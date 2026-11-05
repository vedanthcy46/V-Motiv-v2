import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';

export interface NavbarLink { label: string; href: string; onClick?: () => void }

function LinkItem({ link, className, afterClick }: { link: NavbarLink; className: string; afterClick?: () => void }) {
  return (
    <a
      href={link.href}
      className={className}
      onClick={event => {
        if (link.onClick) { event.preventDefault(); link.onClick(); }
        afterClick?.();
      }}
    >
      {link.label}
    </a>
  );
}

/** Public-site top navigation: brand navy bar, links, actions, theme switch and a collapsing mobile menu. */
export function Navbar({ logo = '/brand/vmotiv-logo.svg', brandHref = '/', onBrandClick, links, actions, mobileActions }: { logo?: string; brandHref?: string; onBrandClick?: () => void; links: NavbarLink[]; actions?: ReactNode; mobileActions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="vm-navbar sticky top-0 z-40">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-4 px-4 sm:px-6">
        <a href={brandHref} className="flex items-center" aria-label="V MOTIV home" onClick={event => { if (onBrandClick) { event.preventDefault(); onBrandClick(); } }}>
          <img src={logo} alt="V MOTIV" className="h-10 w-auto" />
        </a>
        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Primary">
          {links.map(link => <LinkItem key={link.label} link={link} className="vm-navbar-link" />)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 lg:flex">{actions}</div>
          <ThemeToggle />
          <button type="button" className="btn btn-ghost btn-square btn-sm lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(value => !value)}><Icon name={open ? 'close' : 'menu'} size={20} /></button>
        </div>
      </div>
      {open ? (
        <div className="vm-navbar-mobile lg:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1 px-4 py-3 sm:px-6" aria-label="Mobile">
            {links.map(link => <LinkItem key={link.label} link={link} className="vm-navbar-link block py-2.5" afterClick={() => setOpen(false)} />)}
            {mobileActions ?? actions ? <div className="mt-2 grid gap-2 border-t border-white/10 pt-3" onClick={() => setOpen(false)}>{mobileActions ?? actions}</div> : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

/** Public-site footer: navy, link columns, brand blurb and a legal row. */
export function SiteFooter({ id, logo = '/brand/vmotiv-logo.svg', tagline, columns, legal, children }: { id?: string; logo?: string; tagline?: ReactNode; columns: Array<{ title: string; links?: NavbarLink[]; content?: ReactNode }>; legal?: ReactNode; children?: ReactNode }) {
  return (
    <footer id={id} className="vm-sitefooter">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <img src={logo} alt="V MOTIV" className="h-14 w-auto" />
          {tagline ? <p className="mt-4 max-w-sm text-sm leading-relaxed opacity-75">{tagline}</p> : null}
        </div>
        {columns.map(column => (
          <nav key={column.title} aria-label={column.title}>
            <h3 className="mb-3 text-sm font-semibold text-white">{column.title}</h3>
            {column.links ? (
              <ul className="grid gap-2 text-sm">
                {column.links.map(link => <li key={link.label}><LinkItem link={link} className="opacity-75 hover:opacity-100 hover:no-underline" /></li>)}
              </ul>
            ) : null}
            {column.content ? <div className="text-sm opacity-80">{column.content}</div> : null}
          </nav>
        ))}
      </div>
      {children}
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs opacity-75">{legal ?? `© ${new Date().getFullYear()} V MOTIV. All rights reserved.`}</div>
    </footer>
  );
}
