import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';

export interface NavbarLink { label: string; href: string }

/** Marketing / public-site top navigation: brand, links, actions, theme switch, collapsing mobile menu. */
export function Navbar({ logo = '/brand/vmotiv-logo.svg', brandHref = '/', links, actions }: { logo?: string; brandHref?: string; links: NavbarLink[]; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-base-300 bg-base-100/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <a href={brandHref} className="flex items-center" aria-label="V MOTIV home"><img src={logo} alt="V MOTIV" className="h-9 w-auto" /></a>
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map(link => <a key={link.href} href={link.href} className="btn btn-ghost btn-sm font-medium">{link.label}</a>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">{actions}</div>
          <ThemeToggle />
          <button type="button" className="btn btn-ghost btn-square btn-sm md:hidden" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><Icon name={open ? 'close' : 'menu'} size={20} /></button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-base-300 bg-base-100 px-4 py-3 md:hidden">
          <nav className="grid gap-1" aria-label="Mobile">
            {links.map(link => <a key={link.href} href={link.href} className="btn btn-ghost justify-start" onClick={() => setOpen(false)}>{link.label}</a>)}
          </nav>
          {actions ? <div className="mt-3 grid gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

/** Public-site footer with link columns. */
export function SiteFooter({ logo = '/brand/vmotiv-logo.svg', tagline, columns, legal }: { logo?: string; tagline?: ReactNode; columns: Array<{ title: string; links: NavbarLink[] }>; legal?: ReactNode }) {
  return (
    <footer className="border-t border-base-300 bg-neutral text-neutral-content">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <img src={logo} alt="V MOTIV" className="h-10 w-auto" />
          {tagline ? <p className="mt-4 max-w-xs text-sm opacity-75">{tagline}</p> : null}
        </div>
        {columns.map(column => (
          <nav key={column.title} aria-label={column.title}>
            <h3 className="mb-3 text-sm font-semibold text-neutral-content">{column.title}</h3>
            <ul className="grid gap-2 text-sm">
              {column.links.map(link => <li key={link.href}><a className="opacity-75 hover:opacity-100" href={link.href}>{link.label}</a></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs opacity-70">{legal ?? `© ${new Date().getFullYear()} V MOTIV. All rights reserved.`}</div>
    </footer>
  );
}
