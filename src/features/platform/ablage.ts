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
  // UEB-012 (Review ADR-024 Punkt 5): die Dosierfelder gehören zur
  // Durchführungsansicht; ein früher abgelegter Plan ohne sie bleibt lesbar
  // (Vorgaben). Ein abgelegtes Bild von früher fällt beim Lesen weg (ANN-539).
  sets: z.number(),
  reps_min: z.number().nullable(),
  reps_max: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  hold_seconds: z.number().nullable().default(null),
  per_side: z.boolean().default(false),
  times_per_day: z.number().nullable().default(null),
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
  /** Die Kennungen der Ereignisse, die mit der Einheit verworfen sind. */
  ereignisse: string[];
}

let abgewiesen: Abweisung[] = [];
const hoerer = new Set<() => void>();
/**
 * Zählt jede Änderung an Warteschlange und Abweisungen. Eine Lesung, die bei
 * Stand n beginnt, kennt alle Änderungen bis n - so weiß eine Ansicht, ob
 * ihr letzter Haken schon in dem steckt, was `useWarteschlange` sagt.
 */
let ablagestand = 0;

function melden() {
  ablagestand += 1;
  for (const h of hoerer) h();
}

/** Der Stand der Ablage nach der letzten Änderung (`useWarteschlange`). */
export function aktuellerAblagestand(): number {
  return ablagestand;
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
 * Einheit entsteht mit ihrem ersten Ereignis. Gibt zurück, in welcher
 * Einheit das Ereignis liegt und unter welcher Kennung - danach fragt die
 * Ansicht, ob es noch wartet oder abgewiesen ist.
 *
 * **Das Ende bleibt das letzte Ereignis** (BEF-213): Der Server weist eine
 * Einheit ab, in der nach `finish` noch etwas kommt, und die Ablage verwürfe
 * sie dann ganz, samt Haken und Ende. Ist die Einheit auf dem Gerät schon
 * beendet - ein zweites Fenster, ein Tipp während des Beendens -, kommt ein
 * Haken in die offene Einheit desselben Tages oder in eine neue, so wie der
 * Server nach einer anderswo beendeten Einheit („closed“) verfährt. Ein
 * zweites Ende fällt weg; es gilt das erste.
 */
export async function ereignisAblegen(
  besitzer: string,
  einheit: Omit<WartendeEinheit, 'ereignisse'>,
  ereignis: Einheitsereignis,
): Promise<{ einheitId: string; ereignisId: string }> {
  let ziel = { einheitId: einheit.id, ereignisId: ereignis.id };
  await fachAendern(besitzer, FACH, (alt) => {
    const f = fach(alt ?? LEER);
    const beendet = (e: WartendeEinheit) => e.ereignisse.some((x) => x.kind === 'finish');
    let da = f.einheiten.find((e) => e.id === einheit.id);
    if (da && beendet(da) && ereignis.kind === 'finish') {
      const erstes = da.ereignisse.find((x) => x.kind === 'finish')!;
      ziel = { einheitId: da.id, ereignisId: erstes.id };
      return f;
    }
    if (da && beendet(da)) {
      da = f.einheiten.find(
        (e) =>
          e.zugangId === einheit.zugangId &&
          e.planId === einheit.planId &&
          e.tag === einheit.tag &&
          !beendet(e),
      );
      if (!da) {
        da = { ...einheit, id: crypto.randomUUID(), ereignisse: [] };
        f.einheiten.push(da);
      }
    }
    if (da) da.ereignisse.push(ereignis);
    else f.einheiten.push({ ...einheit, ereignisse: [ereignis] });
    ziel = { einheitId: da?.id ?? einheit.id, ereignisId: ereignis.id };
    return f;
  });
  melden();
  return ziel;
}

/** Ergebnis einer Übertragung für die Ansicht, die sie angestoßen hat. */
export interface Uebertragungsergebnis {
  /** Einheiten, die vollständig angekommen sind. */
  angekommen: string[];
  /** Einheiten mit „schwierig, weil …" oder Angaben, die beim Eingang fielen. */
  angabenVerworfen: string[];
  /** Was der Server in diesem Lauf abgewiesen hat, mit den Ereignissen. */
  abgewiesen: Abweisung[];
  /** Ein Funkloch: Was nicht ankam, liegt weiter auf dem Gerät. */
  ohneNetz: boolean;
}

function leeresErgebnis(): Uebertragungsergebnis {
  return { angekommen: [], angabenVerworfen: [], abgewiesen: [], ohneNetz: false };
}

let laeuft: Promise<Uebertragungsergebnis> | null = null;
let nochmal = false;

/** Der Weg zum Server; die Prüfseiten setzen einen eigenen ein. */
export type Sender = typeof einheitUebertragen;

async function einmalUebertragen(besitzer: string, senden: Sender): Promise<Uebertragungsergebnis> {
  const ergebnis = leeresErgebnis();
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
      // ADR-024 Punkt 8: zeigen, warum, und danach verwerfen. Verworfen wird
      // alles der Einheit, auch was während der Übertragung dazukam.
      const abweisung: Abweisung = {
        einheitId: einheit.id,
        planId: einheit.planId,
        satz: fehler.message,
        ereignisse: einheit.ereignisse.map((e) => e.id),
      };
      abgewiesen.push(abweisung);
      ergebnis.abgewiesen.push(abweisung);
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
    // Über alle Runden gesammelt: Ein Ende, das in einer früheren Runde ankam
    // oder abgewiesen wurde, fehlte sonst im Ergebnis.
    const gesamt = leeresErgebnis();
    let ergebnis: Uebertragungsergebnis;
    do {
      nochmal = false;
      ergebnis = await einmalUebertragen(besitzer, senden);
      gesamt.angekommen.push(...ergebnis.angekommen);
      gesamt.angabenVerworfen.push(...ergebnis.angabenVerworfen);
      gesamt.abgewiesen.push(...ergebnis.abgewiesen);
      gesamt.ohneNetz = ergebnis.ohneNetz;
    } while (nochmal && !ergebnis.ohneNetz);
    return gesamt;
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
  /**
   * Bis zu welchem Stand der Ablage (`aktuellerAblagestand`) das gelesen ist;
   * -1, solange noch nichts gelesen ist.
   */
  gelesenBis: number;
}

/** Was noch auf dem Gerät wartet und was der Server abgewiesen hat - live. */
export function useWarteschlange(besitzer: string): Wartestand {
  const [stand, setStand] = useState<Wartestand>({
    einheiten: [],
    abgewiesen,
    gelesenBis: -1,
  });
  useEffect(() => {
    let aktiv = true;
    function neu() {
      const bis = ablagestand;
      void wartendeEinheiten(besitzer).then((einheiten) => {
        // Lesungen können sich überholen: Eine ältere überschreibt keine neuere.
        if (aktiv) {
          setStand((alt) =>
            alt.gelesenBis > bis
              ? alt
              : { einheiten, abgewiesen: [...abgewiesen], gelesenBis: bis },
          );
        }
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
