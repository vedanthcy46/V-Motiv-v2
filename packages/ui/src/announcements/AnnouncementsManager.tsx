import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../components/States';
import { Badge, type Tone } from '../components/Badge';
import { Button } from '../components/Button';
import { EmptyState, ErrorState } from '../components/States';
import { SelectField, TextField } from '../components/Form';
import { Modal } from '../components/Modal';
import { toast } from '../hooks/toastStore';
import type { Announcement, AnnouncementDraft, AnnouncementList, AnnouncementsApi } from './api';

const TARGETS: Record<string, string> = { NONE: 'Just show the message', HOME: 'Open the home screen', BUY: 'Open Buy cars', SELL: 'Open Sell your car', RENTALS: 'Open Rentals', SERVICE: 'Open Car service', VEHICLE: 'Open one specific car' };
const STATUS_TONE: Record<string, Tone> = { DRAFT: 'neutral', SCHEDULED: 'info', SENDING: 'warning', SENT: 'success', CANCELLED: 'neutral' };
const TITLE_MAX = 65;
const BODY_MAX = 178;
const EMPTY: AnnouncementDraft = { title: '', body: '', target: 'NONE', listingId: '', city: '' };

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : '');
const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');

/**
 * Admin and Operations: send a platform update (new feature, new cars, a change) to customers who opted in to promotions.
 * Nothing is sent without a test option, a visible audience count, and a confirmation; customers only receive it between 9 am and 9 pm India time.
 */
export function AnnouncementsManager({ api }: { api: AnnouncementsApi }) {
  const [data, setData] = useState<AnnouncementList | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<AnnouncementDraft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [audience, setAudience] = useState<{ recipients: number; withPushDevice: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<{ announcement: Announcement; schedule: string } | null>(null);
  const [schedule, setSchedule] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.list()); setError(''); } catch (err) { setError(message(err)); }
  }, [api]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 15_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => { api.audience(draft.city?.trim() || undefined).then(value => { if (current) setAudience(value); }).catch(() => { if (current) setAudience(null); }); }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [api, draft.city]);

  const valid = draft.title.trim().length >= 3 && draft.body.trim().length >= 5 && (draft.target !== 'VEHICLE' || Boolean(draft.listingId?.trim()));
  const payload = useMemo<AnnouncementDraft>(() => ({ title: draft.title.trim(), body: draft.body.trim(), target: draft.target, listingId: draft.target === 'VEHICLE' ? draft.listingId?.trim() || null : null, city: draft.city?.trim() || null }), [draft]);

  async function run<T>(key: string, action: () => Promise<T>, success?: string): Promise<T | undefined> {
    setBusy(key);
    try { const result = await action(); if (success) toast.success(success); await load(); return result; }
    catch (err) { toast.error('Could not do that', { description: message(err) }); return undefined; }
    finally { setBusy(''); }
  }
  const save = async (): Promise<Announcement | undefined> => run('save', () => (editing ? api.update(editing, payload) : api.create(payload)), editing ? 'Draft updated' : 'Draft saved').then(saved => { if (saved) setEditing(saved.id); return saved; });
  const reset = () => { setDraft(EMPTY); setEditing(null); setSchedule(''); };

  async function review() {
    const saved = await save();
    if (saved) setConfirm({ announcement: saved, schedule });
  }
  async function sendTest() {
    const saved = await save();
    if (!saved) return;
    const result = await run('test', () => api.test(saved.id));
    if (result) toast.success('Test sent to you', { description: result.pushDevices ? `Check your phone and your notifications (${result.pushDevices} device).` : 'No phone is registered for your account, so it only appears in your notifications.' });
  }
  async function confirmSend() {
    if (!confirm || !audience) return;
    const sent = await run('send', () => api.send(confirm.announcement.id, audience.recipients, confirm.schedule ? new Date(confirm.schedule).toISOString() : null));
    if (sent) {
      toast.success(sent.deferred ? 'Scheduled' : 'Sending', { description: sent.deferred ? `It will go out ${when(sent.scheduledFor)}.` : `${sent.audience?.recipients ?? ''} people are being notified now.` });
      setConfirm(null); reset();
    }
  }

  const settings = data?.settings;
  return (
    <div className="grid gap-5">
      <section className="rounded-box border border-base-300 bg-base-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Announcements to customers</h2>
            <p className="text-sm text-base-content/65">Sent as a notification (and a push) to customers who turned on promotions. They are only delivered between 9 am and 9 pm India time.</p>
          </div>
          {settings ? (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="toggle toggle-success toggle-sm" checked={settings.enabled} disabled={busy === 'settings'} onChange={event => void run('settings', () => api.updateSettings({ enabled: event.target.checked }), event.target.checked ? 'Announcements are on' : 'Announcements are off')} />
                {settings.enabled ? 'On' : 'Switched off'}
              </label>
              <label className="flex items-center gap-2 text-sm">Max per day
                <select className="select select-sm" value={settings.maxPerDay} disabled={busy === 'settings'} onChange={event => void run('settings', () => api.updateSettings({ maxPerDay: Number(event.target.value) }), 'Limit saved')}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          ) : null}
        </div>
        {settings && !settings.enabled ? <Alert tone="warning" className="mt-3">Announcements are switched off. Nothing will be sent, and anything already sending is paused, until you switch them on.</Alert> : null}
      </section>

      <section className="grid gap-4 rounded-box border border-base-300 bg-base-100 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-3">
          <h3 className="font-semibold">{editing ? 'Edit draft' : 'New announcement'}</h3>
          <TextField label="Title" maxLength={TITLE_MAX} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} hint={`${draft.title.length}/${TITLE_MAX}. Short and specific, like "New SUVs in Bengaluru".`} />
          <label className="form-control w-full">
            <span className="mb-1 block text-sm font-medium">Message</span>
            <textarea className="textarea w-full" rows={3} maxLength={BODY_MAX} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} />
            <span className="mt-1 block text-xs text-base-content/60">{draft.body.length}/{BODY_MAX}. Say what is new or changed and why it matters to them.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="When they tap it" value={draft.target} onChange={event => setDraft({ ...draft, target: event.target.value })}>
              {Object.entries(TARGETS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </SelectField>
            <TextField label="Only customers in city (optional)" placeholder="All cities" value={draft.city ?? ''} onChange={event => setDraft({ ...draft, city: event.target.value })} />
          </div>
          {draft.target === 'VEHICLE' ? <TextField label="Vehicle listing ID" placeholder="Paste the published listing's ID" value={draft.listingId ?? ''} onChange={event => setDraft({ ...draft, listingId: event.target.value })} hint="Must be a published car. It opens that car's page." /> : null}
          <TextField label="Send later (optional)" type="datetime-local" value={schedule} onChange={event => setSchedule(event.target.value)} hint="Leave empty to send now. Between 9 am and 9 pm India time only; outside it, sending now waits for 9 am." />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!valid} loading={busy === 'save'} onClick={() => void save()}>{editing ? 'Save changes' : 'Save draft'}</Button>
            <Button variant="outline" disabled={!valid} loading={busy === 'test'} onClick={() => void sendTest()}>Send a test to me</Button>
            <Button disabled={!valid || !settings?.enabled || !audience?.recipients} loading={busy === 'save' && Boolean(confirm)} onClick={() => void review()}>Review and send</Button>
            {editing || draft.title || draft.body ? <Button variant="ghost" onClick={reset}>Clear</Button> : null}
          </div>
        </div>
        <aside className="grid content-start gap-3">
          <div>
            <p className="text-sm font-medium">Preview</p>
            <div className="mt-1 rounded-2xl border border-base-300 bg-base-200 p-3 text-sm shadow-sm">
              <p className="text-xs text-base-content/55">V MOTIV · now</p>
              <p className="font-semibold">{draft.title || 'Your title'}</p>
              <p className="text-base-content/75">{draft.body || 'Your message appears here.'}</p>
            </div>
          </div>
          <div className="rounded-box border border-base-300 p-3 text-sm">
            <p className="font-medium">Who gets it</p>
            {audience ? (
              <>
                <p className="mt-1 text-2xl font-semibold">{audience.recipients.toLocaleString()}</p>
                <p className="text-base-content/65">customers with promotions on{draft.city?.trim() ? ` in ${draft.city.trim()}` : ''}. {audience.withPushDevice.toLocaleString()} will also get a push on their phone; the rest see it in the app.</p>
              </>
            ) : <p className="mt-1 text-base-content/60">Counting…</p>}
            <p className="mt-2 text-xs text-base-content/55">Staff, suspended accounts, and customers who turned promotions off are never included.</p>
          </div>
        </aside>
      </section>

      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-4 py-3"><h3 className="font-semibold">History</h3></div>
        {error ? <div className="p-4"><ErrorState message={error} onRetry={() => void load()} /></div> : !data ? <p className="p-4 text-sm text-base-content/60">Loading…</p> : data.items.length === 0 ? <div className="p-6"><EmptyState title="No announcements yet" description="Your first one will appear here." /></div> : (
          <ul>
            {data.items.map(item => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-base-300/70 px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[item.status]} size="sm">{item.status === 'SENDING' ? 'Sending' : item.status.charAt(0) + item.status.slice(1).toLowerCase()}</Badge><span className="font-medium">{item.title}</span></div>
                  <p className="text-sm text-base-content/70">{item.body}</p>
                  <p className="mt-1 text-xs text-base-content/55">
                    {item.status === 'SCHEDULED' ? `Goes out ${when(item.scheduledFor)}` : item.status === 'SENT' ? `Sent ${when(item.completedAt)}` : item.status === 'CANCELLED' ? `Cancelled ${when(item.cancelledAt)}` : `Created ${when(item.createdAt)}`}
                    {item.status === 'SENT' || item.status === 'SENDING' || item.status === 'CANCELLED' ? ` · ${item.recipientCount.toLocaleString()} notified, ${item.pushQueued.toLocaleString()} pushes queued` : ''}
                    {item.city ? ` · ${item.city}` : ''}
                  </p>
                  {item.lastError ? <p className="text-xs text-error">Last problem: {item.lastError}</p> : null}
                </div>
                <div className="flex gap-2">
                  {item.status === 'DRAFT' || item.status === 'SCHEDULED' ? <Button size="xs" variant="outline" onClick={() => { setEditing(item.id); setDraft({ title: item.title, body: item.body, target: item.target, listingId: item.listingId ?? '', city: item.city ?? '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</Button> : null}
                  {['DRAFT', 'SCHEDULED', 'SENDING'].includes(item.status) ? <Button size="xs" variant="ghost" loading={busy === `cancel-${item.id}`} onClick={() => void run(`cancel-${item.id}`, () => api.cancel(item.id), item.status === 'SENDING' ? 'Stopped. People already notified keep it.' : 'Cancelled')}>{item.status === 'SENDING' ? 'Stop sending' : 'Cancel'}</Button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirm && audience ? (
        <Modal title={confirm.schedule ? 'Schedule this announcement?' : 'Send this announcement now?'} description="This notifies real customers and cannot be taken back once it is delivered." busy={busy === 'send'} onClose={() => setConfirm(null)}
          footer={<><Button variant="ghost" disabled={busy === 'send'} onClick={() => setConfirm(null)}>Not yet</Button><Button loading={busy === 'send'} onClick={() => void confirmSend()}>{confirm.schedule ? 'Schedule it' : `Send to ${audience.recipients.toLocaleString()} customers`}</Button></>}>
          <div className="rounded-2xl border border-base-300 bg-base-200 p-3 text-sm"><p className="font-semibold">{confirm.announcement.title}</p><p>{confirm.announcement.body}</p></div>
          <p className="mt-3 text-sm">It goes to <strong>{audience.recipients.toLocaleString()}</strong> customers ({audience.withPushDevice.toLocaleString()} as a push on their phone){draft.city?.trim() ? ` in ${draft.city.trim()}` : ''}.{confirm.schedule ? ` It will be sent ${new Date(confirm.schedule).toLocaleString()}.` : ' It starts immediately (or at 9 am India time if it is currently night there).'}</p>
        </Modal>
      ) : null}
    </div>
  );
}
