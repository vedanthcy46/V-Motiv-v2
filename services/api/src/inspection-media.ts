import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from './errors.js';
import { isCloudinaryConfigured, uploadToCloudinary } from './cloudinary.js';

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/svg+xml',
  // Videos
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',
  'video/x-msvideo',
  'video/mpeg',
  // Files / Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/x-msvideo': 'avi',
  'video/mpeg': 'mpeg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
};

export class InspectionMediaService {
  private baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir
      ? path.resolve(customDir)
      : path.resolve(process.cwd(), 'storage/inspection-media');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }

  calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  async storeMedia(params: {
    reportId: string;
    logicalMediaId: string;
    buffer: Buffer;
    mimeType: string;
    clientChecksum?: string;
  }): Promise<{
    storageKey: string;
    checksumSha256: string;
    byteSize: number;
    mimeType: string;
  }> {
    const { reportId, logicalMediaId, buffer, mimeType, clientChecksum } = params;

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new HttpError(400, 'UNSUPPORTED_MEDIA_TYPE');
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new HttpError(413, 'MEDIA_FILE_TOO_LARGE');
    }

    if (buffer.length === 0) {
      throw new HttpError(400, 'EMPTY_MEDIA_PAYLOAD');
    }

    const calculatedChecksum = this.calculateChecksum(buffer);
    if (clientChecksum && clientChecksum.toLowerCase() !== calculatedChecksum.toLowerCase()) {
      throw new HttpError(400, 'CHECKSUM_MISMATCH');
    }

    const ext = MIME_EXTENSION_MAP[mimeType] || 'bin';
    const safeLogicalId = logicalMediaId.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 1. When Cloudinary is configured, upload directly to cloud storage without storing on local disk
    if (isCloudinaryConfigured()) {
      try {
        const cloudResult = await uploadToCloudinary({
          buffer,
          folder: `vmotiv/inspections/${reportId}`,
          filename: `${safeLogicalId}-${Date.now()}`,
          mimeType,
          tags: ['inspection', `report-${reportId}`, safeLogicalId],
        });

        // Cloudinary upload successful - no local disk storage required
        return {
          storageKey: cloudResult.secureUrl,
          checksumSha256: calculatedChecksum,
          byteSize: cloudResult.byteSize,
          mimeType,
        };
      } catch (cloudErr) {
        console.error('[CLOUDINARY_UPLOAD_ERROR, FALLING_BACK_TO_LOCAL]', cloudErr);
      }
    }

    // 2. Fallback to local storage ONLY if Cloudinary is unconfigured or failed
    const relativeKey = `${reportId}/${safeLogicalId}-${Date.now()}.${ext}`;
    const destinationPath = path.resolve(this.baseDir, relativeKey);
    if (destinationPath.startsWith(this.baseDir)) {
      const parentDir = path.dirname(destinationPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
      }
      try {
        await fs.promises.writeFile(destinationPath, buffer);
      } catch (writeErr) {
        console.warn('[LOCAL_MEDIA_CACHE_WARNING]', writeErr);
      }
    }

    return {
      storageKey: relativeKey,
      checksumSha256: calculatedChecksum,
      byteSize: buffer.length,
      mimeType,
    };
  }

  async cleanupReportLocalMedia(reportId: string): Promise<void> {
    const reportDir = path.resolve(this.baseDir, reportId);
    if (reportDir.startsWith(this.baseDir) && fs.existsSync(reportDir)) {
      try {
        await fs.promises.rm(reportDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('[LOCAL_MEDIA_CLEANUP_ERROR]', err);
      }
    }
  }

  getMediaPath(storageKey: string): string {
    const resolved = path.resolve(this.baseDir, storageKey);
    if (!resolved.startsWith(this.baseDir)) {
      throw new HttpError(400, 'INVALID_MEDIA_KEY');
    }
    if (!fs.existsSync(resolved)) {
      throw new HttpError(404, 'MEDIA_FILE_NOT_FOUND');
    }
    return resolved;
  }

  async readMedia(storageKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
    // If stored on Cloudinary (or remote URL)
    if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      try {
        const res = await fetch(storageKey);
        if (!res.ok) {
          throw new HttpError(res.status, 'REMOTE_MEDIA_FETCH_FAILED');
        }
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = res.headers.get('content-type') || 'image/jpeg';
        return { buffer, mimeType };
      } catch (remoteErr) {
        console.warn('[REMOTE_MEDIA_FETCH_ERROR, CHECKING_LOCAL_CACHE]', remoteErr);
      }
    }

    // Local file storage
    const filePath = this.getMediaPath(storageKey);
    const buffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mimeType =
      ext === 'png' ? 'image/png' :
      ext === 'webp' ? 'image/webp' :
      ext === 'mp4' ? 'video/mp4' :
      ext === 'pdf' ? 'application/pdf' :
      'image/jpeg';
    return { buffer, mimeType };
  }
}
