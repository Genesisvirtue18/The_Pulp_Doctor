import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import {
  CancelAppointmentBody,
  CancelAppointmentParams,
  CancelAppointmentResponse,
  CreateAppointmentBody,
  CreateAppointmentResponse,
  CreateReferralBody,
  CreateReferralResponse,
  GetAvailabilityQueryParams,
  GetAvailabilityResponse,
  ListLocationsResponse,
  RequestReferralUploadBody,
  RequestReferralUploadResponse,
  RescheduleAppointmentBody,
  RescheduleAppointmentParams,
  RescheduleAppointmentResponse,
} from "@workspace/api-zod";
import { connectMongo } from "../lib/mongo";
import { sendApiError } from "../lib/httpErrors";
import { AppointmentModel } from "../models/appointment";
import {
  ReferralModel,
  ReferralUploadModel,
  type ReferralAttachmentMetadata,
} from "../models/referral";
import { createOnlineAppointment, cancelByPatient, isBookingConflict, rescheduleByPatient, toAppointmentSummary } from "../services/booking";
import { getAvailability, listLocations } from "../services/clinic";
import { notifyReferral } from "../services/email";
import {
  createReferralUploadUrl,
  validateReferralFileMetadata,
  verifyPrivateUpload,
} from "../lib/privateStorage";

const router: IRouter = Router();
const referralRequestKinds = [
  "Endodontic Emergency",
  "Consult and Treat as Necessary",
  "Endodontic Treatment Initiated — Please Complete Treatment",
  "Prognosis/Restorability Consult",
];
const restorationKinds = [
  "Permanent Crown/Bridge",
  "Crown/Bridge with Temporary Cement",
  "Temporary Crown",
  "Permanent Crown to Be Placed",
];
const coronalRestorationKinds = [
  "Core Build-up",
  "Place Post and Resin Core",
  "Restore as Desired",
  "Please Call to Discuss",
  "Fiber-Reinforced Restoration",
];

router.get("/locations", async (req, res): Promise<void> => {
  try {
    const data = ListLocationsResponse.parse(await listLocations());
    res.json(data);
  } catch (error) {
    sendApiError(req, res, error);
  }
});

router.get("/availability", async (req, res): Promise<void> => {
  const params = GetAvailabilityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Choose a valid clinic and date." });
    return;
  }
  try {
    const data = GetAvailabilityResponse.parse(
      await getAvailability(params.data.locationId, params.data.date),
    );
    res.json(data);
  } catch (error) {
    sendApiError(req, res, error);
  }
});

router.post("/appointments", async (req, res): Promise<void> => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Review the appointment details and try again." });
    return;
  }
  try {
    const input = parsed.data;
    const result = await createOnlineAppointment({
      locationId: input.locationId,
      date: input.date,
      slotId: input.slotId,
      patientName: input.patientName,
      phone: input.phone,
      email: input.email,
      appointmentType: input.appointmentType,
      notes: input.notes,
    });
    const data = CreateAppointmentResponse.parse({
      id: String(result.appointment._id),
      reference: result.appointment.reference,
      locationName: result.appointment.locationName,
      date: result.appointment.localDate,
      time: result.appointment.slotId,
      status: result.appointment.status,
      managementToken: result.managementToken,
      emailStatus: result.emailStatus,
    });
    res.status(201).json(data);
  } catch (error) {
    if (isBookingConflict(error)) {
      res.status(409).json({
        error: "This time is no longer available. Choose another appointment.",
      });
      return;
    }
    sendApiError(req, res, error);
  }
});

router.post(
  "/appointments/:appointmentId/cancel",
  async (req, res): Promise<void> => {
    const params = CancelAppointmentParams.safeParse(req.params);
    const body = CancelAppointmentBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Appointment cancellation details are invalid." });
      return;
    }
    try {
      const appointment = await cancelByPatient({
        appointmentId: params.data.appointmentId,
        managementToken: body.data.managementToken,
      });
      res.json(CancelAppointmentResponse.parse(toAppointmentSummary(appointment)));
    } catch (error) {
      if (error instanceof Error && error.message.includes("management token")) {
        res.status(403).json({ error: "Appointment management token is invalid." });
        return;
      }
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Appointment was not found or is no longer active." });
        return;
      }
      if (error instanceof Error && error.message.includes("window has passed")) {
        res.status(409).json({ error: error.message });
        return;
      }
      sendApiError(req, res, error);
    }
  },
);

router.post(
  "/appointments/:appointmentId/reschedule",
  async (req, res): Promise<void> => {
    const params = RescheduleAppointmentParams.safeParse(req.params);
    const body = RescheduleAppointmentBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Appointment rescheduling details are invalid." });
      return;
    }
    try {
      const appointment = await rescheduleByPatient({
        appointmentId: params.data.appointmentId,
        ...body.data,
      });
      res.json(RescheduleAppointmentResponse.parse(toAppointmentSummary(appointment)));
    } catch (error) {
      if (isBookingConflict(error)) {
        res.status(409).json({ error: "This time is no longer available." });
        return;
      }
      if (error instanceof Error && error.message.includes("management token")) {
        res.status(403).json({ error: "Appointment management token is invalid." });
        return;
      }
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Appointment was not found or is no longer active." });
        return;
      }
      if (error instanceof Error && error.message.includes("window has passed")) {
        res.status(409).json({ error: error.message });
        return;
      }
      sendApiError(req, res, error);
    }
  },
);

router.post(
  "/referral-uploads/request-url",
  async (req, res): Promise<void> => {
    const parsed = RequestReferralUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Only approved image or PDF files up to 10 MB are accepted." });
      return;
    }
    try {
      const input = parsed.data;
      validateReferralFileMetadata(
        input.fileName,
        input.contentType,
        input.fileSize,
      );
      await connectMongo();
      const signed = await createReferralUploadUrl({
        fileName: input.fileName,
        contentType: input.contentType,
        fileSize: input.fileSize,
      });
      await ReferralUploadModel.create({
        uploadId: signed.uploadId,
        objectKey: signed.objectKey,
        fileName: input.fileName,
        contentType: input.contentType,
        fileSize: input.fileSize,
        expiresAt: signed.expiresAt,
      });
      res.status(201).json(
        RequestReferralUploadResponse.parse({
          uploadId: signed.uploadId,
          uploadUrl: signed.uploadUrl,
          objectKey: signed.objectKey,
          expiresAt: signed.expiresAt.toISOString(),
        }),
      );
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.post("/referrals", async (req, res): Promise<void> => {
  const parsed = CreateReferralBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Review the referral details, selected teeth, and consent." });
    return;
  }
  const input = parsed.data;
  if (
    !referralRequestKinds.includes(input.requestType) ||
    !restorationKinds.includes(input.existingRestoration) ||
    !coronalRestorationKinds.includes(input.coronalRestoration) ||
    input.authorizationConfirmed !== true
  ) {
    res.status(400).json({ error: "Referral choices or patient authorization are invalid." });
    return;
  }

  try {
    await connectMongo();
    const uploadIds = input.uploadIds ?? [];
    const uploads = uploadIds.length
      ? await ReferralUploadModel.find({
          uploadId: { $in: uploadIds },
          usedAt: null,
          expiresAt: { $gt: new Date() },
        })
      : [];
    if (uploads.length !== uploadIds.length) {
      res.status(400).json({ error: "A referral attachment is expired or unavailable." });
      return;
    }
    for (const upload of uploads) {
      await verifyPrivateUpload({
        objectKey: upload.objectKey,
        contentType: upload.contentType,
        fileSize: upload.fileSize,
      });
    }

    const session = await mongoose.startSession();
    let referral: InstanceType<typeof ReferralModel> | undefined;
    try {
      await session.withTransaction(async () => {
        const claimedUploads = uploadIds.length
          ? await ReferralUploadModel.find({
              uploadId: { $in: uploadIds },
              usedAt: null,
              expiresAt: { $gt: new Date() },
            }).session(session)
          : [];
        if (claimedUploads.length !== uploadIds.length) {
          throw new Error("A referral attachment has already been used.");
        }
        const attachments: ReferralAttachmentMetadata[] = claimedUploads.map(
          (upload) => ({
            uploadId: upload.uploadId,
            objectKey: upload.objectKey,
            fileName: upload.fileName,
            contentType: upload.contentType,
            fileSize: upload.fileSize,
          }),
        );
        const [created] = await ReferralModel.create(
          [
            {
              reference: `REF-${randomUUID().slice(0, 8).toUpperCase()}`,
              referralDate: input.referralDate,
              dentistName: input.dentistName.trim(),
              practiceName: input.practiceName.trim(),
              dentistPhone: input.dentistPhone.trim(),
              dentistEmail: input.dentistEmail.trim().toLowerCase(),
              patientName: input.patientName.trim(),
              patientPhone: input.patientPhone.trim(),
              dateOfBirth: input.dateOfBirth ?? null,
              selectedTeeth: input.selectedTeeth,
              requestType: input.requestType,
              existingRestoration: input.existingRestoration,
              coronalRestoration: input.coronalRestoration,
              restorativePlan: input.restorativePlan?.trim() ?? "",
              clinicalComments: input.clinicalComments?.trim() ?? "",
              preferredDate: input.preferredDate ?? null,
              preferredTime: input.preferredTime ?? null,
              attachments,
              authorizationConfirmed: true,
              status: "received",
              internalNotes: "",
            },
          ],
          { session },
        );
        referral = created;
        if (uploadIds.length) {
          await ReferralUploadModel.updateMany(
            { uploadId: { $in: uploadIds }, usedAt: null },
            { $set: { usedAt: new Date() } },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }
    if (!referral) {
      throw new Error("Referral submission did not complete.");
    }

    let emailStatus: "sent" | "failed" | "not_configured" = "failed";
    try {
      emailStatus = await notifyReferral({
        _id: referral._id,
        reference: referral.reference,
        dentistEmail: referral.dentistEmail,
      });
    } catch {
      // The referral is saved; failed email notification is recorded separately.
    }
    res.status(201).json(
      CreateReferralResponse.parse({
        id: String(referral._id),
        reference: referral.reference,
        status: referral.status,
        message:
          "Referral received. This confirms submission only, not acceptance or appointment confirmation.",
        emailStatus,
      }),
    );
  } catch (error) {
    sendApiError(req, res, error);
  }
});

export default router;
