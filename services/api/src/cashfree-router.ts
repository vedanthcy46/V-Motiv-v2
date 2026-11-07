// Pay for a rental booking or a service request through Cashfree.
//
//   POST /payments/cashfree/orders        (signed-in customer)  → creates the Cashfree order, returns where to pay
//   GET  /payments/cashfree/checkout      (opened by the app)    → hosted page that starts Cashfree checkout
//   GET  /payments/cashfree/return        (Cashfree redirects)   → checks the payment with Cashfree, sends the customer back to the app
//   POST /payments/cashfree/webhook       (Cashfree → us)        → settles the payment even if the app was closed
//
// The amount always comes from our own records, never from the app.
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { HttpError } from './errors.js';
import { randomBytes } from 'node:crypto';
import { assertCashfreeWebhookSignature, cashfreeConfig, createCashfreeOrder, describeCashfreeKeys, fetchCashfreeOrder, type CashfreeOptions } from './cashfree-gateway.js';

const SETTLE_SIGNATURE = 'cashfree-server-verified';

export interface CashfreeSettlers {
  /** Record a verified rental payment (idempotent). */
  rental?: (customerId: string, bookingId: string, proof: { paymentGateway: string; gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }) => Promise<unknown>;
  /** Record a verified service payment (idempotent). */
  service?: (customerId: string, requestId: string, proof: { paymentGateway: string; gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string; amountPaise: bigint }) => Promise<unknown>;
}

const createOrderInput = z.object({
  kind: z.enum(['RENTAL', 'SERVICE']),
  referenceId: z.string().uuid(),
  /** Service only: pay part of the balance. Defaults to everything outstanding. */
  amountPaise: z.coerce.bigint().positive().optional(),
}).strict();

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

/** Security header for the hosted checkout page: scripts, frames and calls only to Cashfree (plus our own nonce-marked starter script). */
export function checkoutContentSecurityPolicy(nonce: string): string {
  const cashfree = 'https://*.cashfree.com';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://sdk.cashfree.com ${cashfree}`,
    `connect-src 'self' ${cashfree}`,
    `frame-src ${cashfree}`,
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "font-src 'self' https: data:",
    "form-action 'self' https:",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

export function publicBaseUrl(req: { protocol: string; get(name: string): string | undefined }, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.API_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.get('x-forwarded-proto') ?? req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`;
}

export function createCashfreeRouter(deps: { verify: VerifyToken; db: PrismaClient; settle?: CashfreeSettlers; gateway?: CashfreeOptions; appScheme?: string }) {
  const router = Router();
  const auth = authentication(deps.verify);
  const scheme = deps.appScheme ?? 'vmotiv';

  async function customerFor(identity: Identity) {
    // A Firebase uid is not a UUID: comparing it with the UUID `id` column makes Postgres reject the whole query (P2023),
    // so the id match is only added when the value really is a UUID.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.uid);
    const user = await deps.db.user.findFirst({ where: { OR: [{ firebaseUid: identity.uid }, ...(isUuid ? [{ id: identity.uid }] : [])] }, select: { id: true, email: true, displayName: true, phone: true } });
    if (!user) throw new HttpError(404, 'USER_RECORD_NOT_FOUND');
    return user;
  }

  /** What the customer owes for this thing, from our records. */
  async function payable(kind: 'RENTAL' | 'SERVICE', referenceId: string, userId: string, uid: string, requested?: bigint) {
    if (kind === 'RENTAL') {
      const booking = await deps.db.rentalBooking.findUnique({ where: { id: referenceId }, select: { id: true, customerId: true, bookingNumber: true } });
      if (!booking) throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
      if (booking.customerId !== userId) throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
      const pending = await deps.db.rentalPaymentRecord.findFirst({ where: { bookingId: booking.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, select: { amountPaise: true } });
      if (!pending || pending.amountPaise <= 0n) throw new HttpError(409, 'NOTHING_TO_PAY');
      return { amountPaise: pending.amountPaise, label: `Rental ${booking.bookingNumber}`, orderPrefix: `rent_${booking.bookingNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 14)}` };
    }
    const request = await deps.db.serviceRequest.findFirst({ where: { id: referenceId, customerId: { in: [userId, uid].filter(id => /^[0-9a-f-]{36}$/i.test(id)) } }, select: { id: true, outstandingBalancePaise: true, requestNumber: true } as any }) as any;
    if (!request) throw new HttpError(404, 'SERVICE_REQUEST_NOT_FOUND');
    const outstanding: bigint = request.outstandingBalancePaise;
    if (outstanding <= 0n) throw new HttpError(409, 'NOTHING_TO_PAY');
    const amount = requested ?? outstanding;
    if (amount > outstanding) throw new HttpError(400, 'AMOUNT_EXCEEDS_BALANCE');
    return { amountPaise: amount, label: `Service ${request.requestNumber ?? request.id.slice(0, 8)}`, orderPrefix: `svc_${request.id.replace(/-/g, '').slice(0, 12)}` };
  }

  router.post('/payments/cashfree/orders', auth, async (req, res, next) => {
    try {
      if (!cashfreeConfig()) throw new HttpError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED');
      const identity = res.locals.identity as Identity;
      const input = createOrderInput.parse(req.body);
      if (input.kind === 'RENTAL' && input.amountPaise !== undefined) throw new HttpError(400, 'AMOUNT_NOT_ALLOWED');
      const user = await customerFor(identity);
      const due = await payable(input.kind, input.referenceId, user.id, identity.uid, input.amountPaise);
      const orderId = `${due.orderPrefix}_${Date.now().toString(36)}`;
      const base = publicBaseUrl(req);
      const order = await createCashfreeOrder({
        orderId,
        amountPaise: due.amountPaise,
        customerId: user.id,
        customerPhone: user.phone,
        customerEmail: user.email,
        customerName: user.displayName,
        returnUrl: `${base}/api/v2/payments/cashfree/return?order_id=${orderId}`,
        notifyUrl: `${base}/api/v2/payments/cashfree/webhook`,
        note: due.label,
      }, deps.gateway);
      await deps.db.gatewayOrder.create({ data: { provider: 'CASHFREE', orderId, kind: input.kind, referenceId: input.referenceId, customerId: user.id, amountPaise: due.amountPaise } });
      res.status(201).json({
        provider: 'CASHFREE',
        mode: cashfreeConfig()!.mode,
        orderId,
        amountPaise: due.amountPaise.toString(),
        paymentSessionId: order.paymentSessionId,
        checkoutUrl: `${base}/api/v2/payments/cashfree/checkout?session=${encodeURIComponent(order.paymentSessionId)}`,
      });
    } catch (error) { next(error); }
  });

  // Hosted page: loads Cashfree's checkout script and starts payment. The session id is single-purpose and unguessable.
  // Whether THIS server can see the Cashfree credentials (never the credentials themselves) - for diagnosing "not configured".
  router.get('/payments/cashfree/status', (_req, res) => {
    const config = cashfreeConfig();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      configured: Boolean(config),
      mode: config?.mode ?? null,
      appIdPresent: Boolean(process.env.CASHFREE_APP_ID?.trim()),
      secretPresent: Boolean(process.env.CASHFREE_SECRET_KEY?.trim()),
      nodeEnv: process.env.NODE_ENV ?? null,
      keys: describeCashfreeKeys(),
    });
  });

  router.get('/payments/cashfree/checkout', (req, res) => {
    const session = typeof req.query.session === 'string' ? req.query.session : '';
    const config = cashfreeConfig();
    if (!config || !/^[A-Za-z0-9_=-]{10,600}$/.test(session)) { res.status(400).type('html').send('<p>This payment link is not valid.</p>'); return; }
    res.setHeader('Cache-Control', 'no-store');
    // The API's default security header only lets pages run scripts from our own server, which would block Cashfree's checkout
    // script and leave this page on "Opening secure payment..." forever. This one page gets its own header that allows Cashfree
    // (and our single inline starter script, by nonce) and nothing else.
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', checkoutContentSecurityPolicy(nonce));
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V MOTIV payment</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#0b2545}</style></head>
<body><p id="m">Opening secure payment…</p>
<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
<script nonce="${nonce}">
  try {
    var cashfree = Cashfree({ mode: "${config.mode}" });
    cashfree.checkout({ paymentSessionId: ${JSON.stringify(session)}, redirectTarget: "_self" });
  } catch (e) { document.getElementById("m").textContent = "Could not open the payment page. Please go back and try again."; }
</script></body></html>`);
  });

  // Cashfree sends the customer here when they finish. We ask Cashfree what happened, then hand control back to the app.
  router.get('/payments/cashfree/return', async (req, res) => {
    const orderId = typeof req.query.order_id === 'string' ? req.query.order_id : '';
    let status = 'PENDING';
    let paymentId = '';
    try {
      const order = await fetchCashfreeOrder(orderId, deps.gateway);
      paymentId = order.paymentId ?? '';
      status = order.status === 'PAID' ? 'SUCCESS' : order.status === 'EXPIRED' ? 'FAILED' : 'PENDING';
      if (status === 'SUCCESS') await settleOrder(orderId).catch(() => undefined);
    } catch { /* the app re-checks; show a neutral result */ }
    const link = `${scheme}://payment-result?status=${status}&orderId=${encodeURIComponent(orderId)}&paymentId=${encodeURIComponent(paymentId)}`;
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${escapeHtml(link)}"><title>V MOTIV payment</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;color:#0b2545}a{display:inline-block;margin-top:12px;padding:12px 20px;border-radius:10px;background:#0b2545;color:#fff;text-decoration:none}</style></head>
<body><div><h2>${status === 'SUCCESS' ? 'Payment received' : status === 'FAILED' ? 'Payment did not go through' : 'Payment is being confirmed'}</h2><p>Returning to the V MOTIV app…</p><a href="${escapeHtml(link)}">Open the app</a></div></body></html>`);
  });

  /** Confirm with Cashfree, then record the payment in the right module. Safe to repeat. */
  async function settleOrder(orderId: string) {
    const record = await deps.db.gatewayOrder.findUnique({ where: { orderId } });
    if (!record) return null;
    if (record.status === 'SETTLED') return record;
    const order = await fetchCashfreeOrder(orderId, deps.gateway);
    if (order.status !== 'PAID' || !order.paymentId) return record;
    const proof = { paymentGateway: 'CASHFREE', gatewayOrderId: orderId, gatewayPaymentId: order.paymentId, gatewaySignature: SETTLE_SIGNATURE };
    if (record.kind === 'RENTAL') await deps.settle?.rental?.(record.customerId, record.referenceId, proof);
    else await deps.settle?.service?.(record.customerId, record.referenceId, { ...proof, amountPaise: record.amountPaise });
    return deps.db.gatewayOrder.update({ where: { orderId }, data: { status: 'SETTLED', gatewayPaymentId: order.paymentId, settledAt: new Date() } });
  }

  // The app can also ask directly (e.g. after returning): our status of an order, settling it if Cashfree says it is paid.
  router.get('/payments/cashfree/orders/:orderId', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const user = await customerFor(identity);
      const record = await deps.db.gatewayOrder.findUnique({ where: { orderId: String(req.params.orderId) } });
      if (!record || record.customerId !== user.id) throw new HttpError(404, 'ORDER_NOT_FOUND');
      const settled = record.status === 'SETTLED' ? record : await settleOrder(record.orderId);
      res.json({ orderId: record.orderId, kind: record.kind, referenceId: record.referenceId, status: settled?.status ?? record.status, gatewayPaymentId: settled?.gatewayPaymentId ?? null });
    } catch (error) { next(error); }
  });

  router.post('/payments/cashfree/webhook', async (req, res, next) => {
    try {
      const raw: string = (req as any).rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      assertCashfreeWebhookSignature(raw, req.headers['x-webhook-timestamp'] as string | undefined, req.headers['x-webhook-signature'] as string | undefined);
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const orderId = payload?.data?.order?.order_id;
      if (payload?.type === 'PAYMENT_SUCCESS_WEBHOOK' && typeof orderId === 'string') await settleOrder(orderId);
      res.json({ received: true });
    } catch (error) { next(error); }
  });

  return router;
}
