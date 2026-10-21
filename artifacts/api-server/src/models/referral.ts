import mongoose, { Schema, type Document } from "mongoose";

export type ReferralStatus =
  | "received"
  | "reviewing"
  | "contacted"
  | "scheduled"
  | "closed";

export interface ReferralAttachmentMetadata {
  uploadId: string;
  cloudinaryAssetId: string;
  cloudinaryPublicId: string;
  resourceType: "image";
  deliveryType: "authenticated";
  format: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface ReferralDocument extends Document {
  submissionId?: string;
  reference: string;
  referralDate: string;
  dentistName: string;
  practiceName: string;
  dentistPhone: string;
  dentistEmail: string;
  dentistRegistrationNumber?: string | null;
  practiceAddress?: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string | null;
  patientGender?: string | null;
  patientAge?: number | null;
  dateOfBirth?: string | null;
  selectedTeeth: number[];
  requestTypes?: string[];
  requestType?: string;
  otherReferralReason?: string | null;
  existingRestoration: string;
  coronalRestoration: string;
  relevantClinicalInformation?: string;
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
  createdAt: Date;
  updatedAt: Date;
  uploadId: string;
  uploadTokenHash: string | null;
  cloudinaryPublicId: string;
  cloudinaryAssetId?: string | null;
  format?: string | null;
  fileName: string;
  contentType: string;
  fileSize: number;
  expiresAt: Date;
  uploadedAt?: Date | null;
  usedAt?: Date | null;
}

const referralAttachmentSchema = new Schema<ReferralAttachmentMetadata>(
  {
    uploadId: { type: String, required: true },
    cloudinaryAssetId: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    resourceType: { type: String, required: true, enum: ["image"] },
    deliveryType: { type: String, required: true, enum: ["authenticated"] },
    format: { type: String, required: true },
    fileName: { type: String, required: true },
    contentType: { type: String, required: true },
    fileSize: { type: Number, required: true },
  },
  { _id: false },
);

const referralSchema = new Schema<ReferralDocument>(
  {
    submissionId: { type: String, required: true, unique: true, index: true },
    reference: { type: String, required: true, unique: true, index: true },
    referralDate: { type: String, required: true },
    dentistName: { type: String, required: true },
    practiceName: { type: String, required: true },
    dentistPhone: { type: String, required: true },
    dentistEmail: { type: String, required: true, index: true },
    dentistRegistrationNumber: { type: String, default: null },
    practiceAddress: { type: String, required: true },
    patientName: { type: String, required: true },
    patientPhone: { type: String, required: true },
    patientEmail: { type: String, default: null },
    patientGender: { type: String, default: null },
    patientAge: { type: Number, default: null, min: 0, max: 120 },
    dateOfBirth: { type: String, default: null },
    selectedTeeth: { type: [Number], required: true },
    requestTypes: { type: [String], required: true },
    requestType: { type: String, default: undefined },
    otherReferralReason: { type: String, default: null },
    existingRestoration: { type: String, required: true },
    coronalRestoration: { type: String, required: true },
    relevantClinicalInformation: { type: String, default: "" },
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
    uploadTokenHash: { type: String, default: null },
    cloudinaryPublicId: { type: String, required: true, unique: true },
    cloudinaryAssetId: { type: String, default: null },
    format: { type: String, default: null },
    fileName: { type: String, required: true },
    contentType: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true, index: true },
    uploadedAt: { type: Date, default: null },
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
