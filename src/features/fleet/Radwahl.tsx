import { Select } from '@/components/ui/Select';
import type { Fleet } from './api';
import { radMitStandort } from './rad';

/**
 * Die Wahl des Rads am Anfang von Check-Up und Panne. Vorbelegt ist das
 * eigene Rad, wenn es eines gibt - übersprungen wird die Wahl nie, sonst
 * meldete man stillschweigend ein beliebiges Rad (VOR-18).
 */
export function Radwahl({
  flotte,
  wert,
  onWahl,
  hinweis,
}: {
  flotte: Fleet;
  wert: string;
  onWahl: (id: string) => void;
  hinweis?: string;
}) {
  return (
    <Select
      label="Rad"
      hint={hinweis}
      value={wert}
      onChange={(event) => onWahl(event.target.value)}
    >
      <option value="">Bitte wählen …</option>
      {flotte.bikes.map((rad) => (
        <option key={rad.id} value={rad.id}>
          {radMitStandort(rad, flotte)}
        </option>
      ))}
    </Select>
  );
}
