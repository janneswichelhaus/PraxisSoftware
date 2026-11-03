import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { barcodeleser, type Barcodeleser } from '@/lib/barcode/erkennung';
import { getippteGtin, gtinGueltig } from '@/lib/barcode/gtin';
import { kamerafehler, kameraVerfuegbar } from '@/lib/dateien/kamera';
import { useSperrsicherung } from '@/lib/sperrsicherung';

/** So oft gelesen gilt eine Nummer, mit gültiger Prüfziffer: ein Fehllesen bleibt einmalig. */
const GLEICHE_LESUNGEN = 2;
/** Pause zwischen zwei Bildern, die gelesen werden (ms). */
const TAKT = 120;

type Zustand =
  | { art: 'startet' }
  | { art: 'laeuft' }
  | { art: 'fehler'; meldung: string; erneut: boolean }
  | { art: 'eintippen' }
  | { art: 'gelesen' };

function stoppe(strom: MediaStream | null) {
  strom?.getTracks().forEach((spur) => spur.stop());
}

/**
 * Ein Barcode aus dem Kamerabild oder von Hand (ADR-027 Punkt 10, ANN-841): nur Bild, gelesen im
 * Arbeitsspeicher, kein Foto; die Kamera endet mit der Nummer, beim Schließen und vor der Sperre.
 */
export function Barcodedialog({
  onNummer,
  onSchliessen,
  leser = barcodeleser,
}: {
  onNummer: (code: string) => void;
  onSchliessen: () => void;
  /** Statt des Lesers des Browsers, etwa in Tests. */
  leser?: () => Promise<Barcodeleser>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const strom = useRef<MediaStream | null>(null);
  const durchlauf = useRef(0);
  const [zustand, setZustand] = useState<Zustand>(() =>
    kameraVerfuegbar() ? { art: 'startet' } : { art: 'eintippen' },
  );
  const fertig = useRef(onNummer);
  fertig.current = onNummer;
  const oeffnen = useRef(leser);
  oeffnen.current = leser;

  const kameraAus = useCallback(() => {
    durchlauf.current += 1;
    stoppe(strom.current);
    strom.current = null;
  }, []);

  const starten = useCallback(async () => {
    kameraAus();
    const dieser = durchlauf.current;
    setZustand({ art: 'startet' });
    try {
      const neu = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (dieser !== durchlauf.current) {
        stoppe(neu);
        return;
      }
      strom.current = neu;
      if (video.current) {
        video.current.srcObject = neu;
        try {
          await video.current.play();
        } catch {
          // `autoPlay` startet das Bild; ein abgelehntes `play()` ist kein Kamerafehler.
        }
      }
      setZustand({ art: 'laeuft' });
    } catch (ursache) {
      if (dieser === durchlauf.current) setZustand({ art: 'fehler', ...kamerafehler(ursache) });
    }
  }, [kameraAus]);

  useEffect(() => {
    if (kameraVerfuegbar()) void starten();
    return kameraAus;
  }, [starten, kameraAus]);

  // Gelesen wird nur, solange die Kamera läuft; die Zählung beginnt mit jedem Start neu.
  useEffect(() => {
    if (zustand.art !== 'laeuft') return;
    let aktiv = true;
    let uhr: number | undefined;
    let geoeffnet: Barcodeleser | null = null;
    const gezaehlt = new Map<string, number>();
    const runde = async () => {
      const quelle = video.current;
      if (!aktiv || !geoeffnet || !quelle) return;
      try {
        for (const code of await geoeffnet.lesen(quelle)) {
          const anzahl = (gezaehlt.get(code) ?? 0) + 1;
          gezaehlt.set(code, anzahl);
          if (anzahl >= GLEICHE_LESUNGEN && aktiv) {
            aktiv = false;
            kameraAus();
            setZustand({ art: 'gelesen' });
            fertig.current(code);
            return;
          }
        }
      } catch {
        // Ein Bild ohne Ergebnis; das nächste folgt.
      }
      if (aktiv) uhr = window.setTimeout(() => void runde(), TAKT);
    };
    void oeffnen.current().then((l) => {
      geoeffnet = l;
      if (aktiv) void runde();
      else l.beenden();
    });
    return () => {
      aktiv = false;
      window.clearTimeout(uhr);
      geoeffnet?.beenden();
    };
  }, [zustand.art, kameraAus]);

  function schliessen() {
    kameraAus();
    onSchliessen();
  }

  useSperrsicherung(() => {
    schliessen();
    return Promise.resolve(true);
  });

  const kamera = zustand.art === 'startet' || zustand.art === 'laeuft';
  return (
    <Dialogfenster titel="Barcode scannen" onSchliessen={schliessen}>
      <div className={kamera ? 'flex flex-col gap-3' : 'hidden'}>
        <p className="text-ink-muted">Den Barcode in den Rahmen halten.</p>
        <div className="bg-ink rounded-image relative overflow-hidden">
          <video
            ref={video}
            muted
            playsInline
            autoPlay
            aria-label="Kamerabild"
            className="block aspect-[4/3] max-h-[calc(100dvh-18rem)] w-full object-cover"
          />
          {/* Der Rahmen zeigt, wohin der Barcode gehört; gelesen wird das Band in der Mitte. */}
          <div
            aria-hidden="true"
            className="border-surface outline-ink/60 rounded-field absolute inset-x-[10%] top-1/3 bottom-1/3 border-2 outline-1"
          />
        </div>
      </div>
      {zustand.art === 'startet' ? (
        <Statusmeldung className="mt-2">Kamera wird gestartet …</Statusmeldung>
      ) : null}
      {zustand.art === 'fehler' ? (
        <Statusmeldung ton="fehler">{zustand.meldung}</Statusmeldung>
      ) : null}
      {zustand.art === 'gelesen' ? <Statusmeldung>Barcode erkannt.</Statusmeldung> : null}
      {zustand.art === 'gelesen' ? null : zustand.art === 'eintippen' ? (
        <Eintippen
          ohneKamera={!kameraVerfuegbar()}
          onNummer={(code) => fertig.current(code)}
          onSchliessen={schliessen}
        />
      ) : (
        <div className="bg-surface sticky bottom-0 -mx-6 mt-4 -mb-6 flex flex-col gap-2 px-6 pt-3 pb-6 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              kameraAus();
              setZustand({ art: 'eintippen' });
            }}
          >
            Nummer eintippen
          </Button>
          {zustand.art === 'fehler' && zustand.erneut ? (
            <Button type="button" variant="secondary" onClick={() => void starten()}>
              Erneut versuchen
            </Button>
          ) : null}
          <Button type="button" variant="quiet" onClick={schliessen}>
            Abbrechen
          </Button>
        </div>
      )}
    </Dialogfenster>
  );
}

/** Die Ziffern unter dem Barcode, geprüft an der Prüfziffer, bevor etwas gesucht wird. */
function Eintippen({
  ohneKamera,
  onNummer,
  onSchliessen,
}: {
  ohneKamera: boolean;
  onNummer: (code: string) => void;
  onSchliessen: () => void;
}) {
  const [wert, setWert] = useState('');
  const [fehler, setFehler] = useState<string | undefined>();
  return (
    <form
      aria-label="Nummer eintippen"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const code = getippteGtin(wert);
        if (!/^(\d{8}|\d{12,14})$/.test(code)) {
          setFehler('Bitte die 8 oder 13 Ziffern unter dem Barcode eintippen.');
          return;
        }
        if (!gtinGueltig(code)) {
          setFehler('Die Nummer stimmt nicht. Bitte noch einmal vergleichen.');
          return;
        }
        setFehler(undefined);
        onNummer(code);
      }}
    >
      {ohneKamera ? (
        <p className="text-ink-muted">Die Kamera steht hier nicht zur Verfügung.</p>
      ) : null}
      <Field
        label="Nummer unter dem Barcode"
        inputMode="numeric"
        autoComplete="off"
        maxLength={20}
        value={wert}
        error={fehler}
        autoFocus
        onChange={(event) => setWert(event.target.value)}
      />
      <Formularfuss dicht>
        <Button type="submit">Nachschlagen</Button>
        <Button type="button" variant="quiet" onClick={onSchliessen}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
