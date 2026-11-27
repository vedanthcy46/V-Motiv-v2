import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { StatusBadge } from '@vmotiv/ui';
import { adminApi } from './api.js';
import { deliveryView } from './invitation-delivery.js';
import type { AdminActor, ManualAcceptance, PendingInvitation } from './types.js';

type Props = {
  user: User;
  actor: AdminActor;
  /** Changes when something else on the page may have added an invitation. */
  refreshKey: number;
  /** Someone became an employee: the directory should reload. */
  onAccepted: () => void;
  errorMessage: (error: unknown) => string;
};

/** Invitations nobody has accepted yet: what happened to each email, send it again, or accept on the person's behalf. */
export function PendingInvitations({ user, actor, refreshKey, onAccepted, errorMessage }: Props) {
  const [items, setItems] = useState<PendingInvitation[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reload, setReload] = useState(0);
  const [accepting, setAccepting] = useState<PendingInvitation | null>(null);

  useEffect(() => {
    adminApi.invitations(user).then(value => { setItems(value); setError(''); }).catch(error => setError(errorMessage(error)));
  }, [user, reload, refreshKey, errorMessage]);

  async function resend(invitation: PendingInvitation) {
    setBusyId(invitation.id); setError(''); setNotice('');
    try {
      await adminApi.resendInvitation(user, invitation.id);
      setNotice(`A new invitation email for ${invitation.email} is queued. The earlier link no longer works. Refresh in a minute to see whether it was delivered.`);
      setReload(value => value + 1);
    } catch (error) { setError(errorMessage(error)); }
    setBusyId('');
  }

  function accepted(result: ManualAcceptance) {
    setAccepting(null);
    setNotice(`${result.email} is now an employee. Ask them to open ${result.portalLabel} (${result.portalUrl}) and sign in with Google using exactly ${result.email}.`);
    setReload(value => value + 1);
    onAccepted();
  }

  const canActOn = (invitation: PendingInvitation) => !invitation.role.privileged || actor.permissions.includes('role.assign.privileged');

  return (
    <section className="panel table-panel" aria-label="Pending invitations">
      <div className="panel-heading">
        <div>
          <h2>Pending invitations</h2>
          <p>{items ? `${items.length} waiting to be accepted` : 'Loading…'}</p>
        </div>
        <button className="button secondary" onClick={() => setReload(value => value + 1)}>Refresh</button>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {items && items.length === 0 && <p className="helper">No invitations are waiting.</p>}
      {items && items.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Person</th><th>Role</th><th>Branch</th><th>Invitation email</th><th>Expires</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {items.map(invitation => {
                const delivery = deliveryView(invitation.delivery);
                return (
                  <tr key={invitation.id}>
                    <td><strong>{invitation.fullName}</strong><span>{invitation.email}</span></td>
                    <td>{invitation.role.name}</td>
                    <td>{invitation.branches.map(branch => branch.code).join(', ')}</td>
                    <td style={{ minWidth: 220, maxWidth: 320, whiteSpace: 'normal' }}><StatusBadge status={delivery.status} label={delivery.label} /><small style={{ display: 'block', marginTop: 4 }}>{delivery.detail}</small></td>
                    <td>{invitation.expired ? <strong>Expired</strong> : <time>{new Date(invitation.expiresAt).toLocaleString()}</time>}</td>
                    <td>
                      {canActOn(invitation) ? (
                        // Kept visible (other tables reveal row actions on hover): these actions are the reason this list exists.
                        <div style={{ opacity: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <button className="text-button" disabled={busyId === invitation.id} onClick={() => resend(invitation)}>{busyId === invitation.id ? 'Sending…' : 'Send again'}</button>
                          {!invitation.expired && <button className="text-button" onClick={() => { setNotice(''); setAccepting(invitation); }}>Accept manually</button>}
                        </div>
                      ) : <small>Needs privileged-role authority</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {accepting && <AcceptManuallyDialog user={user} invitation={accepting} errorMessage={errorMessage} onClose={() => setAccepting(null)} onDone={accepted} />}
    </section>
  );
}

function AcceptManuallyDialog({ user, invitation, errorMessage, onClose, onDone }: { user: User; invitation: PendingInvitation; errorMessage: Props['errorMessage']; onClose: () => void; onDone: (result: ManualAcceptance) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const delivery = deliveryView(invitation.delivery);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { onDone(await adminApi.acceptInvitationManually(user, invitation.id, reason.trim())); }
    catch (error) { setError(errorMessage(error)); setBusy(false); }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      <form onSubmit={submit}>
        <header>
          <div><p className="eyebrow">Employee onboarding</p><h2>Accept for {invitation.fullName}</h2></div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        {error && <div className="alert error" role="alert">{error}</div>}
        <p style={{ marginTop: '1rem' }}>This makes <strong>{invitation.email}</strong> an active <strong>{invitation.role.name}</strong> now, without the email link. Only someone who can sign in to Google with exactly this address can use the access.</p>
        <p className="helper">Email status: {delivery.label}. {delivery.detail}</p>
        <label><span>Reason <span aria-hidden="true">*</span></span>
          <textarea value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={500} required placeholder="For example: email bounced, address confirmed with the person by phone." />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
          <span>I have checked with this person that the email address is correct and belongs to them.</span>
        </label>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy || !confirmed || reason.trim().length < 8}>{busy ? 'Accepting…' : 'Accept invitation'}</button>
        </footer>
      </form>
    </dialog>
  );
}
