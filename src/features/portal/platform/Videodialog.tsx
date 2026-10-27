import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { useSperrsicherung } from '@/lib/sperrsicherung';
import { kameraVerfuegbar } from '@/lib/dateien/kamera';
import { VIDEO_BITRATE, videoformat } from './videoformat';

/**
 * Der Aufnahmedialog für ein kurzes Video (KOM-007, ADR-017 Punkt 62).
 *
 * Dasselbe Muster wie der Kameradialog (Punkt 33): Live-Bild über
 * `getUserMedia`, aufgenommen mit `MediaRecorder`, **nur Bild, nie Ton** —
 * das Mikrofon wird nicht einmal angefragt, und die Permissions-Policy sperrt
 * es. Kein Dateiwähler, kein Ausweg in die Mediathek. Die Aufnahme liegt nur
 * im Arbeitsspeicher der Seite und geht als `Blob` an die aufrufende Stelle.
 *
 * ANN-336: höchstens 30 Sekunden - der Dialog hält von selbst an -, die
 * Bitrate begrenzt auf 2 Mbit/s, damit eine volle Aufnahme unter 10 MB
 * bleibt. Die Kamera läuft nur, solange aufgenommen wird, und endet beim
 * Anhalten, beim Abbrechen und vor der Sitzungssperre.
 */

type Zustand =
  | { art: 'startet' }
  | { art: 'bereit' }
  | { art: 'nimmt_auf'; sekunden: number }
  | { art: 'fehler'; meldung: string; erneut: boolean }
  | { art: 'vorschau'; video: Blob; adresse: string; dauer: number };

function stoppe(strom: MediaStream | null) {
  strom?.getTracks().forEach((spur) => spur.stop());
}

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
  return {
    meldung: 'Die Kamera konnte nicht gestartet werden. Bitte erneut versuchen.',
    erneut: true,
  };
}

export function Videodialog({
  hoechstens,
  hinweis,
  onAufnahme,
  onSchliessen,
}: {
  /** Höchstdauer in Sekunden (Punkt 62). */
  hoechstens: number;
  hinweis?: ReactNode;
  /** Das Video ohne Ton und seine Dauer in ganzen Sekunden. */
  onAufnahme: (video: Blob, dauer: number) => void;
  onSchliessen: () => void;
}) {
  const bild = useRef<HTMLVideoElement>(null);
  const strom = useRef<MediaStream | null>(null);
  const rekorder = useRef<MediaRecorder | null>(null);
  const teile = useRef<Blob[]>([]);
  const beginn = useRef(0);
  const uhr = useRef<number | null>(null);
  const durchlauf = useRef(0);
  const [zustand, setZustand] = useState<Zustand>({ art: 'startet' });

  const uhrStoppen = () => {
    if (uhr.current !== null) window.clearInterval(uhr.current);
    uhr.current = null;
  };

  const starten = useCallback(async () => {
    durchlauf.current += 1;
    const dieser = durchlauf.current;
    stoppe(strom.current);
    strom.current = null;
    if (!kameraVerfuegbar() || !videoformat()) {
      setZustand({
        art: 'fehler',
        meldung:
          'Videos lassen sich hier nicht aufnehmen. Dafür braucht es eine sichere Verbindung (https) und einen Browser, der Videoaufnahmen erlaubt.',
        erneut: false,
      });
      return;
    }
    setZustand({ art: 'startet' });
    try {
      const neu = await navigator.mediaDevices.getUserMedia({
        // Punkt 62: nur Bild, nie Ton.
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
      if (bild.current) {
        bild.current.srcObject = neu;
        try {
          await bild.current.play();
        } catch {
          // autoPlay startet das Bild; ein abgelehntes play() ist kein Fehler.
        }
      }
      setZustand({ art: 'bereit' });
    } catch (ursache) {
      if (dieser === durchlauf.current) setZustand({ art: 'fehler', ...kamerafehler(ursache) });
    }
  }, []);

  useEffect(() => {
    void starten();
    return () => {
      durchlauf.current += 1;
      uhrStoppen();
      if (rekorder.current && rekorder.current.state !== 'inactive') rekorder.current.stop();
      rekorder.current = null;
      stoppe(strom.current);
      strom.current = null;
    };
  }, [starten]);

  const vorschauAdresse = zustand.art === 'vorschau' ? zustand.adresse : null;
  useEffect(() => {
    if (!vorschauAdresse) return;
    return () => URL.revokeObjectURL(vorschauAdresse);
  }, [vorschauAdresse]);

  function anhalten() {
    uhrStoppen();
    if (rekorder.current && rekorder.current.state !== 'inactive') rekorder.current.stop();
  }

  function aufnehmen() {
    const quelle = strom.current;
    const format = videoformat();
    if (!quelle || !format) return;
    teile.current = [];
    const dieser = durchlauf.current;
    const neu = new MediaRecorder(quelle, { mimeType: format, videoBitsPerSecond: VIDEO_BITRATE });
    neu.ondataavailable = (ereignis) => {
      if (ereignis.data.size > 0) teile.current.push(ereignis.data);
    };
    neu.onstop = () => {
      // Die Kamera endet mit der Aufnahme (Punkt 33 sinngemäß).
      stoppe(strom.current);
      strom.current = null;
      if (dieser !== durchlauf.current) return;
      const dauer = Math.min(
        hoechstens,
        Math.max(1, Math.round((performance.now() - beginn.current) / 1000)),
      );
      const video = new Blob(teile.current, { type: neu.mimeType || format });
      teile.current = [];
      if (video.size === 0) {
        setZustand({
          art: 'fehler',
          meldung: 'Das Video konnte nicht aufgenommen werden. Bitte erneut versuchen.',
          erneut: true,
        });
        return;
      }
      setZustand({ art: 'vorschau', video, adresse: URL.createObjectURL(video), dauer });
    };
    rekorder.current = neu;
    beginn.current = performance.now();
    neu.start();
    setZustand({ art: 'nimmt_auf', sekunden: 0 });
    uhr.current = window.setInterval(() => {
      const sekunden = Math.floor((performance.now() - beginn.current) / 1000);
      if (sekunden >= hoechstens) {
        anhalten();
        return;
      }
      setZustand({ art: 'nimmt_auf', sekunden });
    }, 250);
  }

  function abbrechen() {
    durchlauf.current += 1;
    uhrStoppen();
    if (rekorder.current && rekorder.current.state !== 'inactive') rekorder.current.stop();
    stoppe(strom.current);
    strom.current = null;
    onSchliessen();
  }

  // Vor der Sitzungssperre schließt die Kamera, wie im Kameradialog.
  useSperrsicherung(() => {
    abbrechen();
    return Promise.resolve(true);
  });

  const live = zustand.art === 'startet' || zustand.art === 'bereit' || zustand.art === 'nimmt_auf';

  return (
    <Dialogfenster titel="Video aufnehmen" onSchliessen={abbrechen}>
      {hinweis ? <div className="text-ink-muted mb-3 text-sm">{hinweis}</div> : null}

      <div className={live ? 'bg-ink rounded-image overflow-hidden' : 'hidden'}>
        <video
          ref={bild}
          muted
          playsInline
          autoPlay
          aria-label="Kamerabild"
          className="block max-h-[calc(100dvh-16rem)] w-full object-contain"
        />
      </div>

      {zustand.art === 'vorschau' ? (
        <video
          src={zustand.adresse}
          controls
          muted
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          aria-label="Aufgenommenes Video"
          className="bg-ink rounded-image block max-h-[calc(100dvh-16rem)] w-full object-contain"
        />
      ) : null}

      {zustand.art === 'startet' ? (
        <Statusmeldung className="mt-2">Kamera wird gestartet …</Statusmeldung>
      ) : null}
      {zustand.art === 'bereit' ? (
        <p className="text-ink mt-2 text-base">Höchstens {hoechstens} Sekunden, ohne Ton.</p>
      ) : null}
      {zustand.art === 'nimmt_auf' ? (
        <p role="status" className="text-ink mt-2 text-base font-semibold">
          Aufnahme läuft: {zustand.sekunden} von {hoechstens} Sekunden
        </p>
      ) : null}
      {zustand.art === 'fehler' ? (
        <Statusmeldung ton="fehler">{zustand.meldung}</Statusmeldung>
      ) : null}

      <div className="bg-surface sticky bottom-0 -mx-6 mt-4 -mb-6 flex flex-wrap gap-2 px-6 pt-3 pb-6">
        {zustand.art === 'bereit' ? (
          <Button type="button" data-autofocus onClick={aufnehmen}>
            Aufnahme starten
          </Button>
        ) : null}
        {zustand.art === 'nimmt_auf' ? (
          <Button type="button" data-autofocus onClick={anhalten}>
            Aufnahme beenden
          </Button>
        ) : null}
        {zustand.art === 'vorschau' ? (
          <>
            <Button
              type="button"
              data-autofocus
              onClick={() => onAufnahme(zustand.video, zustand.dauer)}
            >
              Video verwenden
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
