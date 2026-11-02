import type { Abruf, Art, Eintrag, Quelle } from './typen.ts';

// Wessen Termine eine Adresse öffnet, entscheidet allein die Datenbank (`calendar_feed`, ANN-838);
// der eigene Schlüssel der Function ruft genau diese eine Funktion (ANN-839).

const TIMEOUT_MS = 5_000;
const ARTEN: readonly string[] = ['home_visit', 'practice', 'video'];
const UID = /^[0-9a-f]{64}$/;

interface Optionen {
  readonly supabaseUrl: string;
  readonly adminKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

function alsEintrag(roh: unknown): Eintrag | null {
  if (typeof roh !== 'object' || roh === null) return null;
  const { uid, beginn, ende, art } = roh as Record<string, unknown>;
  if (typeof uid !== 'string' || !UID.test(uid)) return null;
  if (typeof art !== 'string' || !ARTEN.includes(art)) return null;
  if (typeof beginn !== 'string' || typeof ende !== 'string') return null;
  const von = new Date(beginn);
  const bis = new Date(ende);
  if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime()) || bis <= von) return null;
  return { uid, beginn: von, ende: bis, art: art as Art };
}

export function erstelleQuelle({
  supabaseUrl,
  adminKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: Optionen): Quelle {
  const basis = supabaseUrl.trim().replace(/\/+$/, '');
  const schluessel = adminKey.trim();

  async function lies(adresse: string): Promise<Abruf> {
    let antwort: Response;
    try {
      antwort = await abrufen(`${basis}/rest/v1/rpc/calendar_feed`, {
        method: 'POST',
        headers: {
          apikey: schluessel,
          Authorization: `Bearer ${schluessel}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_token: adresse }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false };
    }
    if (!antwort.ok) return { ok: false };
    let koerper: unknown;
    try {
      koerper = await antwort.json();
    } catch {
      return { ok: false };
    }
    if (koerper === null) return { ok: true, eintraege: null };
    if (!Array.isArray(koerper)) return { ok: false };
    const eintraege = koerper.map(alsEintrag);
    // Ein einziger unlesbarer Termin verwirft die Datei, statt eine halbe auszuliefern.
    if (eintraege.some((eintrag) => eintrag === null)) return { ok: false };
    return { ok: true, eintraege: eintraege as Eintrag[] };
  }

  return { lies };
}
