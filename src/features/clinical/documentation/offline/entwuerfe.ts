import { useEffect, useState } from 'react';
import { z } from 'zod';
import { dauerfachAendern, dauerfachLesen } from '@/lib/geraeteablage';
import { MAX_ZEICHEN, wieGespeichert } from '../api';
import {
  EntwurfAbgewiesen,
  EntwurfNichtAngekommen,
  entwurfUebertragen,
  sitzungskonto,
} from './api';

/**
 * Die Offline-Entwürfe der Dokumentation (OFF-002, ADR-024 Punkte 6 bis 8,
 * ANN-362).
 *
 * Ein Entwurf entsteht auf einem eingerichteten Diensttelefon am Termin des
 * Tagesplans und liegt in der Dauerablage des Kontos (ANN-360): Er fällt nie
 * von selbst, nicht mit dem Tagesplan, nicht mit dem Abmelden, nicht nach
 * einer Frist (§13). Er fällt, wenn
 *
 *   * der Server ihn angenommen hat (`created`, `known`), oder
 *   * die Person ihn ausdrücklich verwirft (`entwurfVerwerfen`), etwa nachdem
 *     sie ihn in eine Korrektur oder einen Nachtrag übernommen hat.
 *
 * Sonst bleibt er stehen, mit seinem Zustand: `wartet` (noch nicht
 * übertragen), `konflikt` (am Termin gibt es schon eine Dokumentation; nichts
 * eingemischt, ADR-024 Punkt 7) oder `abgewiesen` (der Server hat beim Eingang
 * nein gesagt, mit Grund; Punkt 8). Nur ein wartender Entwurf ist zu
 * bearbeiten. Niemand glaubt gespeichert zu haben, was nur lokal liegt
 * (ADR-001): `useEntwuerfe` sagt, was noch auf dem Gerät liegt.
 */

const FACH = 'entwuerfe';

/** Was der Entwurf vom Termin weiß - damit er auch ohne Tagesplan lesbar bleibt. */
const kopfSchema = z.object({
  beginn: z.string(),
  ende: z.string(),
  zeitzone: z.string(),
  name: z.string(),
  terminart: z.string(),
});
export type Entwurfskopf = z.infer<typeof kopfSchema>;

const entwurfSchema = z.object({
  /** Die Kennung, die das Gerät vergibt (UUID, ADR-024 Punkt 7). */
  id: z.string(),
  terminId: z.string(),
  kopf: kopfSchema,
  text: z.string(),
  begonnenAm: z.string(),
  /** Letzte Änderung nach der Uhr des Geräts - geht als Angabe an den Server. */
  geschriebenAm: z.string(),
  zustand: z.enum(['wartet', 'konflikt', 'abgewiesen']),
  grund: z.string().nullable(),
  /** Bei `konflikt`: die Dokumentation, die am Termin schon steht. */
  vorhanden: z.object({ id: z.string(), status: z.enum(['draft', 'final']) }).nullable(),
});
export type Entwurf = z.infer<typeof entwurfSchema>;

interface Fach {
  entwuerfe: Entwurf[];
  /**
   * Was diese Fassung der Anwendung nicht lesen kann (etwa nach einem
   * Update). Es bleibt liegen, statt still zu fallen (§13).
   */
  unlesbar: unknown[];
}

function fach(roh: unknown): Fach {
  const f: Fach = { entwuerfe: [], unlesbar: [] };
  if (roh === null || typeof roh !== 'object') return f;
  const r = roh as { entwuerfe?: unknown; unlesbar?: unknown };
  for (const e of Array.isArray(r.entwuerfe) ? (r.entwuerfe as unknown[]) : []) {
    const g = entwurfSchema.safeParse(e);
    if (g.success) f.entwuerfe.push(g.data);
    else f.unlesbar.push(e);
  }
  if (Array.isArray(r.unlesbar)) f.unlesbar.push(...(r.unlesbar as unknown[]));
  return f;
}

function oderNichts(f: Fach): Fach | undefined {
  return f.entwuerfe.length === 0 && f.unlesbar.length === 0 ? undefined : f;
}

const hoerer = new Set<() => void>();
function melden() {
  for (const h of hoerer) h();
}

export async function entwuerfeLesen(besitzer: string): Promise<Entwurf[]> {
  return fach(await dauerfachLesen(besitzer, FACH)).entwuerfe;
}

/** Der Entwurf, an dem am Termin weitergeschrieben wird - nur ein wartender. */
export async function entwurfAmTermin(
  besitzer: string,
  terminId: string,
): Promise<Entwurf | undefined> {
  return (await entwuerfeLesen(besitzer)).find(
    (e) => e.terminId === terminId && e.zustand === 'wartet',
  );
}

/**
 * Schreibt den Text eines Termins auf das Gerät - beim ersten Zeichen neu,
 * danach in denselben Entwurf. Ein geleertes Feld lässt den Entwurf fallen:
 * Da ist nichts mehr, was verloren gehen könnte. Länger als die
 * Dokumentation erlaubt (`MAX_ZEICHEN`) wird nicht gespeichert.
 */
export async function entwurfSchreiben(
  besitzer: string,
  terminId: string,
  kopf: Entwurfskopf,
  text: string,
  jetzt = new Date(),
  /**
   * Nie in einen vorhandenen Entwurf schreiben, sondern einen eigenen
   * anlegen - für die Schreibseite, die den Entwurf auf dem Gerät nicht
   * kennt (Zweitreview S1).
   */
  immerNeu = false,
): Promise<Entwurf | undefined> {
  if (text.length > MAX_ZEICHEN) throw new Error('zu lang');
  let neueId: string | null = null;
  const leer = wieGespeichert(text) === '';
  const ergebnis = await dauerfachAendern(besitzer, FACH, (alt) => {
    const f = fach(alt);
    const da = immerNeu
      ? undefined
      : f.entwuerfe.find((e) => e.terminId === terminId && e.zustand === 'wartet');
    if (leer) {
      if (immerNeu) return oderNichts(f);
      f.entwuerfe = f.entwuerfe.filter((e) => e !== da);
      return oderNichts(f);
    }
    if (da) {
      da.text = text;
      da.geschriebenAm = jetzt.toISOString();
    } else {
      neueId = crypto.randomUUID();
      f.entwuerfe.push({
        id: neueId,
        terminId,
        kopf,
        text,
        begonnenAm: jetzt.toISOString(),
        geschriebenAm: jetzt.toISOString(),
        zustand: 'wartet',
        grund: null,
        vorhanden: null,
      });
    }
    return f;
  });
  melden();
  return ergebnis?.entwuerfe.find((e) =>
    neueId ? e.id === neueId : e.terminId === terminId && e.zustand === 'wartet',
  );
}

/** Ausdrücklich verwerfen - der einzige Weg, auf dem ein Entwurf ohne Server fällt. */
export async function entwurfVerwerfen(besitzer: string, id: string): Promise<void> {
  await dauerfachAendern(besitzer, FACH, (alt) => {
    const f = fach(alt);
    f.entwuerfe = f.entwuerfe.filter((e) => e.id !== id);
    return oderNichts(f);
  });
  melden();
}

/**
 * Einen abgewiesenen Entwurf noch einmal senden (BEF-150): Hat die Person das
 * Recht inzwischen wieder - etwa nach einer Vertretung -, muss sie den Text
 * nicht kopieren. Er wartet wieder und geht mit der nächsten Übertragung
 * hinaus; weist der Server erneut ab, steht er wieder hier. Liegt am Termin
 * schon ein neuer wartender Entwurf, bleibt er abgewiesen (`false`): Zwei
 * wartende Texte am selben Termin kämen als Konflikt an.
 */
export async function entwurfErneutSenden(besitzer: string, id: string): Promise<boolean> {
  let erneut = false;
  await dauerfachAendern(besitzer, FACH, (alt) => {
    const f = fach(alt);
    const e = f.entwuerfe.find((x) => x.id === id && x.zustand === 'abgewiesen');
    if (!e) return oderNichts(f);
    if (f.entwuerfe.some((x) => x.terminId === e.terminId && x.zustand === 'wartet')) {
      return oderNichts(f);
    }
    e.zustand = 'wartet';
    e.grund = null;
    erneut = true;
    return f;
  });
  melden();
  if (erneut) uebertragungAnstossen();
  return erneut;
}

/**
 * Wie viele Einträge diese Fassung der Anwendung nicht lesen kann (BEF-150).
 * Sie zählen beim Hinweis und beim Abmelden mit, damit „Verwerfen und
 * abmelden" sie nicht ungenannt mitnimmt.
 */
export async function unlesbareZaehlen(besitzer: string): Promise<number> {
  return fach(await dauerfachLesen(besitzer, FACH)).unlesbar.length;
}

/** Beim ausdrücklichen Verwerfen vor dem Abmelden: alles dieses Kontos. */
export async function alleEntwuerfeVerwerfen(besitzer: string): Promise<void> {
  await dauerfachAendern(besitzer, FACH, () => undefined);
  melden();
}

// -----------------------------------------------------------------------------
// Übertragung
// -----------------------------------------------------------------------------

export type EntwurfSender = typeof entwurfUebertragen;

export interface Uebertragungsstand {
  /** Entwürfe, die der Server angenommen hat (sie sind vom Gerät gefallen). */
  angekommen: number;
  /** Funkloch oder gesperrte Sitzung: Was nicht ankam, liegt weiter auf dem Gerät. */
  unterbrochen: boolean;
}

function aendern(besitzer: string, id: string, wie: (e: Entwurf) => Entwurf | null) {
  return dauerfachAendern(besitzer, FACH, (alt) => {
    const f = fach(alt);
    f.entwuerfe = f.entwuerfe.flatMap((e) => {
      if (e.id !== id) return [e];
      const neu = wie(e);
      return neu ? [neu] : [];
    });
    return oderNichts(f);
  });
}

/**
 * Termine, an denen gerade auf dem Gerät geschrieben wird: Die Übertragung
 * lässt sie aus, bis das Feld geschlossen ist - sonst käme ein halber Text an
 * und der Rest als Konflikt hinterher.
 */
const inBearbeitung = new Map<string, number>();

export function bearbeitungBeginnen(terminId: string): () => void {
  inBearbeitung.set(terminId, (inBearbeitung.get(terminId) ?? 0) + 1);
  return () => {
    const n = (inBearbeitung.get(terminId) ?? 1) - 1;
    if (n <= 0) inBearbeitung.delete(terminId);
    else inBearbeitung.set(terminId, n);
    uebertragungAnstossen();
  };
}

/**
 * Wer in offener Sitzung überträgt (`PraxisAblage`), meldet sich hier an; die
 * lokale Ansicht ohne Netz meldet niemanden an und überträgt deshalb nie.
 */
let anstosser: (() => void) | null = null;

export function uebertragungAnmelden(anstossen: () => void): () => void {
  anstosser = anstossen;
  return () => {
    if (anstosser === anstossen) anstosser = null;
  };
}

export function uebertragungAnstossen(): void {
  anstosser?.();
}

/** Je Konto eine Übertragung zur Zeit (Zweitreview B2). */
const laufend = new Map<string, Promise<Uebertragungsstand>>();
const nochmal = new Set<string>();

export type Kontofrage = () => Promise<string | null>;

async function einmal(
  besitzer: string,
  senden: EntwurfSender,
  konto: Kontofrage,
): Promise<Uebertragungsstand> {
  const stand: Uebertragungsstand = { angekommen: 0, unterbrochen: false };
  for (const e of await entwuerfeLesen(besitzer)) {
    if (e.zustand !== 'wartet' || wieGespeichert(e.text) === '') continue;
    if (inBearbeitung.has(e.terminId)) continue;
    // Vor jedem Senden: Gehört die Sitzung noch diesem Konto? Abgemeldet
    // oder ein anderes Konto angemeldet - dann endet die Runde, und nichts
    // geht unter fremdem Namen hinaus (Zweitreview B2).
    if ((await konto().catch(() => null)) !== besitzer) {
      stand.unterbrochen = true;
      break;
    }
    try {
      const antwort = await senden(e);
      if (antwort.status === 'conflict') {
        // Nichts eingemischt: beide Fassungen zeigen, Wege aus ANN-320.
        await aendern(besitzer, e.id, (x) => ({
          ...x,
          zustand: 'konflikt',
          vorhanden: { id: antwort.note_id, status: antwort.note_status ?? 'draft' },
        }));
      } else {
        await aendern(besitzer, e.id, (x) =>
          // Während der Übertragung weitergeschrieben: Der Server hat den
          // älteren Text. Der neuere bleibt stehen, als Fassung neben dem
          // angekommenen Entwurf - er fällt nicht still (§13).
          x.text === e.text
            ? null
            : { ...x, zustand: 'konflikt', vorhanden: { id: antwort.note_id, status: 'draft' } },
        );
        stand.angekommen += 1;
      }
    } catch (fehler) {
      // Nur an diesem Entwurf: er wartet weiter, die übrigen gehen hinaus
      // (Zweitreview S5).
      if (fehler instanceof EntwurfNichtAngekommen) continue;
      if (!(fehler instanceof EntwurfAbgewiesen)) {
        stand.unterbrochen = true;
        break;
      }
      // ADR-024 Punkt 8: Der Text bleibt stehen, bis die Person ihn verwirft.
      await aendern(besitzer, e.id, (x) => ({
        ...x,
        zustand: 'abgewiesen',
        grund: fehler.message,
      }));
    }
    melden();
  }
  return stand;
}

/**
 * Alles Wartende an den Server - der Reihe nach, eine Übertragung zur Zeit.
 * Nur in offener Sitzung mit Verbindung aufrufen (ADR-025 Punkt 16): Die
 * lokale Ansicht nach der Freigabe ohne Netz überträgt nie.
 */
export function entwuerfeUebertragen(
  besitzer: string,
  senden: EntwurfSender = entwurfUebertragen,
  konto: Kontofrage = sitzungskonto,
): Promise<Uebertragungsstand> {
  const da = laufend.get(besitzer);
  if (da) {
    nochmal.add(besitzer);
    return da;
  }
  const neu = (async () => {
    let stand: Uebertragungsstand;
    do {
      nochmal.delete(besitzer);
      stand = await einmal(besitzer, senden, konto);
    } while (nochmal.has(besitzer) && !stand.unterbrochen);
    return stand;
  })().finally(() => {
    laufend.delete(besitzer);
    nochmal.delete(besitzer);
  });
  laufend.set(besitzer, neu);
  return neu;
}

/** Nur für Tests. */
export function entwuerfeZuruecksetzen(): void {
  laufend.clear();
  nochmal.clear();
  inBearbeitung.clear();
  anstosser = null;
}

/** Was auf dem Gerät liegt - live; `undefined`, solange gelesen wird. */
export function useEntwuerfe(besitzer: string): Entwurf[] | undefined {
  const [stand, setStand] = useState<Entwurf[] | undefined>(undefined);
  useEffect(() => {
    let aktiv = true;
    const neu = () =>
      void entwuerfeLesen(besitzer).then(
        (e) => {
          if (aktiv) setStand(e);
        },
        () => {
          if (aktiv) setStand([]);
        },
      );
    neu();
    hoerer.add(neu);
    return () => {
      aktiv = false;
      hoerer.delete(neu);
    };
  }, [besitzer]);
  return stand;
}

/** Die Zahl der unlesbaren Einträge - live; 0, solange gelesen wird (BEF-150). */
export function useUnlesbare(besitzer: string): number {
  const [zahl, setZahl] = useState(0);
  useEffect(() => {
    let aktiv = true;
    const neu = () =>
      void unlesbareZaehlen(besitzer).then(
        (n) => {
          if (aktiv) setZahl(n);
        },
        () => undefined,
      );
    neu();
    hoerer.add(neu);
    return () => {
      aktiv = false;
      hoerer.delete(neu);
    };
  }, [besitzer]);
  return zahl;
}

/** „ein Entwurf“, „2 Entwürfe“ – für Hinweise und Rückfragen. */
export function zahlSatz(n: number): string {
  return n === 1 ? 'ein Entwurf' : `${n} Entwürfe`;
}

/** „ein Eintrag, den …“, „2 Einträge, die …“ – unlesbare Einträge (BEF-150). */
export function unlesbarSatz(n: number): string {
  return n === 1
    ? 'ein Eintrag, den diese Fassung der Anwendung nicht lesen kann'
    : `${n} Einträge, die diese Fassung der Anwendung nicht lesen kann`;
}
