/**
 * Der Draht zur eigenen Instanz (ABN-025, ADR-017 Punkt 50).
 *
 * Vier Aufrufe, alle an dieselbe Instanz, keiner nach außen: die Sitzung der
 * auslösenden Person beim Anmeldedienst, die Ankündigung und das Ergebnis
 * über PostgREST, das Objekt über die Storage-API. Kein Client-Paket — wie im
 * Zugangsdienst ist jeder Aufruf ausgeschrieben und ohne Laufzeit prüfbar,
 * weil `abrufen` von außen kommt.
 *
 * **Zwei Schlüssel, klar getrennt.** Die Sitzung prüft der Anmeldedienst mit
 * dem Token der Person und dem öffentlichen Schlüssel. Ankündigung, Objekt
 * und Ergebnis laufen mit dem Dienstschlüssel, den nur diese Function hat:
 * Die beiden Datenbankfunktionen sind nur für `service_role` freigegeben.
 */

import type { Ankuendigung, Eintrag, Ergebnis, Pruefergebnis } from './typen.ts';

const TIMEOUT_MS = 8_000;

export interface Instanz {
  /** Die Konto-Kennung der auslösenden Person, `null` ohne gültige Sitzung. */
  readonly person: (authorization: string | null) => Promise<Ergebnis<string | null>>;
  readonly ankuendigung: (
    dateiId: string,
    personId: string,
  ) => Promise<Ergebnis<Ankuendigung | null>>;
  readonly objekt: (bucket: string, schluessel: string) => Promise<Ergebnis<Uint8Array>>;
  readonly eintragen: (dateiId: string, ergebnis: Pruefergebnis) => Promise<Ergebnis<Eintrag>>;
}

export interface Einrichtung {
  readonly supabaseUrl: string;
  /** Eigenes Secret dieser Function; ohne es prüft sie nichts (`index.ts`). */
  readonly dienstKey: string;
  readonly anonKey: string;
}

/** Was fehlt - Namen, keine Werte. */
export function fehlendeEinrichtung(einrichtung: Einrichtung): string[] {
  const fehlend: string[] = [];
  if (einrichtung.supabaseUrl.trim() === '') fehlend.push('SUPABASE_URL');
  if (einrichtung.dienstKey.trim() === '') fehlend.push('PATIENT_FILE_VERIFY_SERVICE_KEY');
  if (einrichtung.anonKey.trim() === '') fehlend.push('SUPABASE_ANON_KEY');
  return fehlend;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function erstelleInstanz(
  einrichtung: Einrichtung,
  abrufen: typeof fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): Instanz {
  const basis = einrichtung.supabaseUrl.trim().replace(/\/+$/, '');
  const dienst = einrichtung.dienstKey.trim();
  const anon = einrichtung.anonKey.trim();
  const alsDienst = {
    Authorization: `Bearer ${dienst}`,
    apikey: dienst,
  };

  async function rpc(name: string, rumpf: Record<string, unknown>): Promise<Ergebnis<unknown>> {
    try {
      const antwort = await abrufen(`${basis}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { ...alsDienst, 'Content-Type': 'application/json' },
        body: JSON.stringify(rumpf),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!antwort.ok) return { ok: false };
      return { ok: true, wert: (await antwort.json()) as unknown };
    } catch {
      return { ok: false };
    }
  }

  return {
    async person(authorization) {
      if (!authorization?.startsWith('Bearer ') || authorization.length <= 'Bearer '.length) {
        return { ok: true, wert: null };
      }
      try {
        const antwort = await abrufen(`${basis}/auth/v1/user`, {
          method: 'GET',
          headers: { Authorization: authorization, apikey: anon },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (antwort.status >= 500) return { ok: false };
        if (!antwort.ok) return { ok: true, wert: null };
        const konto = (await antwort.json()) as { id?: unknown };
        return {
          ok: true,
          wert: typeof konto.id === 'string' && UUID.test(konto.id) ? konto.id : null,
        };
      } catch {
        return { ok: false };
      }
    },

    async ankuendigung(dateiId, personId) {
      const antwort = await rpc('patient_file_for_verification', {
        p_file_id: dateiId,
        p_user_id: personId,
      });
      if (!antwort.ok) return antwort;
      const zeilen = Array.isArray(antwort.wert) ? (antwort.wert as Ankuendigung[]) : [];
      const zeile = zeilen[0];
      if (!zeile) return { ok: true, wert: null };
      return {
        ok: true,
        wert: { ...zeile, byte_size: Number(zeile.byte_size) },
      };
    },

    async objekt(bucket, schluessel) {
      try {
        const pfad = schluessel.split('/').map(encodeURIComponent).join('/');
        const antwort = await abrufen(
          `${basis}/storage/v1/object/${encodeURIComponent(bucket)}/${pfad}`,
          { method: 'GET', headers: alsDienst, signal: AbortSignal.timeout(timeoutMs) },
        );
        if (!antwort.ok) return { ok: false };
        return { ok: true, wert: new Uint8Array(await antwort.arrayBuffer()) };
      } catch {
        return { ok: false };
      }
    },

    async eintragen(dateiId, ergebnis) {
      const antwort = await rpc('record_patient_file_verification', {
        p_file_id: dateiId,
        p_content_type_ok: ergebnis.content_type_ok,
        p_checksum_ok: ergebnis.checksum_ok,
        p_metadata_ok: ergebnis.metadata_ok,
      });
      if (!antwort.ok) return antwort;
      const wert = antwort.wert;
      return typeof wert === 'string' &&
        ['passed', 'rejected', 'held', 'already_verified', 'not_found', 'not_confirmed'].includes(
          wert,
        )
        ? { ok: true, wert: wert as Eintrag }
        : { ok: false };
    },
  };
}
