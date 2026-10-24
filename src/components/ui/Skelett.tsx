import type { ReactNode } from 'react';

// Die Formen des Handoffs: Zeile Radius 6, Karte 14, Hero 16 (230 hoch).
// Dazu die der Übersicht (Leinwand „Laden“): eine Zeile des Grußes (32 hoch;
// die Leinwand rundet 8, das System kennt 6), ein Abschnittstitel (22) und
// die Besuchskarte (120). Für den Reiter „Übungen“ (Handoff 2026-10-24, 5.6)
// die Vorschau der Einheit (300) und die Wochenleiste (56).
const FORM = {
  zeile: 'h-4.5 rounded-[6px]',
  gruss: 'h-8 rounded-[6px]',
  titel: 'h-5.5 rounded-[6px]',
  kreis: 'size-12 rounded-pill',
  karte: 'min-h-20 rounded-card',
  besuch: 'min-h-30 rounded-card',
  hero: 'h-57.5 rounded-image',
  vorschau: 'h-75 rounded-image',
  leiste: 'h-14 rounded-button',
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
