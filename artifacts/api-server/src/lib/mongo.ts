import mongoose from "mongoose";

let connectionAttempt: Promise<typeof mongoose> | null = null;

export class MongoUnavailableError extends Error {
  constructor(message = "MongoDB Atlas is not configured for this environment.") {
    super(message);
    this.name = "MongoUnavailableError";
  }
}

export async function connectMongo(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new MongoUnavailableError();
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connectionAttempt) {
    connectionAttempt = mongoose.connect(uri, {
      appName: "The Pulp Doctor",
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
      autoIndex: true,
    });
  }

  try {
    await connectionAttempt;
    return mongoose;
  } catch (error) {
    connectionAttempt = null;
    throw error;
  }
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}
