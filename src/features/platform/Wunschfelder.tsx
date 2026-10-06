import { Checkbox } from '@/components/ui/Checkbox';
import { TAGESZEITEN, TAGESZEIT_NAME, type Tageszeit } from './api';
import { naechsteWerktage, wochentagMitDatum } from './zeit';

/** Wie viele Werktage zur Auswahl stehen - zugleich die Grenze des Servers. */
export const WUNSCHTAGE = 14;

function umschalten<T extends string>(liste: T[], wert: T): T[] {
  return liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert];
}

/**
 * Welche Tage und Tageszeiten passen (POR-009, POR-010): die nächsten
 * Werktage und drei Tageszeiten als Häkchen - Beschriftung am Feld, 48 px
 * Berührfläche (DSN-001 Abschnitt 7).
 */
export function Wunschfelder({
  tage,
  zeiten,
  onTage,
  onZeiten,
}: {
  tage: string[];
  zeiten: Tageszeit[];
  onTage: (tage: string[]) => void;
  onZeiten: (zeiten: Tageszeit[]) => void;
}) {
  const werktage = naechsteWerktage(WUNSCHTAGE);
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink mb-2 text-base font-semibold">Welche Tage passen?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {werktage.map((tag) => (
            <Checkbox
              key={tag}
              label={wochentagMitDatum(tag)}
              checked={tage.includes(tag)}
              onChange={() => onTage(umschalten(tage, tag))}
            />
          ))}
        </div>
        <p className="text-ink-muted text-sm">
          Einen anderen Tag oder Wochenende schreiben Sie bitte unten in die Zeile.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink mb-2 text-base font-semibold">Welche Tageszeit passt?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TAGESZEITEN.map((zeit) => (
            <Checkbox
              key={zeit}
              label={TAGESZEIT_NAME[zeit]}
              checked={zeiten.includes(zeit)}
              onChange={() => onZeiten(umschalten(zeiten, zeit))}
            />
          ))}
        </div>
        <p className="text-ink-muted text-sm">Ohne Angabe: jede Tageszeit.</p>
      </fieldset>
    </>
  );
}
