import mongoose, { Schema, type Document } from "mongoose";

export interface WeeklyHours {
  day: number;
  opensAt: string;
  closesAt: string;
}

export interface ClinicLocationDocument extends Document {
  locationId: string;
  name: string;
  clinicName: string;
  address: string;
  mapsUrl: string;
  phone: string | null;
  active: boolean;
}

export interface DoctorScheduleDocument extends Document {
  locationId: string;
  weeklyHours: WeeklyHours[];
  slotDurationMinutes: number;
}

const weeklyHoursSchema = new Schema<WeeklyHours>(
  {
    day: { type: Number, required: true, min: 0, max: 6 },
    opensAt: { type: String, required: true },
    closesAt: { type: String, required: true },
  },
  { _id: false },
);

const clinicLocationSchema = new Schema<ClinicLocationDocument>(
  {
    locationId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    clinicName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    mapsUrl: { type: String, required: true, trim: true },
    phone: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, strict: "throw" },
);

const doctorScheduleSchema = new Schema<DoctorScheduleDocument>(
  {
    locationId: { type: String, required: true, unique: true, index: true },
    weeklyHours: { type: [weeklyHoursSchema], default: [] },
    slotDurationMinutes: { type: Number, required: true, default: 60, min: 15, max: 240 },
  },
  { timestamps: true, strict: "throw" },
);

export const ClinicLocationModel =
  (mongoose.models.ClinicLocation as mongoose.Model<ClinicLocationDocument>) ||
  mongoose.model<ClinicLocationDocument>("ClinicLocation", clinicLocationSchema);

export const DoctorScheduleModel =
  (mongoose.models.DoctorSchedule as mongoose.Model<DoctorScheduleDocument>) ||
  mongoose.model<DoctorScheduleDocument>("DoctorSchedule", doctorScheduleSchema);

export { weeklyHoursSchema };
