import { VERTRETUNGSART } from '@/lib/vertretung';
import type { Plattformzugang } from './api';

/**
 * „Sie handeln für …" (ADR-023 Punkt 14, DSN-001 Abschnitt 10): das Band in
 * der Hauptfarbe, solange eine Vertretung gewählt ist - im Gerüst unter dem
 * Kopf, im Einstieg unter dem Fortschritt (Handoff 2026-10-22, Abschnitt
 * 5.3). Eine Leiste über die ganze Breite; `innen` stellt den Text an die
 * Kante des Inhalts, `className` setzt die Leiste an den Rand ihrer Fläche.
 */
export function Vertretungsband({
  zugang,
  innen,
  className = '',
}: {
  zugang: Pick<Plattformzugang, 'access_kind' | 'represented_name'>;
  innen: string;
  className?: string;
}) {
  if (zugang.access_kind === 'self') return null;
  return (
    <div role="status" className={`bg-accent text-surface ${className}`.trim()}>
      <p className={`${innen} py-2 text-base`}>
        Sie handeln für <strong>{zugang.represented_name ?? 'eine andere Person'}</strong>
        <span className="opacity-90"> · {VERTRETUNGSART[zugang.access_kind]}</span>
      </p>
    </div>
  );
}
