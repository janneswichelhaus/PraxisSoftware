import { useSyncExternalStore } from 'react';
import { TeamchatFehler, sendeNachricht, type Anhang, type Sendeauftrag } from './api';
import {
  anhaengeBeobachten,
  anhaengeDerNachricht,
  anhaengeZurueck,
  gebundeneErneut,
  gebundeneFreigeben,
  gebundeneVerwerfen,
  type Entwurfsanhang,
} from './entwurfsanhaenge';
import { nachrichtKennung } from './kennung';
import { dauerSekunden } from './sprachnachricht';
import { WIEDERHOLEN_MS } from './takt';

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
 * * **Anhänge, die noch laden** (TEAM-005, ANN-654): Die Nachricht steht mit
 *   „Lädt Anhänge hoch …“ da und geht von selbst, sobald alle oben sind -
 *   zum Server erst dann (ADR-017 Punkt 74). Scheitert einer endgültig,
 *   bleibt sie mit seinem Grund stehen. Bis der Server sie annimmt, hängen
 *   die Anhänge an ihr: „Bearbeiten“ holt Text und Anhänge zurück ins Feld.
 */

export type Ausgangszustand = 'laedt' | 'sendet' | 'wartet' | 'abgelehnt';

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
  /** Beim Laden: Ein Anhang scheiterte am Netz und wartet auf Empfang. */
  anhaengeOhneNetz: boolean;
}

type NachErfolg = (eintrag: Ausgangseintrag) => void;

const speicher = new Map<string, Ausgangseintrag>();
const laufend = new Set<string>();
const rueckmeldungen = new Map<string, NachErfolg>();
const beobachter = new Set<() => void>();
let stand = 0;
let takt: ReturnType<typeof setInterval> | null = null;
let angemeldet = false;

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

let anhaengeBeobachtet = false;

function anmelden() {
  if (!anhaengeBeobachtet) {
    anhaengeBeobachtet = true;
    // Ist ein Anhang oben oder gescheitert, geht es mit seiner Nachricht weiter.
    anhaengeBeobachten(anhaengeGeaendert);
  }
  if (angemeldet || typeof window === 'undefined') return;
  angemeldet = true;
  // Mit dem Netz kommt der nächste Versuch sofort, nicht erst im Takt.
  window.addEventListener('online', wiederholeWartende);
}

/** Wie ein Anhang in der Nachricht steht, solange er lädt - ohne Öffnen. */
function vorschau(a: Entwurfsanhang): Anhang {
  return (
    a.anhang ?? {
      id: a.lokalId,
      name: a.name,
      mime_type: a.mime,
      byte_size: a.groesse,
      verified: false,
      duration_seconds: a.dauer === null ? null : dauerSekunden(a.dauer),
    }
  );
}

/**
 * Bevor eine Nachricht mit Anhängen hinausgeht (ANN-654): Sind alle oben,
 * geht sie mit ihnen; lädt einer noch, wartet sie; ist einer endgültig
 * gescheitert, bleibt sie mit seinem Grund stehen. Liefert die Anhänge zum
 * Senden oder `null`, wenn sie noch nicht geht.
 */
function anhaengeBereit(id: string, eintrag: Ausgangseintrag): readonly Anhang[] | null {
  const gebunden = anhaengeDerNachricht(id);
  if (gebunden.length === 0) return eintrag.anhaenge;
  const anhaenge = gebunden.map(vorschau);
  const gescheitert = gebunden.find((a) => a.zustand === 'fehler' && !a.erneut);
  if (gescheitert) {
    speicher.set(id, {
      ...eintrag,
      anhaenge,
      zustand: 'abgelehnt',
      fehler: `${gescheitert.name}: ${gescheitert.fehler ?? 'Der Anhang konnte nicht hochgeladen werden.'}`,
      anhaengeOhneNetz: false,
    });
    return null;
  }
  if (gebunden.some((a) => a.zustand !== 'bereit')) {
    speicher.set(id, {
      ...eintrag,
      anhaenge,
      zustand: 'laedt',
      fehler: null,
      anhaengeOhneNetz: gebunden.some((a) => a.zustand === 'fehler'),
    });
    return null;
  }
  return anhaenge;
}

async function versuchen(id: string): Promise<void> {
  const eintrag = speicher.get(id);
  if (!eintrag || laufend.has(id)) return;
  const anhaenge = anhaengeBereit(id, eintrag);
  if (anhaenge === null) {
    melden();
    return;
  }
  laufend.add(id);
  speicher.set(id, {
    ...eintrag,
    anhaenge,
    zustand: 'sendet',
    fehler: null,
    anhaengeOhneNetz: false,
  });
  melden();
  try {
    await sendeNachricht({ ...eintrag, anhaenge });
    const fertig = speicher.get(id);
    speicher.delete(id);
    // Erst jetzt gehören die Anhänge zur Nachricht beim Server.
    gebundeneFreigeben(id);
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
    anhaengeOhneNetz: false,
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

/** Ein Anhang ist oben oder gescheitert: Nachrichten, die auf ihre Anhänge warten, weiter. */
function anhaengeGeaendert(): void {
  for (const eintrag of [...speicher.values()]) {
    if (eintrag.zustand === 'laedt') void versuchen(eintrag.id);
  }
}

/** Eine Nachricht von Hand erneut senden - am Netz gescheiterte Anhänge mit. */
export function erneutSenden(id: string): void {
  gebundeneErneut(id);
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

/** „Bearbeiten“: Die Nachricht verlässt den Ausgang, ihre Anhänge kehren in den Entwurf zurück. */
export function ausgangZurueckInsFeld(id: string): Ausgangseintrag | undefined {
  const eintrag = ausgangEntfernen(id);
  anhaengeZurueck(id);
  return eintrag;
}

/** „Verwerfen“: Die Nachricht und ihre Anhänge fallen - die Anhänge auch am Server. */
export function ausgangVerwerfen(id: string): void {
  ausgangEntfernen(id);
  gebundeneVerwerfen(id);
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
