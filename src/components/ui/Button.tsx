import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export type Variant = 'primary' | 'secondary' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  /** Fuer Fokusfuehrung, etwa bei einer Rueckfrage vor einem Vorgang. */
  ref?: Ref<HTMLButtonElement>;
}

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[0.9375rem] font-medium ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-55';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-sunken',
  quiet: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
};

/**
 * Die Klassen einer Schaltflaeche, damit ein Link genauso aussehen kann.
 *
 * Bewusst exportiert statt kopiert: `ButtonLink` ist optisch dieselbe
 * Schaltflaeche und soll es auch nach der naechsten Aenderung hier bleiben.
 */
export function buttonKlassen(variant: Variant = 'primary', zusatz = ''): string {
  return `${base} ${variants[variant]} ${zusatz}`.trim();
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={buttonKlassen(variant, className)} {...props} />;
}
