import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaCustomerStore } from '../src/customer-store.js';
import { PrismaSalesStore, type SalesActor } from '../src/sales-store.js';
import { NotificationService } from '../src/notification/index.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Test drive executive, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const notifications = new NotificationService(db);
  const sales = new PrismaSalesStore(db, undefined, notifications);
  const customers = new PrismaCustomerStore(db, notifications);
  afterAll(() => db.$disconnect());

  async function employee(name: string, phone: string | null) {
    const user = await db.user.create({ data: { firebaseUid: `${name}-${crypto.randomUUID()}`, email: `${name}-${crypto.randomUUID()}@example.test`, displayName: name, phone } });
    await db.employee.create({ data: { userId: user.id, role: 'SALES_EXECUTIVE', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `E-${crypto.randomUUID().slice(0, 8)}`.toUpperCase(), permissions: [] } });
    return { user, actor: { userId: user.id, email: user.email, displayName: name, employeeCode: null, roles: ['SALES_EXECUTIVE'], branches: [], globalScope: true } as SalesActor };
  }

  async function drive() {
    const customer = await db.user.create({ data: { firebaseUid: `c-${crypto.randomUUID()}`, email: `c-${crypto.randomUUID()}@example.test`, displayName: 'Customer' } });
    const vehicle = await db.vehicle.create({ data: { make: 'Hyundai', model: 'Creta', variant: 'SX', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 30000 } });
    const listing = await db.vehicleListing.create({ data: { vehicleId: vehicle.id, title: '2021 Creta', pricePaise: 57_500_000n, status: 'PUBLISHED' } });
    const td = await db.testDriveRequest.create({ data: { userId: customer.id, listingId: listing.id, requestedDate: new Date('2030-01-15T00:00:00Z'), timeSlot: '10:00', serviceCity: 'Bengaluru' } });
    return { customer, td };
  }

  it('shows no pilot before confirmation, then the real person who confirmed', async () => {
    const advisor = await employee('Asha Rao', '+919800000001');
    const { customer, td } = await drive();

    const before = (await customers.drive(customer.firebaseUid, td.id)) as any;
    expect(before.executive).toBeNull();

    await sales.updateTestDriveStatus(advisor.actor, td.id, { status: 'CONFIRMED' });
    const after = (await customers.drive(customer.firebaseUid, td.id)) as any;
    expect(after.executive).toEqual({ name: 'Asha Rao', phone: '+919800000001' });
    expect(((await customers.drives(customer.firebaseUid)) as any[])[0].executive.name).toBe('Asha Rao');
    expect(await db.notification.count({ where: { userId: customer.id, eventType: 'TEST_DRIVE_CONFIRMED' } })).toBe(1);
  });

  it('lets Sales pick another colleague, tells them, and can reassign later', async () => {
    const advisor = await employee('Asha Rao', null);
    const driver = await employee('Ravi Kumar', '+919800000002');
    const other = await employee('Meena Das', '+919800000003');
    const { customer, td } = await drive();

    await sales.updateTestDriveStatus(advisor.actor, td.id, { status: 'CONFIRMED', assignedEmployeeId: driver.user.id });
    expect(((await customers.drive(customer.firebaseUid, td.id)) as any).executive.name).toBe('Ravi Kumar');
    expect(await db.notification.count({ where: { userId: driver.user.id, eventType: 'TEST_DRIVE_CONFIRMED' } })).toBe(1);

    await sales.updateTestDriveStatus(advisor.actor, td.id, { status: 'CONFIRMED', assignedEmployeeId: other.user.id });
    expect(((await customers.drive(customer.firebaseUid, td.id)) as any).executive.name).toBe('Meena Das');
  });

  it('refuses someone who is not an active employee, and hides the executive once cancelled', async () => {
    const advisor = await employee('Asha Rao', null);
    const outsider = await db.user.create({ data: { firebaseUid: `o-${crypto.randomUUID()}`, email: `o-${crypto.randomUUID()}@example.test`, displayName: 'Outsider' } });
    const { customer, td } = await drive();
    await expect(sales.updateTestDriveStatus(advisor.actor, td.id, { status: 'CONFIRMED', assignedEmployeeId: outsider.id })).rejects.toMatchObject({ code: 'TEST_DRIVE_EXECUTIVE_NOT_AVAILABLE' });
    expect(((await customers.drive(customer.firebaseUid, td.id)) as any).status).toBe('REQUESTED');

    await sales.updateTestDriveStatus(advisor.actor, td.id, { status: 'CONFIRMED' });
    await sales.updateTestDriveStatus(advisor.actor, td.id, { status: 'CANCELLED' });
    expect(((await customers.drive(customer.firebaseUid, td.id)) as any).executive).toBeNull();
  });
});
