import type { Abruf, Art, Eintrag, Quelle } from './typen.ts';

// Wessen Termine eine Adresse öffnet, entscheidet allein die Datenbank (`calendar_feed`, ANN-838);
// das Token der Function trägt eine Rolle, die genau diese eine Funktion darf (ANN-839).

const TIMEOUT_MS = 5_000;
const ARTEN: readonly string[] = ['home_visit', 'practice', 'video'];
const UID = /^[0-9a-f]{64}$/;

interface Optionen {
  readonly supabaseUrl: string;
  /** Der öffentliche Schlüssel für das Gateway, derselbe wie in der Anwendung. */
  readonly apiKey: string;
  /** JWT der Rolle `calendar_feed_reader`, nie ein Admin-Schlüssel (ADR-004). */
  readonly rollenToken: string;
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

function istZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function erstelleQuelle({
  supabaseUrl,
  apiKey,
  rollenToken,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: Optionen): Quelle {
  const basis = supabaseUrl.trim().replace(/\/+$/, '');

  async function lies(adresse: string): Promise<Abruf> {
    let antwort: Response;
    try {
      antwort = await abrufen(`${basis}/rest/v1/rpc/calendar_feed`, {
        method: 'POST',
        headers: {
          apikey: apiKey.trim(),
          Authorization: `Bearer ${rollenToken.trim()}`,
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
    if (koerper === null) return { ok: true, kalender: null };
    if (typeof koerper !== 'object' || Array.isArray(koerper)) return { ok: false };
    const { zeitzone, termine } = koerper as Record<string, unknown>;
    if (!istZone(zeitzone) || !Array.isArray(termine)) return { ok: false };
    const eintraege = termine.map(alsEintrag);
    // Ein einziger unlesbarer Termin verwirft die Datei, statt eine halbe auszuliefern.
    if (eintraege.some((eintrag) => eintrag === null)) return { ok: false };
    return { ok: true, kalender: { zeitzone, eintraege: eintraege as Eintrag[] } };
  }

  return { lies };
}
