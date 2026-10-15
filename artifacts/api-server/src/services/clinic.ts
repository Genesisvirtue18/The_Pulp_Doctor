import { connectMongo } from "../lib/mongo";
import { AppointmentModel } from "../models/appointment";
import {
  AvailabilityOverrideModel,
  type AvailabilityOverrideDocument,
} from "../models/availability";
import {
  ClinicLocationModel,
  DoctorScheduleModel,
  type DoctorScheduleDocument,
  type WeeklyHours,
} from "../models/clinic";

const TIMEZONE_OFFSET_MINUTES = 330;

export class ClinicNotFoundError extends Error {}
export class SlotUnavailableError extends Error {}

export interface PublicSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  label: string;
  available: boolean;
  emergency: boolean;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Date is invalid.");
  }
  return { year, month, day };
}

function localDayOfWeek(date: string): number {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(total: number): string {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function localDateTimeToUtc(date: string, time: string): Date {
  const { year, month, day } = parseDate(date);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) -
      TIMEZONE_OFFSET_MINUTES * 60_000,
  );
}

function timeLabel(start: string, duration: number): string {
  const end = minutesToTime(timeToMinutes(start) + duration);
  const format = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
  };
  return `${format(start)} – ${format(end)}`;
}

function makeSlots(hours: WeeklyHours[], duration: number): string[] {
  const slots = new Set<string>();
  for (const period of hours) {
    const open = timeToMinutes(period.opensAt);
    const close = timeToMinutes(period.closesAt);
    for (let start = open; start + duration <= close; start += duration) {
      slots.add(minutesToTime(start));
    }
  }
  return [...slots].sort();
}

async function resolvePublishedSlots(
  locationId: string,
  date: string,
  session?: Parameters<typeof DoctorScheduleModel.findOne>[0] extends never
    ? never
    : import("mongoose").ClientSession,
): Promise<{
  locationName: string;
  schedule: DoctorScheduleDocument | null;
  overrides: AvailabilityOverrideDocument[];
  slotTimes: string[];
  emergencyTimes: Set<string>;
  unavailableReason: string | null;
}> {
  parseDate(date);
  const locationQuery = ClinicLocationModel.findOne({
    locationId,
    active: true,
  });
  const scheduleQuery = DoctorScheduleModel.findOne({ locationId });
  const overrideQuery = AvailabilityOverrideModel.find({ locationId, date });
  if (session) {
    locationQuery.session(session);
    scheduleQuery.session(session);
    overrideQuery.session(session);
  }
  const [location, schedule, overrides] = await Promise.all([
    locationQuery,
    scheduleQuery,
    overrideQuery,
  ]);
  if (!location) {
    throw new ClinicNotFoundError("Clinic location was not found.");
  }

  const day = localDayOfWeek(date);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const closed = overrides.some((override) => override.kind === "closed");
  if (closed) {
    return {
      locationName: location.name,
      schedule,
      overrides,
      slotTimes: [],
      emergencyTimes: new Set(),
      unavailableReason: "This clinic is closed on the selected date.",
    };
  }

  const weeklyHours = schedule?.weeklyHours.filter((period) => period.day === day) ?? [];
  const duration = schedule?.slotDurationMinutes ?? 60;
  const baseSlots = makeSlots(weeklyHours, duration);
  const emergencyTimes = new Set(
    overrides
      .filter((override) => override.kind === "emergency")
      .flatMap((override) => override.slots),
  );
  const extraTimes = overrides
    .filter((override) => override.kind === "extra" || override.kind === "emergency")
    .flatMap((override) => override.slots);
  const blockedTimes = new Set(
    overrides
      .filter((override) => override.kind === "blocked")
      .flatMap((override) => override.slots),
  );

  // Sundays and unconfigured weekdays stay closed unless an administrator
  // explicitly publishes date-specific availability.
  const isWeekendOrClosed = weeklyHours.length === 0;
  const publishedTimes = isWeekendOrClosed
    ? extraTimes.filter((slot) =>
        day === 0
          ? emergencyTimes.has(slot)
          : overrides.some((override) => override.kind === "extra" && override.slots.includes(slot)),
      )
    : [...baseSlots, ...extraTimes];
  const slotTimes = [...new Set(publishedTimes)]
    .filter((slot) => !blockedTimes.has(slot))
    .sort();

  return {
    locationName: location.name,
    schedule,
    overrides,
    slotTimes,
    emergencyTimes,
    unavailableReason:
      slotTimes.length === 0
        ? today === date
          ? "No published appointments remain for this clinic today."
          : "No appointments are published for this clinic on the selected date."
        : null,
  };
}

export async function listLocations() {
  await connectMongo();
  const locations = await ClinicLocationModel.find({ active: true })
    .sort({ name: 1 })
    .lean();
  const schedules = await DoctorScheduleModel.find({
    locationId: { $in: locations.map((location) => location.locationId) },
  }).lean();
  const scheduleByLocation = new Map(
    schedules.map((schedule) => [schedule.locationId, schedule.weeklyHours]),
  );
  return locations.map((location) => ({
    id: location.locationId,
    name: location.name,
    clinicName: location.clinicName,
    address: location.address,
    mapsUrl: location.mapsUrl,
    phone: location.phone,
    weeklyHours: scheduleByLocation.get(location.locationId) ?? [],
  }));
}

export async function getAvailability(locationId: string, date: string) {
  await connectMongo();
  const published = await resolvePublishedSlots(locationId, date);
  const existing = await AppointmentModel.find({
    localDate: date,
    reservationKey: { $exists: true },
    status: { $in: ["pending", "confirmed"] },
  }).select("slotId");
  const bookedTimes = new Set(existing.map((appointment) => appointment.slotId));
  const duration = published.schedule?.slotDurationMinutes ?? 60;
  const slots: PublicSlot[] = published.slotTimes.map((time) => {
    const start = localDateTimeToUtc(date, time);
    const end = new Date(start.getTime() + duration * 60_000);
    return {
      id: time,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      label: timeLabel(time, duration),
      available: !bookedTimes.has(time),
      emergency: published.emergencyTimes.has(time),
    };
  });
  const bookingEnabled =
    Boolean(published.schedule) ||
    published.overrides.some(
      (override) => override.kind === "extra" || override.kind === "emergency",
    );
  return {
    locationId,
    date,
    timezone: "Asia/Kolkata" as const,
    bookingEnabled,
    unavailableReason: bookingEnabled
      ? published.unavailableReason
      : "Online booking is not enabled for this date.",
    slots,
  };
}

export async function assertSlotIsPublished(
  locationId: string,
  date: string,
  slotId: string,
  session: import("mongoose").ClientSession,
): Promise<{ locationName: string; duration: number; startsAt: Date; endsAt: Date; emergency: boolean }> {
  const published = await resolvePublishedSlots(locationId, date, session);
  if (!published.slotTimes.includes(slotId)) {
    throw new SlotUnavailableError("This time is not a published appointment slot.");
  }
  const start = localDateTimeToUtc(date, slotId);
  if (start <= new Date()) {
    throw new SlotUnavailableError("Appointments must be booked for a future time.");
  }
  const duration = published.schedule?.slotDurationMinutes ?? 60;
  return {
    locationName: published.locationName,
    duration,
    startsAt: start,
    endsAt: new Date(start.getTime() + duration * 60_000),
    emergency: published.emergencyTimes.has(slotId),
  };
}

export function formatClinicDate(date: string): string {
  parseDate(date);
  return date;
}

export { localDateTimeToUtc, timeLabel };
