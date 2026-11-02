import { useMemo } from 'react';
import { createMapDisplayConfig } from '@/lib/location/display';
import { useKartenfreigabe } from '@/lib/location/kartenfreigabe';
import { Karte } from '../tours/karte/Karte';
import { addressMarkers } from './addressPoints';
import type { ActiveAddressPoint } from './api';

// Eigene Datei, damit MapLibre erst mit dem Aufklappen lädt. Die Marker tragen eine Zahl, nie einen
// Namen; Kacheln erst, wenn die Function den Schalter offen meldet (ADR-019 Punkt 35).
export default function AddressPointsMap({
  points,
}: {
  readonly points: readonly ActiveAddressPoint[];
}) {
  const config = useMemo(() => createMapDisplayConfig(), []);
  const freigegeben = useKartenfreigabe(config !== null);
  const marker = useMemo(() => addressMarkers(points), [points]);
  return (
    <Karte
      config={config}
      freigabe={freigegeben === undefined ? 'pruefen' : freigegeben ? 'offen' : 'zu'}
      stopps={marker}
      beschriftung={`Karte mit ${marker.length} ${marker.length === 1 ? 'Punkt' : 'Punkten'} laufender Behandlungen`}
      trotzdem="Die Liste nach Postleitzahl gilt trotzdem."
    />
  );
}
