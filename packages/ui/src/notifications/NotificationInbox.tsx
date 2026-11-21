import { useState } from 'react';
import { Badge, type Tone } from '../components/Badge';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, Alert } from '../components/States';
import { SelectField, TextField } from '../components/Form';
import { Icon } from '../components/Icon';
import { toast } from '../hooks/toastStore';
import { OPEN_REFUSAL, type EmployeeNotificationsApi, type InboxFilters, type InboxItem, type Preferences } from './api';
import { useEmployeeNotifications, type UseEmployeeNotificationsOptions } from './useEmployeeNotifications';

const SEVERITY_TONE: Record<string, Tone> = { CRITICAL: 'danger', ACTION_REQUIRED: 'warning', INFORMATIONAL: 'neutral' };
const SEVERITY_LABEL: Record<string, string> = { CRITICAL: 'Critical', ACTION_REQUIRED: 'Action required', INFORMATIONAL: 'Info' };
const MODULE_LABEL: Record<string, string> = { SALES: 'Sales', OPERATIONS: 'Operations', FINANCE: 'Finance', ADMIN: 'Admin', INSPECTION: 'Inspection' };

export function timeAgo(value: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(value).toLocaleDateString();
}

/**
 * Open a notification safely: first ask the server whether the link may be followed now (it may have been reassigned, resolved or the
 * employee's access may have changed), then hand the route to the portal. The portal still authorises the record when it loads it.
 */
export async function openNotification(api: EmployeeNotificationsApi, item: InboxItem, navigate: (route: string, item: InboxItem) => void): Promise<boolean> {
  try {
    const decision = await api.authoriseOpen(item.id);
    if (!decision.allowed) { toast.info('This cannot be opened', { description: OPEN_REFUSAL[decision.reason] ?? 'It is no longer available to you.' }); return false; }
    navigate(decision.actionRoute, item);
    return true;
  } catch (error) {
    toast.error('Could not open it', { description: error instanceof Error ? error.message : 'Try again.' });
    return false;
  }
}

function Row({ item, onOpen, onRead, onAcknowledge, busy }: { item: InboxItem; onOpen: (item: InboxItem) => void; onRead: (item: InboxItem) => void; onAcknowledge: (item: InboxItem) => void; busy: boolean }) {
  const needsAck = item.requiresAck && !item.acknowledgedAt && item.actionable;
  return (
    <li className={`flex gap-3 border-b border-base-300/70 px-4 py-3 last:border-b-0 ${item.read ? '' : 'bg-primary/5'} ${item.actionable ? '' : 'opacity-60'}`}>
      <span className={`mt-1.5 size-2.5 flex-none rounded-full ${item.read ? 'bg-transparent' : item.severity === 'CRITICAL' ? 'bg-error' : 'bg-primary'}`} aria-label={item.read ? 'Read' : 'Unread'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SEVERITY_TONE[item.severity]} size="sm">{SEVERITY_LABEL[item.severity]}</Badge>
          <Badge size="sm">{MODULE_LABEL[item.module] ?? item.module}</Badge>
          {!item.actionable ? <Badge size="sm" tone="neutral">{item.supersededAt ? 'Reassigned' : item.resolvedAt ? 'Done' : 'Expired'}</Badge> : null}
          <span className="text-xs text-base-content/55">{timeAgo(item.createdAt)}</span>
        </div>
        <p className="mt-1 font-medium">{item.title}</p>
        <p className="text-sm text-base-content/70">{item.body}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.actionRoute && item.actionable ? <Button size="xs" onClick={() => onOpen(item)}>Open</Button> : null}
          {needsAck ? <Button size="xs" variant="outline" loading={busy} onClick={() => onAcknowledge(item)} icon={<Icon name="check" size={13} />}>Acknowledge</Button> : null}
          {item.acknowledgedAt ? <span className="text-xs text-success">Acknowledged {timeAgo(item.acknowledgedAt)}</span> : null}
          {!item.read ? <Button size="xs" variant="ghost" onClick={() => onRead(item)}>Mark read</Button> : null}
        </div>
      </div>
    </li>
  );
}

function PreferencesPanel({ api }: { api: EmployeeNotificationsApi }) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!loaded) { setLoaded(true); void api.preferences().then(setPrefs).catch(() => toast.error('Could not load preferences')); }
  if (!prefs) return <p className="p-4 text-sm text-base-content/60">Loading preferences…</p>;
  const save = async (update: Partial<Preferences>) => {
    setSaving(true);
    try { setPrefs(await api.updatePreferences(update)); toast.success('Preferences saved'); } catch (error) { toast.error('Could not save', { description: error instanceof Error ? error.message : undefined }); } finally { setSaving(false); }
  };
  const toggle = (key: 'pushEnabled' | 'emailEnabled' | 'quietHoursEnabled', label: string, hint?: string) => (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" className="toggle toggle-sm mt-0.5" checked={prefs[key]} disabled={saving} onChange={event => void save({ [key]: event.target.checked })} />
      <span><span className="font-medium">{label}</span>{hint ? <span className="block text-xs text-base-content/60">{hint}</span> : null}</span>
    </label>
  );
  return (
    <div className="grid gap-4 p-4">
      {prefs.mandatory ? <Alert tone="info">{prefs.mandatory}</Alert> : null}
      <div className="divide-y divide-base-300/60">
        {toggle('pushEnabled', 'Mobile push', 'On your phone (the Inspector app). The inbox always works without it.')}
        {toggle('emailEnabled', 'Email alerts', 'For critical alerts and approvals.')}
        {toggle('quietHoursEnabled', 'Quiet hours', 'No push or email for ordinary alerts in this window. Critical alerts ignore it.')}
      </div>
      {prefs.quietHoursEnabled ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="From" type="time" value={prefs.quietHoursStart} onChange={event => void save({ quietHoursStart: event.target.value })} />
          <TextField label="Until" type="time" value={prefs.quietHoursEnd} onChange={event => void save({ quietHoursEnd: event.target.value })} />
        </div>
      ) : null}
      <SelectField label="Email digest of unread items" value={prefs.digestFrequency} onChange={event => void save({ digestFrequency: event.target.value as 'OFF' | 'DAILY' })}>
        <option value="OFF">Off</option>
        <option value="DAILY">Once a day (8 am)</option>
      </SelectField>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Mute informational alerts from</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(MODULE_LABEL).map(([key, label]) => {
            const muted = prefs.mutedModules.includes(key);
            return <button key={key} type="button" aria-pressed={muted} className={`btn btn-xs ${muted ? 'btn-neutral' : 'btn-outline'}`} disabled={saving} onClick={() => void save({ mutedModules: muted ? prefs.mutedModules.filter(item => item !== key) : [...prefs.mutedModules, key] })}>{muted ? 'Muted: ' : ''}{label}</button>;
          })}
        </div>
        <p className="mt-1 text-xs text-base-content/55">Muting never hides work that needs action or any critical alert.</p>
      </fieldset>
    </div>
  );
}

export interface NotificationInboxProps extends UseEmployeeNotificationsOptions {
  /** Called with a validated portal route when someone opens a notification. */
  onNavigate: (route: string, item: InboxItem) => void;
  /** Which module is "this portal" (its tab is first and selected by default). */
  moduleHint?: string;
}

export function NotificationInbox({ api, stream, onNavigate, moduleHint }: NotificationInboxProps) {
  const [tab, setTab] = useState<'unread' | 'all' | 'action'>('unread');
  const [severity, setSeverity] = useState('');
  const [module, setModule] = useState('');
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [showPrefs, setShowPrefs] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const filters: InboxFilters = { unread: tab === 'unread', actionRequired: tab === 'action', severity: severity || undefined, module: module || undefined, branchId: branchId || undefined, from: from ? new Date(from).toISOString() : undefined };
  const inbox = useEmployeeNotifications({ api, stream, filters });
  const branches = inbox.page?.branches ?? [];

  const open = async (item: InboxItem) => { if (await openNotification(api, item, onNavigate) && !item.read) void inbox.markRead(item.id); };
  const acknowledge = async (item: InboxItem) => { setBusy(item.id); try { await inbox.acknowledge(item.id); toast.success('Acknowledged'); } catch (error) { toast.error('Could not acknowledge', { description: error instanceof Error ? error.message : undefined }); } finally { setBusy(null); } };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="tabs tabs-box">
          {([['unread', `Unread${inbox.counts.count ? ` (${inbox.counts.count})` : ''}`], ['action', `Action required${inbox.counts.actionRequired ? ` (${inbox.counts.actionRequired})` : ''}`], ['all', 'All']] as const).map(([key, label]) => (
            <button key={key} role="tab" type="button" aria-selected={tab === key} className={`tab ${tab === key ? 'tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs ${inbox.live ? 'text-success' : 'text-base-content/50'}`} title={inbox.live ? 'Updates arrive live' : 'Checking every 45 seconds'}><span className={`size-2 rounded-full ${inbox.live ? 'bg-success' : 'bg-base-content/30'}`} />{inbox.live ? 'Live' : 'Auto-refresh'}</span>
          <Button size="sm" variant="outline" disabled={inbox.counts.count === 0} onClick={() => void inbox.markAllRead(module || undefined).then(() => toast.success('Marked as read'))}>Mark all read</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowPrefs(value => !value)}>Preferences</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <SelectField label="Severity" value={severity} onChange={event => setSeverity(event.target.value)}>
          <option value="">All</option><option value="CRITICAL">Critical</option><option value="ACTION_REQUIRED">Action required</option><option value="INFORMATIONAL">Info</option>
        </SelectField>
        <SelectField label="Module" value={module} onChange={event => setModule(event.target.value)}>
          <option value="">All</option>
          {Object.entries(MODULE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}{key === moduleHint ? ' (this portal)' : ''}</option>)}
        </SelectField>
        <SelectField label="Branch" value={branchId} onChange={event => setBranchId(event.target.value)}>
          <option value="">All my branches</option>
          {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name} · {branch.city}</option>)}
        </SelectField>
        <TextField label="Since" type="date" value={from} onChange={event => setFrom(event.target.value)} />
      </div>

      {showPrefs ? <div className="rounded-box border border-base-300 bg-base-100"><PreferencesPanel api={api} /></div> : null}
      {inbox.error ? <ErrorState message={inbox.error} onRetry={() => void inbox.refresh()} retrying={inbox.loading} /> : null}

      <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
        {inbox.items.length === 0 ? (
          <div className="p-6"><EmptyState title={inbox.loading ? 'Loading…' : tab === 'unread' ? 'You are all caught up' : 'Nothing here'} description={tab === 'unread' ? 'New work handed to you appears here as it happens.' : undefined} /></div>
        ) : (
          <ul>{inbox.items.map(item => <Row key={item.id} item={item} busy={busy === item.id} onOpen={open} onRead={entry => void inbox.markRead(entry.id)} onAcknowledge={acknowledge} />)}</ul>
        )}
      </div>
      {inbox.page?.nextCursor ? <div className="text-center"><Button variant="outline" size="sm" onClick={() => void inbox.loadMore()}>Load older</Button></div> : null}
      <p className="text-xs text-base-content/50">Reading or acknowledging a notification never changes the booking, payment, inspection or approval behind it. Do the work in its own screen.</p>
    </div>
  );
}
