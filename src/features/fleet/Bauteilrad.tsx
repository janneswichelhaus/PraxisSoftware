import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Lastenrad3D, type Markenton } from '@/components/ui/Lastenrad3D';
import { Einstufung } from './Einstufung';
import { bauteilVonTeil } from './radteile';
import type { Entwurf, Stelle } from './stellen';
import { isZoneKey, zoneLabel, type Severity, type ZoneKey } from './zones';

const TON: Record<Severity, Markenton> = { problem: 'kritisch', beobachten: 'achtung' };
const HOECHSTENS = 4;

/**
 * Das Rad zum Antippen über der Frage: Ein Tipp wählt das Bauteil wie der Knopf oder die Liste
 * darunter, die als gleicher Weg bleiben (ANN-870). Liegen am ganzen Rad mehrere Bauteile unter dem
 * Finger, stehen sie als Knöpfe zur Wahl. Am Telefon nimmt das Rad den freien Platz der Seite.
 */
export function Bauteilrad({
  waehlbar,
  stellen,
  entwurf,
  onWahl,
  legende = true,
}: {
  /** Nur diese Bauteile stehen zur Wahl, der Rest des Rads tritt zurück; ohne Angabe alle. */
  waehlbar?: readonly ZoneKey[] | undefined;
  stellen: readonly Stelle[];
  entwurf: Entwurf | null;
  onWahl: (zone: ZoneKey) => void;
  /** Die Marken in Zeichen und Wort; entfällt, wo die Seite die Stellen selbst nennt. */
  legende?: boolean;
}) {
  const [kandidaten, setKandidaten] = useState<readonly ZoneKey[]>([]);
  const gesetzt = stellen.filter((stelle) => stelle.key !== entwurf?.key);
  // Im Ausschnitt nur, was dort zur Wahl steht: Fremde Marken wären das Auffälligste im Bild.
  const markiert = [...gesetzt, ...(entwurf ? [entwurf] : [])].flatMap(({ zone, severity }) =>
    isZoneKey(zone) && (!waehlbar || waehlbar.includes(zone)) ? [{ zone, severity }] : [],
  );
  return (
    <div className="flex flex-1 flex-col gap-2 lg:flex-none">
      <Lastenrad3D
        className="min-h-36 flex-1 lg:h-72 lg:flex-none"
        label="Lastenrad, Bauteil antippen"
        auswahl={{
          gruppeVon: bauteilVonTeil,
          waehlbar,
          marken: marken(markiert),
          onWahl: (gruppen) => {
            const zonen = gruppen.filter(isZoneKey);
            const [getroffen] = zonen;
            if (getroffen === undefined) return;
            // Im Ausschnitt stehen die Bauteile als Knöpfe darunter: Dort zählt das getroffene.
            if (waehlbar || zonen.length === 1) onWahl(getroffen);
            else setKandidaten(zonen.slice(0, HOECHSTENS));
          },
        }}
      />
      {kandidaten.length > 0 ? (
        <div
          role="group"
          aria-label="Bauteile an der getippten Stelle"
          className="flex flex-wrap gap-2"
        >
          {kandidaten.map((zone) => (
            <Button key={zone} variant="secondary" groesse="kompakt" onClick={() => onWahl(zone)}>
              {zoneLabel(zone)}
            </Button>
          ))}
        </div>
      ) : null}
      {legende ? <Markenliste markiert={markiert} /> : null}
    </div>
  );
}

type Markiert = { zone: ZoneKey; severity: Severity };

function marken(markiert: readonly Markiert[]) {
  return markiert.map(({ zone, severity }) => ({ gruppe: zone, ton: TON[severity] }));
}

/** Die Marken in Zeichen und Wort: Die Farbe am Rad allein trägt keine Bedeutung. */
function Markenliste({ markiert }: { markiert: readonly Markiert[] }) {
  if (markiert.length === 0) return null;
  return (
    <ul aria-label="Am Rad markiert" className="text-ink flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {markiert.map(({ zone, severity }, nummer) => (
        <li key={`${zone}-${nummer}`}>
          <Einstufung einstufung={severity} /> · {zoneLabel(zone)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Das Rad zum Ansehen mit den offenen Stellen in der Farbe ihrer Einstufung (ANN-868). Ohne offene
 * Stelle dreht es sich wie bisher; mit Stellen steht es still, damit die Marken lesbar bleiben.
 */
export function Stellenrad({
  offen,
  className,
}: {
  offen: readonly { zone: string; severity: Severity }[];
  className: string;
}) {
  const markiert = offen.flatMap(({ zone, severity }) =>
    isZoneKey(zone) ? [{ zone, severity }] : [],
  );
  if (markiert.length === 0) return <Lastenrad3D className={className} />;
  return (
    <div className="flex flex-col gap-2">
      <Lastenrad3D
        className={className}
        label="Lastenrad, offene Stellen markiert"
        auswahl={{ gruppeVon: bauteilVonTeil, marken: marken(markiert) }}
      />
      <Markenliste markiert={markiert} />
    </div>
  );
}
