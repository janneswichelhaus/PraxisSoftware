/**
 * Synthetische Videocontainer für die Tests von Gerät und Server (KOM-006),
 * ohne Bildspur auch als Sprachnachricht (TEAM-004).
 *
 * Steht in einer eigenen Datei, weil zwei Testdateien sie brauchen — die der
 * Bereinigung auf dem Gerät und die der Prüfung am Server. **Kein Bild,
 * keine Person, keine Stimme:** nur die Struktur, die `MediaRecorder` in
 * Chromium (WebM) und Safari (MP4) schreibt, mit erkennbaren Kennwörtern,
 * damit ein Test sie in den Bytes suchen kann. Bild- und Tondaten sind
 * Füllbytes.
 */

function bytes(...teile: (number[] | Uint8Array)[]): Uint8Array {
  const flach = teile.flatMap((t) => Array.from(t));
  return Uint8Array.from(flach);
}

function text(s: string): number[] {
  return Array.from(s, (z) => z.charCodeAt(0) & 0xff);
}

/** Kennung als Bytes, mit Markierungsbit wie im Format. */
function kennung(id: number): number[] {
  const aus: number[] = [];
  let rest = id;
  while (rest > 0) {
    aus.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  }
  return aus;
}

/** Größe als EBML-Zahl; `breite` 8 wie bei libwebm, sonst so knapp wie möglich. */
function groesse(n: number, breite?: number): number[] {
  let w = breite ?? 1;
  while (!breite && n >= 2 ** (7 * w) - 1) w += 1;
  const aus = new Array<number>(w).fill(0);
  let rest = n;
  for (let i = w - 1; i >= 0; i -= 1) {
    aus[i] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }
  aus[0]! |= 0x80 >> (w - 1);
  return aus;
}

function el(id: number, inhalt: number[] | Uint8Array, breite?: number): number[] {
  const daten = Array.from(inhalt);
  return [...kennung(id), ...groesse(daten.length, breite), ...daten];
}

const UNBEKANNT = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

export interface WebmOptionen {
  /** Eine Spur mit Ton (TrackType 2). */
  ton?: boolean;
  /** Die Bildspur (TrackType 1) - ohne sie eine Sprachnachricht. Vorgabe: ja. */
  bild?: boolean;
  /** Ein Datum im Kopf (DateUTC). */
  datum?: boolean;
  /** Tags mit einem Titel am Ende - wie ein Schnittprogramm sie schreibt. */
  tags?: boolean;
  /**
   * Cluster unbekannter Länge hintereinander - wie `MediaRecorder` mit
   * Zeitscheibe sie schreibt, etwa die Aufnahme einer Sprachnachricht
   * (`start(1000)`). Vorgabe: einer.
   */
  cluster?: number;
  /** Tags mit unbekannter Länge am Ende - so schreibt sie kein `MediaRecorder`. */
  tagsOhneLaenge?: boolean;
  /**
   * Eine Bildspur in einem Cluster unbekannter Länge innerhalb der Spuren -
   * ein Versteck, wenn unbekannte Länge nicht nur auf der Segmentebene gilt;
   * mit `'segment'` dazu in einem Segment fester Länge verschachtelt.
   */
  versteckteBildspur?: boolean | 'segment';
}

/**
 * Ein WebM wie aus `MediaRecorder` in Chromium: Segment und Cluster mit
 * unbekannter Länge, Größen mit acht Bytes, „Chrome" als Programm.
 */
export function webmAusChromium(optionen: WebmOptionen = {}): Uint8Array {
  const kopf = el(0x1a45dfa3, [
    ...el(0x4286, [1]),
    ...el(0x42f7, [1]),
    ...el(0x42f2, [4]),
    ...el(0x42f3, [8]),
    ...el(0x4282, text('webm')),
    ...el(0x4287, [4]),
    ...el(0x4285, [2]),
  ]);
  const info = el(
    0x1549a966,
    [
      ...el(0x2ad7b1, [0x0f, 0x42, 0x40]),
      ...el(0x4d80, text('Chrome'), 8),
      ...el(0x5741, text('Chrome'), 8),
      ...(optionen.datum ? el(0x4461, [0, 0, 0, 0x12, 0x34, 0x56, 0x78, 0x9a]) : []),
    ],
    8,
  );
  const bild = el(
    0xae,
    [...el(0xd7, [1]), ...el(0x73c5, [1]), ...el(0x83, [1]), ...el(0x86, text('V_VP8'))],
    8,
  );
  const ton = el(
    0xae,
    [...el(0xd7, [2]), ...el(0x73c5, [2]), ...el(0x83, [2]), ...el(0x86, text('A_OPUS'))],
    8,
  );
  const cluster0 = [...kennung(0x1f43b675), ...UNBEKANNT, ...bild];
  const versteck =
    optionen.versteckteBildspur === 'segment'
      ? el(0x18538067, cluster0)
      : optionen.versteckteBildspur
        ? cluster0
        : [];
  const spuren = el(
    0x1654ae6b,
    [...(optionen.bild === false ? [] : bild), ...(optionen.ton ? ton : []), ...versteck],
    8,
  );
  const cluster = [
    ...kennung(0x1f43b675),
    ...UNBEKANNT,
    ...el(0xe7, [0]),
    ...el(0xa3, [0x81, 0, 0, 0x80, ...new Array<number>(40).fill(0x55)]),
    ...el(0xa3, [0x81, 0, 0x21, 0x00, ...new Array<number>(30).fill(0x66)]),
  ];
  const tag = el(
    0x7373,
    el(0x67c8, [...el(0x45a3, text('TITLE')), ...el(0x4487, text('Kennwort-Titel'))]),
  );
  const tags = optionen.tags
    ? el(0x1254c367, tag)
    : optionen.tagsOhneLaenge
      ? [...kennung(0x1254c367), ...UNBEKANNT, ...tag]
      : [];
  const cluster_ = Array.from({ length: optionen.cluster ?? 1 }, () => cluster).flat();
  return bytes(kopf, kennung(0x18538067), UNBEKANNT, info, spuren, cluster_, tags);
}

// -----------------------------------------------------------------------------
// MP4
// -----------------------------------------------------------------------------

function kasten(typ: string, inhalt: number[]): number[] {
  const n = 8 + inhalt.length;
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
    ...text(typ),
    ...inhalt,
  ];
}

/** Ein Kasten mit Version/Flags und zwei Zeitstempeln der Version 0. */
function zeitkasten(typ: string, rest: number[]): number[] {
  const zeit = [0xe1, 0x23, 0x45, 0x67];
  return kasten(typ, [0, 0, 0, 0, ...zeit, ...zeit, ...rest]);
}

function hdlr(art: string): number[] {
  return kasten('hdlr', [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    ...text(art),
    ...new Array<number>(12).fill(0),
    0,
  ]);
}

export interface Mp4Optionen {
  ton?: boolean;
  /** Die Bildspur (`vide`) - ohne sie eine Sprachnachricht. Vorgabe: ja. */
  bild?: boolean;
  /** `udta` mit Kennwort im `moov`, wie Kamera-Apps es schreiben. */
  udta?: boolean;
}

/** Ein MP4 wie aus `MediaRecorder` in Safari, mit Aufnahmezeiten im Kopf. */
export function mp4AusSafari(optionen: Mp4Optionen = {}): Uint8Array {
  const spur = (art: string) =>
    kasten('trak', [
      ...zeitkasten('tkhd', new Array<number>(20).fill(0)),
      ...kasten('mdia', [...zeitkasten('mdhd', [0, 0, 0x03, 0xe8, 0, 0, 0, 0]), ...hdlr(art)]),
    ]);
  const moov = kasten('moov', [
    ...zeitkasten('mvhd', [0, 0, 0x03, 0xe8, ...new Array<number>(84).fill(0)]),
    ...(optionen.bild === false ? [] : spur('vide')),
    ...(optionen.ton ? spur('soun') : []),
    ...(optionen.udta ? kasten('udta', kasten('\xa9day', text('Kennwort-Datum'))) : []),
  ]);
  return bytes(
    kasten('ftyp', [...text('mp42'), 0, 0, 0, 0, ...text('isom')]),
    moov,
    kasten('mdat', new Array<number>(64).fill(0x77)),
  );
}

/** Ob ein Kennwort irgendwo in den Bytes steht. */
export function enthaelt(daten: Uint8Array, kennwort: string): boolean {
  const muster = text(kennwort);
  outer: for (let i = 0; i + muster.length <= daten.length; i += 1) {
    for (let j = 0; j < muster.length; j += 1) if (daten[i + j] !== muster[j]) continue outer;
    return true;
  }
  return false;
}
