import type { ReactNode } from 'react';
import type { Ton } from './Badge';

const farben: Record<Ton, string> = {
  neutral: 'text-ink-muted',
  akzent: 'text-accent',
  positiv: 'text-positiv',
  warnung: 'text-warnung',
  kritisch: 'text-danger',
};

/** Dieselben Zeichen wie im `Badge` (DS-001); `neutral` und `akzent` sind kein Status. */
const zeichen: Partial<Record<Ton, string>> = {
  positiv: '✓',
  warnung: '!',
  kritisch: '×',
};

/**
 * Statuszeichen für dichte Listen: Zeichen und Wort ohne Pille
 * (Design-Handoff 2026-10-01, Abschnitt 3).
 *
 * Nur dort, wo ein `Badge` die Zeile sprengt - im Tagesplan des Teams etwa.
 * Töne und Zeichen sind dieselben wie beim `Badge`, damit `dayPlanStatusTon`
 * und `appointmentStatusTon` für beide gelten: „✓ erledigt", „! nicht
 * angetroffen", „× abgesagt"; ein bestätigter Termin steht ohne Zeichen.
 *
 * Farbe trägt nie allein (WCAG 1.4.1): Der Zustand ist das Wort, das Zeichen
 * ist für Vorlesesoftware ausgeblendet.
 */
export function StatusMark({ ton = 'neutral', children }: { ton?: Ton; children: ReactNode }) {
  const bild = zeichen[ton];
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap ${farben[ton]}`}
    >
      {bild ? <span aria-hidden="true">{bild}</span> : null}
      {children}
    </span>
  );
}
