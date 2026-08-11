import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

// Form primitives per DESIGN.md: label above input, error below, hairline
// borders on Black-2, amber focus ring, 44px minimum targets for gloved hands.
// Presentational only — pages own the action wiring.

const FIELD_BASE =
  "w-full min-h-11 rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-3) text-body text-on-dark placeholder:text-on-dark-muted transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-(--space-2)">
      <label htmlFor={name} className="text-sm font-semibold text-on-dark">
        {label}
      </label>
      {children}
      {error ? (
        // Dot-and-Label rule applied to errors: the critical hue rides on the
        // dot, the text stays white. status-critical fails 4.5:1 as text on
        // the brand darks; it was tuned as a dot colour, never a text colour.
        <p
          id={`${name}-error`}
          className="flex items-center gap-(--space-2) text-sm font-semibold text-on-dark"
          role="alert"
        >
          <span
            className="size-2 shrink-0 rounded-(--radius-pill) bg-status-critical"
            aria-hidden="true"
          />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      id={props.name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${props.name}-error` : undefined}
      className={FIELD_BASE}
      {...props}
    />
  );
}

export function TextArea({
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  return (
    <textarea
      id={props.name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${props.name}-error` : undefined}
      rows={props.rows ?? 4}
      className={FIELD_BASE}
      {...props}
    />
  );
}

export function Select({
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <select
      id={props.name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${props.name}-error` : undefined}
      className={FIELD_BASE}
      {...props}
    >
      {children}
    </select>
  );
}

/* Honeypot — visually hidden from people, present for bots. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="website">Leave this field empty</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}
