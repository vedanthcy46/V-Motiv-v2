import { useEffect, useState } from 'react';
import { Button, ThemeToggle } from '@vmotiv/ui';
import { profileIsComplete, validateProfileForm } from './account';
import { NAVIGATE_EVENT } from './navigate';
import { parseScrapRoute } from './route';
import { SessionProvider, useSession } from './session';
import { MyRequests, RequestPage, ScrapHome } from './Requests';
import { Wizard } from './Wizard';
import { Notice, PageShell, Link } from './ui';
import { webErrorMessage } from './messages';

// The scrapping area of the website. It is loaded only when someone opens /scrap, so the landing page never downloads the sign-in code.
// Everything here talks to the same V MOTIV account and API as the app: a request started here continues in the app, and the other way round.

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener(NAVIGATE_EVENT, update);
    return () => { window.removeEventListener('popstate', update); window.removeEventListener(NAVIGATE_EVENT, update); };
  }, []);
  return parseScrapRoute(path);
}

function Header() {
  const { state, profile, signOut } = useSession();
  return (
    <header className="border-b border-base-300 bg-base-100">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <a href="/" className="inline-flex min-h-11 items-center gap-2 font-extrabold" aria-label="V MOTIV home">
          <img src="/brand/vmotiv-icon.png" alt="" width={28} height={28} />
          <span>V MOTIV</span>
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {state === 'signed-in' && profile ? <Button size="sm" variant="ghost" onClick={() => void signOut()}>Sign out</Button> : null}
        </div>
      </div>
    </header>
  );
}

function SignInGate() {
  const { signIn, busy, error, unavailable, retry, state } = useSession();
  return (
    <PageShell title="Scrap your car with V MOTIV" subtitle="Sign in with Google to start a request and follow it here, in the V MOTIV app and in your notifications.">
      {unavailable ? <Notice tone="warning">Sign-in is not available on the website right now. Please use the V MOTIV app.</Notice> : null}
      {error ? <Notice tone="danger" action={{ label: 'Try again', onClick: () => void retry() }}>{error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void signIn()} loading={busy || state === 'booting'} disabled={unavailable}>Continue with Google</Button>
        <a className="link link-primary inline-flex min-h-11 items-center text-sm" href="/#app">Get the V MOTIV app</a>
      </div>
      <p className="text-sm text-base-content/70">V MOTIV arranges scrapping with an authorised facility. It is not the facility and not a government service. Signing in does not prove you own a vehicle.</p>
    </PageShell>
  );
}

/** A phone number and the terms, the same as the app asks, before anything is created in the account. */
function CompleteProfile() {
  const { saveProfile, profile } = useSession();
  const [phone, setPhone] = useState(profile?.phone?.replace(/^\+91/, '') ?? '');
  const [accepted, setAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; terms?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const result = validateProfileForm({ phone, accepted });
    setErrors({ phone: result.phone, terms: result.terms });
    if (!result.value) {
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setBusy(true);
    setError('');
    try { await saveProfile({ phone: result.value.phone, marketingConsent: marketing }); } catch (e) { setError(webErrorMessage(e, 'We could not save your details.')); } finally { setBusy(false); }
  };

  return (
    <PageShell title="One more step" subtitle="We need a mobile number to reach you about your request, and your agreement to our terms.">
      <form noValidate className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className="grid gap-1.5">
          <label htmlFor="profile-phone" className="text-sm font-medium">Mobile number <span className="text-error" aria-hidden="true">*</span></label>
          <div className="flex items-center gap-2">
            <span className="text-sm" aria-hidden="true">+91</span>
            <input id="profile-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" className={`input w-full ${errors.phone ? 'input-error' : ''}`} value={phone} onChange={event => setPhone(event.target.value)} aria-invalid={Boolean(errors.phone) || undefined} aria-describedby={errors.phone ? 'profile-phone-error' : undefined} />
          </div>
          {errors.phone ? <p id="profile-phone-error" className="text-xs text-error" role="alert">{errors.phone}</p> : null}
        </div>
        <div className="grid gap-1">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" checked={accepted} onChange={event => setAccepted(event.target.checked)} aria-invalid={Boolean(errors.terms) || undefined} aria-describedby={errors.terms ? 'profile-terms-error' : undefined} />
            <span>I accept the <a className="link link-primary" href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and the <a className="link link-primary" href="/privacy" target="_blank" rel="noreferrer">Privacy Notice</a>.</span>
          </label>
          {errors.terms ? <p id="profile-terms-error" className="text-xs text-error" role="alert">{errors.terms}</p> : null}
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" checked={marketing} onChange={event => setMarketing(event.target.checked)} />
          <span>Send me offers and updates (optional).</span>
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div><Button type="submit" loading={busy}>Continue</Button></div>
      </form>
    </PageShell>
  );
}

function Routes() {
  const { state, profile } = useSession();
  const route = useRoute();

  if (state === 'booting') return <PageShell title="Scrap a car"><p role="status" className="text-sm text-base-content/70">Checking your sign-in…</p></PageShell>;
  if (state === 'signed-out' || !profile) return <SignInGate />;
  if (!profileIsComplete(profile)) return <CompleteProfile />;

  switch (route.name) {
    case 'new': return <Wizard key="new" />;
    case 'list': return <MyRequests />;
    case 'request': return <RequestPage key={route.id} id={route.id} />;
    default: return <ScrapHome />;
  }
}

export default function ScrapApp() {
  return (
    <SessionProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-base-100 focus:p-2">Skip to content</a>
      <Header />
      <Routes />
      <footer className="mx-auto mt-auto w-full max-w-3xl px-4 py-6 text-xs text-base-content/60">
        <Link to={{ name: 'home' }} className="link">Scrapping home</Link> · <a className="link" href="/privacy">Privacy</a> · <a className="link" href="/terms">Terms</a>
      </footer>
    </SessionProvider>
  );
}
