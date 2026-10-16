import { useMemo } from 'react';
import { Monatsblatt, type Tagesangabe } from '@/components/ui/Monatsblatt';
import { monatPlus, monatsBeginn } from '@/features/appointments/calendar';
import { feiertage, type Bundesland } from './feiertage';
import { gewaehlteTage, type Zeitraumwahl } from './zeitraum';

/**
 * Der Kalender zum Wählen eines Urlaubs (G7, URL-001): zwei Tipps, erster und
 * letzter Tag. Die Monate stehen untereinander und rollen - ein Urlaub im
 * Sommer kostet im Januar so keine Blättertipps (Budget G7 ≤ 6).
 *
 * Gezeigt wird, was die Wahl ändert: Feiertage des Bundeslands (Punkt unter
 * der Zahl) und eigener Urlaub (Fläche). Ob ein Tag ein Arbeitstag ist,
 * weiß der Wochenplan; die Tage zählt der Server (ANN-577), nicht dieses
 * Blatt. Tage vor heute sind nicht wählbar.
 */

/** Wie viele Monate ab dem laufenden der Kalender zeigt. */
export const MONATE_VORAUS = 13;

export interface EigenerZeitraum {
  starts_on: string;
  ends_on: string;
  /** „beantragt“ oder „genehmigt“ - für die Ansage. */
  stand: string;
}

export function Zeitraumkalender({
  heute,
  land,
  wahl,
  eigene,
  onWaehlen,
}: {
  heute: string;
  land: Bundesland;
  wahl: Zeitraumwahl;
  /** Eigener beantragter und genehmigter Urlaub. */
  eigene: readonly EigenerZeitraum[];
  onWaehlen: (tag: string) => void;
}) {
  const monate = useMemo(() => {
    const erster = monatsBeginn(heute);
    return Array.from({ length: MONATE_VORAUS }, (_, i) => monatPlus(erster, i));
  }, [heute]);

  const feiertagsnamen = useMemo(() => {
    const namen = new Map<string, string>();
    for (const jahr of new Set(monate.map((m) => Number(m.slice(0, 4))))) {
      for (const f of feiertage(jahr, land)) namen.set(f.tag, f.name);
    }
    return namen;
  }, [monate, land]);

  const gewaehlt = new Set(gewaehlteTage(wahl));
  const ende = wahl.bis ?? wahl.von;

  function angabe(tag: string): Tagesangabe {
    const fest = feiertagsnamen.get(tag);
    const eigen = eigene.find((e) => e.starts_on <= tag && tag <= e.ends_on);
    return {
      wahl: tag === wahl.von || tag === ende ? 'rand' : gewaehlt.has(tag) ? 'zwischen' : undefined,
      belegt: eigen !== undefined,
      punkt: fest !== undefined,
      zusaetze: [
        ...(fest ? [`Feiertag (${fest})`] : []),
        ...(eigen ? [`Ihr Urlaub (${eigen.stand})`] : []),
      ],
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-muted flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-pill bg-warnung inline-block size-1.5" /> Feiertag
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-surface-sunken border-line rounded-button inline-block size-4 border" />{' '}
          Ihr Urlaub
        </span>
      </p>
      {monate.map((monat) => (
        <Monatsblatt
          key={monat}
          monat={monat}
          heute={heute}
          ab={heute}
          // Mit einer Wahl beginnt der Kalender an ihrem Beginn, sonst heute;
          // der Fokus rollt den Monat ins Bild.
          fokus={wahl.von ?? heute}
          angabe={angabe}
          onWaehlen={onWaehlen}
        />
      ))}
    </div>
  );
}
