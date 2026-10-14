import { useCallback, useEffect, useRef, useState } from 'react';
import { DIKTAT_HOECHSTBYTES, DIKTAT_HOECHSTDAUER_S } from '@/lib/ki/gateway';

/**
 * Die Aufnahme eines Diktats im Browser (KI-EPIC-001, PROJECT_PRINCIPLES.md
 * 6.3, „Start und Zuordnung").
 *
 * Aufgenommen wird **nur auf ausdrücklichen Tipp** (`starten`), und nur so
 * lange, wie die Anzeige im Blick ist:
 *
 *   * Stopp per Tipp (`beenden`, `abbrechen`) und von selbst nach höchstens
 *     fünf Minuten oder kurz vor der Größengrenze des Gateways (ANN-523);
 *   * Stopp, sobald die Seite verborgen wird (anderes Programm, Bildschirm
 *     aus) oder das Mikrofon wegfällt (Anruf, Freigabe entzogen) - eine
 *     Aufnahme ohne sichtbare Anzeige gibt es nicht;
 *   * beim Verlassen der Seite wird verworfen.
 *
 * Nach jedem Stopp werden die Spuren des Mikrofons beendet; das Zeichen des
 * Browsers erlischt. Die Aufnahme liegt danach nur im Arbeitsspeicher der
 * Seite und geht an den, der sie bestellt hat (`onFertig`) - nie auf das
 * Gerät, nie in einen Speicher.
 */

/** Höchstdauer einer Aufnahme in Sekunden - die Grenze des Gateways. */
export const HOECHSTDAUER_S = DIKTAT_HOECHSTDAUER_S;

/**
 * Bitrate der Aufnahme: Für Sprache genügen 64 kbit/s, fünf Minuten sind dann
 * etwa 2,4 MB - die Hälfte der Grenze von 5 MiB.
 */
export const AUDIO_BITRATE = 64_000;

/**
 * Nimmt ein Browser mehr, als er soll, endet die Aufnahme kurz vor der
 * Größengrenze des Gateways statt mit einer Abweisung danach. Die Reserve
 * fasst das letzte Stück, das nach dem Stopp noch kommt (je Sekunde eines).
 */
export const AUFNAHME_HOECHSTBYTES = DIKTAT_HOECHSTBYTES - 256 * 1024;

/**
 * Formate in der Reihenfolge der Wahl. Was der Browser kann, sagt
 * `MediaRecorder.isTypeSupported`: Chrome und Firefox liefern WebM/Opus,
 * Safari MP4.
 */
export const AUFNAHMEFORMATE = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

/** Kann dieses Gerät hier überhaupt aufnehmen? (Ohne HTTPS fehlt `mediaDevices`.) */
export function aufnahmeMoeglich(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** Was Chromium als Permissions-Policy der Seite anbietet (andere Browser: nichts). */
interface Seitenrichtlinie {
  allowsFeature(funktion: string): boolean;
}

/**
 * Lässt die Seite das Mikrofon überhaupt zu? Eine Permissions-Policy kann es
 * sperren - so die Test-Umgebung (`microphone=()`, ADR-017 Punkt 33). Dann
 * führte „Sprechen“ ins Leere, und die Seite bietet es nicht an. Gefragt wird
 * `document.permissionsPolicy` oder das ältere `document.featurePolicy`; wo
 * der Browser keines von beiden kennt, bleibt es bei der Rückfrage des
 * Browsers und ihrer Meldung.
 */
export function mikrofonErlaubt(): boolean {
  if (typeof document === 'undefined') return false;
  const seite = document as Document & {
    permissionsPolicy?: Seitenrichtlinie;
    featurePolicy?: Seitenrichtlinie;
  };
  const richtlinie = seite.permissionsPolicy ?? seite.featurePolicy;
  if (typeof richtlinie?.allowsFeature !== 'function') return true;
  try {
    return richtlinie.allowsFeature('microphone');
  } catch {
    return true;
  }
}

/** Das erste Format, das der Browser aufnehmen kann - oder keines (dann seine Vorgabe). */
export function waehleFormat(unterstuetzt: (typ: string) => boolean): string | undefined {
  return AUFNAHMEFORMATE.find((typ) => {
    try {
      return unterstuetzt(typ);
    } catch {
      return false;
    }
  });
}

/** Was eine beendete Aufnahme übergibt. */
export interface Aufnahme {
  readonly audio: Blob;
  readonly dauerS: number;
}

/**
 * Warum keine Aufnahme zustande kam: Freigabe verweigert (auch durch die
 * Umgebung), kein oder ein belegtes Mikrofon, nichts aufgenommen, sonst ein
 * Fehler des Browsers.
 */
export type Aufnahmefehler = 'verweigert' | 'kein_mikrofon' | 'leer' | 'fehler';

export type Aufnahmezustand = 'bereit' | 'startet' | 'laeuft';

function fehlerArt(fehler: unknown): Aufnahmefehler {
  const name = (fehler as { name?: unknown } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'verweigert';
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') {
    return 'kein_mikrofon';
  }
  return 'fehler';
}

/** Ein Lauf vom Tipp auf „Sprechen" bis zur Übergabe. */
interface Lauf {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  teile: Blob[];
  /** Bisher aufgenommene Bytes - für die Größengrenze. */
  bytes: number;
  format: string;
  beginn: number;
  uhr: number | undefined;
  sperre: WakeLockSentinel | null;
  sichtbarkeit: (() => void) | null;
  /** Gestoppt - per Tipp, Frist, Sichtbarkeit oder Verlassen. */
  beendet: boolean;
  /** Abgebrochen oder verlassen: Die Aufnahme wird nicht übergeben. */
  verwerfen: boolean;
  /** Der Browser meldete einen Fehler. */
  gestoert: boolean;
  aufgeraeumt: boolean;
  /** Übergeben oder verworfen - genau einmal, auch wenn `stop` nach `error` kommt. */
  abgeschlossen: boolean;
}

export function useAufnahme({
  onFertig,
  onFehler,
  hoechstdauerS = HOECHSTDAUER_S,
  hoechstbytes = AUFNAHME_HOECHSTBYTES,
}: {
  onFertig: (aufnahme: Aufnahme) => void;
  onFehler: (fehler: Aufnahmefehler) => void;
  hoechstdauerS?: number;
  hoechstbytes?: number;
}) {
  const [zustand, setZustand] = useState<Aufnahmezustand>('bereit');
  const [sekunden, setSekunden] = useState(0);
  const lauf = useRef<Lauf | null>(null);
  // Die Rückrufe der Seite ändern sich mit jedem Zeichnen; ein Lauf hält
  // seine Ereignisse über viele davon.
  const rueckruf = useRef({ onFertig, onFehler });
  rueckruf.current = { onFertig, onFehler };

  const aufraeumen = useCallback((l: Lauf) => {
    if (l.aufgeraeumt) return;
    l.aufgeraeumt = true;
    window.clearInterval(l.uhr);
    if (l.sichtbarkeit) document.removeEventListener('visibilitychange', l.sichtbarkeit);
    // Die Spuren beenden: Erst dann gibt der Browser das Mikrofon frei.
    l.stream?.getTracks().forEach((spur) => spur.stop());
    void l.sperre?.release().catch(() => undefined);
  }, []);

  const abschliessen = useCallback(
    (l: Lauf) => {
      aufraeumen(l);
      if (l.abgeschlossen) return;
      l.abgeschlossen = true;
      if (lauf.current === l) {
        lauf.current = null;
        setZustand('bereit');
        setSekunden(0);
      }
      const teile = l.teile;
      l.teile = [];
      if (l.gestoert) {
        rueckruf.current.onFehler('fehler');
        return;
      }
      if (l.verwerfen) return;
      if (teile.length === 0) {
        rueckruf.current.onFehler('leer');
        return;
      }
      const typ = (l.format.split(';')[0] ?? '').trim() || 'audio/webm';
      const dauerS = Math.min(hoechstdauerS, Math.max(0, (Date.now() - l.beginn) / 1000));
      rueckruf.current.onFertig({ audio: new Blob(teile, { type: typ }), dauerS });
    },
    [aufraeumen, hoechstdauerS],
  );

  /** Anhalten: `verwerfen` wirft die Aufnahme weg, sonst geht sie an `onFertig`. */
  const anhalten = useCallback(
    (verwerfen: boolean) => {
      const l = lauf.current;
      if (!l || l.beendet) return;
      l.beendet = true;
      l.verwerfen = l.verwerfen || verwerfen;
      if (l.recorder && l.recorder.state !== 'inactive') {
        // `stop` liefert die letzten Daten und dann `stop` - dort geht es weiter.
        l.recorder.stop();
        return;
      }
      // Noch beim Öffnen des Mikrofons: Es gibt nichts zu übergeben.
      l.verwerfen = true;
      abschliessen(l);
    },
    [abschliessen],
  );

  const starten = useCallback(async () => {
    if (lauf.current) return;
    const l: Lauf = {
      stream: null,
      recorder: null,
      teile: [],
      bytes: 0,
      format: '',
      beginn: 0,
      uhr: undefined,
      sperre: null,
      sichtbarkeit: null,
      beendet: false,
      verwerfen: false,
      gestoert: false,
      aufgeraeumt: false,
      abgeschlossen: false,
    };
    lauf.current = l;
    setZustand('startet');
    setSekunden(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (fehler) {
      const abgebrochen = l.beendet;
      if (lauf.current === l) lauf.current = null;
      setZustand('bereit');
      if (!abgebrochen) rueckruf.current.onFehler(fehlerArt(fehler));
      return;
    }
    l.stream = stream;
    // Während der Freigabe abgebrochen oder die Seite verlassen: Das
    // Mikrofon kam erst danach - es geht sofort wieder aus.
    if (l.beendet || lauf.current !== l) {
      stream.getTracks().forEach((spur) => spur.stop());
      aufraeumen(l);
      return;
    }
    // Während das Mikrofon öffnete, wurde die Seite verborgen: Ohne sichtbare
    // Anzeige beginnt keine Aufnahme (6.3) - die Wache unten käme erst mit dem
    // nächsten Wechsel.
    if (document.visibilityState === 'hidden') {
      anhalten(true);
      return;
    }

    const format = waehleFormat((typ) => MediaRecorder.isTypeSupported(typ));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(format ? { mimeType: format } : {}),
        audioBitsPerSecond: AUDIO_BITRATE,
      });
    } catch {
      l.gestoert = true;
      l.beendet = true;
      abschliessen(l);
      return;
    }
    l.recorder = recorder;
    l.format = recorder.mimeType || format || 'audio/webm';
    recorder.addEventListener('dataavailable', (ereignis) => {
      if (ereignis.data.size === 0) return;
      l.teile.push(ereignis.data);
      l.bytes += ereignis.data.size;
      if (l.bytes >= hoechstbytes) anhalten(false);
    });
    recorder.addEventListener('stop', () => abschliessen(l));
    recorder.addEventListener('error', () => {
      l.gestoert = true;
      if (!l.beendet) anhalten(true);
      else abschliessen(l);
    });
    // Das Mikrofon fällt weg (Anruf, Freigabe entzogen): aufbereiten, was da ist.
    stream
      .getAudioTracks()
      .forEach((spur) => spur.addEventListener('ended', () => anhalten(false)));
    // Keine Aufnahme ohne sichtbare Anzeige (6.3): verborgen heißt fertig.
    l.sichtbarkeit = () => {
      if (document.visibilityState === 'hidden') anhalten(false);
    };
    document.addEventListener('visibilitychange', l.sichtbarkeit);

    l.beginn = Date.now();
    recorder.start(1000);
    setZustand('laeuft');
    l.uhr = window.setInterval(() => {
      const vergangen = (Date.now() - l.beginn) / 1000;
      if (vergangen >= hoechstdauerS) {
        setSekunden(hoechstdauerS);
        anhalten(false);
        return;
      }
      setSekunden(Math.floor(vergangen));
    }, 250);

    // Der Bildschirm bleibt an, solange aufgenommen wird - sonst ginge die
    // Anzeige nach einer halben Minute aus und mit ihr die Aufnahme.
    try {
      const sperre = (await navigator.wakeLock?.request('screen')) ?? null;
      if (l.aufgeraeumt) void sperre?.release().catch(() => undefined);
      else l.sperre = sperre;
    } catch {
      l.sperre = null;
    }
  }, [abschliessen, anhalten, aufraeumen, hoechstbytes, hoechstdauerS]);

  // Wer die Seite verlässt, nimmt nichts mit und lässt nichts laufen.
  useEffect(
    () => () => {
      const l = lauf.current;
      if (!l) return;
      l.verwerfen = true;
      l.beendet = true;
      lauf.current = null;
      try {
        if (l.recorder && l.recorder.state !== 'inactive') l.recorder.stop();
      } catch {
        // Der Recorder ist schon fort; die Spuren beendet `aufraeumen`.
      }
      aufraeumen(l);
    },
    [aufraeumen],
  );

  return {
    zustand,
    sekunden,
    starten,
    /** Anhalten und übergeben - „Fertig". */
    beenden: useCallback(() => anhalten(false), [anhalten]),
    /** Anhalten und verwerfen - „Abbrechen". */
    abbrechen: useCallback(() => anhalten(true), [anhalten]),
  };
}

/** „0:12", „4:59" - Minuten und Sekunden der laufenden Aufnahme. */
export function aufnahmedauer(sekunden: number): string {
  const ganz = Math.max(0, Math.floor(sekunden));
  return `${Math.floor(ganz / 60)}:${String(ganz % 60).padStart(2, '0')}`;
}
