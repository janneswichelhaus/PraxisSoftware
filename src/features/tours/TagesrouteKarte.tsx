import { useMemo } from 'react';
import type { Coordinate } from '@/lib/location/contract';
import { createMapDisplayConfig } from '@/lib/location/display';
import { useRoute } from '@/lib/location/route';
import { Karte } from './karte/Karte';
import { PRAXISPROFIL, kartenmarker, routenplan, type Stopp } from './tagesroute';

/**
 * Die Tagesroute auf der Karte (MAP-006b/c).
 *
 * Eigene Datei, weil sie MapLibre zieht und deshalb erst geladen wird, wenn
 * jemand die Karte sieht (Tourenseite) oder aufklappt (Übersicht). Die Marker
 * tragen eine Nummer, nie einen Namen (ANN-096); zur Route gehen über die
 * eigene Function nur die Koordinaten in Fahrtreihenfolge (ADR-019 Punkt 13
 * und 15). Dieselbe Abfrage wie in den Fahrtabschnitten — der Zwischenspeicher
 * der Seite teilt sie, es geht nur **ein** Aufruf hinaus.
 */
export default function TagesrouteKarte({
  start,
  stopps,
}: {
  readonly start: Coordinate | null;
  readonly stopps: readonly Stopp[];
}) {
  const config = useMemo(() => createMapDisplayConfig(), []);
  const marker = useMemo(() => kartenmarker(start, stopps), [start, stopps]);
  const { punkte } = useMemo(() => routenplan(start, stopps), [start, stopps]);
  const route = useRoute(punkte, PRAXISPROFIL);
  const linie = route.data?.ok === true ? route.data.value.route.geometry : undefined;

  const ohnePosition = stopps.filter((stopp) => stopp.position === null).length;

  return (
    <div className="print:hidden">
      <Karte
        config={config}
        stopps={marker}
        beschriftung={`Karte der Tagesroute mit ${marker.length} ${marker.length === 1 ? 'Punkt' : 'Punkten'}`}
        route={linie}
      />
      {ohnePosition > 0 ? (
        <p className="text-ink-muted mt-2 text-sm">
          {ohnePosition === 1
            ? 'Ein Besuch steht nicht auf der Karte: Seine Adresse ist noch nicht verortet.'
            : `${ohnePosition} Besuche stehen nicht auf der Karte: Ihre Adressen sind noch nicht verortet.`}
        </p>
      ) : null}
    </div>
  );
}
