import { useTheme } from '../theme';
import { Icon } from './Icon';

/** Sun/moon switch. `tone="chrome"` is for use on the always-navy sidebar. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={`btn btn-ghost btn-square btn-sm ${className}`} onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <Icon name={resolved === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
