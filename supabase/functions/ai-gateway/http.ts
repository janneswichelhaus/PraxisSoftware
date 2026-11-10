// Was jeder Ablauf des Gateways von der Anfrage liest und wie er antwortet: begrenzt lesen,
// feste Fehlerklassen, nie ein Zwischenspeicher. Ohne Laufzeit, ohne Zweck, ohne Anbieter.

import type { Adapterergebnis, Fehlerklasse } from './typen.ts';

// `*` ist kein Zugeständnis: Ohne gültige Sitzung gibt der Endpunkt nichts heraus und nimmt
// keine Cookies entgegen. `x-client-info` schickt supabase-js mit.
export const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Welcher HTTP-Status zu welcher Fehlerklasse gehört. */
export const STATUS: Readonly<Record<Fehlerklasse, number>> = {
  session_invalid: 401,
  invalid_request: 400,
  forbidden: 403,
  not_configured: 503,
  too_large: 413,
  unavailable: 502,
  timeout: 504,
};

export function fehler(code: Fehlerklasse, meldung: string, status = STATUS[code]): Response {
  return antwort({ ok: false, error: { code, message: `ai-gateway: ${meldung}` } }, status);
}

export function antwort(koerper: object, status: number): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      // Ein Vorschlag ist ein Ergebnis des Augenblicks und wird nirgends abgelegt.
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Der Körper der Anfrage - `zu_gross`, sobald mehr als `grenze` Bytes kommen, `null`, wenn er
 * fehlt oder abbricht. Gelesen wird stückweise und nie über die Grenze hinaus.
 */
async function liesBegrenzt(
  anfrage: Request,
  grenze: number,
): Promise<Uint8Array<ArrayBuffer> | 'zu_gross' | null> {
  const angegeben = Number(anfrage.headers.get('Content-Length') ?? Number.NaN);
  if (Number.isFinite(angegeben) && angegeben > grenze) return 'zu_gross';
  if (anfrage.body === null) return null;

  const leser = anfrage.body.getReader();
  const teile: Uint8Array[] = [];
  let summe = 0;
  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      summe += value.byteLength;
      if (summe > grenze) {
        await leser.cancel().catch(() => undefined);
        return 'zu_gross';
      }
      teile.push(value);
    }
  } catch {
    return null;
  }

  const koerper = new Uint8Array(summe);
  let stelle = 0;
  for (const teil of teile) {
    koerper.set(teil, stelle);
    stelle += teil.byteLength;
  }
  return koerper;
}

/** Das Formular der Anfrage - `zu_gross` über der Grenze, `null`, wenn es keines ist. */
export async function liesFormular(
  anfrage: Request,
  grenze: number,
): Promise<FormData | 'zu_gross' | null> {
  const typ = anfrage.headers.get('Content-Type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(typ)) return null;
  const koerper = await liesBegrenzt(anfrage, grenze);
  if (koerper === 'zu_gross' || koerper === null) return koerper;
  try {
    return await new Response(koerper, { headers: { 'Content-Type': typ } }).formData();
  } catch {
    return null;
  }
}

/** Der Körper als JSON-Objekt - `zu_gross` über der Grenze, `null`, wenn es keines ist. */
export async function liesJson(
  anfrage: Request,
  grenze: number,
): Promise<Record<string, unknown> | 'zu_gross' | null> {
  const typ = anfrage.headers.get('Content-Type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(typ)) return null;
  const koerper = await liesBegrenzt(anfrage, grenze);
  if (koerper === 'zu_gross' || koerper === null) return koerper;
  try {
    const wert: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(koerper));
    if (typeof wert !== 'object' || wert === null || Array.isArray(wert)) return null;
    return wert as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Ein Adapteraufruf mit Frist. Läuft sie ab, wird der Aufruf abgebrochen und die Anfrage meldet
 * `timeout`; wirft der Adapter, gilt er als `unavailable`.
 */
export async function mitFrist<T>(
  aufruf: (signal: AbortSignal) => Promise<Adapterergebnis<T>>,
  ms: number,
): Promise<Adapterergebnis<T>> {
  const steuerung = new AbortController();
  let uhr: ReturnType<typeof setTimeout> | undefined;
  const frist = new Promise<Adapterergebnis<T>>((fertig) => {
    uhr = setTimeout(() => {
      steuerung.abort();
      fertig({ ok: false, error: { code: 'timeout', message: 'Frist abgelaufen' } });
    }, ms);
  });
  const ergebnis = aufruf(steuerung.signal).catch((): Adapterergebnis<T> => ({
    ok: false,
    error: { code: 'unavailable', message: 'Adapter fehlgeschlagen' },
  }));
  try {
    return await Promise.race([ergebnis, frist]);
  } finally {
    clearTimeout(uhr);
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Platz für Feldnamen, Grenzen und Kopfzeilen eines Formulars neben der Datei. */
export const FORMULAR_ZUSCHLAG_BYTES = 64 * 1024;

/** Was eine Datei im Formular mindestens kann - unabhängig von der Laufzeit. */
export interface Datei {
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function istDatei(wert: unknown): wert is Datei {
  if (typeof wert !== 'object' || wert === null) return false;
  const datei = wert as Partial<Datei>;
  return (
    typeof datei.arrayBuffer === 'function' &&
    typeof datei.size === 'number' &&
    typeof datei.type === 'string'
  );
}

/** Das Format ohne Parameter, klein geschrieben (`audio/webm;codecs=opus` ist `audio/webm`). */
export function grundformat(typ: string): string {
  return (typ.split(';')[0] ?? '').trim().toLowerCase();
}

/** SHA-256 als Kleinbuchstaben-Hex, wie `patient_files.checksum_sha256` es führt. */
export async function pruefsumme(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
