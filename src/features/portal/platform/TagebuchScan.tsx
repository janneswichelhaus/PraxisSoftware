import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Barcodezeichen, GESPERRT } from '@/components/ui/Tagebuchbausteine';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Barcodedialog } from '@/features/nutrition/Barcodedialog';
import { Trefferzeile } from '@/features/nutrition/LebensmittelSuche';
import type { Lebensmittel } from '@/features/nutrition/lebensmittel';
import { gleicheGtin } from '@/lib/barcode/gtin';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  barcodeNachschlagen,
  ernaehrungSchluessel,
  ladeErnaehrung,
  type Plattformzugang,
} from './api';
import { barcodeUebergeben } from './barcodeUebergabe';
import { PLATTFORM_PFAD } from './pfade';

type Stand =
  | { art: 'scannen' }
  | { art: 'auswahl'; code: string; treffer: Lebensmittel[] }
  | { art: 'unbekannt'; code: string }
  | { art: 'fehler'; code: string };

/**
 * Vom Barcode zum Lebensmittel (ANN-841): erst die eigenen aus dem Profil auf dem Gerät, dann der
 * Auszug am Server; unbekannt führt zur Suche oder zum eigenen Lebensmittel mit diesem Barcode.
 */
export function BarcodeScan({
  zugang,
  search,
  rueckweg,
  onGefunden,
  onSuchen,
  onSchliessen,
}: {
  zugang: Plattformzugang;
  /** Die Suche der Seite (`bereich`) für den Weg zum eigenen Lebensmittel. */
  search: string;
  /** Wohin „Eigenes anlegen“ danach zurückführt. */
  rueckweg: string;
  onGefunden: (f: Lebensmittel) => void;
  onSuchen: () => void;
  onSchliessen: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stand, setStand] = useState<Stand>({ art: 'scannen' });
  const nachschlagen = useMutation({
    mutationFn: async (code: string) => {
      // Frisch genug für den Scan; nach „Eigenes anlegen“ ist der Stand verworfen und kommt neu.
      const ernaehrung = await queryClient.fetchQuery({
        queryKey: ernaehrungSchluessel(zugang.access_id),
        queryFn: () => ladeErnaehrung(zugang.access_id),
        staleTime: 60_000,
      });
      const eigenes = ernaehrung?.profile.own_foods.find(
        (f) => f.barcode && gleicheGtin(f.barcode, code),
      );
      return eigenes ? [eigenes] : barcodeNachschlagen(zugang.access_id, code);
    },
    onSuccess: (treffer, code) => {
      const [erstes] = treffer;
      if (treffer.length === 1 && erstes) onGefunden(erstes);
      else if (treffer.length > 1) setStand({ art: 'auswahl', code, treffer });
      else setStand({ art: 'unbekannt', code });
    },
    onError: (_fehler, code) => setStand({ art: 'fehler', code }),
  });

  if (nachschlagen.isPending) {
    return (
      <Dialogfenster titel="Barcode scannen" onSchliessen={onSchliessen}>
        <Statusmeldung>Wird nachgeschlagen …</Statusmeldung>
      </Dialogfenster>
    );
  }
  if (stand.art === 'scannen') {
    return (
      <Barcodedialog onNummer={(code) => nachschlagen.mutate(code)} onSchliessen={onSchliessen} />
    );
  }
  if (stand.art === 'auswahl') {
    return (
      <Dialogfenster titel="Welches Produkt?" onSchliessen={onSchliessen}>
        <Listenabschnitt titel="Zu diesem Barcode" ebene={3} rahmen={false}>
          {stand.treffer.map((f) => (
            <Trefferzeile key={`${f.kind}-${f.id}`} f={f} onOeffnen={onGefunden} />
          ))}
        </Listenabschnitt>
      </Dialogfenster>
    );
  }
  if (stand.art === 'unbekannt') {
    return (
      <Dialogfenster
        titel="Nicht im Verzeichnis"
        beschreibung={`Barcode ${stand.code}`}
        onSchliessen={onSchliessen}
      >
        <div className="flex flex-col gap-4">
          <p>Legen Sie es mit den Werten von der Verpackung an, oder suchen Sie es mit Namen.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                barcodeUebergeben(stand.code);
                void navigate(
                  mitRueckweg(`${PLATTFORM_PFAD}/ernaehrung/lebensmittel/neu${search}`, rueckweg),
                );
              }}
            >
              Eigenes anlegen
            </Button>
            <Button type="button" variant="secondary" onClick={onSuchen}>
              Suchen
            </Button>
          </div>
        </div>
      </Dialogfenster>
    );
  }
  return (
    <Dialogfenster titel="Barcode scannen" onSchliessen={onSchliessen}>
      <div className="flex flex-col gap-4">
        <Statusmeldung ton="fehler">
          Das Nachschlagen hat nicht geklappt. {VERBINDUNG_PRUEFEN}
        </Statusmeldung>
        <div>
          <Button type="button" variant="secondary" onClick={() => nachschlagen.mutate(stand.code)}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    </Dialogfenster>
  );
}

/** „Barcode scannen“ in voller Breite; ohne Netz gesperrt mit dem Satz, warum. */
export function ScanKnopf({
  onScannen,
  ohneNetzId,
}: {
  onScannen: () => void;
  /** Kennung des Satzes, der ohne Verbindung sagt, warum nichts geht. */
  ohneNetzId?: string | undefined;
}) {
  const verbunden = useIstVerbunden();
  const gesperrt = !verbunden;
  return (
    <Button
      type="button"
      variant="secondary"
      groesse="gross"
      className={`w-full ${GESPERRT}`}
      {...(gesperrt
        ? { 'aria-disabled': true, ...(ohneNetzId ? { 'aria-describedby': ohneNetzId } : {}) }
        : {})}
      onClick={() => {
        if (!gesperrt) onScannen();
      }}
    >
      <Barcodezeichen />
      Barcode scannen
    </Button>
  );
}
