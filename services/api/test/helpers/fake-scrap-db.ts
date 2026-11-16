// A tiny in-memory stand-in for the Prisma calls the scrapping store makes. It understands exactly the query shapes the store uses (equality,
// not / in / notIn / gt / contains, OR / AND, ordering, take, cursor + skip, increment) and it enforces the same uniqueness rules as the
// database, including the "one live request per registration" partial index, so races and duplicates behave as they would for real.
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;
const NOT_LIVE = ['DRAFT', 'COMPLETED', 'REJECTED', 'CANCELLED'];

const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

function valueMatches(actual: any, spec: any): boolean {
  if (spec !== null && typeof spec === 'object' && !(spec instanceof Date) && !Array.isArray(spec)) {
    const keys = Object.keys(spec);
    if (keys.every(key => ['not', 'in', 'notIn', 'gt', 'lt', 'gte', 'lte', 'contains', 'mode', 'equals'].includes(key))) {
      return keys.every(key => {
        const expected = spec[key];
        switch (key) {
          case 'not': return !valueMatches(actual, expected);
          case 'in': return (expected as any[]).some(item => same(actual, item));
          case 'notIn': return !(expected as any[]).some(item => same(actual, item));
          case 'gt': return actual > expected;
          case 'gte': return actual >= expected;
          case 'lt': return actual < expected;
          case 'lte': return actual <= expected;
          case 'contains': return typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase());
          case 'equals': return same(actual, expected);
          default: return true;
        }
      });
    }
  }
  return same(actual, spec);
}

export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, spec]) => {
    if (key === 'OR') return (spec as Row[]).some(part => matches(row, part));
    if (key === 'AND') return (spec as Row[]).every(part => matches(row, part));
    if (key === 'NOT') return !matches(row, spec);
    // a condition on a related record (for example `user: { firebaseUid }`): the seed embeds the related record in the row
    const isRelationCondition = spec !== null && typeof spec === 'object' && !(spec instanceof Date) && !Array.isArray(spec)
      && row[key] !== null && typeof row[key] === 'object' && !(row[key] instanceof Date) && !Array.isArray(row[key])
      && !Object.keys(spec).every(part => ['not', 'in', 'notIn', 'gt', 'lt', 'gte', 'lte', 'contains', 'mode', 'equals'].includes(part));
    if (isRelationCondition) return matches(row[key], spec);
    return valueMatches(row[key], spec);
  });
}

function sortRows(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  const order = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const part of order) {
      const [key, direction] = Object.entries(part)[0]!;
      const left = a[key], right = b[key];
      const compare = left instanceof Date && right instanceof Date ? left.getTime() - right.getTime() : left < right ? -1 : left > right ? 1 : 0;
      if (compare !== 0) return direction === 'desc' ? -compare : compare;
    }
    return 0;
  });
}

const DEFAULTS: Record<string, () => Row> = {
  scrapRequest: () => ({ status: 'DRAFT', version: 1, blockingFlags: [], paymentState: 'NOT_STARTED', registrationStatus: 'NOT_STARTED', holdFromStatus: null, holdReason: null, salesAssigneeId: null, partnerId: null, submissionKey: null, registrationNormalized: null, city: null, draftData: null, ownershipDeclaredAt: null, ownershipDeclaration: null, pickupAddress: null, submittedAt: null, completedAt: null, cancelledAt: null, cancelReason: null, customerVehicleId: null }),
  scrapOffer: () => ({ status: 'DRAFT', currency: 'INR', payerType: 'RVSF', approvedAt: null, sentAt: null, termsVersion: null, terms: null }),
  scrapDocument: () => ({ storageKey: null, rejectionReason: null, reviewedAt: null, reviewedById: null }),
  scrapPartner: () => ({ status: 'PENDING_VERIFICATION', serviceAreas: [], approvedCategories: [], registrationValidUntil: null }),
  scrapDispute: () => ({ status: 'OPEN', resolution: null }),
  scrapVehicleSnapshot: () => ({ identitySource: 'CUSTOMER_DECLARED', identityVerifiedAt: null, identityVerifiedById: null, isElectric: false }),
  scrapEstimate: () => ({ currency: 'INR' }),
};

export function makeFakeScrapDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map(row => ({ ...row }));
  const table = (name: string) => (tables[name] ??= []);

  /** The database's own rules, applied on every insert and update. */
  function assertUnique(name: string, candidate: Row, ignoreId?: string) {
    if (name !== 'scrapRequest' && name !== 'scrapOfferAcceptance' && name !== 'scrapEstimate') return;
    const others = table(name).filter(row => row.id !== ignoreId);
    const violation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    if (name === 'scrapOfferAcceptance' && others.some(row => row.offerId === candidate.offerId)) throw violation();
    if (name === 'scrapEstimate' && others.some(row => row.requestId === candidate.requestId && row.version === candidate.version)) throw violation();
    if (name === 'scrapRequest') {
      if (others.some(row => row.requestNumber === candidate.requestNumber)) throw violation();
      if (candidate.submissionKey && others.some(row => row.customerId === candidate.customerId && row.submissionKey === candidate.submissionKey)) throw violation();
      if (candidate.registrationNormalized && !NOT_LIVE.includes(candidate.status) && others.some(row => row.registrationNormalized === candidate.registrationNormalized && !NOT_LIVE.includes(row.status))) throw violation();
    }
  }

  function applyData(row: Row, data: Row): Row {
    const next = { ...row };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in (value as Row)) next[key] = (next[key] ?? 0) + (value as Row).increment;
      else if (value === Prisma.DbNull) next[key] = null;
      else if (value !== undefined) next[key] = value;
    }
    next.updatedAt = new Date();
    return next;
  }

  const model = (name: string) => ({
    create: async ({ data }: Row) => {
      const row: Row = { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...(DEFAULTS[name]?.() ?? {}), ...applyData({}, data) };
      assertUnique(name, row);
      table(name).push(row);
      return { ...row };
    },
    findUnique: async ({ where }: Row) => {
      const row = table(name).find(item => matches(item, where));
      return row ? { ...row } : null;
    },
    findFirst: async ({ where, orderBy }: Row = {}) => {
      const row = sortRows(table(name).filter(item => matches(item, where)), orderBy)[0];
      return row ? { ...row } : null;
    },
    findMany: async ({ where, orderBy, take, cursor, skip }: Row = {}) => {
      let rows = sortRows(table(name).filter(item => matches(item, where)), orderBy);
      if (cursor) { const index = rows.findIndex(item => item.id === cursor.id); rows = index >= 0 ? rows.slice(index + (skip ?? 0)) : []; }
      if (take !== undefined) rows = rows.slice(0, take);
      return rows.map(row => ({ ...row }));
    },
    count: async ({ where }: Row = {}) => table(name).filter(item => matches(item, where)).length,
    update: async ({ where, data }: Row) => {
      const index = table(name).findIndex(item => matches(item, where));
      if (index < 0) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
      const next = applyData(table(name)[index]!, data);
      assertUnique(name, next, next.id);
      table(name)[index] = next;
      return { ...next };
    },
    updateMany: async ({ where, data }: Row) => {
      let count = 0;
      for (const [index, row] of table(name).entries()) {
        if (!matches(row, where)) continue;
        const next = applyData(row, data);
        assertUnique(name, next, next.id);
        table(name)[index] = next;
        count += 1;
      }
      return { count };
    },
    deleteMany: async ({ where }: Row = {}) => {
      const before = table(name).length;
      tables[name] = table(name).filter(item => !matches(item, where));
      return { count: before - table(name).length };
    },
  });

  const cache = new Map<string, ReturnType<typeof model>>();
  const overrides: Record<string, unknown> = {};
  const db: any = new Proxy({}, {
    set(_target, property: string, value) { overrides[property] = value; return true; },
    get(_target, property: string) {
      if (property in overrides) return overrides[property];
      if (property === 'tables') return tables;
      if (property === '$transaction') return async (fn: (client: unknown) => unknown) => fn(db);
      if (property === '$queryRaw') return async () => [{ ready: true }];
      if (property === 'then') return undefined;
      if (!cache.has(property)) cache.set(property, model(property));
      return cache.get(property);
    },
  });
  return db as any;
}
