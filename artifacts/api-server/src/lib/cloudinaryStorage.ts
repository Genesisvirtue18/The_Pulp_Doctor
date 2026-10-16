import { Readable } from "node:stream";
import { fileTypeFromBuffer } from "file-type";
import { v2 as cloudinary } from "cloudinary";

const MAX_REFERRAL_FILE_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};
const CLOUDINARY_FORMATS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};
const REFERRAL_PUBLIC_ID_PREFIX = "pulp-doctor/referrals";

export class CloudinaryUnavailableError extends Error {
  constructor() {
    super("Cloudinary is not configured.");
    this.name = "CloudinaryUnavailableError";
  }
}

export class CloudinaryUpstreamError extends Error {
  constructor() {
    super("Cloudinary could not complete the file operation.");
    this.name = "CloudinaryUpstreamError";
  }
}

export class InvalidReferralFileError extends Error {
  constructor(message = "The uploaded file failed type or size validation.") {
    super(message);
    this.name = "InvalidReferralFileError";
  }
}

export interface VerifiedCloudinaryUpload {
  cloudinaryAssetId: string;
  cloudinaryPublicId: string;
  resourceType: "image";
  deliveryType: "authenticated";
  format: string;
  fileSize: number;
}

export interface ReferralAssetRecord extends VerifiedCloudinaryUpload {
  createdAt: string;
}

function getCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new CloudinaryUnavailableError();
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return cloudinary;
}

export function ensureCloudinaryConfigured(): void {
  getCloudinary();
}

export function createReferralPublicId(uploadId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${REFERRAL_PUBLIC_ID_PREFIX}/${date}/${uploadId}`;
}

function allowedExtension(fileName: string, contentType: string): string {
  const extensions = MIME_EXTENSIONS[contentType];
  const cleanedName = fileName.split(/[\\/]/).pop() ?? "";
  const extension = cleanedName.split(".").pop()?.toLowerCase() ?? "";
  if (
    !extensions ||
    !extensions.includes(extension) ||
    cleanedName.length < 1 ||
    cleanedName.length > 180
  ) {
    throw new InvalidReferralFileError(
      "The filename extension does not match an approved file type.",
    );
  }
  return extension;
}

export function validateReferralFileMetadata(
  fileName: string,
  contentType: string,
  fileSize: number,
): void {
  allowedExtension(fileName, contentType);
  if (
    !Number.isInteger(fileSize) ||
    fileSize < 1 ||
    fileSize > MAX_REFERRAL_FILE_SIZE
  ) {
    throw new InvalidReferralFileError(
      "Referral attachments must be no larger than 10 MB.",
    );
  }
}

export async function validateReferralFileBytes(input: {
  fileName: string;
  contentType: string;
  expectedSize: number;
  bytes: Buffer;
}): Promise<void> {
  validateReferralFileMetadata(
    input.fileName,
    input.contentType,
    input.expectedSize,
  );
  if (input.bytes.length !== input.expectedSize) {
    throw new InvalidReferralFileError(
      "The uploaded file size does not match the declared size.",
    );
  }
  const detected = await fileTypeFromBuffer(input.bytes);
  if (!detected || detected.mime !== input.contentType) {
    throw new InvalidReferralFileError(
      "The uploaded file contents do not match the selected file type.",
    );
  }
  const expectedExtensions = MIME_EXTENSIONS[input.contentType] ?? [];
  if (!expectedExtensions.includes(detected.ext)) {
    throw new InvalidReferralFileError(
      "The uploaded file contents do not match the filename extension.",
    );
  }
}

function toAssetRecord(asset: Record<string, unknown>): VerifiedCloudinaryUpload {
  const publicId = asset.public_id;
  const assetId = asset.asset_id;
  const resourceType = asset.resource_type;
  const deliveryType = asset.type;
  const format = asset.format;
  const fileSize = asset.bytes;
  if (
    typeof publicId !== "string" ||
    typeof assetId !== "string" ||
    resourceType !== "image" ||
    deliveryType !== "authenticated" ||
    typeof format !== "string" ||
    typeof fileSize !== "number"
  ) {
    throw new InvalidReferralFileError(
      "Cloudinary returned invalid referral file metadata.",
    );
  }
  return {
    cloudinaryAssetId: assetId,
    cloudinaryPublicId: publicId,
    resourceType,
    deliveryType,
    format,
    fileSize,
  };
}

function uploadBuffer(input: {
  publicId: string;
  bytes: Buffer;
}): Promise<VerifiedCloudinaryUpload> {
  const client = getCloudinary();
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        resource_type: "image",
        type: "authenticated",
        public_id: input.publicId,
        overwrite: false,
        unique_filename: false,
        use_filename: false,
        tags: ["pulp-doctor-referral"],
      },
      (error, result) => {
        if (error || !result) {
          reject(new CloudinaryUpstreamError());
          return;
        }
        try {
          resolve(toAssetRecord(result as unknown as Record<string, unknown>));
        } catch (validationError) {
          reject(validationError);
        }
      },
    );
    Readable.from(input.bytes).pipe(stream);
  });
}

export async function storeReferralFile(input: {
  cloudinaryPublicId: string;
  fileName: string;
  contentType: string;
  expectedSize: number;
  bytes: Buffer;
}): Promise<VerifiedCloudinaryUpload> {
  await validateReferralFileBytes({
    fileName: input.fileName,
    contentType: input.contentType,
    expectedSize: input.expectedSize,
    bytes: input.bytes,
  });
  const extension = allowedExtension(input.fileName, input.contentType);
  const asset = await uploadBuffer({
    publicId: input.cloudinaryPublicId,
    bytes: input.bytes,
  });
  const validFormat = CLOUDINARY_FORMATS[input.contentType]?.includes(
    asset.format.toLowerCase(),
  );
  if (
    asset.cloudinaryPublicId !== input.cloudinaryPublicId ||
    asset.resourceType !== "image" ||
    asset.deliveryType !== "authenticated" ||
    asset.fileSize !== input.expectedSize ||
    !validFormat ||
    !MIME_EXTENSIONS[input.contentType]?.includes(extension)
  ) {
    await deleteReferralAsset(asset.cloudinaryPublicId).catch(() => undefined);
    throw new InvalidReferralFileError(
      "Cloudinary did not store the referral file with the expected private metadata.",
    );
  }
  return asset;
}

export async function verifyPrivateUpload(
  input: VerifiedCloudinaryUpload & { contentType: string },
): Promise<void> {
  const expectedFormats = CLOUDINARY_FORMATS[input.contentType];
  if (!expectedFormats) {
    throw new InvalidReferralFileError();
  }
  try {
    const resource = await getCloudinary().api.resource(
      input.cloudinaryPublicId,
      { resource_type: "image", type: "authenticated" },
    );
    const asset = toAssetRecord(resource as unknown as Record<string, unknown>);
    if (
      asset.cloudinaryAssetId !== input.cloudinaryAssetId ||
      asset.cloudinaryPublicId !== input.cloudinaryPublicId ||
      asset.resourceType !== "image" ||
      asset.deliveryType !== "authenticated" ||
      asset.fileSize !== input.fileSize ||
      !expectedFormats.includes(asset.format.toLowerCase())
    ) {
      throw new InvalidReferralFileError(
        "A referral attachment is missing or its stored metadata changed.",
      );
    }
  } catch (error) {
    if (error instanceof InvalidReferralFileError) {
      throw error;
    }
    const statusCode =
      typeof error === "object" && error !== null && "http_code" in error
        ? Number((error as { http_code?: unknown }).http_code)
        : 0;
    if (statusCode === 404) {
      throw new InvalidReferralFileError(
        "A referral attachment is no longer available.",
      );
    }
    throw new CloudinaryUpstreamError();
  }
}

export async function createReferralReadUrl(
  publicId: string,
  format: string,
): Promise<{ url: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  try {
    const url = getCloudinary().utils.private_download_url(publicId, format, {
      resource_type: "image",
      type: "authenticated",
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      attachment: true,
    });
    if (!url.startsWith("https://")) {
      throw new CloudinaryUpstreamError();
    }
    return { url, expiresAt };
  } catch (error) {
    if (error instanceof CloudinaryUnavailableError) {
      throw error;
    }
    throw new CloudinaryUpstreamError();
  }
}

export async function deleteReferralAsset(publicId: string): Promise<void> {
  try {
    const result = await getCloudinary().uploader.destroy(publicId, {
      resource_type: "image",
      type: "authenticated",
      invalidate: true,
    });
    if (result.result !== "ok" && result.result !== "not found") {
      throw new CloudinaryUpstreamError();
    }
  } catch (error) {
    if (
      error instanceof CloudinaryUnavailableError ||
      error instanceof CloudinaryUpstreamError
    ) {
      throw error;
    }
    throw new CloudinaryUpstreamError();
  }
}

export async function listReferralAssets(): Promise<ReferralAssetRecord[]> {
  const assets: ReferralAssetRecord[] = [];
  let nextCursor: string | undefined;
  try {
    do {
      const result = await getCloudinary().api.resources({
        resource_type: "image",
        type: "authenticated",
        prefix: `${REFERRAL_PUBLIC_ID_PREFIX}/`,
        max_results: 500,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      });
      const resources = result.resources as Record<string, unknown>[];
      for (const resource of resources) {
        const record = toAssetRecord(resource);
        const createdAt = resource.created_at;
        if (typeof createdAt !== "string") {
          continue;
        }
        assets.push({ ...record, createdAt });
      }
      nextCursor =
        typeof result.next_cursor === "string" ? result.next_cursor : undefined;
    } while (nextCursor);
    return assets;
  } catch (error) {
    if (error instanceof CloudinaryUnavailableError) {
      throw error;
    }
    throw new CloudinaryUpstreamError();
  }
}
