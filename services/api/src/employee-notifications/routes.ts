// Where a notification may send someone. A route is a path inside one portal (or the inspector app), never a URL: it is built
// from the event definition and the record id, and checked against this allow-list before it is stored or returned. Opening it
// still goes through the portal's own authorization, so a route never grants access to anything.
export type NotificationModule = 'SALES' | 'OPERATIONS' | 'FINANCE' | 'ADMIN' | 'INSPECTION';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const ID = `(?:${UUID}|[A-Za-z0-9_-]{6,64})`;

const ALLOWED: Record<NotificationModule, RegExp[]> = {
  SALES: [
    new RegExp(`^/seller-leads/${ID}$`), new RegExp(`^/buyer-leads/${ID}$`), new RegExp(`^/quotations/${ID}$`),
    new RegExp(`^/test-drives/${ID}$`), new RegExp(`^/tasks/${ID}$`), /^\/seller-leads$/, /^\/buyer-leads$/, /^\/tasks$/, /^\/scrap-requests$/,
  ],
  OPERATIONS: [
    new RegExp(`^/inspections/requests/${ID}$`), new RegExp(`^/acquisitions/${ID}$`), new RegExp(`^/inventory/${ID}$`),
    new RegExp(`^/service/jobs/${ID}$`), new RegExp(`^/rentals/bookings/${ID}$`), new RegExp(`^/rentals/fleet/${ID}$`),
    /^\/inspections$/, /^\/acquisitions$/, /^\/inventory$/, /^\/service$/, /^\/rentals$/, /^\/publication$/, /^\/refurbishment$/,
  ],
  FINANCE: [
    new RegExp(`^/payments/${ID}$`), new RegExp(`^/payouts/${ID}$`), new RegExp(`^/refunds/${ID}$`), new RegExp(`^/settlements/${ID}$`),
    /^\/payments$/, /^\/payouts$/, /^\/refunds$/, /^\/seller-settlements$/, /^\/reconciliation$/,
  ],
  ADMIN: [
    new RegExp(`^/approvals/${ID}$`), new RegExp(`^/incidents/${ID}$`), /^\/approvals$/, /^\/incidents$/, /^\/health$/, /^\/activity-monitor$/,
  ],
  INSPECTION: [new RegExp(`^/inspections/${ID}$`), new RegExp(`^/reviews/${ID}$`), /^\/reviews$/, /^\/inspections$/],
};

/** True when the route is an allowed path for the module. Anything with a scheme, host, `//` or `..` is refused. */
export function isAllowedActionRoute(module: NotificationModule, route: string | null | undefined): route is string {
  if (!route || route.length > 200 || !route.startsWith('/') || route.startsWith('//')) return false;
  if (/[\s\\]|\.\.|:\/\//.test(route)) return false;
  const path = route.split('?')[0]!;
  return ALLOWED[module].some(pattern => pattern.test(path));
}

/** The portal each module opens in, for the web inbox. */
export const MODULE_PORTAL: Record<NotificationModule, 'sales' | 'ops' | 'finance' | 'admin' | 'inspector'> = {
  SALES: 'sales', OPERATIONS: 'ops', FINANCE: 'finance', ADMIN: 'admin', INSPECTION: 'inspector',
};
