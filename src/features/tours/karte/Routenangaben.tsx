import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { RouteResult } from '@/lib/location/contract';
import type { Routenergebnis } from '@/lib/location/route';
import { formatiereFahrzeit, formatiereStrecke } from '@/lib/location/strecke';
import { FEHLERTEXTE } from './fehlertexte';

/**
 * Distanz und Fahrzeit zur gezeichneten Route (MAP-003b).
 *
 * Die Komponente bekommt fertige Ergebnisse und entscheidet nur, was davon
 * auf dem Bildschirm steht. Sie ruft nichts ab und kennt keinen Anbieter.
 *
 * **Jeder Zustand hat einen eigenen Satz** — die Texte stehen seit MAP-004 in
 * `fehlertexte.ts`, weil die Fahrzeitmatrix dieselben braucht. Zu jedem gehört
 * die Schaltfläche, die den Versuch wiederholt.
 */

interface RoutenangabenProps {
  readonly laedt: boolean;
  /** `undefined`, solange noch nichts vorliegt. */
  readonly ergebnis: Routenergebnis | undefined;
  /** Dasselbe für das Lastenradprofil - der Vergleich aus MAP-003c. */
  readonly lastenrad: Routenergebnis | undefined;
  readonly erneutVersuchen: () => void;
}

export function Routenangaben({ laedt, ergebnis, lastenrad, erneutVersuchen }: RoutenangabenProps) {
  if (laedt || ergebnis === undefined) return <LoadingState label="Route wird berechnet …" />;

  if (!ergebnis.ok) {
    const text = FEHLERTEXTE[ergebnis.error.code];
    return (
      <div>
        <ErrorState title={text.titel} description={text.erklaerung} />
        <Button variant="secondary" className="mt-3" onClick={erneutVersuchen}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  const { route, quelle } = ergebnis.value;

  return (
    <div>
      {quelle === 'nachbildung' ? (
        <Statusmeldung ton="warnung" className="mb-3">
          Nachbildung ohne Kartendienst: Die Linie ist die Luftlinie zwischen den Stopps, die
          Fahrzeit eine Rechnung mit 15 km/h. Keine gefahrene Strecke.
        </Statusmeldung>
      ) : null}

      <p className="text-ink text-[0.9375rem]">
        <strong className="font-semibold tabular-nums">
          {formatiereStrecke(route.distanceMeters)}
        </strong>{' '}
        <span className="text-ink-muted">·</span>{' '}
        <strong className="font-semibold tabular-nums">
          {formatiereFahrzeit(route.durationSeconds)}
        </strong>{' '}
        <span className="text-ink-muted">für alle Stopps, Fahrradprofil</span>
      </p>

      <Profilvergleich fahrrad={route} lastenrad={lastenrad} />

      <h3 className="text-ink mt-4 mb-2 text-sm font-medium">Je Abschnitt</h3>
      <ol aria-label="Abschnitte der Route" className="border-line border-y">
        {route.legs.map((abschnitt, nummer) => (
          <li
            key={nummer}
            className="border-line flex items-baseline justify-between gap-3 border-b py-2 text-sm last:border-b-0"
          >
            <span className="text-ink-muted">
              {nummer + 1} → {nummer + 2}
            </span>
            <span className="text-ink tabular-nums">
              {formatiereStrecke(abschnitt.distanceMeters)} ·{' '}
              {formatiereFahrzeit(abschnitt.durationSeconds)}
            </span>
          </li>
        ))}
      </ol>
      <Button variant="quiet" className="mt-2 px-0" onClick={erneutVersuchen}>
        Neu berechnen
      </Button>
    </div>
  );
}

/**
 * Fahrrad gegen Lastenrad auf denselben Stopps (MAP-003c).
 *
 * Der Vergleich ist der Zweck dieser Seite und **keine Einstellung**: Es gibt
 * keinen Schalter, der ein Profil dauerhaft wählt. Welches Profil die Räder
 * der Praxis abbildet, entscheidet Jannes nach diesen Zahlen — und erst dann
 * bekommt der Vertrag eine Zuordnung (ADR-019, „bewusst nicht Bestandteil").
 *
 * Scheitert der zweite Abruf, fehlt die Zeile: Ein zweiter Fehlerkasten
 * neben dem ersten sagte dasselbe zweimal.
 */
function Profilvergleich({
  fahrrad,
  lastenrad,
}: {
  readonly fahrrad: RouteResult;
  readonly lastenrad: Routenergebnis | undefined;
}) {
  if (lastenrad === undefined || !lastenrad.ok) return null;

  const andere = lastenrad.value.route;
  const mehrMeter = andere.distanceMeters - fahrrad.distanceMeters;
  const mehrSekunden = andere.durationSeconds - fahrrad.durationSeconds;
  const unterschied = unterschiede(mehrMeter, mehrSekunden);

  return (
    <p className="text-ink-muted mt-1 text-sm">
      <span className="tabular-nums">{formatiereStrecke(andere.distanceMeters)}</span> ·{' '}
      <span className="tabular-nums">{formatiereFahrzeit(andere.durationSeconds)}</span> mit dem
      Lastenradprofil
      {unterschied === null ? ' — praktisch dieselben Werte.' : ` (${unterschied}).`}
    </p>
  );
}

/**
 * Der Unterschied in Worten — oder `null`, wenn es keinen nennenswerten gibt.
 *
 * Unterhalb der Rundung steht nichts: „+0 m · unter 1 Min." wäre eine Zahl,
 * die nichts sagt, und lüde dazu ein, aus dem Rauschen eine Entscheidung zu
 * machen.
 */
function unterschiede(meter: number, sekunden: number): string | null {
  const teile: string[] = [];
  if (Math.abs(meter) >= 10) {
    teile.push(`${meter > 0 ? '+' : '−'}${formatiereStrecke(Math.abs(meter))}`);
  }
  if (Math.abs(sekunden) >= 30) {
    teile.push(`${sekunden > 0 ? '+' : '−'}${formatiereFahrzeit(Math.abs(sekunden))}`);
  }
  return teile.length === 0 ? null : teile.join(' · ');
}
