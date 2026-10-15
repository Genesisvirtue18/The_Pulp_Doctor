import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const MAX_REFERRAL_FILE_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export class PrivateStorageUnavailableError extends Error {
  constructor() {
    super("Private referral file storage is not configured.");
    this.name = "PrivateStorageUnavailableError";
  }
}

export class InvalidReferralFileError extends Error {
  constructor(message = "The uploaded file failed type or size validation.") {
    super(message);
    this.name = "InvalidReferralFileError";
  }
}

function getStorageConfig() {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new PrivateStorageUnavailableError();
  }

  const endpoint = process.env.S3_ENDPOINT;
  return {
    bucket,
    client: new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export function validateReferralFileMetadata(
  fileName: string,
  contentType: string,
  fileSize: number,
): string {
  const extension = MIME_EXTENSIONS[contentType];
  if (!extension || fileSize < 1 || fileSize > MAX_REFERRAL_FILE_SIZE) {
    throw new InvalidReferralFileError();
  }
  const safeName = fileName.toLowerCase();
  if (!safeName.endsWith(`.${extension}`)) {
    throw new InvalidReferralFileError(
      "The file extension does not match its approved content type.",
    );
  }
  return extension;
}

export async function createReferralUploadUrl(input: {
  fileName: string;
  contentType: string;
  fileSize: number;
}): Promise<{ uploadId: string; uploadUrl: string; objectKey: string; expiresAt: Date }> {
  const extension = validateReferralFileMetadata(
    input.fileName,
    input.contentType,
    input.fileSize,
  );
  const { bucket, client } = getStorageConfig();
  const uploadId = randomUUID();
  const objectKey = `referrals/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ServerSideEncryption: "AES256",
      Metadata: { "upload-id": uploadId },
    }),
    { expiresIn: 600 },
  );
  return { uploadId, uploadUrl, objectKey, expiresAt };
}

function hasValidFileSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  if (contentType === "application/pdf") {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  }
  return false;
}

export async function verifyPrivateUpload(input: {
  objectKey: string;
  contentType: string;
  fileSize: number;
}): Promise<void> {
  const { bucket, client } = getStorageConfig();
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: input.objectKey }),
  );
  if (
    head.ContentLength !== input.fileSize ||
    head.ContentType !== input.contentType ||
    input.fileSize > MAX_REFERRAL_FILE_SIZE
  ) {
    throw new InvalidReferralFileError();
  }

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      Range: "bytes=0-15",
    }),
  );
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes || !hasValidFileSignature(input.contentType, bytes)) {
    throw new InvalidReferralFileError();
  }
}

export async function createReferralReadUrl(
  objectKey: string,
): Promise<{ url: string; expiresAt: Date }> {
  const { bucket, client } = getStorageConfig();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ResponseContentDisposition: "attachment",
      ResponseContentType: "application/octet-stream",
    }),
    { expiresIn: 300 },
  );
  return { url, expiresAt };
}
