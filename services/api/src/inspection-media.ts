import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from './errors.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
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
    const relativeKey = `${reportId}/${safeLogicalId}-${Date.now()}.${ext}`;
    const destinationPath = path.resolve(this.baseDir, relativeKey);

    // Prevent path traversal outside storage base directory
    if (!destinationPath.startsWith(this.baseDir)) {
      throw new HttpError(400, 'INVALID_MEDIA_KEY');
    }

    const parentDir = path.dirname(destinationPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
    }

    await fs.promises.writeFile(destinationPath, buffer);

    return {
      storageKey: relativeKey,
      checksumSha256: calculatedChecksum,
      byteSize: buffer.length,
      mimeType,
    };
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
    const filePath = this.getMediaPath(storageKey);
    const buffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return { buffer, mimeType };
  }
}
