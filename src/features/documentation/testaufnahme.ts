/**
 * Ein nachgebildetes Mikrofon und ein nachgebildeter `MediaRecorder` für die
 * Tests der Spracheingabe (KI-EPIC-001). Eigene Datei, weil zwei Testdateien
 * sie brauchen - die des Aufnahme-Hooks und die der Schreibseite. **Kein
 * Ton:** Eine „Aufnahme" sind 64 Füllbytes.
 *
 * Ohne Testbibliothek geschrieben: Die Datei gehört zum Quellbaum und wird mit
 * ihm geprüft, kennt also kein `vi`.
 */

/** Eine Spur des Mikrofons: Sie merkt sich, ob sie beendet wurde. */
export class Testspur {
  readonly kind = 'audio';
  beendet = false;
  private readonly hoerer: (() => void)[] = [];

  stop(): void {
    this.beendet = true;
  }

  addEventListener(art: string, f: () => void): void {
    if (art === 'ended') this.hoerer.push(f);
  }

  /** Das Mikrofon fällt weg - Anruf, entzogene Freigabe. */
  enden(): void {
    this.beendet = true;
    for (const f of this.hoerer) f();
  }
}

type Hoerer = (ereignis: { data?: Blob }) => void;

export class Testrecorder {
  /** Welche Formate der nachgebildete Browser kann; je Test umstellbar. */
  static unterstuetzt: (typ: string) => boolean = (typ) => typ.startsWith('audio/webm');
  static alle: Testrecorder[] = [];

  static isTypeSupported(typ: string): boolean {
    return Testrecorder.unterstuetzt(typ);
  }

  state: 'inactive' | 'recording' = 'inactive';
  readonly mimeType: string;
  readonly optionen: MediaRecorderOptions;
  readonly stream: MediaStream;
  zeitscheibe: number | undefined;
  /** Liefert die nächste Aufnahme ohne Daten. */
  leer = false;
  private readonly hoerer = new Map<string, Hoerer[]>();

  constructor(stream: MediaStream, optionen: MediaRecorderOptions = {}) {
    this.stream = stream;
    this.optionen = optionen;
    this.mimeType = optionen.mimeType ?? 'audio/webm';
    Testrecorder.alle.push(this);
  }

  addEventListener(art: string, f: Hoerer): void {
    this.hoerer.set(art, [...(this.hoerer.get(art) ?? []), f]);
  }

  private feuere(art: string, ereignis: { data?: Blob }): void {
    for (const f of this.hoerer.get(art) ?? []) f(ereignis);
  }

  start(zeitscheibe?: number): void {
    this.state = 'recording';
    this.zeitscheibe = zeitscheibe;
  }

  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    const daten = this.leer
      ? new Blob([])
      : new Blob([new Uint8Array(64)], { type: this.mimeType });
    this.feuere('dataavailable', { data: daten });
    this.feuere('stop', {});
  }

  /** Ein Stück Aufnahme, wie es der Browser je Zeitscheibe liefert. */
  liefere(bytes: number): void {
    if (this.state !== 'recording') return;
    this.feuere('dataavailable', {
      data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }),
    });
  }

  /** Der Browser meldet einen Fehler mitten in der Aufnahme. */
  stoere(): void {
    this.state = 'inactive';
    this.feuere('error', {});
    this.feuere('stop', {});
  }
}

export class Testmikrofon {
  readonly anfragen: MediaStreamConstraints[] = [];
  readonly spuren: Testspur[] = [];
  private fehler: string | null = null;
  private halten = false;
  private readonly wartend: (() => void)[] = [];

  /** Die nächste Freigabe scheitert, etwa mit `NotAllowedError`. */
  verweigere(name = 'NotAllowedError'): void {
    this.fehler = name;
  }

  /** Die Freigabe bleibt offen, bis `gibFrei` - wie die Rückfrage des Browsers. */
  halteAn(): void {
    this.halten = true;
  }

  gibFrei(): void {
    this.halten = false;
    for (const f of this.wartend.splice(0)) f();
  }

  readonly getUserMedia = (vorgaben: MediaStreamConstraints): Promise<MediaStream> => {
    this.anfragen.push(vorgaben);
    if (this.fehler) return Promise.reject(new DOMException('synthetisch', this.fehler));
    const spur = new Testspur();
    this.spuren.push(spur);
    const strom = {
      getTracks: () => [spur],
      getAudioTracks: () => [spur],
    } as unknown as MediaStream;
    if (!this.halten) return Promise.resolve(strom);
    return new Promise((fertig) => this.wartend.push(() => fertig(strom)));
  };
}

/**
 * Setzt Mikrofon und Recorder in `window` und `navigator` ein und gibt sie
 * zurück; `entfernen` stellt den vorigen Stand her (jsdom hat beides nicht).
 */
export function installiereAufnahme(): {
  mikrofon: Testmikrofon;
  entfernen: () => void;
} {
  const mikrofon = new Testmikrofon();
  Testrecorder.alle = [];
  Testrecorder.unterstuetzt = (typ) => typ.startsWith('audio/webm');
  const ziele = [globalThis, window].filter((ziel, i, liste) => liste.indexOf(ziel) === i);
  const vorher = ziele.map((ziel) => Object.getOwnPropertyDescriptor(ziel, 'MediaRecorder'));
  const geraete = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

  for (const ziel of ziele) {
    Object.defineProperty(ziel, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: Testrecorder,
    });
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: mikrofon.getUserMedia },
  });

  return {
    mikrofon,
    entfernen() {
      ziele.forEach((ziel, i) => {
        const alt = vorher[i];
        if (alt) Object.defineProperty(ziel, 'MediaRecorder', alt);
        else delete (ziel as { MediaRecorder?: unknown }).MediaRecorder;
      });
      if (geraete) Object.defineProperty(navigator, 'mediaDevices', geraete);
      else delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    },
  };
}
