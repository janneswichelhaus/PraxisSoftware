import { Link } from 'react-router-dom';
import { Personenbild } from '@/components/ui/Personenbild';
import type { Termin } from './api';
import { terminBeschreibung } from './terminbeschreibung';
import { tagOhneJahr, uhrzeit } from './zeit';

/**
 * Der nächste Termin mit der Person, die kommt (Handoff 2026-10-22,
 * Abschnitt 3): oben der Tag groß, darunter die Zeit; nach einer Linie die
 * Person mit Bild, Art und Ort. Die ganze Karte führt zum Termin. Art und Ort
 * kommen aus `terminBeschreibung` wie in der Terminliste - neu ist nur die
 * Anordnung.
 *
 * Antippbar und deshalb mit der Tiefenstufe `shadow-plattform` (ANN-678);
 * gedrückt vertieft und 98 % groß, bei „Bewegung reduzieren“ nur vertieft.
 */
export function Besuchskarte({ termin, to }: { termin: Termin; to: string }) {
  const { titel, ort } = terminBeschreibung(termin);
  return (
    <Link
      to={to}
      className="border-line bg-surface text-ink rounded-card shadow-plattform hover:bg-surface-sunken active:bg-surface-sunken ease-druck flex flex-col border p-5 no-underline transition-[background-color,scale] duration-120 motion-safe:active:scale-98"
    >
      {/* Die Leerzeichen trennen die Zeilen im Namen des Links; sichtbar
          trennt sie das Layout. */}
      <span className="text-abschnitt">{tagOhneJahr(termin.starts_at)}</span>{' '}
      <span className="text-ink-muted">
        {uhrzeit(termin.starts_at)} bis {uhrzeit(termin.ends_at)}
      </span>{' '}
      <span className="border-line mt-4 flex items-center gap-4 border-t pt-4">
        {/* Ohne Namen kein Bild: Ein „?“ im Kreis sagte nichts. */}
        {termin.staff_name ? (
          <Personenbild name={termin.staff_name} farbe={null} groesse="karte" />
        ) : null}
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{titel}</span>{' '}
          {ort ? <span className="text-ink-muted">{ort}</span> : null}
        </span>
      </span>
    </Link>
  );
}
