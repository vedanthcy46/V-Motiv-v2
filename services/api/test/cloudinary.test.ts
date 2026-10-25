import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isCloudinaryConfigured, configureCloudinary } from '../src/cloudinary.js';

describe('Cloudinary Service Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });

  it('detects unconfigured state cleanly without throwing', () => {
    expect(isCloudinaryConfigured()).toBe(false);
  });

  it('configures with individual credentials', () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'vmotiv-cloud';
    process.env.CLOUDINARY_API_KEY = '1234567890';
    process.env.CLOUDINARY_API_SECRET = 'secret123';

    expect(isCloudinaryConfigured()).toBe(true);
  });

  it('configures with CLOUDINARY_URL connection string', () => {
    process.env.CLOUDINARY_URL = 'cloudinary://1234567890:secret123@vmotiv-cloud';

    expect(isCloudinaryConfigured()).toBe(true);
  });
});
