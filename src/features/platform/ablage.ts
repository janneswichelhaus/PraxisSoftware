import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { fachAendern, fachLesen } from '@/lib/geraeteablage';
import {
  UebertragungAbgewiesen,
  einheitUebertragen,
  plaeneSchluessel,
  type EigenePlaene,
  type EigenerPlan,
  type Einheitsereignis,
} from './api';

/**
 * Die Durchführung ohne Netz (TRK-008, ADR-024 Punkte 5, 7 und 8, ANN-358).
 *
 * Auf dem Gerät liegen genau zwei Dinge:
 *
 *   * **der Plan der Einheit**, so wie er beim letzten Laden mit Verbindung
 *     war - nur zugewiesene, laufende Pläne, an denen der Zugang üben darf,
 *     und nur die Felder der Durchführungsansicht (`ablageplanSchema`);
 *   * **die Warteschlange** der Haken und des Endes, die der Server noch
 *     nicht angenommen hat.
 *
 * Jeder Haken kommt zuerst hierher und geht dann, sobald Verbindung und
 * offene Sitzung da sind, an den Server (`uebertragen`). Was der Server
 * annimmt, fällt aus der Warteschlange; was er abweist, fällt mit seinem
 * Grund in `abgewiesen` und wird der Person gezeigt. Ein Funkloch lässt
 * alles liegen. Niemand glaubt gespeichert zu haben, was nur lokal liegt
 * (ADR-001): `useWarteschlange` sagt, was noch auf dem Gerät wartet.
 */

const FACH = 'plattform';

const positionSchema = z.object({
  id: z.string(),
  position: z.number(),
  variant_lay_name: z.string(),
  instruction: z.string().nullable(),
  equipment: z.array(z.string()),
  sets: z.number(),
  reps_min: z.number().nullable(),
  reps_max: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  load: z.string().nullable(),
  tempo: z.string().nullable(),
  rest_seconds: z.number().nullable(),
  double_progression: z.boolean(),
  note: z.string().nullable(),
});

/**
 * ADR-024 Punkt 5: genau die Felder der Durchführungsansicht. Eine neue Spalte
 * ist eine Änderung mit Review (wie die Feldliste aus Punkt 6).
 */
const ablageplanSchema = z.object({
  id: z.string(),
  service_area: z.enum(['therapy', 'training']),
  title: z.string(),
  note_allowed: z.boolean(),
  open_session: z
    .object({
      id: z.string(),
      sets: z.array(z.object({ item_id: z.string(), set_number: z.number() })),
    })
    .nullable(),
  items: z.array(positionSchema),
});
export type Ablageplan = z.infer<typeof ablageplanSchema>;

const ereignisSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('set'),
    at: z.string(),
    item_id: z.string(),
    set_number: z.number(),
    done: z.boolean(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('finish'),
    at: z.string(),
    note: z.string(),
    values: z.record(z.string(), z.number()),
  }),
]);

const einheitSchema = z.object({
  id: z.string(),
  zugangId: z.string(),
  planId: z.string(),
  /** Der Tag des Geräts (ANN-357). */
  tag: z.string(),
  begonnenAm: z.string(),
  ereignisse: z.array(ereignisSchema),
});
export type WartendeEinheit = z.infer<typeof einheitSchema>;

const zugangsablageSchema = z.object({
  /** Für die lokale Ansicht: „für Erika Muster" bei einer Vertretung (ANN-358). */
  vertreten: z.string().nullable(),
  /** Der Tag der Praxis beim Laden: `open_session` gilt nur an diesem Tag. */
  tag: z.string(),
  plaene: z.array(ablageplanSchema),
});
type Zugangsablage = z.infer<typeof zugangsablageSchema>;

interface Fach {
  /** Je Zugang die Pläne, an denen er beim letzten Laden üben durfte. */
  zugaenge: Record<string, Zugangsablage>;
  einheiten: WartendeEinheit[];
  /**
   * Einheiten, die diese Fassung der Anwendung nicht lesen kann (etwa nach
   * einem Update). Sie bleiben liegen, statt still zu fallen (Zweitreview S2),
   * und gehen mit der Frist der Ablage.
   */
  unlesbar: unknown[];
}

const LEER: Fach = { zugaenge: {}, einheiten: [], unlesbar: [] };

/**
 * Das Fach lesen - Eintrag für Eintrag: Ein Plan, der nicht passt, fällt (er
 * kommt beim nächsten Laden wieder); eine Einheit nie (Zweitreview S2).
 */
function fach(roh: unknown): Fach {
  const f: Fach = { zugaenge: {}, einheiten: [], unlesbar: [] };
  if (roh === null || typeof roh !== 'object') return f;
  const r = roh as { zugaenge?: unknown; einheiten?: unknown; unlesbar?: unknown };
  if (r.zugaenge !== null && typeof r.zugaenge === 'object') {
    for (const [id, z] of Object.entries(r.zugaenge as Record<string, unknown>)) {
      const g = zugangsablageSchema.safeParse(z);
      if (g.success) f.zugaenge[id] = g.data;
    }
  }
  for (const e of Array.isArray(r.einheiten) ? (r.einheiten as unknown[]) : []) {
    const g = einheitSchema.safeParse(e);
    if (g.success) f.einheiten.push(g.data);
    else f.unlesbar.push(e);
  }
  if (Array.isArray(r.unlesbar)) f.unlesbar.push(...(r.unlesbar as unknown[]));
  return f;
}

/** Ein leeres Fach fällt ganz (`fachAendern` mit `undefined`). */
function oderNichts(f: Fach): Fach | undefined {
  return Object.keys(f.zugaenge).length === 0 && f.einheiten.length === 0 && f.unlesbar.length === 0
    ? undefined
    : f;
}

// -----------------------------------------------------------------------------
// Wer zuhört: die Ansichten, die sagen, was noch auf dem Gerät liegt.
// -----------------------------------------------------------------------------

export interface Abweisung {
  einheitId: string;
  planId: string;
  satz: string;
}

let abgewiesen: Abweisung[] = [];
const hoerer = new Set<() => void>();

function melden() {
  for (const h of hoerer) h();
}

/** Nur für Tests: alles Gemerkte vergessen. */
export function ablageZuruecksetzen(): void {
  abgewiesen = [];
  laeuft = null;
  nochmal = false;
  melden();
}

// -----------------------------------------------------------------------------
// Pläne
// -----------------------------------------------------------------------------

function alsAblageplan(p: EigenerPlan): Ablageplan {
  return ablageplanSchema.parse(p);
}

/**
 * Nach jedem Laden mit Verbindung: Die Pläne dieses Zugangs, an denen er
 * heute üben darf, ersetzen die abgelegten. Was der Server nicht mehr nennt,
 * fällt (ADR-024 Punkt 5). Die Frist der Ablage beginnt neu.
 */
export async function plaeneAblegen(
  besitzer: string,
  zugangId: string,
  vertreten: string | null,
  daten: EigenePlaene,
): Promise<void> {
  const plaene = daten.plans
    .filter((p) => p.status === 'assigned' && p.can_exercise && p.items.length > 0)
    .map(alsAblageplan);
  await fachAendern(
    besitzer,
    FACH,
    (alt) => {
      const f = fach(alt ?? LEER);
      if (plaene.length === 0) delete f.zugaenge[zugangId];
      else f.zugaenge[zugangId] = { vertreten, tag: daten.today, plaene };
      return oderNichts(f);
    },
    true,
  );
}

/**
 * Die Zugänge, die der Server beim Laden noch nennt. Pläne anderer Zugänge
 * (entzogen, gesperrt, abgelaufen) fallen; ihre Warteschlange bleibt - der
 * Server sagt bei der Übertragung, warum er sie nicht annimmt.
 */
export async function zugaengeAbgleichen(besitzer: string, zugangIds: string[]): Promise<void> {
  const bleiben = new Set(zugangIds);
  await fachAendern(besitzer, FACH, (alt) => {
    if (alt === undefined) return undefined;
    const f = fach(alt);
    for (const id of Object.keys(f.zugaenge)) if (!bleiben.has(id)) delete f.zugaenge[id];
    return oderNichts(f);
  });
}

export interface AbgelegterZugang {
  zugangId: string;
  vertreten: string | null;
  tag: string;
  plaene: Ablageplan[];
}

/**
 * Die abgelegten Zugänge mit ihren Plänen. Die heute begonnene Einheit gilt
 * nur, wenn am selben Tag geladen wurde; sonst gehört sie zu einem früheren
 * Tag und bleibt stehen (ANN-305, Zweitreview S1).
 */
export async function abgelegteZugaenge(besitzer: string): Promise<AbgelegterZugang[]> {
  const f = fach(await fachLesen(besitzer, FACH));
  const heute = geraetetag();
  return Object.entries(f.zugaenge).map(([zugangId, z]) => ({
    zugangId,
    ...z,
    plaene: z.tag === heute ? z.plaene : z.plaene.map((p) => ({ ...p, open_session: null })),
  }));
}

/**
 * Ein abgelegter Plan. Die heute begonnene Einheit gilt nur, wenn er heute
 * geladen wurde; sonst gehört sie zu einem früheren Tag und bleibt stehen
 * (ANN-305).
 */
export async function abgelegterPlan(
  besitzer: string,
  zugangId: string,
  planId: string,
): Promise<Ablageplan | undefined> {
  return (await abgelegteZugaenge(besitzer))
    .find((z) => z.zugangId === zugangId)
    ?.plaene.find((p) => p.id === planId);
}

// -----------------------------------------------------------------------------
// Warteschlange
// -----------------------------------------------------------------------------

/** Der heutige Tag nach der Uhr des Geräts (ANN-357). */
export function geraetetag(jetzt = new Date()): string {
  const j = jetzt.getFullYear();
  const m = String(jetzt.getMonth() + 1).padStart(2, '0');
  const t = String(jetzt.getDate()).padStart(2, '0');
  return `${j}-${m}-${t}`;
}

export async function wartendeEinheiten(besitzer: string): Promise<WartendeEinheit[]> {
  return fach(await fachLesen(besitzer, FACH)).einheiten;
}

/**
 * Ein Ereignis in die Warteschlange - erst hier, dann zum Server. Die
 * Einheit entsteht mit ihrem ersten Ereignis.
 */
export async function ereignisAblegen(
  besitzer: string,
  einheit: Omit<WartendeEinheit, 'ereignisse'>,
  ereignis: Einheitsereignis,
): Promise<void> {
  await fachAendern(besitzer, FACH, (alt) => {
    const f = fach(alt ?? LEER);
    const da = f.einheiten.find((e) => e.id === einheit.id);
    if (da) da.ereignisse.push(ereignis);
    else f.einheiten.push({ ...einheit, ereignisse: [ereignis] });
    return f;
  });
  melden();
}

/** Ergebnis einer Übertragung für die Ansicht, die sie angestoßen hat. */
export interface Uebertragungsergebnis {
  /** Einheiten, die vollständig angekommen sind. */
  angekommen: string[];
  /** Einheiten mit „schwierig, weil …" oder Angaben, die beim Eingang fielen. */
  angabenVerworfen: string[];
  /** Ein Funkloch: Was nicht ankam, liegt weiter auf dem Gerät. */
  ohneNetz: boolean;
}

let laeuft: Promise<Uebertragungsergebnis> | null = null;
let nochmal = false;

/** Der Weg zum Server; die Prüfseiten setzen einen eigenen ein. */
export type Sender = typeof einheitUebertragen;

async function einmalUebertragen(besitzer: string, senden: Sender): Promise<Uebertragungsergebnis> {
  const ergebnis: Uebertragungsergebnis = { angekommen: [], angabenVerworfen: [], ohneNetz: false };
  for (const einheit of await wartendeEinheiten(besitzer)) {
    if (einheit.ereignisse.length === 0) continue;
    const gesendet = new Set(einheit.ereignisse.map((e) => e.id));
    let fallen = false;
    let angenommen = false;
    try {
      const antwort = await senden(einheit.zugangId, einheit);
      if (antwort.status === 'closed') {
        // Die Einheit nimmt nichts mehr an - anderswo beendet (zweites Gerät,
        // Vertretung) oder von einem anderen Tag: Die Ereignisse gehören in
        // eine neue Einheit, statt still zu fallen (Zweitreview UEB-EPIC-003,
        // S1, S5). Ist am Tag schon eine offen, kommen sie dorthin.
        const neueId = crypto.randomUUID();
        await fachAendern(besitzer, FACH, (alt) => {
          const f = fach(alt ?? LEER);
          for (const e of f.einheiten) if (e.id === einheit.id) e.id = neueId;
          return f;
        });
        nochmal = true;
        continue;
      }
      if (antwort.note_dropped) ergebnis.angabenVerworfen.push(einheit.id);
      // Beendet - jetzt oder beim ersten Senden: An dieser Einheit ändert sich nichts mehr.
      fallen = antwort.status === 'finished' || einheit.ereignisse.some((e) => e.kind === 'finish');
      angenommen = true;
    } catch (fehler) {
      if (!(fehler instanceof UebertragungAbgewiesen)) {
        ergebnis.ohneNetz = true;
        break;
      }
      // ADR-024 Punkt 8: zeigen, warum, und danach verwerfen.
      abgewiesen.push({ einheitId: einheit.id, planId: einheit.planId, satz: fehler.message });
      fallen = true;
    }
    await fachAendern(besitzer, FACH, (alt) => {
      const f = fach(alt ?? LEER);
      f.einheiten = f.einheiten.flatMap((e) => {
        if (e.id !== einheit.id) return [e];
        if (fallen) return [];
        // Was während der Übertragung dazukam, bleibt für die nächste.
        const rest = e.ereignisse.filter((x) => !gesendet.has(x.id));
        return rest.length > 0 ? [{ ...e, ereignisse: rest }] : [];
      });
      return oderNichts(f);
    });
    if (angenommen) ergebnis.angekommen.push(einheit.id);
    melden();
  }
  return ergebnis;
}

/**
 * Alles Wartende an den Server - der Reihe nach, eine Übertragung zur Zeit.
 * Wer während einer laufenden anstößt, bekommt danach eine zweite. Nur in
 * offener Sitzung mit Verbindung aufrufen (ADR-025 Punkt 16): Die lokale
 * Ansicht nach der Freigabe ohne Netz überträgt nie.
 */
export function uebertragen(
  besitzer: string,
  senden: Sender = einheitUebertragen,
): Promise<Uebertragungsergebnis> {
  if (laeuft) {
    nochmal = true;
    return laeuft;
  }
  laeuft = (async () => {
    let ergebnis: Uebertragungsergebnis;
    do {
      nochmal = false;
      ergebnis = await einmalUebertragen(besitzer, senden);
    } while (nochmal && !ergebnis.ohneNetz);
    return ergebnis;
  })().finally(() => {
    laeuft = null;
  });
  return laeuft;
}

// -----------------------------------------------------------------------------
// Für die Ansichten
// -----------------------------------------------------------------------------

/**
 * Wer die Durchführung trägt: das Konto, dem die Ablage gehört, und ob
 * übertragen werden darf. Die Plattform setzt beides in offener Sitzung; die
 * lokale Ansicht nach der Freigabe ohne Netz setzt `uebertragen` auf `null`.
 */
export interface Durchfuehrungstraeger {
  besitzer: string;
  anstossen: (() => Promise<Uebertragungsergebnis>) | null;
}

export const DurchfuehrungKontext = createContext<Durchfuehrungstraeger | null>(null);

export function useDurchfuehrungstraeger(): Durchfuehrungstraeger {
  const t = useContext(DurchfuehrungKontext);
  if (!t) throw new Error('DurchfuehrungKontext fehlt.');
  return t;
}

export interface Wartestand {
  /** Einheiten mit noch nicht übertragenen Ereignissen. */
  einheiten: WartendeEinheit[];
  abgewiesen: Abweisung[];
}

/** Was noch auf dem Gerät wartet und was der Server abgewiesen hat - live. */
export function useWarteschlange(besitzer: string): Wartestand {
  const [stand, setStand] = useState<Wartestand>({ einheiten: [], abgewiesen });
  useEffect(() => {
    let aktiv = true;
    function neu() {
      void wartendeEinheiten(besitzer).then((einheiten) => {
        if (aktiv) setStand({ einheiten, abgewiesen: [...abgewiesen] });
      });
    }
    neu();
    hoerer.add(neu);
    return () => {
      aktiv = false;
      hoerer.delete(neu);
    };
  }, [besitzer]);
  return stand;
}

/** Eine gezeigte Abweisung schließen. */
export function abweisungGelesen(einheitId: string): void {
  abgewiesen = abgewiesen.filter((a) => a.einheitId !== einheitId);
  melden();
}

/**
 * Legt jede Antwort auf „Ihre Übungen" ab, die in offener Sitzung ankommt -
 * gleich, welche Seite sie geladen hat. Die eine Stelle für Punkt 5; die
 * Seiten selbst laden wie bisher.
 */
export function usePlaeneAblegen(
  besitzer: string,
  zugaenge: readonly { access_id: string; represented_name: string | null }[],
): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    void zugaengeAbgleichen(
      besitzer,
      zugaenge.map((z) => z.access_id),
    );
    const vertreten = new Map(zugaenge.map((z) => [z.access_id, z.represented_name]));
    const [art] = plaeneSchluessel('');
    return queryClient.getQueryCache().subscribe((ereignis) => {
      if (ereignis.type !== 'updated' || ereignis.action.type !== 'success') return;
      const [schluessel, zugangId] = ereignis.query.queryKey as readonly unknown[];
      if (schluessel !== art || typeof zugangId !== 'string' || !vertreten.has(zugangId)) return;
      void plaeneAblegen(
        besitzer,
        zugangId,
        vertreten.get(zugangId) ?? null,
        ereignis.action.data as EigenePlaene,
      );
    });
  }, [besitzer, zugaenge, queryClient]);
}
