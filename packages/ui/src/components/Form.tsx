import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type FieldBase = { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; className?: string };

function Wrapper({ id, label, hint, error, required, className = '', children }: FieldBase & { id: string; children: ReactNode }) {
  return (
    <div className={`grid content-start gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}{required ? <span className="ml-0.5 text-error" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-error" role="alert">{error}</p> : hint ? <p className="text-xs text-base-content/55">{hint}</p> : null}
    </div>
  );
}

export function TextField({ label, hint, error, className, required, ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Wrapper id={id} {...{ label, hint, error, required, className }}>
      <input id={id} required={required} aria-invalid={Boolean(error) || undefined} className={`input w-full ${error ? 'input-error' : ''}`} {...rest} />
    </Wrapper>
  );
}

export function SelectField({ label, hint, error, className, required, children, ...rest }: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Wrapper id={id} {...{ label, hint, error, required, className }}>
      <select id={id} required={required} aria-invalid={Boolean(error) || undefined} className={`select w-full ${error ? 'select-error' : ''}`} {...rest}>{children}</select>
    </Wrapper>
  );
}

export function TextareaField({ label, hint, error, className, required, ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Wrapper id={id} {...{ label, hint, error, required, className }}>
      <textarea id={id} required={required} aria-invalid={Boolean(error) || undefined} className={`textarea min-h-24 w-full ${error ? 'textarea-error' : ''}`} {...rest} />
    </Wrapper>
  );
}
