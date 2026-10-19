import { useSyncExternalStore } from 'react';
import {
  ANHAENGE_MAX,
  SITZUNGSENDE,
  TeamchatFehler,
  ladeAnhangHoch,
  mitSitzungGefallen,
  verwirfAnhang,
  type Anhang,
} from './api';
import { WIEDERHOLEN_MS } from './takt';

/**
 * Anhänge im Entwurf (TEAM-003, ADR-017 Punkt 74): je Konto, Gespräch und
 * Thread wie der Text (`entwuerfe.ts`), nur im Arbeitsspeicher dieser Sitzung.
 *
 * Eine Datei lädt hoch, sobald sie gewählt ist - während die Person schreibt
 * (wie Slack). Die Bytes bleiben bis dahin im Speicher der Seite; ohne Netz
 * gibt es keinen Anhang. Ein gescheitertes Hochladen wiederholt sich von
 * selbst, sobald wieder Netz da ist, und alle 15 Sekunden bis zu achtmal
 * (`VON_SELBST_HOECHSTENS`) - an einer gesendeten Nachricht danach alle zwei
 * Minuten weiter -, oder auf „Noch einmal“; alles nur, solange die Seite
 * offen ist. Vor dem Verlassen und Abmelden warnt `AusgangAbmeldewache`
 * (Punkt 33). Wer das Gespräch wechselt, findet
 * die Anhänge beim Zurückkommen wieder; nichts wandert in ein anderes
 * Gespräch oder Konto. Beim Abmelden fällt alles (`teamchatLeeren`); was dann
 * schon hochgeladen war, verwirft der Server nach 24 Stunden.
 *
 * Eine Sprachnachricht (TEAM-004, ADR-017 Abschnitt N) ist ein Anhang wie ein
 * Foto, nur mit ihrer Dauer aus der Aufnahme.
 *
 * Gesendet wird auch, während Anhänge noch laden (TEAM-005, ANN-654): Dann
 * hängen sie an der Nachricht im Ausgang statt am Entwurf (`nachrichtId`),
 * laden und wiederholen sich dort weiter und bleiben an ihr, bis der Server
 * sie angenommen hat - „Bearbeiten“ holt sie zurück in den Entwurf.
 */

export type Anhangszustand = 'laedt' | 'bereit' | 'fehler';

export interface Entwurfsanhang {
  /** Kennung nur auf dem Gerät - bis zum Hochladen gibt es keine andere. */
  lokalId: string;
  kontoId: string;
  kanalId: string;
  threadId: string | null;
  name: string;
  mime: string;
  groesse: number;
  /** Objekt-URL der eigenen Bytes - nur für Bilder, nur vor dem Senden. */
  vorschau: string | null;
  /** Sekunden aus der Aufnahme - nur bei einer Sprachnachricht (ANN-655). */
  dauer: number | null;
  zustand: Anhangszustand;
  fehler: string | null;
  /** Ob ein neuer Versuch gelingen kann (kein Netz) - bei falschem Format nicht. */
  erneut: boolean;
  /** Versuche von selbst seit dem letzten von Hand - höchstens `VON_SELBST_HOECHSTENS`. */
  vonSelbst: number;
  /** Was der Server angenommen hat - erst dann kann die Nachricht hinaus. */
  anhang: Anhang | null;
  /** Die Nachricht im Ausgang, an der der Anhang hängt - `null` im Entwurf (ANN-654). */
  nachrichtId: string | null;
}

const speicher = new Map<string, Entwurfsanhang>();
/** Die Datei selbst, für einen neuen Versuch - nie außerhalb dieses Moduls. */
const dateien = new Map<string, Blob>();
/**
 * Was gerade hochlädt, mit seinem Abbruch - ein zweiter Versuch derselben
 * Datei wartet nicht daneben. Fällt ein Anhang (Entfernen, Abmelden,
 * Kontowechsel), unterbleibt der nächste Schritt (Zweitreview TEAM-005).
 */
const laufend = new Map<string, AbortController>();
const beobachter = new Set<() => void>();
let stand = 0;
let takt: ReturnType<typeof setInterval> | null = null;
let angemeldet = false;

function melden() {
  stand += 1;
  for (const b of beobachter) b();
  taktPruefen();
}

/**
 * So oft versucht es ein Anhang im Takt von selbst (zwei Minuten), dann im
 * Entwurf nur noch mit dem Netz oder von Hand: Jeder Versuch, der die
 * Datenbank erreicht, legt eine Zeile an und verwirft sie wieder.
 */
export const VON_SELBST_HOECHSTENS = 8;

/** Schläge des Takts, seit er läuft - für den langsamen Takt im Ausgang. */
let schlaege = 0;

/** Ob ein neuer Versuch gelingen kann - gescheitert am Netz, nicht am Format. */
function wiederholbar(a: Entwurfsanhang): boolean {
  return a.zustand === 'fehler' && a.erneut;
}

/**
 * Ob der Takt es noch einmal versucht. An einer gesendeten Nachricht hört er
 * nicht auf, sondern versucht es nach den acht Malen jeden achten Schlag,
 * alle zwei Minuten: Bei schwachem Empfang meldet der Browser kein neues
 * Netz, und die Nachricht soll trotzdem von selbst gehen (Praxis-Review
 * TEAM-005, ANN-654).
 */
function imTakt(a: Entwurfsanhang): boolean {
  return wiederholbar(a) && (a.vonSelbst < VON_SELBST_HOECHSTENS || a.nachrichtId !== null);
}

/** Ob dieser Schlag des Takts für den Anhang einer ist. */
function jetztDran(a: Entwurfsanhang): boolean {
  return a.vonSelbst < VON_SELBST_HOECHSTENS || schlaege % VON_SELBST_HOECHSTENS === 0;
}

function taktPruefen() {
  const wartet = [...speicher.values()].some(imTakt);
  if (wartet && takt === null) {
    schlaege = 0;
    takt = setInterval(imTaktWiederholen, WIEDERHOLEN_MS);
  } else if (!wartet && takt !== null) {
    clearInterval(takt);
    takt = null;
  }
}

function anmelden() {
  if (angemeldet || typeof window === 'undefined') return;
  angemeldet = true;
  // Mit dem Netz kommt der nächste Versuch sofort, nicht erst im Takt - und
  // der Takt beginnt von vorn.
  window.addEventListener('online', () => anhaengeWiederholen(true));
}

function imTaktWiederholen(): void {
  schlaege += 1;
  anhaengeWiederholen(false);
}

/**
 * Am Netz gescheiterte Anhänge noch einmal - wie `wiederholeWartende`. Im
 * Takt nur bis `VON_SELBST_HOECHSTENS`; mit dem Netz oder beim Abmelden
 * (`neu`) alle, und der Takt zählt wieder von vorn.
 */
export function anhaengeWiederholen(neu = true): void {
  for (const a of [...speicher.values()]) {
    if (!wiederholbar(a)) continue;
    if (neu) speicher.set(a.lokalId, { ...a, vonSelbst: 0 });
    else if (!imTakt(a) || !jetztDran(a)) continue;
    void hochladen(a.lokalId, !neu);
  }
}

function gehoertZu(a: Entwurfsanhang, kontoId: string, kanalId: string, threadId: string | null) {
  return (
    a.nachrichtId === null &&
    a.kontoId === kontoId &&
    a.kanalId === kanalId &&
    a.threadId === threadId
  );
}

export function anhaengeVon(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
): Entwurfsanhang[] {
  return [...speicher.values()].filter((a) => gehoertZu(a, kontoId, kanalId, threadId));
}

/** Das Wort zur Art eines Anhangs - die Bedeutung trägt das Wort, nicht das Zeichen. */
export function anhangArt(mime: string): 'PDF' | 'Sprachnachricht' | 'Foto' {
  if (mime === 'application/pdf') return 'PDF';
  return mime.startsWith('audio/') ? 'Sprachnachricht' : 'Foto';
}

/** Höchstens 120 Zeichen ohne Steuerzeichen - wie am Server. */
export function anhangName(name: string): string {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen sind genau, was hier fort soll.
  const sauber = name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return (sauber || 'Datei').slice(0, 120).trim();
}

/**
 * Der Name eines Fotos aus dem Kameradialog oder einer Sprachnachricht
 * (ANN-655): Tag und Uhrzeit der Aufnahme, gezählt, wenn in derselben Minute
 * schon eine im Entwurf liegt - ohne Vorschaubild ist der Name das Merkmal
 * (Praxis-Review TEAM-003).
 */
export function aufnahmeName(
  art: 'Foto' | 'Sprachnachricht',
  zeitzone: string,
  vorhanden: readonly string[],
  jetzt = new Date(),
): string {
  const zeit = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zeitzone,
  }).format(jetzt);
  const basis = `${art} ${zeit}`;
  if (!vorhanden.includes(basis)) return basis;
  let nummer = 2;
  while (vorhanden.includes(`${basis} (${nummer})`)) nummer += 1;
  return `${basis} (${nummer})`;
}

async function hochladen(lokalId: string, vonSelbst = false): Promise<void> {
  const eintrag = speicher.get(lokalId);
  const datei = dateien.get(lokalId);
  if (!eintrag || !datei || laufend.has(lokalId)) return;
  const abbruch = new AbortController();
  laufend.set(lokalId, abbruch);
  speicher.set(lokalId, {
    ...eintrag,
    zustand: 'laedt',
    fehler: null,
    erneut: false,
    vonSelbst: vonSelbst ? eintrag.vonSelbst + 1 : eintrag.vonSelbst,
  });
  melden();
  try {
    const anhang = await ladeAnhangHoch(
      eintrag.kanalId,
      datei,
      eintrag.name,
      eintrag.dauer ?? undefined,
      abbruch.signal,
    );
    const jetzt = speicher.get(lokalId);
    if (!jetzt) {
      // Während des Hochladens entfernt: dann auch am Server fort - nach dem
      // Abmelden nicht, das ginge unter der nächsten Sitzung hinaus.
      if (!mitSitzungGefallen(abbruch.signal)) {
        void verwirfAnhang(anhang.id).catch(() => undefined);
      }
      return;
    }
    speicher.set(lokalId, { ...jetzt, zustand: 'bereit', anhang, groesse: anhang.byte_size });
  } catch (ursache) {
    const jetzt = speicher.get(lokalId);
    if (!jetzt) return;
    speicher.set(lokalId, {
      ...jetzt,
      zustand: 'fehler',
      fehler:
        ursache instanceof Error ? ursache.message : 'Der Anhang konnte nicht hochgeladen werden.',
      erneut: ursache instanceof TeamchatFehler ? ursache.netz : true,
    });
  } finally {
    if (laufend.get(lokalId) === abbruch) laufend.delete(lokalId);
    melden();
  }
}

/**
 * Hängt Dateien an den Entwurf und lädt sie hoch - eine Sprachnachricht mit
 * ihrer Dauer (`dauer`). Liefert, wie viele über der Grenze von fünf liegen
 * und deshalb nicht angehängt sind. Eine Aufnahme hängt auch darüber an
 * (`grenze`): Sonst wäre sie fort; „Senden“ wartet dann, bis entfernt ist.
 */
export function anhaengen(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
  neue: readonly { datei: Blob; name: string; dauer?: number }[],
  grenze: number = ANHAENGE_MAX,
): number {
  anmelden();
  const frei = grenze - anhaengeVon(kontoId, kanalId, threadId).length;
  const angenommen = neue.slice(0, Math.max(0, frei));
  for (const { datei, name, dauer } of angenommen) {
    const lokalId = crypto.randomUUID();
    const bild = datei.type === 'image/jpeg' || datei.type === 'image/png';
    speicher.set(lokalId, {
      lokalId,
      kontoId,
      kanalId,
      threadId,
      name: anhangName(name),
      mime: datei.type,
      groesse: datei.size,
      vorschau:
        bild && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(datei) : null,
      dauer: dauer ?? null,
      zustand: 'laedt',
      fehler: null,
      erneut: false,
      vonSelbst: 0,
      anhang: null,
      nachrichtId: null,
    });
    dateien.set(lokalId, datei);
    void hochladen(lokalId);
  }
  if (angenommen.length > 0) melden();
  return neue.length - angenommen.length;
}

/** Ein gescheitertes Hochladen noch einmal, von Hand - der Takt zählt von vorn. */
export function anhangErneut(lokalId: string): void {
  const eintrag = speicher.get(lokalId);
  if (eintrag) speicher.set(lokalId, { ...eintrag, vonSelbst: 0 });
  void hochladen(lokalId);
}

function freigeben(eintrag: Entwurfsanhang, grund?: string) {
  laufend.get(eintrag.lokalId)?.abort(grund);
  if (eintrag.vorschau) URL.revokeObjectURL(eintrag.vorschau);
  dateien.delete(eintrag.lokalId);
  speicher.delete(eintrag.lokalId);
}

/** Einen Anhang vor dem Senden entfernen - schon hochgeladen, dann auch am Server. */
export function anhangEntfernen(lokalId: string): void {
  const eintrag = speicher.get(lokalId);
  if (!eintrag) return;
  freigeben(eintrag);
  if (eintrag.anhang) void verwirfAnhang(eintrag.anhang.id).catch(() => undefined);
  melden();
}

/**
 * Die Anhänge des Entwurfs gehen mit der Nachricht (ANN-654): Sie hängen
 * fortan an ihr - fertig oder noch beim Hochladen - und der Entwurf ist frei.
 */
export function anhaengeBinden(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
  nachrichtId: string,
): number {
  const entwurf = anhaengeVon(kontoId, kanalId, threadId);
  for (const a of entwurf) speicher.set(a.lokalId, { ...a, nachrichtId });
  if (entwurf.length > 0) melden();
  return entwurf.length;
}

/** Die Anhänge einer Nachricht im Ausgang, in der Reihenfolge des Anhängens. */
export function anhaengeDerNachricht(nachrichtId: string): Entwurfsanhang[] {
  return [...speicher.values()].filter((a) => a.nachrichtId === nachrichtId);
}

/** Der Server hat die Nachricht angenommen: Ihre Anhänge verlassen den Speicher. */
export function gebundeneFreigeben(nachrichtId: string): void {
  const gebunden = anhaengeDerNachricht(nachrichtId);
  for (const a of gebunden) freigeben(a);
  if (gebunden.length > 0) melden();
}

/** „Bearbeiten“: Die Anhänge kehren in den Entwurf ihrer Stelle zurück. */
export function anhaengeZurueck(nachrichtId: string): void {
  const gebunden = anhaengeDerNachricht(nachrichtId);
  for (const a of gebunden) speicher.set(a.lokalId, { ...a, nachrichtId: null });
  if (gebunden.length > 0) melden();
}

/** „Verwerfen“: Die Anhänge fallen mit der Nachricht - am Server mit. */
export function gebundeneVerwerfen(nachrichtId: string): void {
  for (const a of anhaengeDerNachricht(nachrichtId)) anhangEntfernen(a.lokalId);
}

/** „Jetzt versuchen“ an einer Nachricht: Ihre am Netz gescheiterten Anhänge noch einmal. */
export function gebundeneErneut(nachrichtId: string): void {
  for (const a of anhaengeDerNachricht(nachrichtId)) {
    if (wiederholbar(a)) anhangErneut(a.lokalId);
  }
}

/** Für den Ausgang: Bescheid bei jeder Änderung an den Anhängen. */
export function anhaengeBeobachten(rueckruf: () => void): () => void {
  return abonnieren(rueckruf);
}

/** Alle Anhänge aller Konten fort - beim Abmelden und Kontowechsel. */
export function anhaengeLeeren(): void {
  if (speicher.size === 0) return;
  for (const eintrag of [...speicher.values()]) freigeben(eintrag, SITZUNGSENDE);
  melden();
}

function abonnieren(rueckruf: () => void): () => void {
  beobachter.add(rueckruf);
  return () => beobachter.delete(rueckruf);
}

/**
 * Wie viele Anhänge eines Kontos nur im Speicher der Seite liegen - noch nicht
 * oben oder gescheitert. Sie gingen beim Abmelden und Verlassen verloren
 * (ADR-017 Punkt 33); ein Foto aus der Kamera der App gibt es sonst nirgends.
 */
export function useAnhaengeNurHier(kontoId: string): number {
  useSyncExternalStore(abonnieren, () => stand);
  return [...speicher.values()].filter((a) => a.kontoId === kontoId && a.zustand !== 'bereit')
    .length;
}

/** Die Anhänge im Entwurf an einer Stelle, in der Reihenfolge des Anhängens. */
export function useEntwurfsanhaenge(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
): Entwurfsanhang[] {
  useSyncExternalStore(abonnieren, () => stand);
  return anhaengeVon(kontoId, kanalId, threadId);
}
