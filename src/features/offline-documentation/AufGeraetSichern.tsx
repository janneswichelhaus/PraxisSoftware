import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { useIstVerbunden } from '@/app/verbindung';
import { entwurfSchreiben, type Entwurfskopf } from './entwuerfe';
import { ABLAGE_FUER_PRAXISKONTEN, useEinrichtung } from './servicePhone';

/**
 * An der gewohnten Schreibseite, ohne Verbindung, auf einem eingerichteten
 * Diensttelefon (OFF-003, ADR-024 Konsequenzen: „Für Praxiskonten gilt
 * dasselbe am Termin"): Der Text geht als Offline-Entwurf auf das Gerät und
 * von dort an den Server, sobald Verbindung besteht. Ohne Einrichtung steht
 * hier nichts; dann bleibt es bei ANN-319 (Text im Speicher der Seite).
 */
export function AufGeraetSichern({
  besitzer,
  terminId,
  kopf,
  text,
  onGesichert,
}: {
  besitzer: string;
  terminId: string;
  kopf: Entwurfskopf;
  text: string;
  /** Danach gibt die Seite ihren Schutz frei und führt zu „Auf dem Gerät“. */
  onGesichert: () => void;
}) {
  const einrichtung = useEinrichtung(besitzer);
  const verbunden = useIstVerbunden();
  const [fehler, setFehler] = useState(false);
  if (!ABLAGE_FUER_PRAXISKONTEN || verbunden || !einrichtung) return null;
  return (
    <div className="shrink-0 px-4 py-2">
      <Statusmeldung ton={fehler ? 'fehler' : 'warnung'}>
        {fehler
          ? 'Das Gerät hat den Text nicht gespeichert. Bitte den Text im Feld stehen lassen.'
          : 'Keine Verbindung. Auf diesem Diensttelefon lässt sich der Text auf dem Gerät sichern; er geht an die Praxis, sobald Verbindung besteht.'}
      </Statusmeldung>
      <Button
        type="button"
        variant="secondary"
        className="mt-2"
        onClick={() => {
          setFehler(false);
          void entwurfSchreiben(besitzer, terminId, kopf, text).then(onGesichert, () =>
            setFehler(true),
          );
        }}
      >
        Auf dem Gerät sichern
      </Button>
    </div>
  );
}
