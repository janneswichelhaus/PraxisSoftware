import { Select } from '@/components/ui/Select';
import { BIKE_ZONES, ZONE_GROUPS, type ZoneKey } from './bike3d/zones';

/**
 * „Wo genau?“ als Auswahlliste wie die Radwahl: mit `zonen` die Bauteile eines Prüfpunkts,
 * sonst alle nach Prüfpunkt gruppiert. Sie ersetzt das 3D-Rad (ANN-555, ANN-556 verworfen):
 * Die Liste des Telefons trifft man mit einer Hand, ohne Ziehen und ohne WebGL.
 */
export function Bauteilwahl({
  label,
  wert,
  onWahl,
  zonen,
  hinweis,
  autofokus = false,
}: {
  label: string;
  wert: string;
  onWahl: (zone: string) => void;
  zonen?: readonly ZoneKey[];
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
      {zonen
        ? zonen.map((zone) => (
            <option key={zone} value={zone}>
              {BIKE_ZONES[zone].label}
            </option>
          ))
        : ZONE_GROUPS.map((gruppe) => (
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
