import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { CountBadge } from './Badge';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';
import { RequestProgress } from './Loaders';
import { Toaster } from './Toaster';

export interface NavItem<K extends string = string> {
  key: K;
  label: string;
  icon?: ReactNode | ComponentType<{ size?: number }>;
  /** Number of items needing attention; hidden at zero. */
  badge?: number;
}
export interface NavSection<K extends string = string> { title?: string; items: NavItem<K>[] }

export interface AccountInfo { name: string; role?: string }

function renderIcon(icon: NavItem['icon']) {
  if (!icon) return null;
  if (typeof icon === 'function') { const C = icon; return <C size={18} />; }
  return icon;
}

export interface SidebarProps<K extends string> {
  open: boolean;
  onClose: () => void;
  logo?: string;
  /** Short portal name shown beside the logo, e.g. "Sales". */
  portalName: string;
  sections: NavSection<K>[];
  active: K;
  onSelect: (key: K) => void;
  account?: AccountInfo;
  onSignOut?: () => void;
}

export function Sidebar<K extends string>({ open, onClose, logo = '/brand/vmotiv-logo.svg', portalName, sections, active, onSelect, account, onSignOut }: SidebarProps<K>) {
  return (
    <>
      <aside className="vm-sidebar" data-open={open} aria-label={`${portalName} navigation`}>
        <div className="vm-sidebar-brand">
          <img src={logo} alt="V MOTIV" />
          <span className="vm-sidebar-tag">{portalName}</span>
        </div>
        <nav className="vm-sidebar-nav">
          {sections.map((section, index) => (
            <div key={section.title ?? index}>
              {section.title ? <div className="vm-nav-title">{section.title}</div> : null}
              {section.items.map(item => (
                <button key={item.key} type="button" className="vm-nav-item" aria-current={item.key === active ? 'page' : undefined} onClick={() => { onSelect(item.key); onClose(); }}>
                  {renderIcon(item.icon)}
                  <span className="truncate">{item.label}</span>
                  {item.badge ? <CountBadge count={item.badge} className="vm-nav-badge" /> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        {account || onSignOut ? (
          <div className="vm-sidebar-foot">
            {account ? (
              <div className="vm-account">
                <span className="vm-avatar" aria-hidden="true">{(account.name || '?').trim().charAt(0).toUpperCase()}</span>
                <div className="min-w-0">
                  <div className="vm-account-name" title={account.name}>{account.name}</div>
                  {account.role ? <div className="vm-account-role">{account.role.replace(/_/g, ' ').toLowerCase()}</div> : null}
                </div>
              </div>
            ) : null}
            {onSignOut ? <button type="button" className="vm-nav-item" onClick={onSignOut}><Icon name="logout" /> Sign out</button> : null}
          </div>
        ) : null}
      </aside>
      {open ? <button type="button" className="vm-scrim" aria-label="Close navigation" onClick={onClose} /> : null}
    </>
  );
}

export interface TopbarProps {
  onMenu: () => void;
  menuOpen: boolean;
  /** Small line above the title, e.g. the portal or branch. */
  context?: ReactNode;
  title?: ReactNode;
  /** Right-hand content: notification bell, sync status, user chip... */
  children?: ReactNode;
}

export function Topbar({ onMenu, menuOpen, context, title, children }: TopbarProps) {
  return (
    <header className="vm-topbar">
      <div className="vm-topbar-left">
        <button type="button" className="vm-menu-btn btn btn-ghost btn-square btn-sm" aria-label="Open navigation" aria-expanded={menuOpen} onClick={onMenu}><Icon name="menu" size={20} /></button>
        <div className="vm-crumb">{context ? <small>{context}</small> : null}{title ? <strong>{title}</strong> : null}</div>
      </div>
      <div className="vm-topbar-right">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}

export interface FooterLink { label: string; href: string }
export function Footer({ links = [], children }: { links?: FooterLink[]; children?: ReactNode }) {
  return (
    <footer className="vm-footer">
      <span>© {new Date().getFullYear()} V MOTIV. {children ?? 'All rights reserved.'}</span>
      {links.length ? <nav aria-label="Footer">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav> : null}
    </footer>
  );
}

export interface AppShellProps<K extends string> {
  portalName: string;
  logo?: string;
  sections: NavSection<K>[];
  active: K;
  onSelect: (key: K) => void;
  account?: AccountInfo;
  onSignOut?: () => void;
  /** Topbar title (defaults to the active nav label). */
  title?: ReactNode;
  context?: ReactNode;
  /** Topbar right-hand slot. */
  toolbar?: ReactNode;
  footerLinks?: FooterLink[];
  children: ReactNode;
}

/** Sidebar + topbar + content + footer, plus the global toaster and request-progress bar. Used by every staff portal. */
export function AppShell<K extends string>({ portalName, logo, sections, active, onSelect, account, onSignOut, title, context, toolbar, footerLinks, children }: AppShellProps<K>) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);
  const activeLabel = sections.flatMap(section => section.items).find(item => item.key === active)?.label;
  return (
    <>
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[3000] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-content" href="#main">Skip to main content</a>
      <RequestProgress />
      <div className="vm-shell">
        <Sidebar open={open} onClose={close} logo={logo} portalName={portalName} sections={sections} active={active} onSelect={onSelect} account={account} onSignOut={onSignOut} />
        <div className="vm-main">
          <Topbar onMenu={() => setOpen(true)} menuOpen={open} context={context ?? `${portalName} workspace`} title={title ?? activeLabel}>{toolbar}</Topbar>
          <main id="main" className="vm-content" key={active}>{children}</main>
          <Footer links={footerLinks} />
        </div>
      </div>
      <Toaster />
    </>
  );
}

/** Sign-in screen layout shared by every staff portal. */
export function AuthLayout({ logo = '/brand/vmotiv-logo.svg', portalName, eyebrow, title, description, children, points = [] }: { logo?: string; portalName: string; eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; children: ReactNode; points?: Array<{ title: string; text: string }> }) {
  return (
    <>
      <RequestProgress />
      <div className="vm-auth">
        <section className="vm-auth-brand">
          <img src={logo} alt="V MOTIV" />
          <p className="vm-eyebrow">{eyebrow ?? `${portalName} portal`}</p>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </section>
        <section className="vm-auth-panel">
          <div className="flex justify-end"><ThemeToggle /></div>
          <div className="grid gap-4">{children}</div>
          {points.length ? (
            <div className="vm-points">
              {points.map(point => <div className="vm-point" key={point.title}><strong>{point.title}</strong><span>{point.text}</span></div>)}
            </div>
          ) : null}
        </section>
      </div>
      <Toaster />
    </>
  );
}

/** Shell for single-screen workspaces (no sidebar): branded topbar, content, footer, toaster. */
export function SimpleShell({ portalName, logo = '/brand/vmotiv-logo.svg', toolbar, footerLinks, wide, children }: { portalName: string; logo?: string; toolbar?: ReactNode; footerLinks?: FooterLink[]; wide?: boolean; children: ReactNode }) {
  return (
    <>
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[3000] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-content" href="#main">Skip to main content</a>
      <RequestProgress />
      <div className="flex min-h-dvh flex-col bg-base-200">
        <header className="vm-topbar vm-topbar-brand">
          <div className="vm-topbar-left">
            <img src={logo} alt="V MOTIV" className="h-9 w-auto" />
            <span className="vm-sidebar-tag">{portalName}</span>
          </div>
          <div className="vm-topbar-right">{toolbar}<ThemeToggle /></div>
        </header>
        <main id="main" className={`vm-content w-full ${wide ? '!max-w-[110rem]' : ''}`}>{children}</main>
        <Footer links={footerLinks} />
      </div>
      <Toaster />
    </>
  );
}
