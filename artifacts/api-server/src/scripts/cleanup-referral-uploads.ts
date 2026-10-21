import { connectMongo } from "../lib/mongo";
import {
  deleteReferralAsset,
  listReferralAssets,
} from "../lib/cloudinaryStorage";
import { ReferralModel, ReferralUploadModel } from "../models/referral";
import { logger } from "../lib/logger";

const ORPHAN_GRACE_MS = 60 * 60 * 1000;
const USED_RESERVATION_RETENTION_MS = 24 * 60 * 60 * 1000;

async function cleanupReferralUploads(): Promise<void> {
  await connectMongo();
  const now = new Date();
  const [uploads, referrals, assets] = await Promise.all([
    ReferralUploadModel.find().select("cloudinaryPublicId expiresAt usedAt createdAt"),
    ReferralModel.find().select("attachments.cloudinaryPublicId"),
    listReferralAssets(),
  ]);

  const referencedAssets = new Set<string>();
  for (const referral of referrals) {
    for (const attachment of referral.attachments) {
      referencedAssets.add(attachment.cloudinaryPublicId);
    }
  }
  for (const upload of uploads) {
    referencedAssets.add(upload.cloudinaryPublicId);
  }

  for (const upload of uploads) {
    const consumedAndOld =
      upload.usedAt &&
      upload.createdAt.getTime() <= now.getTime() - USED_RESERVATION_RETENTION_MS;
    const expiredAndUnused = !upload.usedAt && upload.expiresAt <= now;
    if (!consumedAndOld && !expiredAndUnused) {
      continue;
    }
    if (expiredAndUnused && upload.cloudinaryPublicId) {
      const isReferenced = referrals.some((referral) =>
        referral.attachments.some(
          (attachment) =>
            attachment.cloudinaryPublicId === upload.cloudinaryPublicId,
        ),
      );
      if (isReferenced) {
        continue;
      }
      if (upload.cloudinaryAssetId) {
        await deleteReferralAsset(upload.cloudinaryPublicId);
      }
    }
    await ReferralUploadModel.deleteOne({ _id: upload._id });
  }

  const orphanCutoff = now.getTime() - ORPHAN_GRACE_MS;
  for (const asset of assets) {
    if (
      new Date(asset.createdAt).getTime() < orphanCutoff &&
      !referencedAssets.has(asset.cloudinaryPublicId)
    ) {
      await deleteReferralAsset(asset.cloudinaryPublicId);
      logger.info({ cloudinaryAssetId: asset.cloudinaryAssetId }, "Removed orphaned referral upload");
    }
  }
}

cleanupReferralUploads()
  .then(() => {
    logger.info("Referral upload cleanup completed.");
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Referral upload cleanup failed",
    );
    process.exitCode = 1;
  });
