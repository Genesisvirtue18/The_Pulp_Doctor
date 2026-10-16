import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import rateLimit from "express-rate-limit";
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
  ReferralUploadInput,
  ReferralUploadReservation,
  ReferralUploadComplete,
  RescheduleAppointmentBody,
  RescheduleAppointmentParams,
  RescheduleAppointmentResponse,
} from "@workspace/api-zod";
import { connectMongo } from "../lib/mongo";
import { sendApiError } from "../lib/httpErrors";
import {
  ReferralModel,
  ReferralUploadModel,
  type ReferralAttachmentMetadata,
} from "../models/referral";
import { createOnlineAppointment, cancelByPatient, isBookingConflict, rescheduleByPatient, toAppointmentSummary } from "../services/booking";
import { getAvailability, listLocations } from "../services/clinic";
import { notifyReferral } from "../services/email";
import {
  createReferralPublicId,
  deleteReferralAsset,
  ensureCloudinaryConfigured,
  InvalidReferralFileError,
  storeReferralFile,
  validateReferralFileMetadata,
  verifyPrivateUpload,
} from "../lib/cloudinaryStorage";

const router: IRouter = Router();
const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const intakeFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
}).single("file");
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

function receiveReferralFile(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  intakeFileUpload(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      res
        .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        .json({ error: "Choose one approved attachment no larger than 10 MB." });
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
}

function hashUploadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function matchesUploadToken(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }
  const actual = Buffer.from(hashUploadToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

router.post(
  "/referral-uploads/reservations",
  uploadRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = ReferralUploadInput.safeParse(req.body);
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
      ensureCloudinaryConfigured();
      await connectMongo();
      const uploadId = randomUUID();
      const uploadToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const cloudinaryPublicId = createReferralPublicId(uploadId);
      await ReferralUploadModel.create({
        uploadId,
        uploadTokenHash: hashUploadToken(uploadToken),
        cloudinaryPublicId,
        fileName: input.fileName,
        contentType: input.contentType,
        fileSize: input.fileSize,
        expiresAt,
      });
      res.status(201).json(
        ReferralUploadReservation.parse({
          uploadId,
          uploadToken,
          expiresAt: expiresAt.toISOString(),
        }),
      );
    } catch (error) {
      sendApiError(req, res, error);
    }
  },
);

router.put(
  "/referral-uploads/:uploadId/content",
  uploadRateLimiter,
  receiveReferralFile,
  async (req, res): Promise<void> => {
    const uploadId =
      typeof req.params.uploadId === "string" ? req.params.uploadId : "";
    const token = req.get("x-upload-token") ?? "";
    if (!uploadId || !token || !req.file) {
      res.status(400).json({ error: "The upload authorization or file is missing." });
      return;
    }

    let cloudinaryAsset:
      | Awaited<ReturnType<typeof storeReferralFile>>
      | undefined;
    try {
      await connectMongo();
      const reservation = await ReferralUploadModel.findOne({ uploadId });
      if (
        !reservation ||
        reservation.expiresAt <= new Date() ||
        reservation.uploadedAt ||
        !reservation.uploadTokenHash
      ) {
        res.status(410).json({ error: "The upload authorization has expired or was already used." });
        return;
      }
      if (!matchesUploadToken(token, reservation.uploadTokenHash)) {
        res.status(403).json({ error: "The upload authorization is invalid." });
        return;
      }
      if (
        req.file.originalname !== reservation.fileName ||
        req.file.mimetype !== reservation.contentType
      ) {
        throw new InvalidReferralFileError(
          "The file name or MIME type does not match the upload reservation.",
        );
      }
      cloudinaryAsset = await storeReferralFile({
        cloudinaryPublicId: reservation.cloudinaryPublicId,
        fileName: reservation.fileName,
        contentType: reservation.contentType,
        expectedSize: reservation.fileSize,
        bytes: req.file.buffer,
      });

      let savedReservation;
      try {
        savedReservation = await ReferralUploadModel.findOneAndUpdate(
          {
            _id: reservation._id,
            uploadTokenHash: reservation.uploadTokenHash,
            uploadedAt: null,
            expiresAt: { $gt: new Date() },
          },
          {
            $set: {
              cloudinaryAssetId: cloudinaryAsset.cloudinaryAssetId,
              format: cloudinaryAsset.format,
              uploadedAt: new Date(),
              uploadTokenHash: null,
            },
          },
          { new: true, runValidators: true },
        );
      } catch (error) {
        await deleteReferralAsset(cloudinaryAsset.cloudinaryPublicId).catch(
          (cleanupError: unknown) => {
            req.log.error(
              {
                errorName:
                  cleanupError instanceof Error
                    ? cleanupError.name
                    : "UnknownError",
              },
              "Could not remove an unrecorded Cloudinary upload",
            );
          },
        );
        throw error;
      }
      if (!savedReservation) {
        await deleteReferralAsset(cloudinaryAsset.cloudinaryPublicId).catch(
          () => undefined,
        );
        res.status(409).json({ error: "This upload authorization is no longer valid." });
        return;
      }
      res.status(201).json(
        ReferralUploadComplete.parse({ uploadId, status: "uploaded" }),
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
          cloudinaryAssetId: { $ne: null },
          format: { $ne: null },
          uploadedAt: { $ne: null },
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
        cloudinaryAssetId: upload.cloudinaryAssetId!,
        cloudinaryPublicId: upload.cloudinaryPublicId,
        resourceType: "image",
        deliveryType: "authenticated",
        format: upload.format!,
        fileSize: upload.fileSize,
        contentType: upload.contentType,
      });
    }

    const session = await mongoose.startSession();
    let referral: InstanceType<typeof ReferralModel> | undefined;
    try {
      await session.withTransaction(async () => {
        const claimedUploads = uploadIds.length
          ? await ReferralUploadModel.find({
              uploadId: { $in: uploadIds },
              cloudinaryAssetId: { $ne: null },
              format: { $ne: null },
              uploadedAt: { $ne: null },
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
            cloudinaryAssetId: upload.cloudinaryAssetId!,
            cloudinaryPublicId: upload.cloudinaryPublicId,
            resourceType: "image",
            deliveryType: "authenticated",
            format: upload.format!,
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
          const updated = await ReferralUploadModel.updateMany(
            {
              uploadId: { $in: uploadIds },
              cloudinaryAssetId: { $ne: null },
              uploadedAt: { $ne: null },
              usedAt: null,
            },
            { $set: { usedAt: new Date() } },
            { session },
          );
          if (updated.modifiedCount !== uploadIds.length) {
            throw new Error("A referral attachment was used by another submission.");
          }
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
