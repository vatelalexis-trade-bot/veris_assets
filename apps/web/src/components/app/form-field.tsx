import { useId, type ReactElement, cloneElement } from 'react';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  label: string;
  /** Translated error message; marks the control as invalid and links the message to it. */
  error?: string;
  hint?: string;
  /** A single form control (Input, select…), which receives id and ARIA attributes. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Label + control + inline validation message, accessible by construction (SPEC §23.3). */
export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
