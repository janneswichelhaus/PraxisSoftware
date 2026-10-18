import { useSyncExternalStore } from 'react';
import { TeamchatFehler, sendeNachricht, type Sendeauftrag } from './api';
import { nachrichtKennung } from './kennung';

/**
 * Der Ausgang des Teamchats (TEAM-002, ANN-641): Was gesendet ist, steht sofort
 * im Gespräch - mit „wird gesendet“, bis der Server es angenommen hat.
 *
 * * **Ohne Netz** wartet die Nachricht und geht beim nächsten Empfang von
 *   selbst - mit derselben Kennung, die das Gerät beim Senden vergeben hat
 *   (ADR-024 Punkt 7). Kam die erste Anfrage doch an und nur die Antwort
 *   verloren, legt der Server nichts doppelt an; und weil das Gerät die
 *   Kennung der Nachricht ebenso ableitet wie der Server (`kennung.ts`),
 *   steht sie im Verlauf auch nicht zweimal da.
 * * **Abgelehnt** (Kanal archiviert, Person fort) bleibt sie mit dem Grund
 *   stehen, bis die Person sie bearbeitet oder verwirft. Still verschwindet
 *   nichts.
 * * Nur im Arbeitsspeicher und an das Konto gebunden wie die Entwürfe; nach
 *   ADR-024 Punkt 4 ist eine Nachricht nichts, das auf dem Gerät liegt.
 */

export type Ausgangszustand = 'sendet' | 'wartet' | 'abgelehnt';

export interface Ausgangseintrag extends Sendeauftrag {
  kontoId: string;
  zustand: Ausgangszustand;
  /** Der feste Satz zur Ablehnung - nie der Text der Nachricht. */
  fehler: string | null;
  /** Zeitpunkt des Absendens, für die Reihenfolge im Gespräch. */
  erstellt: string;
  /**
   * Die Kennung, unter der der Server die Nachricht anlegt (`kennung.ts`) -
   * `null`, bis sie berechnet ist. Steht sie im Verlauf, ist die Nachricht
   * angekommen, auch wenn die Antwort noch fehlt.
   */
  serverId: string | null;
}

type NachErfolg = (eintrag: Ausgangseintrag) => void;

const speicher = new Map<string, Ausgangseintrag>();
const laufend = new Set<string>();
const rueckmeldungen = new Map<string, NachErfolg>();
const beobachter = new Set<() => void>();
let stand = 0;
let takt: ReturnType<typeof setInterval> | null = null;
let angemeldet = false;

/** So oft versucht eine wartende Nachricht es von selbst erneut. */
export const WIEDERHOLEN_MS = 15_000;

function melden() {
  stand += 1;
  for (const b of beobachter) b();
}

function taktPruefen() {
  const wartet = [...speicher.values()].some((e) => e.zustand === 'wartet');
  if (wartet && takt === null) {
    takt = setInterval(wiederholeWartende, WIEDERHOLEN_MS);
  } else if (!wartet && takt !== null) {
    clearInterval(takt);
    takt = null;
  }
}

function anmelden() {
  if (angemeldet || typeof window === 'undefined') return;
  angemeldet = true;
  // Mit dem Netz kommt der nächste Versuch sofort, nicht erst im Takt.
  window.addEventListener('online', wiederholeWartende);
}

async function versuchen(id: string): Promise<void> {
  const eintrag = speicher.get(id);
  if (!eintrag || laufend.has(id)) return;
  laufend.add(id);
  speicher.set(id, { ...eintrag, zustand: 'sendet', fehler: null });
  melden();
  try {
    await sendeNachricht(eintrag);
    const fertig = speicher.get(id);
    speicher.delete(id);
    const rueckruf = rueckmeldungen.get(id);
    rueckmeldungen.delete(id);
    if (fertig && rueckruf) rueckruf(fertig);
  } catch (fehler) {
    const jetzt = speicher.get(id);
    if (jetzt) {
      const netz = fehler instanceof TeamchatFehler ? fehler.netz : true;
      speicher.set(id, {
        ...jetzt,
        zustand: netz ? 'wartet' : 'abgelehnt',
        fehler: netz ? null : fehler instanceof Error ? fehler.message : null,
      });
    }
  } finally {
    laufend.delete(id);
    taktPruefen();
    melden();
  }
}

/**
 * Reiht eine Nachricht ein und sendet sie sofort. `nachErfolg` läuft, sobald
 * der Server sie angenommen hat - auch nach einem späteren Versuch.
 * `staffMemberId` ist die eigene Kennung im Team; mit ihr leitet das Gerät
 * die Kennung der Nachricht ab wie der Server.
 */
export function einreihen(
  kontoId: string,
  staffMemberId: string | null,
  auftrag: Sendeauftrag,
  nachErfolg?: NachErfolg,
): void {
  anmelden();
  speicher.set(auftrag.id, {
    ...auftrag,
    kontoId,
    zustand: 'sendet',
    fehler: null,
    erstellt: new Date().toISOString(),
    serverId: null,
  });
  if (nachErfolg) rueckmeldungen.set(auftrag.id, nachErfolg);
  melden();
  void versuchen(auftrag.id);
  if (staffMemberId && typeof crypto !== 'undefined' && crypto.subtle) {
    void nachrichtKennung(staffMemberId, auftrag.id)
      .then((serverId) => {
        const eintrag = speicher.get(auftrag.id);
        if (!eintrag) return;
        speicher.set(auftrag.id, { ...eintrag, serverId });
        melden();
      })
      .catch(() => undefined);
  }
}

/** Alle wartenden Nachrichten erneut - beim Wiederkehren des Netzes und im Takt. */
export function wiederholeWartende(): void {
  for (const eintrag of [...speicher.values()]) {
    if (eintrag.zustand === 'wartet') void versuchen(eintrag.id);
  }
}

/** Eine Nachricht von Hand erneut senden. */
export function erneutSenden(id: string): void {
  void versuchen(id);
}

/** Eine Nachricht aus dem Ausgang nehmen - verworfen oder zum Bearbeiten zurück ins Feld. */
export function ausgangEntfernen(id: string): Ausgangseintrag | undefined {
  const eintrag = speicher.get(id);
  speicher.delete(id);
  rueckmeldungen.delete(id);
  taktPruefen();
  melden();
  return eintrag;
}

/** Alles fort - beim Abmelden und Kontowechsel (wie die Entwürfe). */
export function ausgangLeeren(): void {
  speicher.clear();
  rueckmeldungen.clear();
  taktPruefen();
  melden();
}

/** Wie viele Nachrichten der Person noch nicht beim Server sind. */
export function offeneImAusgang(kontoId: string): number {
  return [...speicher.values()].filter((e) => e.kontoId === kontoId).length;
}

function abonnieren(rueckruf: () => void): () => void {
  beobachter.add(rueckruf);
  return () => beobachter.delete(rueckruf);
}

/** Der Ausgang eines Gesprächs oder Threads, in der Reihenfolge des Absendens. */
export function useAusgang(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
): Ausgangseintrag[] {
  useSyncExternalStore(abonnieren, () => stand);
  return [...speicher.values()]
    .filter((e) => e.kontoId === kontoId && e.kanalId === kanalId && e.threadId === threadId)
    .sort((a, b) => a.erstellt.localeCompare(b.erstellt));
}

/** Der ganze Ausgang der Person - für die Wache beim Abmelden. */
export function useAusgangsZahl(kontoId: string): number {
  useSyncExternalStore(abonnieren, () => stand);
  return offeneImAusgang(kontoId);
}
