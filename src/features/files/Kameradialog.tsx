import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { useSperrsicherung } from '@/features/auth/sitzungssperre/sperrsicherung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { kameraVerfuegbar } from './kamera';

/**
 * Der Kameradialog der Anwendung (DOK-006, ADR-017 Punkt 33).
 *
 * Ein Foto, das über die Kamera-App des Handys entsteht, liegt danach in der
 * Mediathek — und mit ihr im Cloud-Backup des privaten Kontos. Genau das soll
 * nicht passieren. Dieser Dialog hält das Bild vom Sensor bis zum Upload in
 * einer Hand:
 *
 *   * **Live-Bild über `getUserMedia`**, nur Bild, nie Ton. Der Auslöser sitzt
 *     in der Anwendung; das Foto wird aus dem Kamerabild gerechnet und als
 *     JPEG kodiert. `<input type="file" capture>` wäre nur eine Empfehlung an
 *     den Browser und übergäbe an die Kamera-App (Punkt 33).
 *   * **Nur im Arbeitsspeicher.** Kein IndexedDB, kein Cache, kein Download,
 *     keine Warteschlange (ADR-001 Punkt 2). Die Aufnahme geht als `Blob` an
 *     die aufrufende Stelle, und die lädt sie hoch oder verwirft sie.
 *   * **Die Kamera läuft nur, solange der Dialog offen ist**, und endet beim
 *     Auslösen und beim Abbrechen. Die Vorschau danach zeigt das aufgenommene
 *     Bild, nicht mehr die Kamera.
 *
 * Aufnahmemetadaten entstehen hier nicht: Ein Bild aus dem Canvas trägt kein
 * EXIF. Was Chromium trotzdem schreibt (JFIF, Farbprofil), entfernt der
 * Upload-Weg wie bei jedem anderen Bild (`metadaten.ts`, Punkt 34).
 *
 * Die Kamera gibt es nur in einem sicheren Kontext (HTTPS, `localhost`) und
 * nur, wenn die Permissions-Policy sie der eigenen Herkunft freigibt
 * (`camera=(self)`). Fehlt sie, sagt der Dialog das — einen Ausweg über den
 * Dateiwähler bietet er nicht an; ob es einen gibt, entscheidet die Stelle,
 * die ihn öffnet (für ein Patientenfoto: nein, Punkt 33).
 */

/** JPEG-Qualität der Aufnahme: lesbar für ein Rezept, klein genug für 10 MB. */
const JPEG_QUALITAET = 0.9;

type Zustand =
  | { art: 'startet' }
  | { art: 'laeuft' }
  /** `erneut`: Hat ein zweiter Versuch Aussicht? Ohne Kamera nicht (DAT-25). */
  | { art: 'fehler'; meldung: string; erneut: boolean }
  | { art: 'vorschau'; bild: Blob; adresse: string };

function kamerafehler(ursache: unknown): { meldung: string; erneut: boolean } {
  const name = ursache instanceof Error ? ursache.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      meldung:
        'Die Kamera wurde nicht freigegeben. Bitte in den Einstellungen des Browsers für diese Seite erlauben und erneut öffnen.',
      erneut: true,
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { meldung: 'Auf diesem Gerät wurde keine Kamera gefunden.', erneut: false };
  }
  if (name === 'NotReadableError') {
    return {
      meldung:
        'Die Kamera wird gerade von einer anderen App benutzt. Bitte dort schließen und erneut versuchen.',
      erneut: true,
    };
  }
  return {
    meldung: 'Die Kamera konnte nicht gestartet werden. Bitte erneut versuchen.',
    erneut: true,
  };
}

function stoppe(strom: MediaStream | null) {
  strom?.getTracks().forEach((spur) => spur.stop());
}

export function Kameradialog({
  titel,
  hinweis,
  onAufnahme,
  onSchliessen,
}: {
  titel: string;
  /** Steht über dem Kamerabild — etwa, was auf ein Patientenfoto gehört. */
  hinweis?: ReactNode;
  /** Das Foto, als JPEG, nur im Arbeitsspeicher. */
  onAufnahme: (foto: Blob) => void;
  onSchliessen: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const strom = useRef<MediaStream | null>(null);
  // Die Freigabe kann kommen, nachdem der Dialog schon zu ist oder ein neuer
  // Start den alten abgelöst hat - dann wird der Strom sofort wieder beendet,
  // statt unbemerkt weiterzulaufen. Jeder Start und jeder Abbau zählt weiter.
  const durchlauf = useRef(0);
  const [zustand, setZustand] = useState<Zustand>({ art: 'startet' });

  const starten = useCallback(async () => {
    durchlauf.current += 1;
    const dieser = durchlauf.current;
    stoppe(strom.current);
    strom.current = null;
    if (!kameraVerfuegbar()) {
      setZustand({
        art: 'fehler',
        meldung:
          'Die Kamera steht hier nicht zur Verfügung. Sie braucht eine sichere Verbindung (https) und einen Browser, der sie freigibt.',
        erneut: false,
      });
      return;
    }
    setZustand({ art: 'startet' });
    try {
      const neu = await navigator.mediaDevices.getUserMedia({
        // Nur Bild. Die Rückkamera, wo es eine gibt; die Auflösung als Wunsch,
        // nicht als Bedingung - sonst scheitert ein Gerät, das sie nicht kann.
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (dieser !== durchlauf.current) {
        stoppe(neu);
        return;
      }
      strom.current = neu;
      if (video.current) {
        video.current.srcObject = neu;
        // `autoPlay` startet das Bild ohnehin; ein abgelehntes `play()` ist
        // kein Kamerafehler.
        try {
          await video.current.play();
        } catch {
          // siehe oben
        }
      }
      setZustand({ art: 'laeuft' });
    } catch (ursache) {
      if (dieser === durchlauf.current) setZustand({ art: 'fehler', ...kamerafehler(ursache) });
    }
  }, []);

  // Läuft die Kamera, liegt der Fokus auf „Auslösen" (DAT-11): Das Fenster
  // setzt ihn beim Öffnen, als es nur „Abbrechen" gab.
  const ausloeserRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (zustand.art === 'laeuft') ausloeserRef.current?.focus();
  }, [zustand.art]);

  useEffect(() => {
    void starten();
    return () => {
      // Beim Schließen, beim Verlassen der Seite, bei jedem Abbau: Die Kamera
      // läuft keinen Augenblick länger als der Dialog.
      durchlauf.current += 1;
      stoppe(strom.current);
      strom.current = null;
    };
  }, [starten]);

  // Die Objekt-URL der Vorschau lebt so lange wie die Vorschau.
  const vorschauAdresse = zustand.art === 'vorschau' ? zustand.adresse : null;
  useEffect(() => {
    if (!vorschauAdresse) return;
    return () => URL.revokeObjectURL(vorschauAdresse);
  }, [vorschauAdresse]);

  function ausloesen() {
    const quelle = video.current;
    if (!quelle || quelle.videoWidth === 0) return;
    const leinwand = document.createElement('canvas');
    leinwand.width = quelle.videoWidth;
    leinwand.height = quelle.videoHeight;
    leinwand.getContext('2d')?.drawImage(quelle, 0, 0, leinwand.width, leinwand.height);
    // Punkt 33: Die Kamera endet mit dem Auslösen.
    stoppe(strom.current);
    strom.current = null;
    const dieser = durchlauf.current;
    leinwand.toBlob(
      (bild) => {
        // Zu, bevor das Bild fertig war: keine Objekt-URL, die niemand freigibt.
        if (dieser !== durchlauf.current) return;
        if (!bild) {
          setZustand({
            art: 'fehler',
            meldung: 'Das Foto konnte nicht erzeugt werden. Bitte erneut versuchen.',
            erneut: true,
          });
          return;
        }
        setZustand({ art: 'vorschau', bild, adresse: URL.createObjectURL(bild) });
      },
      'image/jpeg',
      JPEG_QUALITAET,
    );
  }

  function abbrechen() {
    stoppe(strom.current);
    strom.current = null;
    onSchliessen();
  }

  // Vor der Sitzungssperre schließt die Kamera (Zweitreview SEC-EPIC-001):
  // Ein laufender Kamerastrom hinter der Sperrseite wäre ein offenes Auge.
  // Ein noch nicht übernommenes Bild geht dabei verloren - übernommene Fotos
  // hält der Fotoverlustschutz fest.
  useSperrsicherung(() => {
    abbrechen();
    return Promise.resolve(true);
  });

  return (
    <Dialogfenster titel={titel} onSchliessen={abbrechen}>
      {hinweis ? <div className="text-ink-muted mb-3 text-sm">{hinweis}</div> : null}

      {/* Das Kamerabild bleibt eingehängt, solange die Kamera läuft oder
          startet - `srcObject` braucht das Element. Seine Höhe lässt Platz
          für Titel, Hinweis und Knöpfe (DAT-14): Mit 60 % der Fensterhöhe lag
          „Auslösen" am quer gehaltenen Telefon unter der Kante. Radius eines
          Bildes, nicht einer Karte (DAT-20). */}
      <div
        className={
          zustand.art === 'startet' || zustand.art === 'laeuft'
            ? 'bg-ink rounded-image overflow-hidden'
            : 'hidden'
        }
      >
        <video
          ref={video}
          muted
          playsInline
          autoPlay
          aria-label="Kamerabild"
          className="block max-h-[calc(100dvh-16rem)] w-full object-contain"
        />
      </div>

      {zustand.art === 'vorschau' ? (
        <img
          src={zustand.adresse}
          alt="Aufgenommenes Foto"
          className="bg-ink rounded-image block max-h-[calc(100dvh-16rem)] w-full object-contain"
        />
      ) : null}

      {zustand.art === 'startet' ? (
        <Statusmeldung className="mt-2">Kamera wird gestartet …</Statusmeldung>
      ) : null}

      {zustand.art === 'fehler' ? (
        <Statusmeldung ton="fehler">{zustand.meldung}</Statusmeldung>
      ) : null}

      {/* Die Knöpfe bleiben am unteren Rand des Fensters stehen, auch wenn es
          innen rollt (DAT-14): Der Auslöser ist die Aktion, die am Lenker mit
          Handschuh zählt. Die Fläche deckt den Innenabstand darunter mit ab. */}
      <div className="bg-surface sticky bottom-0 -mx-6 mt-4 -mb-6 flex flex-wrap gap-2 px-6 pt-3 pb-6">
        {zustand.art === 'laeuft' ? (
          <Button ref={ausloeserRef} type="button" data-autofocus onClick={ausloesen}>
            Auslösen
          </Button>
        ) : null}
        {zustand.art === 'vorschau' ? (
          <>
            <Button type="button" data-autofocus onClick={() => onAufnahme(zustand.bild)}>
              Foto verwenden
            </Button>
            <Button type="button" variant="secondary" onClick={() => void starten()}>
              Neu aufnehmen
            </Button>
          </>
        ) : null}
        {zustand.art === 'fehler' && zustand.erneut ? (
          <Button type="button" variant="secondary" onClick={() => void starten()}>
            Erneut versuchen
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={abbrechen}>
          Abbrechen
        </Button>
      </div>
    </Dialogfenster>
  );
}
