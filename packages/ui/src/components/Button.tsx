import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-error',
  success: 'btn-success',
  link: 'btn-link',
};
const sizeClass: Record<ButtonSize, string> = { xs: 'btn-xs', sm: 'btn-sm', md: '', lg: 'btn-lg' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button until the server answers. */
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, block, icon, className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${variantClass[variant]} ${sizeClass[size]} ${block ? 'btn-block' : ''} font-medium ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="loading loading-spinner loading-xs" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={`btn btn-ghost btn-square btn-sm ${className}`} {...rest}>
      {children}
    </button>
  );
}
