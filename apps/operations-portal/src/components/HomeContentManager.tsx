import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Alert, Badge, Button, ConfirmDialog, EmptyState, Modal, SelectField, TextField, TextareaField, toast, describeApiError } from '@vmotiv/ui';
import { homeContentApi, type HomeContentItem } from '../api';
import {
  KIND_INFO, SCREEN_OPTIONS, STATE_LABEL, STATE_TONE, blankForm, cloudinaryUploadUrl, fileProblem, formFromItem, formProblems, readUpload, toPayload, whenText,
  type HomeKind, type ItemForm,
} from '../homeContent';

// Banners and hub photos and videos for the customer app's Home screen. Operations drafts, schedules, publishes and removes them here; the
// apps read whatever is live. Nothing is shown to customers until an item is published and inside its dates.

const KINDS: HomeKind[] = ['BANNER', 'HUB_PHOTO', 'HUB_VIDEO'];

/** Uploads straight to our media account with a one-time signature, so large videos never pass through the API server. */
async function uploadMedia(user: User, kind: HomeKind, file: File, onProgress: (percent: number) => void): Promise<{ url: string; durationSeconds: number | null }> {
  const signed = await homeContentApi.uploadSignature(user);
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', signed.apiKey);
  body.append('timestamp', String(signed.timestamp));
  body.append('folder', signed.folder);
  body.append('signature', signed.signature);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', cloudinaryUploadUrl(signed.cloudName, KIND_INFO[kind].media));
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    request.onload = () => {
      try {
        if (request.status < 200 || request.status >= 300) throw new Error('The media service refused the file. Try a smaller or different file.');
        resolve(readUpload(JSON.parse(request.responseText)));
      } catch (error) { reject(error); }
    };
    request.send(body);
  });
}

function Thumb({ item }: { item: HomeContentItem }) {
  const source = item.kind === 'HUB_VIDEO' ? item.posterUrl : item.mediaUrl;
  return (
    <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-base-200">
      {source ? <img src={source} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full w-full place-items-center text-xs text-base-content/50">No preview</div>}
      {item.kind === 'HUB_VIDEO' ? <span className="absolute inset-0 grid place-items-center text-white" aria-hidden="true"><span className="rounded-full bg-black/55 px-2 py-0.5 text-xs">▶ {item.durationSeconds ? `${item.durationSeconds}s` : 'Video'}</span></span> : null}
    </div>
  );
}

export function HomeContentManager({ user, onError }: { user: User; onError?: (error: unknown) => void }) {
  const [items, setItems] = useState<HomeContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<HomeKind>('BANNER');
  const [editing, setEditing] = useState<{ item: HomeContentItem | null; kind: HomeKind } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HomeContentItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try { setItems((await homeContentApi.list(user)).items); } catch (e) { setError(describeApiError(e)); onError?.(e); } finally { setLoading(false); }
  }, [user, onError]);
  useEffect(() => { void load(); }, [load]);

  const act = async (item: HomeContentItem, work: () => Promise<unknown>, message: string) => {
    if (busyId) return; // one change at a time
    setBusyId(item.id);
    try { await work(); toast.success(message); await load(); } catch (e) { toast.error('That did not work', { description: describeApiError(e) }); } finally { setBusyId(null); }
  };

  const shown = items.filter(item => item.kind === kind && item.status !== 'ARCHIVED');
  const archived = items.filter(item => item.kind === kind && item.status === 'ARCHIVED');
  const liveCount = (k: HomeKind) => items.filter(item => item.kind === k && item.state === 'LIVE').length;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-xl font-bold">Home content</h2>
        <p className="mt-1 max-w-3xl text-sm text-base-content/70">
          What customers see on the app's Home screen. Nothing appears until you publish it, and an item with dates shows only between them. A section with nothing live is hidden.
        </p>
      </div>

      {error ? <Alert tone="error" onDismiss={() => setError('')}>{error} <Button size="xs" variant="outline" onClick={() => void load()}>Try again</Button></Alert> : null}

      <div role="tablist" aria-label="Kind of content" className="flex flex-wrap gap-2">
        {KINDS.map(k => (
          <button key={k} role="tab" aria-selected={kind === k} className={`btn btn-sm ${kind === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setKind(k)}>
            {KIND_INFO[k].plural} <span className="badge badge-sm">{liveCount(k)} live</span>
          </button>
        ))}
        <span className="flex-1" />
        <Button onClick={() => setEditing({ item: null, kind })}>Add {KIND_INFO[kind].label.toLowerCase()}</Button>
      </div>
      <p className="text-sm text-base-content/65">{KIND_INFO[kind].hint}</p>

      {loading ? <p role="status" className="text-sm text-base-content/70">Loading…</p> : null}
      {!loading && shown.length === 0 ? <EmptyState title={`No ${KIND_INFO[kind].plural.toLowerCase()} yet`} description="Add one, check it, then publish it." /> : null}

      <ul className="grid gap-3">
        {shown.map((item, index) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-base-300 bg-base-100 p-3">
            <Thumb item={item} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{item.title || <span className="text-base-content/50">(no title)</span>}</p>
              <p className="text-sm text-base-content/65">{whenText(item)}{item.city ? ` · ${item.city}` : ' · All cities'}{item.hubName ? ` · ${item.hubName}` : ''}</p>
              <div className="mt-1"><Badge tone={STATE_TONE[item.state]} dot>{STATE_LABEL[item.state]}</Badge></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" aria-label="Move up" disabled={index === 0 || busyId !== null} onClick={() => void act(item, () => homeContentApi.move(user, item.id, 'UP'), 'Moved up')}>↑</Button>
              <Button size="sm" variant="ghost" aria-label="Move down" disabled={index === shown.length - 1 || busyId !== null} onClick={() => void act(item, () => homeContentApi.move(user, item.id, 'DOWN'), 'Moved down')}>↓</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing({ item, kind })}>Edit</Button>
              {item.status === 'PUBLISHED'
                ? <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void act(item, () => homeContentApi.unpublish(user, item.id), 'Taken off Home')}>Unpublish</Button>
                : <Button size="sm" disabled={busyId !== null} onClick={() => void act(item, () => homeContentApi.publish(user, item.id), 'Published')}>Publish</Button>}
              {item.status === 'PUBLISHED'
                ? null
                : <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => setConfirmDelete(item)}>Delete</Button>}
            </div>
          </li>
        ))}
      </ul>

      {archived.length ? (
        <details className="text-sm"><summary className="cursor-pointer text-base-content/70">{archived.length} archived</summary>
          <ul className="mt-2 grid gap-2">{archived.map(item => (
            <li key={item.id} className="flex items-center gap-3 rounded-lg border border-base-300 p-2"><Thumb item={item} /><span className="flex-1 truncate">{item.title || '(no title)'}</span>
              <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void act(item, () => homeContentApi.unpublish(user, item.id), 'Restored as a draft')}>Restore</Button></li>))}
          </ul></details>
      ) : null}

      {editing ? (
        <Editor
          user={user}
          kind={editing.kind}
          item={editing.item}
          nextOrder={shown.length}
          onClose={() => setEditing(null)}
          onSaved={async message => { toast.success(message); setEditing(null); await load(); }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this item?"
          message="It is removed for good. To keep it but hide it, unpublish it instead."
          confirmLabel="Delete"
          tone="danger"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => { const item = confirmDelete; setConfirmDelete(null); await act(item, () => homeContentApi.remove(user, item.id), 'Deleted'); }}
        />
      ) : null}
    </div>
  );
}

function Editor({ user, kind, item, nextOrder, onClose, onSaved }: {
  user: User; kind: HomeKind; item: HomeContentItem | null; nextOrder: number; onClose: () => void; onSaved: (message: string) => Promise<void>;
}) {
  const [form, setForm] = useState<ItemForm>(() => (item ? formFromItem(item) : blankForm(kind)));
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ItemForm>(field: K, value: ItemForm[K]) => setForm(current => ({ ...current, [field]: value }));
  const problems = formProblems(form);
  const info = KIND_INFO[kind];

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const problem = fileProblem(kind, file);
    if (problem) { setUploadError(problem); return; }
    setUploadError('');
    setUploading(0);
    try {
      const uploaded = await uploadMedia(user, kind, file, setUploading);
      setForm(current => ({ ...current, mediaUrl: uploaded.url, durationSeconds: uploaded.durationSeconds ?? current.durationSeconds }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : describeApiError(error));
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const save = async (publish: boolean) => {
    setTouched(true);
    if (Object.keys(problems).length || uploading !== null) return;
    setSaving(true);
    setServerError('');
    try {
      const body = toPayload(form, item?.sortOrder ?? nextOrder);
      const saved = item ? await homeContentApi.update(user, item.id, body) : await homeContentApi.create(user, body);
      if (publish && saved.status !== 'PUBLISHED') await homeContentApi.publish(user, saved.id);
      await onSaved(publish ? 'Saved and published' : 'Saved');
    } catch (error) {
      setServerError(describeApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void save(false); };
  const preview = kind === 'HUB_VIDEO' ? (form.thumbnailUrl || null) : form.mediaUrl || null;

  return (
    <Modal
      title={`${item ? 'Edit' : 'Add'} ${info.label.toLowerCase()}`}
      size="lg"
      busy={saving || uploading !== null}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="outline" loading={saving} disabled={uploading !== null}>Save as draft</Button>
        <Button type="button" loading={saving} disabled={uploading !== null} onClick={() => void save(true)}>{item?.status === 'PUBLISHED' ? 'Save changes' : 'Save and publish'}</Button>
      </>}
    >
      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{info.media === 'video' ? 'Video' : 'Image'} <span className="text-error">*</span></legend>
          {form.mediaUrl ? (
            info.media === 'video'
              ? <video src={form.mediaUrl} poster={preview ?? undefined} controls preload="metadata" className="max-h-64 w-full rounded-lg bg-black" />
              : <div className="relative aspect-[2/1] w-full max-w-xl overflow-hidden rounded-xl bg-base-200"><img src={form.mediaUrl} alt="Preview of the uploaded image" className="h-full w-full object-cover" />
                  {kind === 'BANNER' && (form.title || form.subtitle || (form.actionType !== 'NONE' && form.ctaLabel)) ? (
                    <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-[#061A38]/80 via-[#061A38]/35 to-transparent px-4 pb-2 pt-8 text-white">
                      <div className="min-w-0 flex-1">{form.title ? <p className="truncate text-sm font-extrabold">{form.title}</p> : null}{form.subtitle ? <p className="truncate text-xs opacity-90">{form.subtitle}</p> : null}</div>
                      {form.actionType !== 'NONE' && form.ctaLabel ? <span className="shrink-0 rounded-full bg-[#F7B503] px-3 py-1 text-xs font-extrabold text-[#061A38]">{form.ctaLabel}</span> : null}
                    </div>
                  ) : null}</div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileInput} type="file" className="file-input file-input-sm" accept={info.media === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/jpeg,image/png,image/webp'} onChange={event => void choose(event.target.files?.[0])} disabled={uploading !== null} aria-label={`Choose a ${info.media} to upload`} />
            {uploading !== null ? <span role="status" className="text-sm">Uploading… {uploading}%</span> : form.mediaUrl ? <span className="text-sm text-success">Uploaded. Choose another file to replace it.</span> : null}
          </div>
          {uploadError ? <p className="text-sm text-error" role="alert">{uploadError}</p> : touched && problems.mediaUrl ? <p className="text-sm text-error" role="alert">{problems.mediaUrl}</p> : null}
          <p className="text-xs text-base-content/60">{info.hint}</p>
        </fieldset>

        {kind === 'HUB_VIDEO' ? (
          <TextField label="Cover image address (optional)" hint="Videos get a still from their first frame automatically. Paste an address only to use a different cover." value={form.thumbnailUrl} onChange={event => set('thumbnailUrl', event.target.value)} />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={`Title${kind === 'HUB_VIDEO' ? '' : ' (optional)'}`} required={kind === 'HUB_VIDEO'} maxLength={kind === 'BANNER' ? 40 : 80} hint={kind === 'BANNER' ? 'Keep it short (up to 40 characters): it shows on one line over the bottom of the picture. If your image already has words on it, leave this empty.' : undefined} value={form.title} onChange={event => set('title', event.target.value)} error={touched ? problems.title : undefined} />
          <TextField label="Short line under the title (optional)" maxLength={kind === 'BANNER' ? 60 : 160} value={form.subtitle} onChange={event => set('subtitle', event.target.value)} />
          <TextField label="Hub name (optional)" hint="For example Koramangala Hub." maxLength={80} value={form.hubName} onChange={event => set('hubName', event.target.value)} />
          <TextField label="City (optional)" hint="Leave empty to show in every city." maxLength={80} value={form.city} onChange={event => set('city', event.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="When tapped" value={form.actionType} onChange={event => setForm(current => ({ ...current, actionType: event.target.value as ItemForm['actionType'], actionTarget: '' }))}>
            <option value="NONE">Nothing happens</option>
            <option value="SCREEN">Open a screen in the app</option>
            <option value="LISTING">Open a car</option>
            <option value="URL">Open a web link</option>
          </SelectField>
          {form.actionType === 'SCREEN' ? (
            <SelectField label="Which screen" value={form.actionTarget} error={touched ? problems.actionTarget : undefined} onChange={event => set('actionTarget', event.target.value)}>
              <option value="">Choose…</option>
              {SCREEN_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
          ) : form.actionType !== 'NONE' ? (
            <TextField label={form.actionType === 'LISTING' ? 'Car listing id' : 'Web link (https://…)'} value={form.actionTarget} error={touched ? problems.actionTarget : undefined} onChange={event => set('actionTarget', event.target.value)} />
          ) : <span />}
          {form.actionType !== 'NONE' ? <TextField label="Button text (optional)" hint="For example Book now. Shown as a small button at the right of the banner." maxLength={kind === 'BANNER' ? 18 : 30} value={form.ctaLabel} onChange={event => set('ctaLabel', event.target.value)} /> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField type="datetime-local" label="Show from (optional)" hint="Leave empty to start as soon as it is published." value={form.startsAt} onChange={event => set('startsAt', event.target.value)} />
          <TextField type="datetime-local" label="Show until (optional)" hint="Leave empty to keep showing it." value={form.endsAt} onChange={event => set('endsAt', event.target.value)} error={touched ? problems.endsAt : undefined} />
        </div>

        {serverError ? <Alert tone="error">{serverError}</Alert> : null}
      </div>
    </Modal>
  );
}
