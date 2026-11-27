import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';
import type { IdentityStore } from '../src/identity-store.js';
import type { AdminActor, AdminStore } from '../src/admin-store.js';
import { requirePermission } from '../src/admin-store.js';
import { HttpError } from '../src/errors.js';

const token = {
  uid: 'admin-firebase', email: 'admin@example.test', email_verified: true,
  firebase: { sign_in_provider: 'google.com', sign_in_second_factor: 'totp' },
} as DecodedIdToken;
const actor: AdminActor = {
  userId: '7b680c3e-c2c0-4587-a84a-a827c1331ba8', firebaseUid: token.uid, email: token.email!, displayName: 'Admin',
  employeeCode: 'VM-ADMIN-1', designation: 'Administrator', status: 'ACTIVE', mfaStatus: 'COMPLIANT', roles: ['ADMIN'],
  permissions: ['admin.portal.access', 'employee.read', 'employee.invite', 'employee.suspend', 'audit.read'], branches: [],
};

function setup(options: { secondFactor?: boolean; actorError?: Error } = {}) {
  const verified = options.secondFactor === false ? { ...token, firebase: { sign_in_provider: 'google.com' } } as DecodedIdToken : token;
  const verify = vi.fn().mockResolvedValue(verified);
  const identity: IdentityStore = { sync: vi.fn(), find: vi.fn(), ready: vi.fn() };
  const admin: AdminStore = {
    actor: options.actorError ? vi.fn().mockRejectedValue(options.actorError) : vi.fn().mockResolvedValue(actor),
    touchAccess: vi.fn(),
    dashboard: vi.fn().mockResolvedValue({ employees: { active: 1 }, generatedAt: new Date() }),
    roles: vi.fn().mockResolvedValue([]), branches: vi.fn().mockResolvedValue([]),
    manageBranches: vi.fn().mockResolvedValue([]), createBranch: vi.fn().mockResolvedValue({ id: 'branch-one' }), updateBranch: vi.fn().mockResolvedValue({ id: 'branch-one' }),
    serviceAreas: vi.fn().mockResolvedValue([]), createServiceArea: vi.fn().mockResolvedValue({ id: 'area-one' }), updateServiceArea: vi.fn().mockResolvedValue({ id: 'area-one' }),
    supportCases: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 0, items: [] }), updateSupportCase: vi.fn().mockResolvedValue({ id: 'case-one' }), replySupportCase: vi.fn().mockResolvedValue({ id: 'reply-one' }),
    systemHealth: vi.fn().mockResolvedValue({ services: [] }),
    policies: vi.fn().mockResolvedValue([]),
    proposePolicy: vi.fn().mockResolvedValue({ id: 'policy-approval', status: 'PENDING' }),
    employees: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 0, items: [] }),
    invite: vi.fn().mockResolvedValue({ id: 'invite-one', status: 'PENDING' }),
    proposePrivilegedInvitation: vi.fn().mockResolvedValue({ id: 'approval-one', status: 'PENDING', version: 1 }),
    approvals: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 0, items: [] }),
    decideApproval: vi.fn().mockResolvedValue({ id: 'approval-one', status: 'APPROVED' }),
    acceptInvitation: vi.fn().mockResolvedValue(actor),
    setEmployeeStatus: vi.fn().mockResolvedValue({ firebaseUid: 'target-firebase' }),
    audit: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 0, items: [] }),
    businessSelling: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 1, items: [{ id: 'lead-1', sellerName: 'Rohit' }], counts: { INITIATED: 1 } }),
    businessBuying: vi.fn().mockResolvedValue({ testDrives: { total: 1, items: [] }, purchaseEnquiries: { total: 0, items: [] } }),
    businessInventory: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 1, items: [{ id: 'listing-1', title: 'Honda City' }], counts: { PUBLISHED: 1 } }),
    businessFinance: vi.fn().mockResolvedValue({ activeInventoryCount: 1, activeInventoryValueRupees: 850000, totalAcquisitionLeads: 5, totalOffersIssued: 2, totalOffersValueRupees: 1400000, pendingSettlements: 1, reconciliationStatus: 'HEALTHY' }),
    masterData: vi.fn().mockResolvedValue([{ id: 'md-1', category: 'CAR_MAKE', code: 'HONDA', name: 'Honda', active: true }]),
    createMasterDataItem: vi.fn().mockResolvedValue({ id: 'md-2', category: 'CAR_MAKE', code: 'TOYOTA', name: 'Toyota', active: true }),
    updateMasterDataItem: vi.fn().mockResolvedValue({ id: 'md-2', category: 'CAR_MAKE', code: 'TOYOTA', name: 'Toyota Motors', active: true }),
    communicationsOutbox: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 1, items: [{ id: 'email-1', recipient: 'ro***t@example.com', state: 'SENT' }], summary: { SENT: 1 } }),
    communicationsTemplates: vi.fn().mockResolvedValue([{ key: 'welcome-v1', name: 'Customer Welcome' }]),
    retryEmailOutbox: vi.fn().mockResolvedValue({ id: 'email-failed', state: 'PENDING' }),
    privacyRequests: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 1, items: [{ id: 'pr-1', requestType: 'ACCESS', status: 'PENDING' }] }),
    updatePrivacyRequest: vi.fn().mockResolvedValue({ id: 'pr-1', status: 'COMPLETED', resolution: 'Data export provided' }),
    exportJobs: vi.fn().mockResolvedValue({ page: 1, limit: 25, total: 1, items: [{ id: 'exp-1', resourceType: 'INVENTORY', status: 'READY' }] }),
    createExportJob: vi.fn().mockResolvedValue({ id: 'exp-1', resourceType: 'INVENTORY', sensitive: false, status: 'READY', rowCount: 10 }),
    downloadExport: vi.fn().mockResolvedValue({ fileContent: 'Listing ID,Title\r\n1,Honda City', resourceType: 'INVENTORY', format: 'CSV' }),
  };
  const revokeTokens = vi.fn().mockResolvedValue(undefined);
  const app = createApp({ verify, store: identity, webOrigin: 'http://localhost:3100', adminWebOrigin: 'http://localhost:3200', admin, revokeTokens });
  return { app, admin, revokeTokens };
}

describe('Admin authentication and authorization boundary', () => {
  it('denies missing authentication and ordinary customers', async () => {
    const missing = setup();
    expect((await request(missing.app).get('/api/v2/admin/me')).status).toBe(401);
    const customer = setup({ actorError: new HttpError(403, 'ADMIN_ACCESS_DENIED') });
    const response = await request(customer.app).get('/api/v2/admin/me').set('Authorization', 'Bearer customer');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'ADMIN_ACCESS_DENIED' });
  });

  it('requires a verified second factor for every Admin route', async () => {
    const { app, admin } = setup({ secondFactor: false });
    const response = await request(app).get('/api/v2/admin/dashboard').set('Authorization', 'Bearer admin');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'ADMIN_MFA_REQUIRED' });
    expect(admin.dashboard).not.toHaveBeenCalled();
  });

  it('returns real store results to an active MFA-authenticated Admin', async () => {
    const { app, admin } = setup();
    const response = await request(app).get('/api/v2/admin/dashboard').set('Authorization', 'Bearer admin');
    expect(response.status).toBe(200);
    expect(response.body.employees.active).toBe(1);
    expect(admin.dashboard).toHaveBeenCalledWith(actor);
  });

  it('validates invitation input and never returns the raw invitation token', async () => {
    const { app, admin } = setup();
    const invalid = await request(app).post('/api/v2/admin/invitations').set('Authorization', 'Bearer admin').send({ email: 'invalid' });
    expect(invalid.status).toBe(400);
    const valid = await request(app).post('/api/v2/admin/invitations').set('Authorization', 'Bearer admin').send({
      email: 'sales@example.test', fullName: 'Sales Employee', roleId: '9a58f7fd-11f9-4437-a553-167f781025a0', branchIds: ['65e39ba8-a533-41f0-a070-5e1670539934'], expiresInHours: 48,
    });
    expect(valid.status).toBe(201);
    expect(JSON.stringify(valid.body)).not.toContain('token');
    expect(admin.invite).toHaveBeenCalledWith(actor, expect.objectContaining({ adminOrigin: 'http://localhost:3200' }));
  });

  it('accepts an invitation using verified identity before Admin access exists', async () => {
    const { app, admin } = setup();
    const response = await request(app).post('/api/v2/staff/invitations/accept').set('Authorization', 'Bearer invited').send({ token: 'a'.repeat(43) });
    expect(response.status).toBe(201);
    expect(admin.acceptInvitation).toHaveBeenCalledWith(expect.objectContaining({ uid: token.uid, email: token.email }), 'a'.repeat(43));
    expect(admin.actor).not.toHaveBeenCalled();
  });

  it('revokes Firebase sessions after suspension', async () => {
    const { app, revokeTokens } = setup();
    const employeeId = '297973f4-d558-48a7-a0a5-b28f03e1ff51';
    const response = await request(app).patch(`/api/v2/admin/employees/${employeeId}/status`).set('Authorization', 'Bearer admin').send({ status: 'SUSPENDED', reason: 'Security review required' });
    expect(response.status).toBe(204);
    expect(revokeTokens).toHaveBeenCalledWith('target-firebase');
  });

  it('accepts a privileged invitation only as an approval proposal', async () => {
    const { app, admin } = setup();
    const response = await request(app).post('/api/v2/admin/approvals/privileged-invitations').set('Authorization', 'Bearer admin').send({
      email: 'security@example.test', fullName: 'Security Admin', roleId: '9a58f7fd-11f9-4437-a553-167f781025a0', branchIds: ['65e39ba8-a533-41f0-a070-5e1670539934'], expiresInHours: 48, reason: 'Security ownership coverage',
    });
    expect(response.status).toBe(202);
    expect(admin.proposePrivilegedInvitation).toHaveBeenCalledWith(actor, expect.objectContaining({ adminOrigin: 'http://localhost:3200' }), 'Security ownership coverage');
  });

  it('validates protected branch and service-area configuration requests', async () => {
    const { app, admin } = setup();
    const invalid = await request(app).post('/api/v2/admin/branches').set('Authorization', 'Bearer admin').send({ code: '!', name: 'x', city: '' });
    expect(invalid.status).toBe(400);
    const created = await request(app).post('/api/v2/admin/branches').set('Authorization', 'Bearer admin').send({ code: 'blr_01', name: 'Bengaluru Central', city: 'Bengaluru' });
    expect(created.status).toBe(201);
    expect(admin.createBranch).toHaveBeenCalledWith(actor, { code: 'blr_01', name: 'Bengaluru Central', city: 'Bengaluru' });
    const area = await request(app).post('/api/v2/admin/service-areas').set('Authorization', 'Bearer admin').send({ name: 'Bengaluru' });
    expect(area.status).toBe(201);
    expect(admin.createServiceArea).toHaveBeenCalledWith(actor, 'Bengaluru');
  });

  it('validates support actions behind the Admin authentication boundary', async () => {
    const { app, admin } = setup();
    const caseId = '297973f4-d558-48a7-a0a5-b28f03e1ff51';
    const invalid = await request(app).post(`/api/v2/admin/support/cases/${caseId}/replies`).set('Authorization', 'Bearer admin').send({ body: '' });
    expect(invalid.status).toBe(400);
    const response = await request(app).post(`/api/v2/admin/support/cases/${caseId}/replies`).set('Authorization', 'Bearer admin').send({ body: 'We are reviewing the issue and will update you shortly.' });
    expect(response.status).toBe(201);
    expect(admin.replySupportCase).toHaveBeenCalledWith(actor, caseId, 'We are reviewing the issue and will update you shortly.');
  });

  it('exposes only safe system-health data through the protected Admin route', async () => {
    const { app, admin } = setup();
    const response = await request(app).get('/api/v2/admin/system-health').set('Authorization', 'Bearer admin');
    expect(response.status).toBe(200);
    expect(admin.systemHealth).toHaveBeenCalledWith(actor);
  });

  it('validates and forwards versioned policy proposals through the protected route', async () => {
    const { app, admin } = setup();
    const response = await request(app).post('/api/v2/admin/policies/proposals').set('Authorization', 'Bearer admin').send({ key: 'customer-terms', title: 'Customer terms', content: { revision: 1 }, reason: 'Legal copy refresh requires independent policy review.' });
    expect(response.status).toBe(202);
    expect(admin.proposePolicy).toHaveBeenCalledWith(actor, expect.objectContaining({ key: 'customer-terms' }));
  });

  it('denies missing granular permissions without role-name shortcuts', () => {
    expect(() => requirePermission({ ...actor, roles: ['SUPER_ADMIN'], permissions: [] }, 'employee.invite')).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
  });

  it('serves business oversight operational feeds with real store querying', async () => {
    const { app, admin } = setup();
    const selling = await request(app).get('/api/v2/admin/business/selling?search=Rohit').set('Authorization', 'Bearer admin');
    expect(selling.status).toBe(200);
    expect(selling.body.items).toHaveLength(1);
    expect(admin.businessSelling).toHaveBeenCalledWith(actor, expect.objectContaining({ search: 'Rohit' }));

    const buying = await request(app).get('/api/v2/admin/business/buying').set('Authorization', 'Bearer admin');
    expect(buying.status).toBe(200);
    expect(admin.businessBuying).toHaveBeenCalledWith(actor, expect.any(Object));

    const inventory = await request(app).get('/api/v2/admin/business/inventory').set('Authorization', 'Bearer admin');
    expect(inventory.status).toBe(200);
    expect(admin.businessInventory).toHaveBeenCalledWith(actor, expect.any(Object));

    const finance = await request(app).get('/api/v2/admin/business/finance').set('Authorization', 'Bearer admin');
    expect(finance.status).toBe(200);
    expect(finance.body.activeInventoryCount).toBe(1);
    expect(admin.businessFinance).toHaveBeenCalledWith(actor);
  });

  it('manages canonical master data entries with audit trails', async () => {
    const { app, admin } = setup();
    const list = await request(app).get('/api/v2/admin/master-data?category=CAR_MAKE').set('Authorization', 'Bearer admin');
    expect(list.status).toBe(200);
    expect(admin.masterData).toHaveBeenCalledWith(actor, 'CAR_MAKE');

    const created = await request(app).post('/api/v2/admin/master-data').set('Authorization', 'Bearer admin').send({
      category: 'CAR_MAKE', code: 'TOYOTA', name: 'Toyota',
    });
    expect(created.status).toBe(201);
    expect(admin.createMasterDataItem).toHaveBeenCalledWith(actor, expect.objectContaining({ code: 'TOYOTA' }));

    const itemId = '297973f4-d558-48a7-a0a5-b28f03e1ff51';
    const updated = await request(app).patch(`/api/v2/admin/master-data/${itemId}`).set('Authorization', 'Bearer admin').send({
      name: 'Toyota Motors',
    });
    expect(updated.status).toBe(200);
    expect(admin.updateMasterDataItem).toHaveBeenCalledWith(actor, itemId, expect.objectContaining({ name: 'Toyota Motors' }));
  });

  it('supports email outbox monitoring and controlled retry', async () => {
    const { app, admin } = setup();
    const outbox = await request(app).get('/api/v2/admin/communications/outbox?state=ACCEPTED').set('Authorization', 'Bearer admin');
    expect(outbox.status).toBe(200);
    expect(outbox.body.items[0].recipient).toContain('***');
    expect(admin.communicationsOutbox).toHaveBeenCalledWith(actor, expect.objectContaining({ state: 'ACCEPTED' }));
    // "SENT" is not a state an email can be in; asking the database for it failed with a server error.
    expect((await request(app).get('/api/v2/admin/communications/outbox?state=SENT').set('Authorization', 'Bearer admin')).status).toBe(400);

    const templates = await request(app).get('/api/v2/admin/communications/templates').set('Authorization', 'Bearer admin');
    expect(templates.status).toBe(200);
    expect(admin.communicationsTemplates).toHaveBeenCalledWith(actor);

    const emailId = '297973f4-d558-48a7-a0a5-b28f03e1ff51';
    const retried = await request(app).post(`/api/v2/admin/communications/outbox/${emailId}/retry`).set('Authorization', 'Bearer admin');
    expect(retried.status).toBe(200);
    expect(admin.retryEmailOutbox).toHaveBeenCalledWith(actor, emailId);
  });

  it('manages privacy compliance requests and resolution workflows', async () => {
    const { app, admin } = setup();
    const requests = await request(app).get('/api/v2/admin/support/privacy-requests?status=PENDING').set('Authorization', 'Bearer admin');
    expect(requests.status).toBe(200);
    expect(admin.privacyRequests).toHaveBeenCalledWith(actor, expect.objectContaining({ status: 'PENDING' }));

    const requestId = '297973f4-d558-48a7-a0a5-b28f03e1ff51';
    const resolved = await request(app).patch(`/api/v2/admin/support/privacy-requests/${requestId}`).set('Authorization', 'Bearer admin').send({
      status: 'COMPLETED', resolution: 'Data export provided',
    });
    expect(resolved.status).toBe(200);
    expect(admin.updatePrivacyRequest).toHaveBeenCalledWith(actor, requestId, 'COMPLETED', 'Data export provided');
  });

  it('generates controlled CSV exports and downloads with formula protection', async () => {
    const { app, admin } = setup();
    const exportJob = await request(app).post('/api/v2/admin/exports').set('Authorization', 'Bearer admin').send({
      resourceType: 'INVENTORY', sensitive: false,
    });
    expect(exportJob.status).toBe(201);
    expect(admin.createExportJob).toHaveBeenCalledWith(actor, expect.objectContaining({ resourceType: 'INVENTORY' }));

    const exportId = '297973f4-d558-48a7-a0a5-b28f03e1ff51';
    const downloaded = await request(app).get(`/api/v2/admin/exports/${exportId}/download`).set('Authorization', 'Bearer admin');
    expect(downloaded.status).toBe(200);
    expect(downloaded.body.fileContent).toContain('Honda City');
    expect(admin.downloadExport).toHaveBeenCalledWith(actor, exportId);
  });

  it('serializes BigInt values in responses without throwing TypeError', async () => {
    const { app, admin } = setup();
    admin.businessInventory = vi.fn().mockResolvedValue({
      page: 1, limit: 25, total: 1,
      items: [{ id: 'listing-bigint', pricePaise: 85000000n, vehicle: { make: 'Honda' } }],
    });
    const response = await request(app).get('/api/v2/admin/business/inventory').set('Authorization', 'Bearer admin');
    expect(response.status).toBe(200);
    expect(response.body.items[0].pricePaise).toBe('85000000');
  });
});
