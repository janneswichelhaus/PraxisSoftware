import { Monatsblatt, type Tagesangabe } from '@/components/ui/Monatsblatt';
import { feiertageZwischen, type Bundesland } from './feiertage';
import { gewaehlteTage, type Zeitraumwahl } from './zeitraum';
import { tagKurz } from '@/lib/datum';

/**
 * Der Kalender zum Wählen eines Urlaubs (G7, URL-001): ein Monat je Seite,
 * mit ‹ › zum Nachbarmonat - der Monat kommt von der Seite davor („Ab welchem
 * Monat?“), so rollt keine Seite des Ablaufs (Design-Review Überholung 7).
 *
 * Gezeigt wird, was die Wahl ändert, als Zeichen und Wort: Feiertage des
 * Bundeslands (Punkt unter der Zahl, darunter mit Namen) und eigener Urlaub
 * (gestrichelte Kante). Ob ein Tag ein Arbeitstag ist, weiß der Wochenplan;
 * die Tage zählt der Server (ANN-577), nicht dieses Blatt.
 */

/** Wie viele Monate ab dem laufenden sich wählen lassen. */
export const MONATE_VORAUS = 13;

export interface EigenerZeitraum {
  starts_on: string;
  ends_on: string;
  /** „beantragt“ oder „genehmigt“ - für die Ansage. */
  stand: string;
}

export function Zeitraumkalender({
  monat,
  heute,
  ab,
  bis,
  land,
  wahl,
  eigene,
  onMonat,
  onWaehlen,
}: {
  /** Der gezeigte Monat, `YYYY-MM-01`. */
  monat: string;
  heute: string;
  /** Erster wählbarer Tag. */
  ab: string;
  /** Letzter wählbarer Tag. */
  bis: string;
  land: Bundesland;
  wahl: Zeitraumwahl;
  /** Eigener beantragter und genehmigter Urlaub. */
  eigene: readonly EigenerZeitraum[];
  onMonat: (monat: string) => void;
  onWaehlen: (tag: string) => void;
}) {
  const monatsende = new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const feiertage = feiertageZwischen(monat, monatsende, land);
  const gewaehlt = new Set(gewaehlteTage(wahl));
  const ende = wahl.bis ?? wahl.von;

  function angabe(tag: string): Tagesangabe {
    const fest = feiertage.find((f) => f.tag === tag);
    const eigen = eigene.find((e) => e.starts_on <= tag && tag <= e.ends_on);
    return {
      wahl: tag === wahl.von || tag === ende ? 'rand' : gewaehlt.has(tag) ? 'zwischen' : undefined,
      belegt: eigen !== undefined,
      punkt: fest !== undefined,
      zusaetze: [
        ...(tag === wahl.von ? ['erster Urlaubstag'] : []),
        ...(fest ? [`Feiertag (${fest.name})`] : []),
        ...(eigen ? [`Ihr Urlaub (${eigen.stand})`] : []),
      ],
    };
  }

  const eigeneImMonat = eigene.some((e) => e.starts_on <= monatsende && monat <= e.ends_on);

  return (
    <div className="flex flex-col gap-4">
      <Monatsblatt
        monat={monat}
        heute={heute}
        ab={ab}
        bis={bis}
        fokus={wahl.von?.startsWith(monat.slice(0, 7)) ? wahl.von : undefined}
        angabe={angabe}
        onWaehlen={onWaehlen}
        onMonat={onMonat}
      />
      {/* Eine Zeile Zeichen und Wort; die Namen der Feiertage nennt die
          Zusammenfassung („Karfreitag zählt nicht“) - so passt auch ein Monat
          mit sechs Wochen ohne Rollen ins Bild. */}
      {feiertage.length > 0 || eigeneImMonat ? (
        <p className="text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {feiertage.length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="rounded-pill bg-warnung inline-block size-1.5" />
              {`Feiertag: ${feiertage.map((f) => tagKurz(f.tag)).join(', ')}`}
            </span>
          ) : null}
          {eigeneImMonat ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="border-ink-muted bg-surface-sunken rounded-button inline-block size-4 border-2 border-dashed"
              />
              Ihr Urlaub
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
