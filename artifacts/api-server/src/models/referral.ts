import mongoose, { Schema, type Document } from "mongoose";

export type ReferralStatus =
  | "received"
  | "reviewing"
  | "contacted"
  | "scheduled"
  | "closed";

export interface ReferralAttachmentMetadata {
  uploadId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface ReferralDocument extends Document {
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
  attachments: ReferralAttachmentMetadata[];
  authorizationConfirmed: boolean;
  status: ReferralStatus;
  internalNotes: string;
}

export interface ReferralUploadDocument extends Document {
  uploadId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  expiresAt: Date;
  usedAt?: Date | null;
}

const referralAttachmentSchema = new Schema<ReferralAttachmentMetadata>(
  {
    uploadId: { type: String, required: true },
    objectKey: { type: String, required: true },
    fileName: { type: String, required: true },
    contentType: { type: String, required: true },
    fileSize: { type: Number, required: true },
  },
  { _id: false },
);

const referralSchema = new Schema<ReferralDocument>(
  {
    reference: { type: String, required: true, unique: true, index: true },
    referralDate: { type: String, required: true },
    dentistName: { type: String, required: true },
    practiceName: { type: String, required: true },
    dentistPhone: { type: String, required: true },
    dentistEmail: { type: String, required: true, index: true },
    patientName: { type: String, required: true },
    patientPhone: { type: String, required: true },
    dateOfBirth: { type: String, default: null },
    selectedTeeth: { type: [Number], required: true },
    requestType: { type: String, required: true },
    existingRestoration: { type: String, required: true },
    coronalRestoration: { type: String, required: true },
    restorativePlan: { type: String, default: "" },
    clinicalComments: { type: String, default: "" },
    preferredDate: { type: String, default: null },
    preferredTime: { type: String, default: null },
    attachments: { type: [referralAttachmentSchema], default: [] },
    authorizationConfirmed: { type: Boolean, required: true },
    status: {
      type: String,
      enum: ["received", "reviewing", "contacted", "scheduled", "closed"],
      default: "received",
      index: true,
    },
    internalNotes: { type: String, default: "" },
  },
  { timestamps: true, strict: "throw" },
);

const referralUploadSchema = new Schema<ReferralUploadDocument>(
  {
    uploadId: { type: String, required: true, unique: true, index: true },
    objectKey: { type: String, required: true, unique: true },
    fileName: { type: String, required: true },
    contentType: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, strict: "throw" },
);

export const ReferralModel =
  (mongoose.models.Referral as mongoose.Model<ReferralDocument>) ||
  mongoose.model<ReferralDocument>("Referral", referralSchema);

export const ReferralUploadModel =
  (mongoose.models.ReferralUpload as mongoose.Model<ReferralUploadDocument>) ||
  mongoose.model<ReferralUploadDocument>(
    "ReferralUpload",
    referralUploadSchema,
  );
