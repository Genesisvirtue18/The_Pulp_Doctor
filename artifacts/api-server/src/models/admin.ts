import mongoose, { Schema, type Document } from "mongoose";

export interface AdminUserDocument extends Document {
  email: string;
  displayName: string;
  passwordHash: string;
  role: "admin";
  active: boolean;
}

const adminUserSchema = new Schema<AdminUserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin"], required: true, default: "admin" },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, strict: "throw" },
);

export const AdminUserModel =
  (mongoose.models.AdminUser as mongoose.Model<AdminUserDocument>) ||
  mongoose.model<AdminUserDocument>("AdminUser", adminUserSchema);
