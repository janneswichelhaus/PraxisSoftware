import type { ReactNode } from 'react';

// Die Formen des Handoffs: Zeile Radius 6, Karte 14, Hero 16 (230 hoch).
const FORM = {
  zeile: 'h-4.5 rounded-[6px]',
  kreis: 'size-12 rounded-pill',
  karte: 'min-h-20 rounded-card',
  hero: 'h-57.5 rounded-image',
} as const;

/**
 * Die Form des Inhalts, solange er lädt (Handoff 2026-10-22, Abschnitt 3;
 * DR-126): eine vertiefte Fläche, die ruhig pulsiert, statt eines Satzes
 * „wird geladen …“. Für Vorlesesoftware unsichtbar - was lädt, sagt der
 * `SkelettBereich` darum. `LoadingState` bleibt für die Praxis-App.
 */
export function Skelett({ form, className = '' }: { form: keyof typeof FORM; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-skelett={form}
      className={`bg-surface-sunken skelett-puls block ${FORM[form]} ${className}`.trim()}
    />
  );
}

/**
 * Der Bereich, der lädt: `aria-busy` und ein Satz nur für Vorlesesoftware,
 * etwa „Übersicht wird geladen“.
 */
export function SkelettBereich({
  beschriftung,
  children,
  className = '',
}: {
  beschriftung: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div aria-busy="true" className={className || undefined}>
      <p className="sr-only">{beschriftung}</p>
      {children}
    </div>
  );
}
