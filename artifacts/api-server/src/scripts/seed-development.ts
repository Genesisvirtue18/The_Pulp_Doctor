import { connectMongo } from "../lib/mongo";
import { ClinicLocationModel, DoctorScheduleModel } from "../models/clinic";
import { logger } from "../lib/logger";

const locations = [
  {
    locationId: "gurugram-jcm",
    name: "Gurugram",
    clinicName: "Dr Pearl's Dental Studio (JCM, Phase 2, Gurugram)",
    address:
      "Block P, 22, Jacaranda Marg, DLF Phase 2, Sector 25, Gurugram, Shahpur, Haryana 122002",
    mapsUrl: "https://maps.app.goo.gl/xuPhAEtMd2eSnWaMA",
    phone: process.env.PUBLIC_PHONE || null,
    active: true,
    weeklyHours: [
      { day: 1, opensAt: "11:00", closesAt: "19:00" },
      { day: 3, opensAt: "11:00", closesAt: "19:00" },
      { day: 5, opensAt: "11:00", closesAt: "19:00" },
    ],
  },
  {
    locationId: "model-town-delhi",
    name: "Model Town, Delhi",
    clinicName: "Dr Pearl's Dental Studio (Model Town, Delhi)",
    address:
      "1st Floor, F-14/40, next to Hudson Lane, near Mukherjee Nagar, Model Town Phase 2, Model Town Phase I, Model Town, Delhi 110009",
    mapsUrl: "https://maps.app.goo.gl/xKdNoPK7ZMmfkuZD9",
    phone: process.env.PUBLIC_PHONE || null,
    active: true,
    weeklyHours: [{ day: 2, opensAt: "11:00", closesAt: "19:00" }],
  },
  {
    locationId: "karol-bagh-delhi",
    name: "Karol Bagh, Delhi",
    clinicName: "Khandelwal Clinic",
    address:
      "Shop No. 7723, New Market, Plot No. 1, New Rohtak Road, near Liberty Cinema, Block 18B, Dev Nagar, Karol Bagh, New Delhi, Delhi 110005",
    mapsUrl: "https://maps.app.goo.gl/n9Wc4HL35MtTn84G8",
    phone: process.env.PUBLIC_PHONE || null,
    active: true,
    weeklyHours: [{ day: 6, opensAt: "11:00", closesAt: "19:00" }],
  },
];

async function seedDevelopment(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Development seed is disabled unless NODE_ENV=development.");
  }
  await connectMongo();
  for (const location of locations) {
    await ClinicLocationModel.updateOne(
      { locationId: location.locationId },
      {
        $setOnInsert: {
          locationId: location.locationId,
          name: location.name,
          clinicName: location.clinicName,
          address: location.address,
          mapsUrl: location.mapsUrl,
          phone: location.phone,
          active: location.active,
        },
      },
      { upsert: true },
    );
    await DoctorScheduleModel.updateOne(
      { locationId: location.locationId },
      {
        $setOnInsert: {
          locationId: location.locationId,
          weeklyHours: location.weeklyHours,
          slotDurationMinutes: 60,
        },
      },
      { upsert: true },
    );
  }
  logger.info({ locations: locations.length }, "Development clinic schedules seeded");
}

seedDevelopment()
  .catch((error: unknown) => {
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Could not seed development clinic schedules",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  });
