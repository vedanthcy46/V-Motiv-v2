import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Alert, toast, describeApiError } from '@vmotiv/ui';
import { salesApi, type ScrapRequestItem } from '../api.js';

// Customers who asked us to scrap a vehicle. The job here is small: call them, note what was agreed, mark the request contacted or closed.
// Everything after the call (inspection, price, paperwork, pickup) is handled outside this system.

const STATUS_LABEL: Record<ScrapRequestItem['status'], string> = { NEW: 'New: call them', CONTACTED: 'Contacted', CLOSED: 'Closed' };
const STATUS_BADGE: Record<ScrapRequestItem['status'], string> = { NEW: 'badge-amber', CONTACTED: 'badge-blue', CLOSED: 'badge-gray' };

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function ScrapRequests({ user, onChanged }: { user: User; onChanged?: () => void }) {
  const [items, setItems] = useState<ScrapRequestItem[]>([]);
  const [status, setStatus] = useState<'' | ScrapRequestItem['status']>('NEW');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await salesApi.scrapRequests(user, { status: status || undefined, search: search.trim() || undefined });
      setItems(result.items);
      setNotes(current => ({ ...Object.fromEntries(result.items.map(item => [item.id, item.staffNote ?? ''])), ...current }));
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setLoading(false);
    }
  }, [user, status, search]);

  useEffect(() => { setLoading(true); void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const update = async (item: ScrapRequestItem, next: ScrapRequestItem['status']) => {
    if (busyId) return; // one change at a time
    setBusyId(item.id);
    try {
      await salesApi.updateScrapRequest(user, item.id, { status: next, note: notes[item.id] ?? '' });
      toast.success(next === 'CONTACTED' ? 'Marked as contacted' : next === 'CLOSED' ? 'Request closed' : 'Request reopened');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error('Could not update the request', { description: describeApiError(e) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">VEHICLE SCRAPPING</p>
          <h1>Scrap-a-car requests</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
            Customers who want their vehicle scrapped. Call them on the number shown, note what you agreed, and mark the request. The rest is handled offline.
          </p>
        </div>
      </div>

      {error ? <Alert tone="warning" className="mb-4" onDismiss={() => setError('')}>{error}</Alert> : null}

      <div className="panel">
        <div className="filters-bar">
          <div className="search-input-box">
            <input aria-label="Search by request number, registration or phone" placeholder="Request no., registration or phone" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { setLoading(true); void load(); } }} />
          </div>
          <select className="filter-select" aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value as typeof status)}>
            <option value="">All</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="CLOSED">Closed</option>
          </select>
          <button className="btn-secondary btn-sm" onClick={() => { setLoading(true); void load(); }}>Search</button>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr><th>Customer</th><th>Vehicle</th><th>Where</th><th>Status</th><th>Your note</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="empty-state">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">{status === 'NEW' ? 'No new requests. Everyone has been called.' : 'No requests match.'}</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="table-title">{item.customerName}</div>
                    <div className="table-sub"><a href={`tel:${item.contactPhone}`}>{item.contactPhone}</a></div>
                    <div className="table-sub">{item.requestNumber} · {when(item.createdAt)}</div>
                  </td>
                  <td>
                    <div className="table-title">{item.manufacturingYear} {item.make} {item.model}</div>
                    <div className="table-sub">{item.registrationNumber}{item.fuelType ? ` · ${item.fuelType}` : ''}{item.odometerKm ? ` · ${item.odometerKm.toLocaleString('en-IN')} km` : ''}</div>
                    {item.condition ? <div className="table-sub">“{item.condition}”</div> : null}
                  </td>
                  <td>
                    <div>{item.city}</div>
                    {item.pickupAddress ? <div className="table-sub">{item.pickupAddress}</div> : null}
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[item.status]}`}>{STATUS_LABEL[item.status]}</span></td>
                  <td>
                    <textarea
                      aria-label={`Note for ${item.requestNumber}`}
                      rows={2}
                      maxLength={1000}
                      style={{ width: '220px' }}
                      placeholder="What was agreed?"
                      value={notes[item.id] ?? ''}
                      onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {item.status !== 'CONTACTED' ? <button className="btn-primary btn-sm" disabled={busyId !== null} onClick={() => void update(item, 'CONTACTED')}>Mark contacted</button> : null}
                      {item.status !== 'CLOSED' ? <button className="btn-secondary btn-sm" disabled={busyId !== null} onClick={() => void update(item, 'CLOSED')}>Close</button> : null}
                      {item.status === 'CLOSED' ? <button className="btn-secondary btn-sm" disabled={busyId !== null} onClick={() => void update(item, 'NEW')}>Reopen</button> : null}
                      {item.status === 'CONTACTED' ? <button className="btn-secondary btn-sm" disabled={busyId !== null} onClick={() => void update(item, 'CONTACTED')}>Save note</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
