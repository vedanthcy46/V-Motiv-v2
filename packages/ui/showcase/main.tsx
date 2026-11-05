import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  Alert, AppShell, Badge, Button, Card, CardHeader, ConfirmDialog, CountBadge, Drawer, EmptyState, ErrorState, Modal, NotificationBell, PageHeader, SelectField, Skeleton,
  SkeletonCards, Spinner, StatCard, StatusBadge, TableSkeleton, TextField, TextareaField, initTheme, toast, useAction, type NavSection,
} from '../src';

initTheme();

const sections: NavSection[] = [
  { title: 'Core operations', items: [{ key: 'overview', label: 'Overview' }, { key: 'leads', label: 'Seller leads', badge: 12 }, { key: 'buyers', label: 'Buyer leads', badge: 3 }] },
  { title: 'Deal execution', items: [{ key: 'inventory', label: 'Inventory stock' }, { key: 'drives', label: 'Test drives', badge: 120 }] },
];

const rows = [
  ['Hyundai i20 Sportz', 'Aarav Mehta', 'Bengaluru', 'PENDING_APPROVAL', '₹6,40,000'],
  ['Maruti Swift VXi', 'Diya Rao', 'Hyderabad', 'APPROVED', '₹4,95,000'],
  ['Tata Nexon XZ+', 'Kabir Shah', 'Pune', 'REJECTED', '₹9,10,000'],
  ['Honda City ZX', 'Isha Nair', 'Chennai', 'IN_PROGRESS', '₹8,25,000'],
];

function Showcase() {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [legacyModal, setLegacyModal] = useState(false);
  const [page, setPage] = useState('overview');
  const approve = useAction(() => new Promise(resolve => setTimeout(resolve, 1400)), { success: 'Valuation approved' });
  const fail = useAction(() => Promise.reject(new Error('The server rejected the request')), { errorTitle: 'Could not approve' });

  return (
    <AppShell
      portalName="Sales"
      sections={sections}
      active={page}
      onSelect={setPage}
      account={{ name: 'Priya Sharma', role: 'SALES_EXECUTIVE' }}
      onSignOut={() => toast.info('Signed out (demo)')}
      context="Bengaluru branch"
      toolbar={<NotificationBell unread={2} items={[{ id: '1', title: 'New seller lead', body: 'Hyundai i20 · Bengaluru', read: false, createdAt: new Date().toISOString() }, { id: '2', title: 'Offer accepted', body: 'VM-2041 accepted the offer', read: true, createdAt: new Date(Date.now() - 7200000).toISOString() }]} />}
    >
      <PageHeader title="Overview" description="Everything that needs attention today across your branch." actions={<><Button variant="secondary" onClick={() => toast.success('Refreshed')}>Refresh</Button><Button onClick={() => setModal(true)}>New lead</Button></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New seller leads" value="24" hint="+6 since yesterday" />
        <StatCard label="Inspections today" value="9" hint="3 overdue" />
        <StatCard label="Pending approvals" value="5" hint="Oldest 2 days" />
        <StatCard label="Loading" value="" loading />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card padded={false}>
          <div className="p-5 pb-0"><CardHeader title="Valuation approvals" subtitle="Awaiting a decision" actions={<Button size="sm" variant="secondary">Export</Button>} /></div>
          <div className="vm-table-wrap rounded-none border-0 border-t">
            <table>
              <thead><tr><th>Vehicle</th><th>Seller</th><th>City</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r[0]}><td><strong>{r[0]}</strong></td><td>{r[1]}</td><td>{r[2]}</td><td><StatusBadge status={r[3]!} /></td><td className="money">{r[4]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Actions" subtitle="Buttons show progress at once" />
          <div className="flex flex-wrap gap-2">
            <Button loading={approve.busy} onClick={() => void approve.run()}>Approve</Button>
            <Button variant="danger" loading={fail.busy} onClick={() => void fail.run()}>Reject</Button>
            <Button variant="secondary" onClick={() => setConfirm(true)}>Confirm…</Button>
            <Button variant="ghost" onClick={() => setDrawer(true)}>Open drawer</Button>
            <Button variant="success" size="sm">Success</Button>
            <Button variant="outline" size="sm" disabled>Disabled</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="primary">Primary</Badge><Badge tone="success">Success</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Danger</Badge><Badge tone="info">Info</Badge><Badge>Neutral</Badge>
            <CountBadge count={7} /><CountBadge count={150} tone="danger" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="xs" variant="secondary" onClick={() => toast.success('Lead saved', { description: 'The lead was assigned to you.' })}>Success toast</Button>
            <Button size="xs" variant="secondary" onClick={() => toast.error('Could not save', { description: 'Cannot reach the server.' })}>Error toast</Button>
            <Button size="xs" variant="secondary" onClick={() => toast.warning('Offer expires soon')}>Warning toast</Button>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Form" subtitle="Consistent fields, labels and errors" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Seller name" required placeholder="Full name" />
            <TextField label="Phone" error="Enter a valid +91 mobile number" defaultValue="+91 98" />
            <SelectField label="City"><option>Bengaluru</option><option>Hyderabad</option></SelectField>
            <TextField label="Odometer (km)" hint="As shown on the cluster" type="number" />
            <TextareaField className="sm:col-span-2" label="Notes" placeholder="Anything the inspector should know" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Feedback and loading" />
          <div className="grid gap-3">
            <Alert tone="info" title="Heads up">Prices refresh every night at 2 am.</Alert>
            <Alert tone="warning" title="Approval pending">This quotation needs an independent approver.</Alert>
            <Alert tone="success">Saved.</Alert>
            <ErrorState message="Cannot reach the server." onRetry={() => toast.info('Retrying')} />
            <div className="flex items-center gap-3"><Spinner /> <Skeleton className="h-4 w-40" /></div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Loading table" /><TableSkeleton rows={4} columns={4} /></Card>
        <Card><CardHeader title="Empty state" /><EmptyState title="No test drives scheduled" description="Requests from customers appear here." action={<Button size="sm">Schedule one</Button>} /></Card>
      </div>
      <div className="mt-6"><SkeletonCards /></div>

      <h2 className="mb-3 mt-8">Legacy markup (existing portal class names, same system)</h2>
      <div className="metric-grid">
        <div className="metric-card"><span>Open offers</span><strong>18</strong><small>4 expire this week</small></div>
        <div className="metric-card"><span>Revenue</span><strong>₹42.8L</strong><small>This month</small></div>
      </div>
      <section className="panel">
        <div className="panel-heading"><h2>Legacy panel</h2><button className="button secondary small">Action</button></div>
        <div className="filters-bar"><div className="search-input-box"><input placeholder="Search" /></div><select className="filter-select"><option>All statuses</option></select><button className="btn btn-secondary btn-sm">Filter</button></div>
        <div className="table-responsive"><table><thead><tr><th>Lead</th><th>Status</th><th /></tr></thead><tbody><tr><td><span className="table-title">Aarav Mehta</span><span className="table-sub">VM-1042</span></td><td><span className="badge badge-green">Accepted</span> <span className="badge badge-amber">Pending</span> <span className="badge badge-red">Declined</span> <span className="badge badge-blue">Info</span></td><td><button className="btn btn-primary btn-sm">Open</button> <button className="btn btn-danger btn-sm">Remove</button></td></tr></tbody></table></div>
        <div className="mt-4 flex gap-2"><button className="button primary" onClick={() => setLegacyModal(true)}>Open legacy modal</button><button className="button danger">Delete</button><button className="btn-gold btn">Gold</button></div>
      </section>

      {modal && (
        <Modal title="Record walk-in seller lead" description="Create a lead for a customer at the showroom." onClose={() => setModal(false)} size="lg" onSubmit={e => { e.preventDefault(); setModal(false); toast.success('Lead created'); }}
          footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button type="submit">Create lead</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2"><TextField label="Seller name" required /><TextField label="Phone" required defaultValue="+91" /><TextField label="Make" /><TextField label="Model" /></div>
        </Modal>
      )}
      {drawer && <Drawer title="Lead VM-1042" subtitle="Hyundai i20 · Bengaluru" onClose={() => setDrawer(false)}><p>Lead 360 content goes here.</p></Drawer>}
      {confirm && <ConfirmDialog title="Reject this valuation?" message="The seller will be notified. This cannot be undone." confirmLabel="Reject" tone="danger" onCancel={() => setConfirm(false)} onConfirm={async () => { await new Promise(r => setTimeout(r, 800)); setConfirm(false); toast.success('Valuation rejected'); }} />}
      {legacyModal && (
        <div className="modal-overlay"><div className="modal-dialog modal-dialog-md"><div className="modal-header"><h3>Legacy modal</h3><button onClick={() => setLegacyModal(false)}>✕</button></div><form onSubmit={e => { e.preventDefault(); setLegacyModal(false); }}><div className="modal-body"><div className="form-group"><label className="form-label">Name</label><input className="form-input" /></div><div className="error-banner">Something to fix.</div></div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setLegacyModal(false)}>Cancel</button><button className="btn btn-primary">Save</button></div></form></div></div>
      )}
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(<Showcase />);
