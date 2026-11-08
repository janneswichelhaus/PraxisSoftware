import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { GESPERRT } from '@/components/ui/Tagebuchbausteine';
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

/** Ein leiser Weg hinaus unter jedem Fenster: Am Telefon gibt es keine Escape-Taste. */
function Abbrechen({ onSchliessen }: { onSchliessen: () => void }) {
  return (
    <Button type="button" variant="quiet" onClick={onSchliessen}>
      Abbrechen
    </Button>
  );
}

/**
 * Vom Barcode zum Lebensmittel (ANN-841): erst die eigenen aus dem Profil auf dem Gerät, dann der
 * Auszug am Server; unbekannt führt zur Suche oder zum eigenen Lebensmittel mit diesem Barcode.
 */
export function BarcodeScan({
  zugang,
  search,
  rueckweg,
  code: vorgegeben,
  ohneZahlen = false,
  onGefunden,
  onSuchen,
  onSchliessen,
}: {
  zugang: Plattformzugang;
  /** Die Suche der Seite (`bereich`) für den Weg zum eigenen Lebensmittel. */
  search: string;
  /** Wohin „Eigenes anlegen“ danach zurückführt. */
  rueckweg: string;
  /** Ein Barcode, der ohne Kamera gleich nachgeschlagen wird, etwa nach „Eigenes anlegen“. */
  code?: string | undefined;
  /** „Zahlen ausblenden“ der Person (ADR-027 Punkt 11). */
  ohneZahlen?: boolean;
  onGefunden: (f: Lebensmittel) => void;
  onSuchen: () => void;
  onSchliessen: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stand, setStand] = useState<Stand>({ art: 'scannen' });
  const nachschlagen = useMutation({
    mutationFn: async (gelesen: string) => {
      // Frisch genug für den Scan; nach „Eigenes anlegen“ ist der Stand verworfen und kommt neu.
      const ernaehrung = await queryClient.fetchQuery({
        queryKey: ernaehrungSchluessel(zugang.access_id),
        queryFn: () => ladeErnaehrung(zugang.access_id),
        staleTime: 60_000,
      });
      const eigenes = ernaehrung?.profile.own_foods.find(
        (f) => f.barcode && gleicheGtin(f.barcode, gelesen),
      );
      return eigenes ? [eigenes] : barcodeNachschlagen(zugang.access_id, gelesen);
    },
    onSuccess: (treffer, gelesen) => {
      const [erstes] = treffer;
      if (treffer.length === 1 && erstes) onGefunden(erstes);
      else if (treffer.length > 1) setStand({ art: 'auswahl', code: gelesen, treffer });
      else setStand({ art: 'unbekannt', code: gelesen });
    },
    onError: (_fehler, gelesen) => setStand({ art: 'fehler', code: gelesen }),
  });
  const { mutate } = nachschlagen;
  const gestartet = useRef(false);
  useEffect(() => {
    if (!vorgegeben || gestartet.current) return;
    gestartet.current = true;
    mutate(vorgegeben);
  }, [vorgegeben, mutate]);

  if (nachschlagen.isPending || (vorgegeben && nachschlagen.isIdle)) {
    return (
      <Dialogfenster titel="Barcode scannen" onSchliessen={onSchliessen}>
        <LoadingState label="Wird nachgeschlagen …" />
        <div className="mt-4">
          <Abbrechen onSchliessen={onSchliessen} />
        </div>
      </Dialogfenster>
    );
  }
  if (stand.art === 'scannen') {
    return <Barcodedialog onNummer={(gelesen) => mutate(gelesen)} onSchliessen={onSchliessen} />;
  }
  if (stand.art === 'auswahl') {
    return (
      <Dialogfenster titel="Welches Produkt?" onSchliessen={onSchliessen}>
        <Listenabschnitt titel="Zu diesem Barcode" ebene={3} rahmen={false}>
          {stand.treffer.map((f) => (
            <Trefferzeile
              key={`${f.kind}-${f.id}`}
              f={f}
              onOeffnen={onGefunden}
              ohneZahlen={ohneZahlen}
            />
          ))}
        </Listenabschnitt>
        <div className="mt-4">
          <Abbrechen onSchliessen={onSchliessen} />
        </div>
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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
            <Abbrechen onSchliessen={onSchliessen} />
          </div>
        </div>
      </Dialogfenster>
    );
  }
  return (
    <Dialogfenster titel="Barcode scannen" onSchliessen={onSchliessen}>
      <ErrorState
        title="Das Nachschlagen hat nicht geklappt."
        onErneut={() => mutate(stand.code)}
      />
      <div className="mt-4">
        <Abbrechen onSchliessen={onSchliessen} />
      </div>
    </Dialogfenster>
  );
}

/** Ein Barcode im Sucher: Ecken und Striche, Raster 20 (DESIGN.md 9.15). */
function Barcodezeichen() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-5 shrink-0"
    >
      <path d="M2.5 6.5v-4h4M13.5 2.5h4v4M17.5 13.5v4h-4M6.5 17.5h-4v-4M6.5 7v6M9 7v6M11.5 7v6M14 7v6" />
    </svg>
  );
}

/**
 * „Barcode scannen“ in voller Breite; ohne Netz gesperrt mit dem Satz, warum: dem der Seite, wo es
 * ihn gibt, sonst einem eigenen.
 */
export function ScanKnopf({
  onScannen,
  ohneNetzId,
}: {
  onScannen: () => void;
  /** Kennung des Satzes der Seite, der ohne Verbindung sagt, warum nichts geht. */
  ohneNetzId?: string | undefined;
}) {
  const verbunden = useIstVerbunden();
  const eigeneId = useId();
  const satz = ohneNetzId ?? eigeneId;
  return (
    <div className="flex flex-col gap-2">
      {!verbunden && !ohneNetzId ? (
        <p id={eigeneId} className="text-ink-muted">
          Scannen geht wieder mit Verbindung.
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className={`w-full ${GESPERRT}`}
        {...(verbunden ? {} : { 'aria-disabled': true, 'aria-describedby': satz })}
        onClick={() => {
          if (verbunden) onScannen();
        }}
      >
        <Barcodezeichen />
        Barcode scannen
      </Button>
    </div>
  );
}
