import mongoose, { Schema, type Document } from "mongoose";

export interface ContactMessageDocument extends Document {
  createdAt: Date;
  updatedAt: Date;
  reference: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
}

const contactMessageSchema = new Schema<ContactMessageDocument>(
  {
    reference: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: null },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true, strict: "throw" },
);

export const ContactMessageModel =
  (mongoose.models.ContactMessage as mongoose.Model<ContactMessageDocument>) ||
  mongoose.model<ContactMessageDocument>("ContactMessage", contactMessageSchema);
