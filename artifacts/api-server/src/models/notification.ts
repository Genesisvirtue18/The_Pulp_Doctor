import mongoose, { Schema, type Document } from "mongoose";

export type NotificationStatus = "sent" | "failed" | "not_configured";

export interface EmailNotificationDocument extends Document {
  idempotencyKey: string;
  entityType: "appointment" | "referral";
  entityId: string;
  entityReference: string;
  event: string;
  recipient: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  retryLockUntil: Date | null;
}

const emailNotificationSchema = new Schema<EmailNotificationDocument>(
  {
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    entityType: { type: String, enum: ["appointment", "referral"], required: true },
    entityId: { type: String, required: true, index: true },
    entityReference: { type: String, required: true, index: true },
    event: { type: String, required: true },
    recipient: { type: String, required: true },
    status: {
      type: String,
      enum: ["sent", "failed", "not_configured"],
      required: true,
      default: "not_configured",
      index: true,
    },
    attempts: { type: Number, required: true, default: 0 },
    lastError: { type: String, default: null },
    retryLockUntil: { type: Date, default: null },
  },
  { timestamps: true, strict: "throw" },
);

export const EmailNotificationModel =
  (mongoose.models.EmailNotification as mongoose.Model<EmailNotificationDocument>) ||
  mongoose.model<EmailNotificationDocument>(
    "EmailNotification",
    emailNotificationSchema,
  );
