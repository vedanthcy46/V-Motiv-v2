import { v2 as cloudinary, type UploadApiResponse, type UploadApiOptions } from 'cloudinary';
import crypto from 'node:crypto';

let isConfigured = false;

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
  configureCloudinary();
  const config = cloudinary.config();
  return Boolean(config.cloud_name && config.api_key && config.api_secret);
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

export function getCloudinaryClient() {
  configureCloudinary();
  return cloudinary;
}
