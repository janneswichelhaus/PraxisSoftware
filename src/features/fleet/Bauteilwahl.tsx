import { Select } from '@/components/ui/Select';
import { BIKE_ZONES, ZONE_GROUPS } from './zones';

/**
 * Alle 27 Bauteile als Auswahlliste wie die Radwahl, nach Prüfpunkt gruppiert. Sie ersetzt das
 * 3D-Rad (ANN-555, ANN-556 verworfen): Die Liste des Telefons trifft man mit einer Hand.
 */
export function Bauteilwahl({
  label,
  wert,
  onWahl,
  hinweis,
  autofokus = false,
}: {
  label: string;
  wert: string;
  onWahl: (zone: string) => void;
  hinweis?: string | undefined;
  /** Hier beginnt der Fokus der Seite (`data-autofocus`). */
  autofokus?: boolean;
}) {
  return (
    <Select
      label={label}
      hint={hinweis}
      value={wert}
      onChange={(event) => onWahl(event.target.value)}
      {...(autofokus ? { 'data-autofocus': true } : {})}
    >
      <option value="">Bitte wählen …</option>
      {ZONE_GROUPS.map((gruppe) => (
        <optgroup key={gruppe.label} label={gruppe.label}>
          {gruppe.zones.map((zone) => (
            <option key={zone} value={zone}>
              {BIKE_ZONES[zone].label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
