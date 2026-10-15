import mongoose, { Schema, type Document } from "mongoose";

export type OverrideKind = "extra" | "closed" | "blocked" | "emergency";

export interface AvailabilityOverrideDocument extends Document {
  locationId: string;
  date: string;
  kind: OverrideKind;
  slots: string[];
  reason: string;
}

const availabilityOverrideSchema =
  new Schema<AvailabilityOverrideDocument>(
    {
      locationId: { type: String, required: true, index: true },
      date: { type: String, required: true, index: true },
      kind: {
        type: String,
        enum: ["extra", "closed", "blocked", "emergency"],
        required: true,
      },
      slots: { type: [String], default: [] },
      reason: { type: String, default: "" },
    },
    { timestamps: true, strict: "throw" },
  );

availabilityOverrideSchema.index({ locationId: 1, date: 1 });

export const AvailabilityOverrideModel =
  (mongoose.models.AvailabilityOverride as mongoose.Model<AvailabilityOverrideDocument>) ||
  mongoose.model<AvailabilityOverrideDocument>(
    "AvailabilityOverride",
    availabilityOverrideSchema,
  );
