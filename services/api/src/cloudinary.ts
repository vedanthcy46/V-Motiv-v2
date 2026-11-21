import { v2 as cloudinary, type UploadApiResponse, type UploadApiOptions } from 'cloudinary';
import crypto from 'node:crypto';

let isConfigured = false;

type CloudinaryCredentials = { cloudName: string; apiKey: string; apiSecret: string };

function getCloudinaryCredentials(): CloudinaryCredentials | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret };

  const url = process.env.CLOUDINARY_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const inferredCloudName = parsed.hostname.split('.')[0];
    const inferredApiKey = decodeURIComponent(parsed.username);
    const inferredApiSecret = decodeURIComponent(parsed.password);
    return inferredCloudName && inferredApiKey && inferredApiSecret
      ? { cloudName: inferredCloudName, apiKey: inferredApiKey, apiSecret: inferredApiSecret }
      : null;
  } catch {
    return null;
  }
}

function isCloudflareWorkerRuntime(): boolean {
  return typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';
}

export function configureCloudinary() {
  if (isConfigured) return;

  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (cloudinaryUrl) {
    cloudinary.config({
      cloudinary_url: cloudinaryUrl,
    });
    isConfigured = true;
  } else if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    isConfigured = true;
  }
}

export function isCloudinaryConfigured(): boolean {
  if (isCloudflareWorkerRuntime()) return Boolean(getCloudinaryCredentials());
  configureCloudinary();
  const config = cloudinary.config();
  return Boolean(config.cloud_name && config.api_key && config.api_secret);
}

async function uploadToCloudinaryOverHttp(params: {
  buffer: Buffer;
  folder: string;
  filename?: string;
  mimeType?: string;
  resourceType: 'image' | 'video' | 'raw';
  tags?: string[];
  checksumSha256: string;
}): Promise<CloudinaryUploadResult> {
  const credentials = getCloudinaryCredentials();
  if (!credentials) throw new Error('CLOUDINARY_NOT_CONFIGURED');

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = params.filename?.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const tags = params.tags?.filter(Boolean).join(',') || undefined;
  const signedParams: Record<string, string | number> = { folder: params.folder, timestamp };
  if (publicId) signedParams.public_id = publicId;
  if (tags) signedParams.tags = tags;
  const signaturePayload = Object.entries(signedParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const signature = crypto.createHash('sha1').update(`${signaturePayload}${credentials.apiSecret}`).digest('hex');

  const form = new FormData();
  form.set('api_key', credentials.apiKey);
  form.set('timestamp', String(timestamp));
  form.set('signature', signature);
  form.set('folder', params.folder);
  if (publicId) form.set('public_id', publicId);
  if (tags) form.set('tags', tags);
  form.set('file', new Blob([new Uint8Array(params.buffer)], { type: params.mimeType || 'application/octet-stream' }), params.filename || 'upload');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(credentials.cloudName)}/${params.resourceType}/upload`, {
    method: 'POST',
    body: form,
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.secure_url !== 'string' || typeof body.public_id !== 'string') {
    throw new Error(`CLOUDINARY_UPLOAD_FAILED_${response.status}`);
  }
  return {
    url: typeof body.url === 'string' ? body.url : body.secure_url,
    secureUrl: body.secure_url,
    publicId: body.public_id,
    format: typeof body.format === 'string' ? body.format : (params.mimeType?.split('/')[1] || 'bin'),
    byteSize: typeof body.bytes === 'number' ? body.bytes : params.buffer.byteLength,
    resourceType: (body.resource_type as CloudinaryUploadResult['resourceType']) || params.resourceType,
    checksumSha256: params.checksumSha256,
    width: typeof body.width === 'number' ? body.width : undefined,
    height: typeof body.height === 'number' ? body.height : undefined,
    duration: typeof body.duration === 'number' ? body.duration : undefined,
  };
}

export type CloudinaryUploadResult = {
  url: string;
  secureUrl: string;
  publicId: string;
  format: string;
  byteSize: number;
  resourceType: 'image' | 'video' | 'raw';
  checksumSha256: string;
  width?: number;
  height?: number;
  duration?: number;
};

export async function uploadToCloudinary(params: {
  buffer: Buffer;
  folder?: string;
  filename?: string;
  mimeType?: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  tags?: string[];
}): Promise<CloudinaryUploadResult> {
  configureCloudinary();

  if (!isCloudinaryConfigured()) {
    throw new Error('CLOUDINARY_NOT_CONFIGURED');
  }

  const { buffer, folder = 'vmotiv', filename, mimeType, tags } = params;

  let resourceType: 'image' | 'video' | 'raw' | 'auto' = params.resourceType || 'auto';
  if (resourceType === 'auto' && mimeType) {
    if (mimeType.startsWith('image/')) resourceType = 'image';
    else if (mimeType.startsWith('video/')) resourceType = 'video';
    else resourceType = 'raw';
  }

  const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  if (isCloudflareWorkerRuntime()) {
    return uploadToCloudinaryOverHttp({
      buffer,
      folder,
      filename,
      mimeType,
      resourceType: resourceType === 'auto' ? 'image' : resourceType,
      tags,
      checksumSha256,
    });
  }

  const options: UploadApiOptions = {
    folder,
    resource_type: resourceType,
    tags,
    use_filename: Boolean(filename),
    unique_filename: true,
    overwrite: true,
  };

  if (filename) {
    options.public_id = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error: unknown, result?: UploadApiResponse) => {
        if (error || !result) {
          return reject(error || new Error('CLOUDINARY_UPLOAD_FAILED'));
        }
        resolve({
          url: result.url,
          secureUrl: result.secure_url,
          publicId: result.public_id,
          format: result.format || (mimeType ? (mimeType.split('/')[1] || 'bin') : 'bin'),
          byteSize: result.bytes,
          resourceType: (result.resource_type as 'image' | 'video' | 'raw') || (resourceType === 'auto' ? 'image' : resourceType),
          checksumSha256,
          width: result.width,
          height: result.height,
          duration: result.duration,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * What the operations portal needs to upload a photo or video straight to our Cloudinary account: the public account name and key, a time
 * stamp, a fixed folder, and a signature made with the secret (which is never sent). Null when Cloudinary is not configured.
 * The signature covers the folder and time stamp only, so it cannot be reused to upload somewhere else, and it expires quickly.
 */
export function signDirectUpload(folder: string, now: number = Math.floor(Date.now() / 1000)): { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string } | null {
  const credentials = getCloudinaryCredentials();
  if (!credentials) return null;
  const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${now}${credentials.apiSecret}`).digest('hex');
  return { cloudName: credentials.cloudName, apiKey: credentials.apiKey, timestamp: now, folder, signature };
}

/** The account name, for checking that media addresses come from our own account. */
export function cloudinaryCloudName(): string | null {
  return getCloudinaryCredentials()?.cloudName ?? null;
}

export function getCloudinaryClient() {
  configureCloudinary();
  return cloudinary;
}
