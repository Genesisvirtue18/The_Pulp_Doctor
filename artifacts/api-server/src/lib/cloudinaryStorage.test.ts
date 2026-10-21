import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidReferralFileError,
  validateReferralFileBytes,
  validateReferralFileMetadata,
} from "./cloudinaryStorage";

test("referral upload metadata only accepts approved matching extensions and sizes", () => {
  assert.doesNotThrow(() =>
    validateReferralFileMetadata("scan.pdf", "application/pdf", 1024),
  );
  assert.throws(
    () => validateReferralFileMetadata("scan.jpg", "application/pdf", 1024),
    InvalidReferralFileError,
  );
  assert.throws(
    () => validateReferralFileMetadata("scan.pdf", "application/pdf", 10 * 1024 * 1024 + 1),
    InvalidReferralFileError,
  );
});

test("referral upload rejects content whose signature does not match its MIME type", async () => {
  const bytes = Buffer.from("not a png file");
  await assert.rejects(
    validateReferralFileBytes({
      fileName: "scan.png",
      contentType: "image/png",
      expectedSize: bytes.length,
      bytes,
    }),
    InvalidReferralFileError,
  );
});
