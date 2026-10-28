# V MOTIV Connect — Customer Garage Linking & Ownership Controls

## 1. Security Threat Model & Linking Rules
Registration numbers are publicly visible on vehicle license plates. Therefore:
> [!CAUTION]
> A registration number is **NEVER** accepted as sole proof of vehicle ownership or sticker control. 
> Knowing a vehicle's plate number or having seen a QR code in passing must never allow an attacker to hijack a sticker.

### Core Guardrails:
1. **Authenticated Session Requirement**:
   - The user must hold an authenticated V MOTIV account with a verified telephone number and session token.
2. **Garage Ownership Validation**:
   - The user must own the target `CustomerVehicle` record in V2 PostgreSQL (`vehicle.userId === authenticatedUser.id`).
3. **Cryptographic Entropy**:
   - The user must provide the exact 64-character raw token or the full printed URL (`https://.../v/<rawToken>`).
   - If configured on the sticker batch, a physical scratch-off Claim Code PIN must also be supplied.
4. **Single-Owner Invariant**:
   - A single QR token cannot be linked to multiple vehicles simultaneously.
   - If an existing active link exists for that token, the API rejects linking with `HTTP 409 Conflict` (`TOKEN_ALREADY_CLAIMED`).

---

## 2. API Contract: POST /api/v2/customer/garage/:id/connect/link

### Request Payload
```json
{
  "token": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "qrUrl": "https://v-motiv.netlify.app/v/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "claimCode": "948271"
}
```
*(Either `token` or `qrUrl` is required. If `qrUrl` is provided, the API automatically extracts the terminal path token).*

### Server Verification Logic
```ts
// 1. Extract raw token
const rawToken = input.qrUrl ? extractTokenFromUrl(input.qrUrl) : input.token;
if (!rawToken || rawToken.length < 16) throw new BadRequestError('Invalid token format');

// 2. Compute SHA-256
const tokenHash = sha256(rawToken);

// 3. Check for existing active claim
const existing = await prisma.customerGarageConnectLink.findUnique({ where: { qrTokenHash: tokenHash } });
if (existing && existing.status !== 'REVOKED' && existing.vehicleId !== vehicleId) {
  throw new ConflictError('This QR sticker is already linked to another vehicle.');
}

// 4. Create or update link record
const link = await prisma.customerGarageConnectLink.upsert({
  where: { vehicleId },
  create: {
    vehicleId,
    userId,
    qrTokenHash: tokenHash,
    qrTokenPreview: `vm_${rawToken.slice(0, 6)}...`,
    status: 'ACTIVE',
  },
  update: {
    qrTokenHash: tokenHash,
    qrTokenPreview: `vm_${rawToken.slice(0, 6)}...`,
    status: 'ACTIVE',
    lastSyncedAt: new Date(),
  }
});
```

---

## 3. Vehicle Ownership Transfer / Sale Procedure
When a vehicle is sold (via V MOTIV Sales Portal or privately):
1. **Automatic Revocation**:
   - When a selling request achieves `SALE_CLOSED`, the backend automatically marks any associated `CustomerGarageConnectLink` as `REVOKED`.
2. **Preventing Prior Owner Stalking**:
   - The previous owner loses all access to scan alerts, call logs, and messaging history.
   - The new owner is supplied with a brand-new sticker pack during vehicle delivery.
