# Cashfree payments

Rental and service payments in the customer app go through Cashfree. Test mode and live mode use the same code; only
the keys and `CASHFREE_ENV` change.

## Set up (server)

| Variable | Value |
| --- | --- |
| `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` | From the Cashfree dashboard (test keys for testing, live keys later) |
| `CASHFREE_ENV` | `sandbox` (default) or `production` |
| `API_PUBLIC_URL` | Public https address of this API. Cashfree redirects customers and calls the webhook here. |

In the Cashfree dashboard, set the webhook URL to `<API_PUBLIC_URL>/api/v2/payments/cashfree/webhook` and subscribe to
the payment-success event. Keys are never sent to the app. Without keys, the app falls back to the demo payment in
development, and production refuses Cashfree payments (`PAYMENT_GATEWAY_NOT_CONFIGURED`).

Going live: replace the keys, set `CASHFREE_ENV=production`, update the webhook URL in the live dashboard. No code change.

## How a payment works

1. The app calls `POST /payments/cashfree/orders` with `{ kind: 'RENTAL' | 'SERVICE', referenceId }`. The amount comes
   from our records (the pending rental payment, or the service balance; a service payment may be part of the balance).
   The order is stored in `GatewayOrder`, bound to the customer.
2. The app opens the returned `checkoutUrl` in the browser. That page starts Cashfree checkout.
3. Cashfree sends the customer to `/payments/cashfree/return`. The server asks Cashfree whether the order is paid,
   records the payment through the normal rental or service verification, and sends the customer back with
   `vmotiv://payment-result`.
4. The webhook does the same if the customer never came back, so a paid order is never lost. Recording is repeat-safe.

Every payment is confirmed with Cashfree server-to-server (order paid, payment id matches, INR, amount covers what is
owed). The existing verify endpoints accept `paymentGateway: 'CASHFREE'` and apply the same check.

## Testing

Use Cashfree's test cards or UPI test handles in the sandbox checkout. Automated tests mock Cashfree
(`test/cashfree-gateway.test.ts`, `test/cashfree-router.test.ts`).

## Not covered yet

Buying a car is paid through Finance (receipts recorded by staff); there is no in-app car payment to connect.
Refunds to customers are still recorded manually in Finance.
