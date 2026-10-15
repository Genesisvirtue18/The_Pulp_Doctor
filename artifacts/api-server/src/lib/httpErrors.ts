import type { Request, Response } from "express";
import { isDuplicateKeyError, MongoUnavailableError } from "./mongo";
import { InvalidReferralFileError, PrivateStorageUnavailableError } from "./privateStorage";
import { ClinicNotFoundError, SlotUnavailableError } from "../services/clinic";

export function sendApiError(
  req: Request,
  res: Response,
  error: unknown,
): void {
  if (error instanceof MongoUnavailableError) {
    res.status(503).json({ error: "MongoDB Atlas is not configured." });
    return;
  }
  if (error instanceof PrivateStorageUnavailableError) {
    res.status(503).json({ error: "Private referral file storage is not configured." });
    return;
  }
  if (error instanceof InvalidReferralFileError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof ClinicNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof SlotUnavailableError || isDuplicateKeyError(error)) {
    res.status(409).json({
      error:
        error instanceof Error
          ? error.message
          : "That appointment time is no longer available.",
    });
    return;
  }
  if (
    error instanceof Error &&
    (error.name === "MongooseServerSelectionError" ||
      error.name === "MongoNetworkError" ||
      error.name === "MongoServerError")
  ) {
    req.log.warn({ errorName: error.name }, "MongoDB request could not connect");
    res.status(503).json({ error: "The database is temporarily unavailable." });
    return;
  }
  req.log.error(
    {
      errorName: error instanceof Error ? error.name : "UnknownError",
    },
    "API request failed",
  );
  res.status(500).json({ error: "The request could not be completed." });
}
