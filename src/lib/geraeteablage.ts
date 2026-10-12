/**
 * Die Ablage auf dem Gerät (ADR-024 Punkte 5 und 9, TRK-EPIC-003, ANN-358).
 *
 * Was ohne Netz gebraucht wird, liegt hier und nirgends sonst: der Plan der
 * Durchführung, die Warteschlange der noch nicht übertragenen Haken und die
 * öffentlichen Schlüssel der eigenen Passkeys für die Freigabe ohne Netz.
 * Jedes Fach gehört dem Modul, das es schreibt, und wird beim Lesen von ihm
 * geprüft; diese Datei kennt nur die Grenzen, die für alle gelten:
 *
 *   * **ein Konto:** Die Ablage gehört dem Konto, das sie angelegt hat. Liest
 *     oder schreibt ein anderes, ist sie vorher leer (Kontowechsel).
 *   * **sieben Tage:** Liegt das letzte Laden mit Verbindung länger zurück,
 *     ist sie beim nächsten Zugriff leer.
 *   * **keine eigene Verschlüsselung** (ADR-024 Punkt 5, W2 a): Schutz sind
 *     Gerätesperre und Geräteverschlüsselung des Telefons.
 *
 * Abgelegt wird in IndexedDB, ein Datensatz für alles. Ohne IndexedDB (jsdom,
 * privates Fenster mancher Browser) liegt die Ablage nur im Speicher der
 * Seite und geht mit ihr.
 *
 * **Die Dauerablage** (OFF-001, ADR-024 Punkt 6, ANN-360) ist ein zweiter
 * Datensatz je Konto, für das, was nie von selbst fallen darf: die
 * Offline-Entwürfe der Dokumentation (§13) und die Einrichtung des
 * Diensttelefons. Sie fällt weder beim Kontowechsel noch nach sieben Tagen
 * noch beim Abmelden (`ablageLeeren`), sondern nur, wenn ihr Modul es
 * ausdrücklich sagt. Ein anderes Konto liest sie nie: Der Schlüssel ist das
 * Konto selbst.
 */

/** ADR-024 Punkt 5: die eine Frist; `app.offline_transfer_days()` hält dieselbe (ANN-357). */
export const OFFLINE_FRIST_TAGE = 7;

const FRIST_MS = OFFLINE_FRIST_TAGE * 24 * 60 * 60 * 1000;

export interface Ablagestand {
  /** Kennung des Kontos beim Anmeldedienst. */
  besitzer: string;
  /** Letztes Laden mit Verbindung (Uhr des Geräts, Millisekunden). */
  zuletztMitNetz: number;
  faecher: Record<string, unknown>;
}

export interface Ablagespeicher {
  holen(): Promise<Ablagestand | undefined>;
  legen(stand: Ablagestand): Promise<void>;
  leeren(): Promise<void>;
  /** Die Dauerablage eines Kontos (ANN-360). */
  dauerHolen(besitzer: string): Promise<Record<string, unknown> | undefined>;
  dauerLegen(besitzer: string, faecher: Record<string, unknown>): Promise<void>;
  dauerLeeren(besitzer: string): Promise<void>;
}

export function speicherImSpeicher(): Ablagespeicher {
  let stand: Ablagestand | undefined;
  const dauer = new Map<string, Record<string, unknown>>();
  return {
    dauerHolen: (besitzer) => {
      const d = dauer.get(besitzer);
      return Promise.resolve(d === undefined ? undefined : structuredClone(d));
    },
    dauerLegen: (besitzer, faecher) => {
      dauer.set(besitzer, structuredClone(faecher));
      return Promise.resolve();
    },
    dauerLeeren: (besitzer) => {
      dauer.delete(besitzer);
      return Promise.resolve();
    },
    holen: () => Promise.resolve(stand === undefined ? undefined : structuredClone(stand)),
    legen: (neu) => {
      stand = structuredClone(neu);
      return Promise.resolve();
    },
    leeren: () => {
      stand = undefined;
      return Promise.resolve();
    },
  };
}

const DATENBANK = 'praxis-geraeteablage';
const TABELLE = 'ablage';
const SCHLUESSEL = 'stand';

function anfrage<T>(a: IDBRequest<T>): Promise<T> {
  return new Promise((fertig, fehler) => {
    a.onsuccess = () => fertig(a.result);
    a.onerror = () => fehler(a.error ?? new Error('IndexedDB'));
  });
}

export function speicherInIndexedDb(): Ablagespeicher {
  let db: Promise<IDBDatabase> | null = null;
  function oeffnen(): Promise<IDBDatabase> {
    db ??= new Promise<IDBDatabase>((fertig, fehler) => {
      const a = indexedDB.open(DATENBANK, 1);
      a.onupgradeneeded = () => a.result.createObjectStore(TABELLE);
      a.onsuccess = () => fertig(a.result);
      a.onerror = () => {
        db = null;
        fehler(a.error ?? new Error('IndexedDB'));
      };
    });
    return db;
  }
  async function tabelle(modus: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await oeffnen()).transaction(TABELLE, modus).objectStore(TABELLE);
  }
  return {
    holen: async () => (await anfrage((await tabelle('readonly')).get(SCHLUESSEL))) as Ablagestand,
    legen: async (stand) => {
      await anfrage((await tabelle('readwrite')).put(stand, SCHLUESSEL));
    },
    leeren: async () => {
      await anfrage((await tabelle('readwrite')).delete(SCHLUESSEL));
    },
    dauerHolen: async (besitzer) =>
      (await anfrage((await tabelle('readonly')).get(`dauer:${besitzer}`))) as
        Record<string, unknown> | undefined,
    dauerLegen: async (besitzer, faecher) => {
      await anfrage((await tabelle('readwrite')).put(faecher, `dauer:${besitzer}`));
    },
    dauerLeeren: async (besitzer) => {
      await anfrage((await tabelle('readwrite')).delete(`dauer:${besitzer}`));
    },
  };
}

let speicher: Ablagespeicher =
  typeof indexedDB === 'undefined' ? speicherImSpeicher() : speicherInIndexedDb();

/** Nur für Tests: einen frischen Speicher einsetzen. */
export function speicherSetzen(neu: Ablagespeicher): void {
  speicher = neu;
  reihe = Promise.resolve();
}

/**
 * Alle Zugriffe laufen nacheinander: Lesen, Ändern, Schreiben eines Fachs
 * überholt kein zweites.
 */
let reihe: Promise<unknown> = Promise.resolve();
function nacheinander<T>(schritt: () => Promise<T>): Promise<T> {
  const ergebnis = reihe.then(schritt, schritt);
  reihe = ergebnis.catch(() => undefined);
  return ergebnis;
}

async function gueltigerStand(besitzer: string): Promise<Ablagestand | undefined> {
  const stand = await speicher.holen();
  if (stand === undefined) return undefined;
  if (stand.besitzer !== besitzer || Date.now() - stand.zuletztMitNetz > FRIST_MS) {
    await speicher.leeren();
    return undefined;
  }
  return stand;
}

/** Ein Fach lesen - `undefined`, wenn es fehlt, einem anderen Konto gehört oder zu alt ist. */
export function fachLesen(besitzer: string, fach: string): Promise<unknown> {
  return nacheinander(async () => (await gueltigerStand(besitzer))?.faecher[fach]);
}

/**
 * Ein Fach ändern. `mitNetz`: Der neue Inhalt kommt gerade vom Server - die
 * Frist beginnt neu. Ohne Netz geschriebenes (ein Haken) verlängert sie nicht.
 * Gibt `ändern` `undefined` zurück, fällt das Fach.
 */
export function fachAendern<T>(
  besitzer: string,
  fach: string,
  aendern: (alt: unknown) => T | undefined,
  mitNetz = false,
): Promise<T | undefined> {
  return nacheinander(async () => {
    const stand = (await gueltigerStand(besitzer)) ?? {
      besitzer,
      zuletztMitNetz: Date.now(),
      faecher: {},
    };
    const neu = aendern(stand.faecher[fach]);
    if (neu === undefined) delete stand.faecher[fach];
    else stand.faecher[fach] = neu;
    if (mitNetz) stand.zuletztMitNetz = Date.now();
    if (Object.keys(stand.faecher).length === 0) await speicher.leeren();
    else await speicher.legen(stand);
    return neu;
  });
}

/**
 * Alles weg: beim Abmelden und beim Kontowechsel (ADR-024 Punkt 5). Ein
 * Fehler des Browsers wird geschluckt - es gibt nichts, was die Person dann
 * anders machen könnte.
 */
export function ablageLeeren(): Promise<void> {
  return nacheinander(() => speicher.leeren()).catch(() => undefined);
}

// -----------------------------------------------------------------------------
// Die Dauerablage je Konto (OFF-001, ANN-360)
// -----------------------------------------------------------------------------

/** Ein Fach der Dauerablage lesen; `undefined`, wenn es fehlt. */
export function dauerfachLesen(besitzer: string, fach: string): Promise<unknown> {
  return nacheinander(async () => (await speicher.dauerHolen(besitzer))?.[fach]);
}

/**
 * Ein Fach der Dauerablage ändern. Gibt `ändern` `undefined` zurück, fällt
 * das Fach; ist danach keins mehr da, fällt der Datensatz des Kontos.
 */
export function dauerfachAendern<T>(
  besitzer: string,
  fach: string,
  aendern: (alt: unknown) => T | undefined,
): Promise<T | undefined> {
  return nacheinander(async () => {
    const faecher = (await speicher.dauerHolen(besitzer)) ?? {};
    const neu = aendern(faecher[fach]);
    if (neu === undefined) delete faecher[fach];
    else faecher[fach] = neu;
    if (Object.keys(faecher).length === 0) await speicher.dauerLeeren(besitzer);
    else await speicher.dauerLegen(besitzer, faecher);
    return neu;
  });
}
