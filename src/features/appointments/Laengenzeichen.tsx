import { Badge } from '@/components/ui/Badge';
import { abweichendeLaengeMinuten, abweichendeLaengeText, type AppointmentKind } from './api';

/**
 * Das Zeichen für eine abweichende Terminlänge (CAL-020).
 *
 * `PROJECT_PRINCIPLES.md` 0.11 §8.1: Ein Behandlungstermin, dessen Länge weder
 * 45 noch 60 Minuten beträgt, wird gekennzeichnet — „in einer Form, die auch
 * ohne Farbe und ohne Bildschirm erfassbar ist". Deshalb trägt das Zeichen
 * immer ein Bild **und** die Minuten als Text, und Vorlesewerkzeuge bekommen
 * den ganzen Satz („Länge weicht ab: 30 Minuten").
 *
 * Es meldet, es verbietet nichts: neutraler Ton, kein Warnzeichen. Ein
 * Ereignis trägt es nie; ob eins nötig ist, entscheidet
 * `abweichendeLaengeMinuten` an genau einer Stelle.
 *
 * `knapp` ist die Fassung für die Kalenderkachel: dort ist kein Platz für ein
 * Abzeichen, das Bild steht allein in der Zeitzeile — der Satz bleibt für
 * Vorlesewerkzeuge und steht zusätzlich im Tooltip der Kachel.
 */
export function Laengenzeichen({
  termin,
  knapp = false,
}: {
  termin: { kind?: AppointmentKind | undefined; starts_at: string; ends_at: string };
  knapp?: boolean;
}) {
  const minuten = abweichendeLaengeMinuten(termin);
  if (minuten === null) return null;

  if (knapp) {
    return (
      <span data-testid="laengenzeichen" className="inline-flex items-center align-[-0.1em]">
        <SpannenBild />
        <span className="sr-only">{abweichendeLaengeText(minuten)}</span>
      </span>
    );
  }

  return (
    <span data-testid="laengenzeichen" className="inline-flex shrink-0">
      <Badge eigenesZeichen={<SpannenBild />}>
        <span className="sr-only">Länge weicht ab: </span>
        {minuten} Min.
      </Badge>
    </span>
  );
}

/**
 * Eine Spanne zwischen zwei Anschlägen — Länge, nicht Uhrzeit.
 *
 * Inline-SVG wie bei den Mitteilungszeichen: ein Sonderzeichen hinge an der
 * Schriftart des Geräts.
 */
function SpannenBild() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 4v8M13.5 4v8M2.5 8h11M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5" />
    </svg>
  );
}
