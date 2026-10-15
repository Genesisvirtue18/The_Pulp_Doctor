import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { Router, type IRouter } from "express";
import {
  AdminLoginBody,
  AdminLoginResponse,
  CancelAdminAppointmentBody,
  CancelAdminAppointmentParams,
  CancelAdminAppointmentResponse,
  CreateAdminAvailabilityOverrideBody,
  CreateAdminAvailabilityOverrideResponse,
  CreatePhoneAppointmentBody,
  CreatePhoneAppointmentResponse,
  GetAdminDashboardResponse,
  GetAdminSessionResponse,
  ListAdminAppointmentsQueryParams,
  ListAdminAppointmentsResponse,
  ListAdminAvailabilityOverridesQueryParams,
  ListAdminAvailabilityOverridesResponse,
  ListAdminNotificationsResponse,
  ListAdminReferralsQueryParams,
  ListAdminReferralsResponse,
  ListAdminSchedulesResponse,
  RequestReferralAttachmentAccessUrlParams,
  RequestReferralAttachmentAccessUrlResponse,
  RescheduleAdminAppointmentBody,
  RescheduleAdminAppointmentParams,
  RescheduleAdminAppointmentResponse,
  UpdateAdminLocationBody,
  UpdateAdminLocationParams,
  UpdateAdminLocationResponse,
  UpdateAdminScheduleBody,
  UpdateAdminScheduleParams,
  UpdateAdminScheduleResponse,
  UpdateReferralStatusBody,
  UpdateReferralStatusParams,
  UpdateReferralStatusResponse,
} from "@workspace/api-zod";
import { connectMongo } from "../lib/mongo";
import { sendApiError } from "../lib/httpErrors";
import {
  clearAdminSessionCookie,
  requireAdmin,
  requireSameOrigin,
  setAdminSessionCookie,
} from "../middleware/adminAuth";
import { AdminUserModel } from "../models/admin";
import { AppointmentModel } from "../models/appointment";
import { AvailabilityOverrideModel } from "../models/availability";
import {
  ClinicLocationModel,
  DoctorScheduleModel,
} from "../models/clinic";
import { EmailNotificationModel } from "../models/notification";
import { ReferralModel } from "../models/referral";
import {
  cancelByAdmin,
  createPhoneAppointment,
  isBookingConflict,
  rescheduleByAdmin,
  toAdminAppointment,
} from "../services/booking";
import { retryNotification } from "../services/email";
import { createReferralReadUrl } from "../lib/privateStorage";

const router: IRouter = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});

function param(req: { params: Record<string, string | string[]> }, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function localDateInKolkata(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toReferral(referral: {
  _id: unknown;
  reference: string;
  referralDate: string;
  dentistName: string;
  practiceName: string;
  dentistPhone: string;
  dentistEmail: string;
  patientName: string;
  patientPhone: string;
  dateOfBirth?: string | null;
  selectedTeeth: number[];
  requestType: string;
  existingRestoration: string;
  coronalRestoration: string;
  restorativePlan: string;
  clinicalComments: string;
  preferredDate?: string | null;
  preferredTime?: string | null;
  attachments: { uploadId: string }[];
  authorizationConfirmed: boolean;
  status: string;
  internalNotes: string;
  createdAt?: Date;
}) {
  return {
    id: String(referral._id),
    reference: referral.reference,
    referralDate: referral.referralDate,
    dentistName: referral.dentistName,
    practiceName: referral.practiceName,
    dentistPhone: referral.dentistPhone,
    dentistEmail: referral.dentistEmail,
    patientName: referral.patientName,
    patientPhone: referral.patientPhone,
    dateOfBirth: referral.dateOfBirth ?? null,
    selectedTeeth: referral.selectedTeeth,
    requestType: referral.requestType,
    existingRestoration: referral.existingRestoration,
    coronalRestoration: referral.coronalRestoration,
    restorativePlan: referral.restorativePlan,
    clinicalComments: referral.clinicalComments,
    preferredDate: referral.preferredDate ?? null,
    preferredTime: referral.preferredTime ?? null,
    uploadIds: referral.attachments.map((attachment) => attachment.uploadId),
    authorizationConfirmed: referral.authorizationConfirmed,
    status: referral.status,
    internalNotes: referral.internalNotes,
    createdAt: referral.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toAdminNotification(notification: {
  _id: unknown;
  event: string;
  recipient: string;
  entityReference: string;
  status: string;
  attempts: number;
  lastError: string | null;
  updatedAt?: Date;
}) {
  return {
    id: String(notification._id),
    event: notification.event,
    recipient: notification.recipient,
    entityReference: notification.entityReference,
    status: notification.status,
    attempts: notification.attempts,
    lastError: notification.lastError,
    updatedAt: notification.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

router.post(
  "/login",
  loginLimiter,
  requireSameOrigin,
  async (req, res): Promise<void> => {
    const parsed = AdminLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a valid email and password." });
      return;
    }
    try {
      await connectMongo();
      const admin = await AdminUserModel.findOne({
        email: parsed.data.email.toLowerCase(),
        active: true,
        role: "admin",
      }).select("+passwordHash");
      if (!admin || !(await bcrypt.compare(parsed.data.password, admin.passwordHash))) {
        res.status(401).json({ error: "Email or password is incorrect." });
        return;
      }
      const session = {
        id: String(admin._id),
        email: admin.email,
        displayName: admin.displayName,
        role: "admin" as const,
      };
      setAdminSessionCookie(res, session);
      res.json(AdminLoginResponse.parse(session));
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.post("/logout", requireSameOrigin, (_req, res): void => {
  clearAdminSessionCookie(res);
  res.sendStatus(204);
});

router.use(requireSameOrigin, requireAdmin);

router.get("/session", (req, res): void => {
  if (!req.admin) {
    res.status(401).json({ error: "Administrator sign-in required." });
    return;
  }
  res.json(GetAdminSessionResponse.parse(req.admin));
});

router.get("/dashboard", async (req, res): Promise<void> => {
  try {
    await connectMongo();
    const today = localDateInKolkata();
    const [todayAppointments, upcomingAppointments, pendingReferrals, next] =
      await Promise.all([
        AppointmentModel.countDocuments({
          localDate: today,
          status: { $in: ["pending", "confirmed"] },
        }),
        AppointmentModel.countDocuments({
          localDate: { $gt: today },
          status: { $in: ["pending", "confirmed"] },
        }),
        ReferralModel.countDocuments({
          status: { $in: ["received", "reviewing"] },
        }),
        AppointmentModel.find({
          localDate: { $gte: today },
          status: { $in: ["pending", "confirmed"] },
        })
          .sort({ startsAt: 1 })
          .limit(6),
      ]);
    res.json(
      GetAdminDashboardResponse.parse({
        todayAppointments,
        upcomingAppointments,
        pendingReferrals,
        nextAppointments: next.map(toAdminAppointment),
      }),
    );
  } catch (error) {
    sendApiError(req, res, error);
  }
});

router.get("/notifications", async (req, res): Promise<void> => {
  try {
    await connectMongo();
    const notifications = await EmailNotificationModel.find()
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json(
      ListAdminNotificationsResponse.parse(
        notifications.map(toAdminNotification),
      ),
    );
  } catch (error) {
    sendApiError(req, res, error);
  }
});

router.post(
  "/notifications/:notificationId/retry",
  async (req, res): Promise<void> => {
    const id = param(req, "notificationId");
    try {
      await connectMongo();
      const status = await retryNotification(id);
      if (!status) {
        res.status(404).json({ error: "Notification was not found." });
        return;
      }
      if (status === "not_configured") {
        res.status(409).json({
          error: "Configure the email sender before retrying notifications.",
        });
        return;
      }
      const notification = await EmailNotificationModel.findById(id).lean();
      if (!notification) {
        res.status(404).json({ error: "Notification was not found." });
        return;
      }
      res.json(
        ListAdminNotificationsResponse.element.parse(
          toAdminNotification(notification),
        ),
      );
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.get("/appointments", async (req, res): Promise<void> => {
  const parsed = ListAdminAppointmentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Appointment filters are invalid." });
    return;
  }
  try {
    await connectMongo();
    const filter: Record<string, unknown> = {};
    if (parsed.data.from || parsed.data.to) {
      filter.localDate = {
        ...(parsed.data.from ? { $gte: parsed.data.from } : {}),
        ...(parsed.data.to ? { $lte: parsed.data.to } : {}),
      };
    }
    if (parsed.data.locationId) {
      filter.locationId = parsed.data.locationId;
    }
    if (parsed.data.status) {
      filter.status = parsed.data.status;
    }
    if (parsed.data.source) {
      filter.source = parsed.data.source;
    }
    const appointments = await AppointmentModel.find(filter)
      .sort({ startsAt: 1 })
      .limit(500);
    res.json(
      ListAdminAppointmentsResponse.parse(appointments.map(toAdminAppointment)),
    );
  } catch (error) {
    sendApiError(req, res, error);
  }
});

router.post("/appointments", async (req, res): Promise<void> => {
  const parsed = CreatePhoneAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Review the phone booking details and try again." });
    return;
  }
  try {
    const input = parsed.data;
    const appointment = await createPhoneAppointment({
      locationId: input.locationId,
      date: input.date,
      slotId: input.slotId,
      patientName: input.patientName,
      phone: input.phone,
      email: input.email ?? null,
      appointmentType: input.appointmentType,
      notes: input.notes,
      internalNotes: input.internalNotes,
    });
    res.status(201).json(
      CreatePhoneAppointmentResponse.parse(toAdminAppointment(appointment)),
    );
  } catch (error) {
    if (isBookingConflict(error)) {
      res.status(409).json({ error: "That appointment time is no longer available." });
      return;
    }
    sendApiError(req, res, error);
  }
});

router.post(
  "/appointments/:appointmentId/cancel",
  async (req, res): Promise<void> => {
    const params = CancelAdminAppointmentParams.safeParse(req.params);
    const body = CancelAdminAppointmentBody.safeParse(req.body);
    if (!params.success || !body.success || body.data.confirmed !== true) {
      res.status(400).json({ error: "Confirm the appointment cancellation to continue." });
      return;
    }
    try {
      const appointment = await cancelByAdmin(params.data.appointmentId);
      res.json(
        CancelAdminAppointmentResponse.parse(toAdminAppointment(appointment)),
      );
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.post(
  "/appointments/:appointmentId/reschedule",
  async (req, res): Promise<void> => {
    const params = RescheduleAdminAppointmentParams.safeParse(req.params);
    const body = RescheduleAdminAppointmentBody.safeParse(req.body);
    if (!params.success || !body.success || body.data.confirmed !== true) {
      res.status(400).json({ error: "Confirm the appointment rescheduling to continue." });
      return;
    }
    try {
      const appointment = await rescheduleByAdmin({
        appointmentId: params.data.appointmentId,
        locationId: body.data.locationId,
        date: body.data.date,
        slotId: body.data.slotId,
      });
      res.json(
        RescheduleAdminAppointmentResponse.parse(toAdminAppointment(appointment)),
      );
    } catch (error) {
      if (isBookingConflict(error)) {
        res.status(409).json({ error: "That appointment time is no longer available." });
        return;
      }
      sendApiError(req, res, error);
    }
  },
);

router.get("/referrals", async (req, res): Promise<void> => {
  const parsed = ListAdminReferralsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Referral filters are invalid." });
    return;
  }
  try {
    await connectMongo();
    const filter = parsed.data.status ? { status: parsed.data.status } : {};
    const referrals = await ReferralModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(300);
    res.json(
      ListAdminReferralsResponse.parse(referrals.map(toReferral)),
    );
  } catch (error) {
    sendApiError(req, res, error);
  }
});

router.patch(
  "/referrals/:referralId/status",
  async (req, res): Promise<void> => {
    const params = UpdateReferralStatusParams.safeParse(req.params);
    const body = UpdateReferralStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Referral status update is invalid." });
      return;
    }
    try {
      await connectMongo();
      const referral = await ReferralModel.findByIdAndUpdate(
        params.data.referralId,
        {
          $set: {
            status: body.data.status,
            ...(body.data.internalNotes !== undefined
              ? { internalNotes: body.data.internalNotes }
              : {}),
          },
        },
        { new: true, runValidators: true },
      );
      if (!referral) {
        res.status(404).json({ error: "Referral was not found." });
        return;
      }
      res.json(UpdateReferralStatusResponse.parse(toReferral(referral)));
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.post(
  "/referrals/:referralId/attachments/:uploadId/access-url",
  async (req, res): Promise<void> => {
    const params = RequestReferralAttachmentAccessUrlParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Attachment reference is invalid." });
      return;
    }
    try {
      await connectMongo();
      const referral = await ReferralModel.findById(params.data.referralId);
      const attachment = referral?.attachments.find(
        (item) => item.uploadId === params.data.uploadId,
      );
      if (!attachment) {
        res.status(404).json({ error: "Attachment was not found." });
        return;
      }
      const result = await createReferralReadUrl(attachment.objectKey);
      res.json(
        RequestReferralAttachmentAccessUrlResponse.parse({
          url: result.url,
          expiresAt: result.expiresAt.toISOString(),
        }),
      );
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.get("/schedules", async (req, res): Promise<void> => {
  try {
    await connectMongo();
    const [locations, schedules] = await Promise.all([
      ClinicLocationModel.find({ active: true }).sort({ name: 1 }).lean(),
      DoctorScheduleModel.find().lean(),
    ]);
    const scheduleByLocation = new Map(
      schedules.map((schedule) => [schedule.locationId, schedule]),
    );
    res.json(
      ListAdminSchedulesResponse.parse(
        locations.map((location) => {
          const schedule = scheduleByLocation.get(location.locationId);
          return {
            locationId: location.locationId,
            locationName: location.name,
            weeklyHours: schedule?.weeklyHours ?? [],
            slotDurationMinutes: schedule?.slotDurationMinutes ?? 60,
          };
        }),
      ),
    );
  } catch (error) {
    sendApiError(req, res, error);
  }
});

router.put(
  "/schedules/:locationId",
  async (req, res): Promise<void> => {
    const params = UpdateAdminScheduleParams.safeParse(req.params);
    const body = UpdateAdminScheduleBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Schedule details are invalid." });
      return;
    }
    try {
      await connectMongo();
      const location = await ClinicLocationModel.findOne({
        locationId: params.data.locationId,
        active: true,
      });
      if (!location) {
        res.status(404).json({ error: "Clinic location was not found." });
        return;
      }
      const schedule = await DoctorScheduleModel.findOneAndUpdate(
        { locationId: params.data.locationId },
        {
          $set: {
            weeklyHours: body.data.weeklyHours,
            slotDurationMinutes: body.data.slotDurationMinutes,
          },
        },
        { new: true, upsert: true, runValidators: true },
      );
      res.json(
        UpdateAdminScheduleResponse.parse({
          locationId: schedule.locationId,
          locationName: location.name,
          weeklyHours: schedule.weeklyHours,
          slotDurationMinutes: schedule.slotDurationMinutes,
        }),
      );
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.put(
  "/locations/:locationId",
  async (req, res): Promise<void> => {
    const params = UpdateAdminLocationParams.safeParse(req.params);
    const body = UpdateAdminLocationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Clinic location details are invalid." });
      return;
    }
    try {
      await connectMongo();
      const location = await ClinicLocationModel.findOneAndUpdate(
        { locationId: params.data.locationId, active: true },
        {
          $set: {
            name: body.data.name.trim(),
            clinicName: body.data.clinicName.trim(),
            address: body.data.address.trim(),
            mapsUrl: body.data.mapsUrl,
            phone: body.data.phone?.trim() || null,
          },
        },
        { new: true, runValidators: true },
      );
      if (!location) {
        res.status(404).json({ error: "Clinic location was not found." });
        return;
      }
      const schedule = await DoctorScheduleModel.findOne({
        locationId: location.locationId,
      }).lean();
      res.json(
        UpdateAdminLocationResponse.parse({
          id: location.locationId,
          name: location.name,
          clinicName: location.clinicName,
          address: location.address,
          mapsUrl: location.mapsUrl,
          phone: location.phone,
          weeklyHours: schedule?.weeklyHours ?? [],
        }),
      );
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.get("/availability-overrides", async (req, res): Promise<void> => {
  const parsed = ListAdminAvailabilityOverridesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Availability override filters are invalid." });
    return;
  }
  try {
    await connectMongo();
    const filter: Record<string, unknown> = {};
    if (parsed.data.locationId) {
      filter.locationId = parsed.data.locationId;
    }
    if (parsed.data.from || parsed.data.to) {
      filter.date = {
        ...(parsed.data.from ? { $gte: parsed.data.from } : {}),
        ...(parsed.data.to ? { $lte: parsed.data.to } : {}),
      };
    }
    const overrides = await AvailabilityOverrideModel.find(filter)
      .sort({ date: 1, locationId: 1 })
      .limit(500)
      .lean();
    res.json(
      ListAdminAvailabilityOverridesResponse.parse(
        overrides.map((override) => ({
          id: String(override._id),
          locationId: override.locationId,
          date: override.date,
          kind: override.kind,
          slots: override.slots,
          reason: override.reason,
        })),
      ),
    );
  } catch (error) {
    sendApiError(req, res, error);
  }
});

router.post(
  "/availability-overrides",
  async (req, res): Promise<void> => {
    const parsed = CreateAdminAvailabilityOverrideBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Availability override details are invalid." });
      return;
    }
    try {
      await connectMongo();
      const input = parsed.data;
      const location = await ClinicLocationModel.findOne({
        locationId: input.locationId,
        active: true,
      });
      if (!location) {
        res.status(404).json({ error: "Clinic location was not found." });
        return;
      }
      if (input.kind === "closed" || input.kind === "blocked") {
        const active = await AppointmentModel.find({
          locationId: input.locationId,
          localDate: input.date,
          status: { $in: ["pending", "confirmed"] },
          reservationKey: { $exists: true },
        }).select("slotId");
        const affected = active.filter(
          (appointment) =>
            input.kind === "closed" || input.slots.includes(appointment.slotId),
        );
        if (affected.length) {
          res.status(409).json({
            error:
              "Existing appointments must be explicitly cancelled or rescheduled before blocking this date or slot.",
          });
          return;
        }
      }
      const override = await AvailabilityOverrideModel.create({
        locationId: input.locationId,
        date: input.date,
        kind: input.kind,
        slots: input.slots,
        reason: input.reason ?? "",
      });
      res.status(201).json(
        CreateAdminAvailabilityOverrideResponse.parse({
          id: String(override._id),
          locationId: override.locationId,
          date: override.date,
          kind: override.kind,
          slots: override.slots,
          reason: override.reason,
        }),
      );
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

export default router;
