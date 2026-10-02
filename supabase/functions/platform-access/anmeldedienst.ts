/**
 * Der Draht zur eigenen Instanz (POR-003, ADR-023 Punkt 9).
 *
 * Der Zugangsdienst spricht nur mit zwei Stellen der eigenen Instanz: dem
 * Anmeldedienst (`/auth/v1`) und der Datenbank über PostgREST (`/rest/v1`).
 * Kein Client-Paket: Die paar Aufrufe sind hier einzeln ausgeschrieben, und
 * jeder ist ohne Laufzeit prüfbar, weil `abrufen` von außen kommt.
 *
 * **Zwei Schlüssel, klar getrennt.** Der Admin-Schlüssel steht nur an den Aufrufen, die ihn brauchen: Konto anlegen, Kennwort
 * setzen, Konto entfernen und die zwei Funktionen des Zugangsdienstes.
 * Der Versand läuft mit der Sitzung der einladenden Person und dem
 * öffentlichen Schlüssel — so prüft die Datenbank ihre Rolle, nicht dieser
 * Dienst.
 */

import type { Einladungsmail, Ergebnis, Nachgeschlagen, Zweck } from './typen.ts';

const TIMEOUT_MS = 8_000;

export interface Anmeldedienst {
  readonly nachschlagen: (codeHash: string) => Promise<Ergebnis<Nachgeschlagen | null>>;
  readonly einloesen: (codeHash: string, kontoId: string) => Promise<Ergebnis<string>>;
  /** Zählt einen Fehlversuch an der Einladung; nach fünf ist sie verbraucht. */
  readonly fehlversuch: (codeHash: string) => Promise<Ergebnis<null>>;
  readonly kontoAnlegen: (email: string, kennwort: string) => Promise<Ergebnis<string>>;
  readonly kennwortPruefen: (email: string, kennwort: string) => Promise<Ergebnis<string | null>>;
  readonly kennwortSetzen: (kontoId: string, kennwort: string) => Promise<Ergebnis<null>>;
  /** Entfernt ein Konto über die Admin-API; ein bereits fehlendes gilt als entfernt. */
  readonly kontoEntfernen: (kontoId: string) => Promise<Ergebnis<null>>;
  /** ABN-011: die fälligen Löschaufträge des Löschlaufs abholen. */
  readonly loeschauftraege: () => Promise<Ergebnis<string[]>>;
  /** ABN-011: eine Löschung bestätigen; erst dann steht sie im Löschjournal. */
  readonly loeschungBestaetigen: (kontoId: string) => Promise<Ergebnis<null>>;
  /** Trägt die Anfrage den Admin-Schlüssel? Nur dann gibt es `konten_loeschen`. */
  readonly istDienstaufruf: (authorization: string | null) => boolean;
  readonly einladungsmail: (
    authorization: string,
    einladungId: string,
    codeHash: string,
  ) => Promise<Ergebnis<Einladungsmail>>;
}

interface Optionen {
  readonly supabaseUrl: string;
  /**
   * Der Admin-Schlüssel der eigenen Instanz. Er kommt aus einem eigenen,
   * ausdrücklich gesetzten Secret dieser Function (`index.ts`) und nicht aus
   * der Vorgabe der Laufzeit: Ohne dass jemand ihn bewusst setzt, legt der
   * Dienst kein Konto an („nicht eingerichtet"). Er steht nie im Browser.
   */
  readonly adminKey: string;
  readonly anonKey: string;
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Vergleich in gleicher Zeit, damit die Antwortzeit den Schlüssel nicht verrät. */
function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i += 1) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/** Nur prüfen, ob alles da ist - Namen, keine Werte. */
export function fehlendeEinrichtung(optionen: Optionen): string[] {
  const fehlend: string[] = [];
  if (optionen.supabaseUrl.trim() === '') fehlend.push('SUPABASE_URL');
  if (optionen.adminKey.trim() === '') fehlend.push('PLATFORM_ACCESS_ADMIN_KEY');
  if (optionen.anonKey.trim() === '') fehlend.push('SUPABASE_ANON_KEY');
  return fehlend;
}

export function erstelleAnmeldedienst({
  supabaseUrl,
  adminKey,
  anonKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: Optionen): Anmeldedienst {
  const basis = supabaseUrl.trim().replace(/\/+$/, '');
  const admin = {
    apikey: adminKey,
    Authorization: `Bearer ${adminKey}`,
    'Content-Type': 'application/json',
  };

  async function rufe(
    pfad: string,
    methode: string,
    kopf: Record<string, string>,
    koerper?: unknown,
  ): Promise<{ status: number; daten: unknown } | null> {
    try {
      const antwort = await abrufen(`${basis}${pfad}`, {
        method: methode,
        headers: kopf,
        ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await antwort.text();
      let daten: unknown = null;
      try {
        daten = text === '' ? null : JSON.parse(text);
      } catch {
        daten = null;
      }
      return { status: antwort.status, daten };
    } catch {
      return null;
    }
  }

  /** Die Meldung einer abgelehnten Datenbankfunktion, klein geschrieben. */
  function meldung(daten: unknown): string {
    if (typeof daten !== 'object' || daten === null) return '';
    const m = (daten as Record<string, unknown>)['message'];
    return typeof m === 'string' ? m.toLowerCase() : '';
  }

  /** Der Fehlerschlüssel des Anmeldedienstes (`error_code`, ältere Fassungen `code`). */
  function fehlerschluessel(daten: unknown): string {
    if (typeof daten !== 'object' || daten === null) return '';
    const d = daten as Record<string, unknown>;
    const wert = d['error_code'] ?? d['code'];
    return typeof wert === 'string' ? wert : '';
  }

  function kennung(daten: unknown): string | null {
    if (typeof daten !== 'object' || daten === null) return null;
    const d = daten as Record<string, unknown>;
    const id = d['id'] ?? (d['user'] as Record<string, unknown> | undefined)?.['id'];
    return typeof id === 'string' ? id : null;
  }

  return {
    async nachschlagen(codeHash) {
      const r = await rufe('/rest/v1/rpc/platform_invitation_lookup', 'POST', admin, {
        p_code_hash: codeHash,
      });
      if (r === null || r.status >= 500) return { ok: false, error: 'unavailable' };
      if (r.status !== 200 || !Array.isArray(r.daten)) return { ok: false, error: 'unavailable' };
      const zeile = r.daten[0] as Record<string, unknown> | undefined;
      if (zeile === undefined) return { ok: true, value: null };
      const purpose = zeile['purpose'];
      if (purpose !== 'activate' && purpose !== 'reset') return { ok: false, error: 'unavailable' };
      return {
        ok: true,
        value: {
          purpose: purpose satisfies Zweck,
          accountUserId:
            typeof zeile['account_user_id'] === 'string' ? zeile['account_user_id'] : null,
          organizationName:
            typeof zeile['organization_name'] === 'string' ? zeile['organization_name'] : '',
        },
      };
    },

    async fehlversuch(codeHash) {
      const r = await rufe('/rest/v1/rpc/platform_invitation_failed', 'POST', admin, {
        p_code_hash: codeHash,
      });
      if (r === null || r.status !== 200) return { ok: false, error: 'unavailable' };
      return { ok: true, value: null };
    },

    async einloesen(codeHash, kontoId) {
      const r = await rufe('/rest/v1/rpc/redeem_platform_invitation', 'POST', admin, {
        p_code_hash: codeHash,
        p_user_id: kontoId,
      });
      if (r === null || r.status >= 500) return { ok: false, error: 'unavailable' };
      if (r.status === 200 && typeof r.daten === 'string') return { ok: true, value: r.daten };
      const m = meldung(r.daten);
      if (m.includes('practice account') || m.includes('another person')) {
        return { ok: false, error: 'account_conflict' };
      }
      return { ok: false, error: 'invitation_invalid' };
    },

    async kontoAnlegen(email, kennwort) {
      // Die Adresse gilt als bestätigt: Bestätigt hat sie die Übergabe vor
      // Ort oder die Mail an die Adresse im Verhältnis (ADR-023 Punkt 11).
      // Die Marke `platform_account` lässt den Löschlauf ein Konto finden,
      // das nie gebunden wurde (Zweitreview, ANN-189).
      const r = await rufe('/auth/v1/admin/users', 'POST', admin, {
        email,
        password: kennwort,
        email_confirm: true,
        app_metadata: { platform_account: true },
      });
      if (r === null || r.status >= 500) return { ok: false, error: 'unavailable' };
      if (r.status === 200 || r.status === 201) {
        const id = kennung(r.daten);
        return id === null ? { ok: false, error: 'unavailable' } : { ok: true, value: id };
      }
      const schluessel = fehlerschluessel(r.daten);
      if (schluessel === 'weak_password') return { ok: false, error: 'weak_password' };
      if (
        schluessel === 'email_exists' ||
        schluessel === 'user_already_exists' ||
        r.status === 422
      ) {
        return { ok: false, error: 'email_taken' };
      }
      return { ok: false, error: 'invalid_request' };
    },

    async kennwortPruefen(email, kennwort) {
      // Ein bestehendes Konto derselben Person wird mit seinem Kennwort
      // bestätigt, nicht übernommen (ADR-023 Punkt 4, ANN-191). Mit dem
      // öffentlichen Schlüssel - wie eine gewöhnliche Anmeldung.
      const r = await rufe(
        '/auth/v1/token?grant_type=password',
        'POST',
        { apikey: anonKey, 'Content-Type': 'application/json' },
        { email, password: kennwort },
      );
      if (r === null || r.status >= 500) return { ok: false, error: 'unavailable' };
      if (r.status !== 200) return { ok: true, value: null };
      // Die Prüfung meldet an und erzeugt eine Sitzung. Die wird sofort
      // wieder beendet (Zweitreview): Sie dient nur der Bestätigung.
      const token = (r.daten as Record<string, unknown> | null)?.['access_token'];
      if (typeof token === 'string') {
        await rufe('/auth/v1/logout?scope=local', 'POST', {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        });
      }
      return { ok: true, value: kennung(r.daten) };
    },

    async kennwortSetzen(kontoId, kennwort) {
      const r = await rufe(`/auth/v1/admin/users/${encodeURIComponent(kontoId)}`, 'PUT', admin, {
        password: kennwort,
      });
      if (r === null || r.status >= 500) return { ok: false, error: 'unavailable' };
      if (r.status === 200) return { ok: true, value: null };
      return fehlerschluessel(r.daten) === 'weak_password'
        ? { ok: false, error: 'weak_password' }
        : { ok: false, error: 'invitation_invalid' };
    },

    async kontoEntfernen(kontoId) {
      const r = await rufe(`/auth/v1/admin/users/${encodeURIComponent(kontoId)}`, 'DELETE', admin);
      if (r === null) return { ok: false, error: 'unavailable' };
      // ABN-011: Ein Konto, das es nicht mehr gibt, ist entfernt - etwa wenn
      // die Bestätigung beim letzten Mal nicht ankam.
      if (r.status === 404) return { ok: true, value: null };
      if (r.status >= 300) return { ok: false, error: 'unavailable' };
      return { ok: true, value: null };
    },

    async loeschauftraege() {
      const r = await rufe('/rest/v1/rpc/claim_platform_account_deletions', 'POST', admin, {
        p_limit: 20,
      });
      if (r === null || r.status !== 200 || !Array.isArray(r.daten)) {
        return { ok: false, error: 'unavailable' };
      }
      const ids = r.daten
        .map((zeile) => (zeile as Record<string, unknown> | null)?.['account_user_id'])
        .filter((id): id is string => typeof id === 'string');
      return { ok: true, value: ids };
    },

    async loeschungBestaetigen(kontoId) {
      const r = await rufe('/rest/v1/rpc/confirm_platform_account_deletion', 'POST', admin, {
        p_account_user_id: kontoId,
      });
      if (r === null || r.status >= 300) return { ok: false, error: 'unavailable' };
      return { ok: true, value: null };
    },

    istDienstaufruf(authorization) {
      return authorization !== null && gleich(authorization, `Bearer ${adminKey}`);
    },

    async einladungsmail(authorization, einladungId, codeHash) {
      const r = await rufe(
        '/rest/v1/rpc/platform_invitation_mail',
        'POST',
        { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
        { p_invitation_id: einladungId, p_code_hash: codeHash },
      );
      if (r === null || r.status >= 500) return { ok: false, error: 'unavailable' };
      if (r.status === 401) return { ok: false, error: 'session_invalid' };
      if (r.status === 403) return { ok: false, error: 'not_allowed' };
      if (r.status !== 200) {
        return meldung(r.daten).includes('address changed')
          ? { ok: false, error: 'address_changed' }
          : { ok: false, error: 'not_allowed' };
      }
      const zeile = (Array.isArray(r.daten) ? r.daten[0] : null) as Record<string, unknown> | null;
      if (
        zeile === null ||
        typeof zeile['email'] !== 'string' ||
        typeof zeile['expires_at'] !== 'string'
      ) {
        return { ok: false, error: 'not_allowed' };
      }
      return {
        ok: true,
        value: {
          email: zeile['email'],
          organizationName:
            typeof zeile['organization_name'] === 'string' ? zeile['organization_name'] : '',
          expiresAt: zeile['expires_at'],
        },
      };
    },
  };
}
