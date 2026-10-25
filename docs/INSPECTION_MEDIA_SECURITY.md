# V MOTIV V2 — Inspection Evidence & Media Security

## 1. Zero Public Media Exposure

Inspection photographs contain sensitive private information:
- Customer location and vehicle storage conditions
- Legible registration plates and chassis/VIN numbers
- Vehicle RC and insurance documents containing owner personal data

**Rule**: Inspection media is never stored in publicly accessible buckets or exposed through static public URLs.

## 2. Secure Upload Flow & Cryptographic Verification

```
Inspector Mobile App
    ↓  1. POST /api/v2/inspector/reports/:id/media/initiate { logicalMediaId, mimeType }
API validates active assignment and report draft status
    ↓  Returns upload target & size limits (max 15MB)
Inspector Captures Photo & Computes SHA-256
    ↓  2. POST /api/v2/inspector/reports/:id/media/:mediaId/upload
API receives payload (base64 or binary):
  - Validates MIME type: image/jpeg, image/png, image/webp
  - Computes server-side SHA-256 hash: crypto.createHash('sha256').update(buffer).digest('hex')
  - Validates clientChecksum === serverChecksum (throws 400 CHECKSUM_MISMATCH on divergence)
  - Prevents path traversal via path.resolve() checks
  - Writes to secure private disk store / object storage: storage/inspection-media/<reportId>/<logicalId>-<timestamp>.<ext>
  - Upserts InspectionMedia database record
  - Logs INSPECTION_MEDIA_UPLOADED audit event
```

## 3. Authenticated Streaming Access

Media files are accessed exclusively through authorized endpoints:
- Inspector: `GET /api/v2/inspector/reports/:id/media/:mediaId/content`
- Reviewer: `GET /api/v2/inspection-review/reports/:id/media/:mediaId/content`

### Access Control Rules:
1. Valid Firebase Bearer token must be presented.
2. The user must be the assigned Inspector for this specific report OR an authorized Quality Reviewer / Super Admin with branch scope.
3. The server sets:
   - `Content-Type: image/jpeg` (or png/webp)
   - `Cache-Control: private, max-age=86400`
   - Content is streamed securely directly from storage.
