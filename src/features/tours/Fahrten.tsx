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
      <p className="text-ink text-liste">
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

/**
 * Die Zeile zwischen zwei Stopps: Fahrzeit und ob sie in die Lücke passt.
 *
 * Passt sie, steht dort, wie viel Luft bleibt (TER-23, BEF-031) - die
 * Antwort auf „Komme ich hin?", ohne dass jemand zwei Uhrzeiten voneinander
 * abzieht. Gerechnet wird dabei keine neue Regel: Es ist der Abstand zwischen
 * dem frühesten Beginn, den der Server nach §8.1 gerundet hat (ANN-097), und
 * dem Beginn des nächsten Stopps. Fehlt der, bleibt es beim frühesten Beginn.
 *
 * Ist sie zu knapp, trägt die Zeile das Warnzeichen „!" wie Abzeichen und
 * Meldungen - kein Sonderzeichen, das an der Schrift des Geräts hängt.
 */
export function Fahrtabschnitt({
  sekunden,
  pruefung,
  zeitzone,
  naechsterBeginn,
}: {
  readonly sekunden: number | null;
  readonly pruefung: Pufferpruefung | null;
  readonly zeitzone: string;
  /** Beginn des nächsten Stopps (`starts_at`), für die verbleibende Luft. */
  readonly naechsterBeginn?: string | undefined;
}) {
  if (sekunden === null) {
    // Auf Papier sagt die Zeile nichts, was hilft (TER-12).
    return (
      <p className="text-ink-muted ml-10 border-l-2 border-dashed pl-3 text-sm print:hidden">
        Fahrzeit nicht verfügbar – nicht geprüft
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
        <span aria-hidden="true" className="mr-1.5">
          !
        </span>
        {fahrt} · {pruefung.shortfall_minutes} Min. zu knapp – frühester Beginn {uhr(frueh)}
      </p>
    );
  }
  const luft = luftInMinuten(pruefung.earliest_start, naechsterBeginn);
  return (
    <p className="text-ink-muted border-line ml-10 border-l-2 pl-3 text-sm">
      {fahrt} · passt
      {luft === null ? ` (frühester Beginn ${uhr(frueh)})` : ` · ${luft} Min. Luft`}
    </p>
  );
}

function uhr(uhrzeit: string): string {
  return `${uhrzeit} Uhr`;
}

/** Minuten zwischen frühestem Beginn und dem Beginn des nächsten Stopps. */
function luftInMinuten(fruehesterBeginn: string, naechsterBeginn: string | undefined) {
  if (naechsterBeginn === undefined) return null;
  const minuten = Math.floor((Date.parse(naechsterBeginn) - Date.parse(fruehesterBeginn)) / 60_000);
  return Number.isFinite(minuten) && minuten >= 0 ? minuten : null;
}
