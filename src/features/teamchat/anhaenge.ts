import { useSyncExternalStore } from 'react';
import { ANHAENGE_MAX, TeamchatFehler, ladeAnhangHoch, verwirfAnhang, type Anhang } from './api';

/**
 * Anhänge im Entwurf (TEAM-003, ADR-017 Punkt 74): je Konto, Gespräch und
 * Thread wie der Text (`entwuerfe.ts`), nur im Arbeitsspeicher dieser Sitzung.
 *
 * Eine Datei lädt hoch, sobald sie gewählt ist - während die Person schreibt
 * (wie Slack). Die Bytes bleiben bis dahin im Speicher der Seite; ohne Netz
 * gibt es keinen Anhang, ein gescheitertes Hochladen lässt sich wiederholen,
 * solange die Seite offen ist (Punkt 33). Wer das Gespräch wechselt, findet
 * die Anhänge beim Zurückkommen wieder; nichts wandert in ein anderes
 * Gespräch oder Konto. Beim Abmelden fällt alles (`teamchatLeeren`); was dann
 * schon hochgeladen war, verwirft der Server nach 24 Stunden.
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
  zustand: Anhangszustand;
  fehler: string | null;
  /** Ob ein neuer Versuch gelingen kann (kein Netz) - bei falschem Format nicht. */
  erneut: boolean;
  /** Was der Server angenommen hat - erst dann kann die Nachricht hinaus. */
  anhang: Anhang | null;
}

const speicher = new Map<string, Entwurfsanhang>();
/** Die Datei selbst, für einen neuen Versuch - nie außerhalb dieses Moduls. */
const dateien = new Map<string, Blob>();
const beobachter = new Set<() => void>();
let stand = 0;

function melden() {
  stand += 1;
  for (const b of beobachter) b();
}

function gehoertZu(a: Entwurfsanhang, kontoId: string, kanalId: string, threadId: string | null) {
  return a.kontoId === kontoId && a.kanalId === kanalId && a.threadId === threadId;
}

export function anhaengeVon(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
): Entwurfsanhang[] {
  return [...speicher.values()].filter((a) => gehoertZu(a, kontoId, kanalId, threadId));
}

/** Das Wort zur Art eines Anhangs - die Bedeutung trägt das Wort, nicht das Zeichen. */
export function anhangArt(mime: string): string {
  return mime === 'application/pdf' ? 'PDF' : 'Foto';
}

/** Höchstens 120 Zeichen ohne Steuerzeichen - wie am Server. */
export function anhangName(name: string): string {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen sind genau, was hier fort soll.
  const sauber = name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return (sauber || 'Datei').slice(0, 120).trim();
}

async function hochladen(lokalId: string): Promise<void> {
  const eintrag = speicher.get(lokalId);
  const datei = dateien.get(lokalId);
  if (!eintrag || !datei) return;
  speicher.set(lokalId, { ...eintrag, zustand: 'laedt', fehler: null, erneut: false });
  melden();
  try {
    const anhang = await ladeAnhangHoch(eintrag.kanalId, datei, eintrag.name);
    const jetzt = speicher.get(lokalId);
    if (!jetzt) {
      // Während des Hochladens entfernt: dann auch am Server fort.
      void verwirfAnhang(anhang.id).catch(() => undefined);
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
    melden();
  }
}

/**
 * Hängt Dateien an den Entwurf und lädt sie hoch. Liefert, wie viele über
 * der Grenze von fünf liegen und deshalb nicht angehängt sind.
 */
export function anhaengen(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
  neue: readonly { datei: Blob; name: string }[],
): number {
  const frei = ANHAENGE_MAX - anhaengeVon(kontoId, kanalId, threadId).length;
  const angenommen = neue.slice(0, Math.max(0, frei));
  for (const { datei, name } of angenommen) {
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
      zustand: 'laedt',
      fehler: null,
      erneut: false,
      anhang: null,
    });
    dateien.set(lokalId, datei);
    void hochladen(lokalId);
  }
  if (angenommen.length > 0) melden();
  return neue.length - angenommen.length;
}

/** Ein gescheitertes Hochladen noch einmal. */
export function anhangErneut(lokalId: string): void {
  void hochladen(lokalId);
}

function freigeben(eintrag: Entwurfsanhang) {
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
 * Die fertigen Anhänge gehen mit der Nachricht: Sie verlassen den Entwurf,
 * ohne verworfen zu werden.
 */
export function anhaengeAbgeben(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
): Anhang[] {
  const fertig = anhaengeVon(kontoId, kanalId, threadId);
  const anhaenge = fertig.flatMap((a) => (a.anhang ? [a.anhang] : []));
  for (const eintrag of fertig) freigeben(eintrag);
  if (fertig.length > 0) melden();
  return anhaenge;
}

/** Alle Anhänge aller Konten fort - beim Abmelden und Kontowechsel. */
export function anhaengeLeeren(): void {
  if (speicher.size === 0) return;
  for (const eintrag of [...speicher.values()]) freigeben(eintrag);
  melden();
}

function abonnieren(rueckruf: () => void): () => void {
  beobachter.add(rueckruf);
  return () => beobachter.delete(rueckruf);
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
