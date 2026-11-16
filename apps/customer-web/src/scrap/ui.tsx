import { useId, type ReactNode } from 'react';
import { Alert, Badge, Button, type Tone as BadgeTone } from '@vmotiv/ui';
import { PROGRESS_STAGES, statusTone, type Tone } from '../../../customer-mobile/src/services/scrap-form';
import type { SaveState } from '../../../customer-mobile/src/services/scrap-sync';
import { navigate } from './navigate';
import { scrapPath, type ScrapRoute } from './route';

// Small building blocks for the scrapping pages. Questions are real fieldsets with radio buttons and checkboxes (not styled divs), so screen
// readers announce the question with its answers, the keyboard works, and errors are tied to the field they belong to.

const alertTone = (tone: Tone) => (tone === 'danger' ? 'error' : tone === 'neutral' ? 'info' : tone);

export function Notice({ tone = 'info', title, children, action }: { tone?: Tone; title?: string; children: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <Alert tone={alertTone(tone)} title={title}>
      {children}
      {action ? <Button className="mt-2" size="sm" variant="outline" onClick={action.onClick}>{action.label}</Button> : null}
    </Alert>
  );
}

export function Section({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-base-300 bg-base-100 p-4 sm:p-5 grid gap-3 ${className}`}>
      {title ? <h2 className="text-base font-bold">{title}</h2> : null}
      {children}
    </section>
  );
}

const badgeTone = (tone: Tone): BadgeTone => (tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : tone === 'info' ? 'info' : 'neutral');

/** The status always carries its words; colour is only extra. */
export function StatusPill({ status, label }: { status: string; label: string }) {
  return <Badge tone={badgeTone(statusTone(status))} dot>{label}</Badge>;
}

export function Link({ to, children, className = '' }: { to: ScrapRoute; children: ReactNode; className?: string }) {
  const href = scrapPath(to);
  return (
    <a
      href={href}
      className={className}
      onClick={event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // let "open in new tab" work
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

export function LinkButton({ to, children, variant = 'primary', block }: { to: ScrapRoute; children: ReactNode; variant?: 'primary' | 'outline'; block?: boolean }) {
  return <Link to={to} className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-outline'} min-h-11 ${block ? 'btn-block' : ''}`}>{children}</Link>;
}

interface ChoiceProps { label: string; help?: string; error?: string; required?: boolean; name: string }

function Legend({ label, help, required, helpId }: { label: string; help?: string; required?: boolean; helpId: string }) {
  return (
    <>
      <legend className="text-sm font-medium">{label}{required ? <span className="ml-0.5 text-error" aria-hidden="true">*</span> : null}</legend>
      {help ? <p id={helpId} className="text-xs text-base-content/60">{help}</p> : null}
    </>
  );
}

/** One question with a few answers. A radio group, so the arrow keys move between answers. */
export function ChoiceGroup({ label, help, error, required, name, options, value, onChange, layout = 'stack' }: ChoiceProps & { options: Array<{ value: string; label: string }>; value: string | undefined; onChange: (value: string) => void; layout?: 'stack' | 'wrap' }) {
  const id = useId();
  return (
    <fieldset className="grid gap-2" aria-describedby={[help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} aria-invalid={Boolean(error) || undefined}>
      <Legend {...{ label, help, required }} helpId={`${id}-help`} />
      <div className={layout === 'wrap' ? 'flex flex-wrap gap-2' : 'grid gap-2'}>
        {options.map(option => (
          <label key={option.value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${value === option.value ? 'border-primary bg-primary/10 font-medium' : 'border-base-300'}`}>
            <input type="radio" className="size-5 shrink-0 accent-[var(--color-primary)]" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error ? <p id={`${id}-error`} className="text-xs text-error" role="alert">{error}</p> : null}
    </fieldset>
  );
}

export function YesNo({ label, help, error, required, name, value, onChange }: ChoiceProps & { value: boolean | undefined; onChange: (value: boolean) => void }) {
  return (
    <ChoiceGroup
      {...{ label, help, error, required, name }}
      layout="wrap"
      options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
      value={value === undefined ? undefined : value ? 'yes' : 'no'}
      onChange={next => onChange(next === 'yes')}
    />
  );
}

export function CheckboxField({ name, checked, onChange, error, children }: { name: string; checked: boolean; onChange: (value: boolean) => void; error?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-base-300 p-3 text-sm">
        <input type="checkbox" name={name} className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" checked={checked} onChange={event => onChange(event.target.checked)} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : undefined} />
        <span>{children}</span>
      </label>
      {error ? <p id={`${id}-error`} className="text-xs text-error" role="alert">{error}</p> : null}
    </div>
  );
}

const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved',
  offline: 'Not saved yet. Your answers are kept in this browser. Reconnect, then try again.',
  error: 'Could not save. Your answers are kept in this browser.',
};

/** Announced politely to screen readers, so people know their answers are safe without being interrupted. */
export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <p className="flex min-h-6 items-center gap-2 text-xs text-base-content/70" role="status" aria-live="polite">
      <span>{SAVE_TEXT[state]}</span>
      {state === 'offline' || state === 'error' ? <button type="button" className="link link-primary min-h-6" onClick={onRetry}>Try again</button> : null}
    </p>
  );
}

/** The progress track as an ordered list with the current stage marked in words, so it makes sense without colour. */
export function ProgressTrack({ stage }: { stage: number | null }) {
  if (stage === null) return null;
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Progress">
      {PROGRESS_STAGES.map((name, index) => (
        <li key={name} className={index === stage ? 'font-bold text-primary' : index < stage ? 'text-base-content' : 'text-base-content/50'} aria-current={index === stage ? 'step' : undefined}>
          {index < stage ? '✓ ' : ''}{name}{index === stage ? ' (now)' : ''}
        </li>
      ))}
    </ol>
  );
}

export function PageShell({ title, subtitle, children, back }: { title: string; subtitle?: string; children: ReactNode; back?: { to: ScrapRoute; label: string } }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10" id="main">
      {back ? <Link to={back.to} className="mb-3 inline-flex min-h-11 items-center text-sm link link-primary">← {back.label}</Link> : null}
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl" tabIndex={-1} data-page-title>{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-base-content/70">{subtitle}</p> : null}
      <div className="mt-5 grid gap-4">{children}</div>
    </main>
  );
}
