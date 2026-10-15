import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { isDuplicateKeyError } from "../lib/mongo";
import { AppointmentModel, type AppointmentDocument } from "../models/appointment";
import { ClinicLocationModel } from "../models/clinic";
import {
  assertSlotIsPublished,
  SlotUnavailableError,
} from "./clinic";
import { notifyAppointment, type NotificationStatus } from "./email";

export interface BookingInput {
  locationId: string;
  date: string;
  slotId: string;
  patientName: string;
  phone: string;
  email: string | null;
  appointmentType: string;
  notes?: string;
  internalNotes?: string;
}

function reference(prefix: "TPD" | "REF"): string {
  return `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function hashManagementToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function managementTokenMatches(token: string, expectedHash: string | null): boolean {
  if (!expectedHash) {
    return false;
  }
  const actual = Buffer.from(hashManagementToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && actual.length > 0 && actual.equals(expected);
}

async function createReservation(
  input: BookingInput,
  source: "online" | "phone",
): Promise<{ appointment: AppointmentDocument; managementToken?: string }> {
  const session = await mongoose.startSession();
  const managementToken =
    source === "online" ? randomBytes(32).toString("base64url") : undefined;
  let created: AppointmentDocument | undefined;

  try {
    await session.withTransaction(async () => {
      const location = await ClinicLocationModel.findOne({
        locationId: input.locationId,
        active: true,
      }).session(session);
      if (!location) {
        throw new Error("Clinic location was not found.");
      }
      const published = await assertSlotIsPublished(
        input.locationId,
        input.date,
        input.slotId,
        session,
      );
      const reservationKey = `${input.date}:${input.slotId}`;
      const existing = await AppointmentModel.exists({ reservationKey }).session(
        session,
      );
      if (existing) {
        throw new SlotUnavailableError(
          "This appointment time has just been reserved. Choose another time.",
        );
      }
      const [appointment] = await AppointmentModel.create(
        [
          {
            reference: reference("TPD"),
            locationId: input.locationId,
            locationName: published.locationName,
            localDate: input.date,
            slotId: input.slotId,
            startsAt: published.startsAt,
            endsAt: published.endsAt,
            status: "confirmed",
            source,
            patientName: input.patientName.trim(),
            phone: input.phone.trim(),
            email: input.email?.trim().toLowerCase() || null,
            appointmentType: input.appointmentType.trim(),
            notes: input.notes?.trim() ?? "",
            internalNotes: input.internalNotes?.trim() ?? "",
            managementTokenHash: managementToken
              ? hashManagementToken(managementToken)
              : null,
            reservationKey,
          },
        ],
        { session },
      );
      created = appointment;
    });
  } finally {
    await session.endSession();
  }

  if (!created) {
    throw new Error("Appointment reservation did not complete.");
  }
  return { appointment: created, managementToken };
}

export async function createOnlineAppointment(input: BookingInput): Promise<{
  appointment: AppointmentDocument;
  managementToken: string;
  emailStatus: NotificationStatus;
}> {
  const result = await createReservation(input, "online");
  if (!result.managementToken) {
    throw new Error("Appointment management token was not created.");
  }
  let emailStatus: NotificationStatus = "failed";
  try {
    emailStatus = await notifyAppointment({
      _id: result.appointment._id,
      reference: result.appointment.reference,
      email: result.appointment.email,
    });
  } catch {
    // Notification delivery is logged separately; a committed booking remains
    // valid even if the email provider is unavailable.
  }
  return {
    appointment: result.appointment,
    managementToken: result.managementToken,
    emailStatus,
  };
}

export async function createPhoneAppointment(
  input: BookingInput,
): Promise<AppointmentDocument> {
  const { appointment } = await createReservation(input, "phone");
  return appointment;
}

function cancellationCutoffAllows(startsAt: Date): boolean {
  const cutoffHours = Number(process.env.CANCELLATION_CUTOFF_HOURS ?? "0");
  if (!Number.isFinite(cutoffHours) || cutoffHours < 0) {
    return true;
  }
  return startsAt.getTime() - Date.now() >= cutoffHours * 60 * 60 * 1000;
}

async function updateReservation(
  appointmentId: string,
  action: "cancel" | "reschedule",
  target?: { locationId: string; date: string; slotId: string },
): Promise<AppointmentDocument> {
  const session = await mongoose.startSession();
  let updated: AppointmentDocument | null = null;
  try {
    await session.withTransaction(async () => {
      const current = await AppointmentModel.findById(appointmentId).session(
        session,
      );
      if (!current || !["pending", "confirmed"].includes(current.status)) {
        throw new Error("Appointment was not found or is no longer active.");
      }
      if (!cancellationCutoffAllows(current.startsAt)) {
        throw new Error("The cancellation or rescheduling window has passed.");
      }

      if (action === "cancel") {
        updated = await AppointmentModel.findOneAndUpdate(
          {
            _id: current._id,
            status: { $in: ["pending", "confirmed"] },
          },
          {
            $set: { status: "cancelled" },
            $unset: { reservationKey: 1 },
          },
          { new: true, session, runValidators: true },
        );
        return;
      }

      if (!target) {
        throw new Error("A new appointment time is required.");
      }
      const published = await assertSlotIsPublished(
        target.locationId,
        target.date,
        target.slotId,
        session,
      );
      updated = await AppointmentModel.findOneAndUpdate(
        {
          _id: current._id,
          status: { $in: ["pending", "confirmed"] },
        },
        {
          $set: {
            locationId: target.locationId,
            locationName: published.locationName,
            localDate: target.date,
            slotId: target.slotId,
            startsAt: published.startsAt,
            endsAt: published.endsAt,
            reservationKey: `${target.date}:${target.slotId}`,
          },
        },
        { new: true, session, runValidators: true },
      );
    });
  } finally {
    await session.endSession();
  }
  if (!updated) {
    throw new Error("Appointment update did not complete.");
  }
  return updated;
}

export async function cancelByPatient(input: {
  appointmentId: string;
  managementToken: string;
}): Promise<AppointmentDocument> {
  const current = await AppointmentModel.findById(input.appointmentId).select(
    "+managementTokenHash",
  );
  if (!current || !managementTokenMatches(input.managementToken, current.managementTokenHash)) {
    throw new Error("Appointment management token is invalid.");
  }
  const updated = await updateReservation(input.appointmentId, "cancel");
  await safelyNotify(updated, "cancelled");
  return updated;
}

export async function rescheduleByPatient(input: {
  appointmentId: string;
  managementToken: string;
  locationId: string;
  date: string;
  slotId: string;
}): Promise<AppointmentDocument> {
  const current = await AppointmentModel.findById(input.appointmentId).select(
    "+managementTokenHash",
  );
  if (!current || !managementTokenMatches(input.managementToken, current.managementTokenHash)) {
    throw new Error("Appointment management token is invalid.");
  }
  const updated = await updateReservation(input.appointmentId, "reschedule", {
    locationId: input.locationId,
    date: input.date,
    slotId: input.slotId,
  });
  await safelyNotify(updated, "rescheduled");
  return updated;
}

export async function cancelByAdmin(
  appointmentId: string,
): Promise<AppointmentDocument> {
  const updated = await updateReservation(appointmentId, "cancel");
  await safelyNotify(updated, "cancelled");
  return updated;
}

export async function rescheduleByAdmin(input: {
  appointmentId: string;
  locationId: string;
  date: string;
  slotId: string;
}): Promise<AppointmentDocument> {
  const updated = await updateReservation(input.appointmentId, "reschedule", {
    locationId: input.locationId,
    date: input.date,
    slotId: input.slotId,
  });
  await safelyNotify(updated, "rescheduled");
  return updated;
}

async function safelyNotify(
  appointment: AppointmentDocument,
  change: "cancelled" | "rescheduled",
): Promise<void> {
  try {
    await notifyAppointment(
      {
        _id: appointment._id,
        reference: appointment.reference,
        email: appointment.email,
      },
      change,
    );
  } catch {
    // Database updates are authoritative; notification status remains visible
    // to administrators when the notification record could be written.
  }
}

export function isBookingConflict(error: unknown): boolean {
  return (
    error instanceof SlotUnavailableError ||
    isDuplicateKeyError(error) ||
    (error instanceof Error &&
      error.message.includes("just been reserved"))
  );
}

export function toAppointmentSummary(appointment: AppointmentDocument) {
  return {
    id: String(appointment._id),
    reference: appointment.reference,
    status: appointment.status,
    date: appointment.localDate,
    time: appointment.slotId,
  };
}

export function toAdminAppointment(appointment: AppointmentDocument) {
  return {
    id: String(appointment._id),
    reference: appointment.reference,
    locationId: appointment.locationId,
    locationName: appointment.locationName,
    date: appointment.localDate,
    time: appointment.slotId,
    status: appointment.status,
    source: appointment.source,
    patientName: appointment.patientName,
    phone: appointment.phone,
    email: appointment.email ?? "",
    appointmentType: appointment.appointmentType,
    notes: appointment.notes,
    internalNotes: appointment.internalNotes,
  };
}
