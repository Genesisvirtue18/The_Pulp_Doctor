import mongoose, { Schema, type Document } from "mongoose";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed";
export type BookingSource = "online" | "phone";

export interface AppointmentDocument extends Document {
  reference: string;
  locationId: string;
  locationName: string;
  localDate: string;
  slotId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  source: BookingSource;
  patientName: string;
  phone: string;
  email: string | null;
  appointmentType: string;
  notes: string;
  internalNotes: string;
  managementTokenHash: string | null;
  reservationKey?: string;
  reservationBuckets?: string[];
}

const appointmentSchema = new Schema<AppointmentDocument>(
  {
    reference: { type: String, required: true, unique: true, index: true },
    locationId: { type: String, required: true, index: true },
    locationName: { type: String, required: true },
    localDate: { type: String, required: true, index: true },
    slotId: { type: String, required: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      required: true,
      default: "confirmed",
      index: true,
    },
    source: { type: String, enum: ["online", "phone"], required: true },
    patientName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: null },
    appointmentType: { type: String, required: true },
    notes: { type: String, default: "" },
    internalNotes: { type: String, default: "" },
    managementTokenHash: { type: String, default: null, select: false },
    reservationKey: { type: String },
    reservationBuckets: { type: [String] },
  },
  { timestamps: true, strict: "throw" },
);

// A single doctor serves all locations: a date/time can be reserved only once.
// Cancelled or rescheduled records release the key without deleting history.
appointmentSchema.index(
  { reservationKey: 1 },
  { unique: true, sparse: true, name: "unique_active_doctor_slot" },
);
appointmentSchema.index(
  { reservationBuckets: 1 },
  { unique: true, sparse: true, name: "unique_active_appointment_buckets" },
);
appointmentSchema.index({ localDate: 1, locationId: 1, status: 1 });

export const AppointmentModel =
  (mongoose.models.Appointment as mongoose.Model<AppointmentDocument>) ||
  mongoose.model<AppointmentDocument>("Appointment", appointmentSchema);
