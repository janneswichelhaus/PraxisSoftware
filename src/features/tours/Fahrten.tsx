import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { Routenergebnis } from '@/lib/location/route';
import { formatiereFahrzeit, formatiereStrecke } from '@/lib/location/strecke';
import { formatLocalTime } from '@/features/appointments/api';
import type { Pufferpruefung } from './fahrpuffer';
import { FEHLERTEXTE } from './karte/fehlertexte';

/**
 * Anzeige von Route, Fahrzeit und Fahrpuffer (MAP-006c).
 *
 * Die Komponenten bekommen fertige Ergebnisse und rechnen nichts: die Fahrzeit
 * stammt aus der Route, die Rundung aus `check_travel_buffers` (§8.1,
 * ANN-097). **Eine Warnung, keine Sperre** — wer den Weg kennt, weiß oft mehr
 * als die Rechnung (ADR-019, B6).
 */

/** Summe der Route über dem Tag — oder der Grund, warum es keine gibt. */
export function Routenzusammenfassung({
  laedt,
  ergebnis,
  erneutVersuchen,
}: {
  readonly laedt: boolean;
  readonly ergebnis: Routenergebnis | undefined;
  readonly erneutVersuchen: () => void;
}) {
  if (laedt || ergebnis === undefined) {
    return <p className="text-ink-muted text-sm">Route und Fahrzeiten werden berechnet …</p>;
  }
  if (!ergebnis.ok) {
    const text = FEHLERTEXTE[ergebnis.error.code];
    return (
      <div className="space-y-2">
        <Statusmeldung ton="warnung">
          {text.titel}. {text.erklaerung} Ohne Fahrzeit ist der Fahrpuffer nicht geprüft.
        </Statusmeldung>
        <Button
          type="button"
          variant="secondary"
          className="print:hidden"
          onClick={erneutVersuchen}
        >
          Erneut versuchen
        </Button>
      </div>
    );
  }
  const { route, quelle } = ergebnis.value;
  return (
    <div className="space-y-2">
      {quelle === 'nachbildung' ? (
        <Statusmeldung ton="warnung">
          Nachbildung ohne Kartendienst: Die Linie ist die Luftlinie, die Fahrzeiten sind mit 15
          km/h gerechnet. Keine gefahrene Strecke.
        </Statusmeldung>
      ) : null}
      <p className="text-ink text-[0.9375rem]">
        <strong className="font-semibold tabular-nums">
          {formatiereStrecke(route.distanceMeters)}
        </strong>{' '}
        ·{' '}
        <strong className="font-semibold tabular-nums">
          {formatiereFahrzeit(route.durationSeconds)}
        </strong>{' '}
        <span className="text-ink-muted">reine Fahrzeit mit dem Lastenrad</span>
      </p>
    </div>
  );
}

/** Die Zeile zwischen zwei Stopps: Fahrzeit und ob sie in die Lücke passt. */
export function Fahrtabschnitt({
  sekunden,
  pruefung,
  zeitzone,
}: {
  readonly sekunden: number | null;
  readonly pruefung: Pufferpruefung | null;
  readonly zeitzone: string;
}) {
  if (sekunden === null) {
    return (
      <p className="text-ink-subtle ml-10 border-l-2 border-dashed pl-3 text-sm">
        Fahrzeit unbekannt — nicht geprüft
      </p>
    );
  }
  const fahrt = `Fahrt ${formatiereFahrzeit(sekunden)}`;
  if (pruefung === null) {
    return <p className="text-ink-muted border-line ml-10 border-l-2 pl-3 text-sm">{fahrt}</p>;
  }
  const frueh = formatLocalTime(pruefung.earliest_start, zeitzone);
  if (pruefung.shortfall_minutes > 0) {
    return (
      <p className="text-warnung border-warnung ml-10 border-l-2 pl-3 text-sm font-medium">
        {fahrt} · <span aria-hidden="true">⚠ </span>
        {pruefung.shortfall_minutes} Min. zu knapp — frühester Beginn {uhr(frueh)}
      </p>
    );
  }
  return (
    <p className="text-ink-muted border-line ml-10 border-l-2 pl-3 text-sm">
      {fahrt} · passt (frühester Beginn {uhr(frueh)})
    </p>
  );
}

function uhr(uhrzeit: string): string {
  return `${uhrzeit} Uhr`;
}
