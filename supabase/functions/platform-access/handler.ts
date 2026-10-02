/**
 * Die Function selbst, ohne Laufzeit (POR-003, ADR-023 Punkte 7 bis 10).
 *
 * Alles, was von außen kommt — Anmeldedienst, Versand, Adresse der
 * Anwendung —, ist eine Abhängigkeit im Aufruf. Damit ist der ganze Ablauf
 * ohne Deno prüfbar (`handler.test.ts`), wie beim Kartendienst.
 *
 * **Kein Betriebslog.** Die Function schreibt nichts auf die Konsole: Ein
 * dritter Ausgang neben `src/lib/protokoll.ts` und dem Kartendienst wäre eine
 * eigene Entscheidung (`src/protokollierung.test.ts`). Jeder Fehler geht als
 * Fehlerklasse an den Aufrufer zurück, und dort sieht ihn die Person.
 *
 * **Scharf erst nach OPS-001.** Die Function hält den Admin-Schlüssel und
 * legt Konten an. Gebaut und getestet wird sie lokal mit synthetischen Daten
 * (§15.2); für echte Konten braucht es die geprüfte Edge Runtime (ADR-015
 * Punkt 20). `supabase/config.toml` lässt die Laufzeit deshalb aus.
 */

import type { Anmeldedienst } from './anmeldedienst.ts';
import { einladungstext, type Versandweg } from './versand.ts';
import {
  codeHash,
  ADRESS_MUSTER,
  CODE_MUSTER,
  MAX_KENNWORT,
  MIN_KENNWORT,
  type ZugangsFehler,
} from './typen.ts';

/**
 * `*`, weil die Einlöseseite ohne Sitzung aufruft und der Versand die
 * Sitzung im Kopf trägt, nicht in einem Cookie. Die Autorisierung liegt am
 * Code bzw. an der Sitzung, nicht an der Herkunft.
 */
const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const STATUS: Readonly<Record<ZugangsFehler, number>> = {
  invalid_request: 400,
  invitation_invalid: 400,
  email_taken: 409,
  weak_password: 400,
  account_conflict: 409,
  password_not_set: 502,
  session_invalid: 401,
  not_allowed: 403,
  address_changed: 409,
  not_configured: 503,
  unavailable: 502,
};

interface HandlerOptionen {
  /** `null`, wenn der Dienst nicht vollständig eingerichtet ist. */
  readonly anmeldedienst: Anmeldedienst | null;
  readonly versand: Versandweg | null;
  /** Adresse der Anwendung für den Link in der Mail (`site_url`). */
  readonly appUrl: string;
}

function antwort(koerper: unknown, status: number): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function fehler(code: ZugangsFehler): Response {
  return antwort({ ok: false, error: code }, STATUS[code]);
}

type Auftrag =
  | {
      readonly aufgabe: 'einloesen';
      readonly code: string;
      readonly email: string;
      readonly kennwort: string;
    }
  | { readonly aufgabe: 'versenden'; readonly einladungId: string; readonly code: string }
  | { readonly aufgabe: 'konten_loeschen' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function liesAnfrage(anfrage: Request): Promise<Auftrag | ZugangsFehler> {
  let koerper: unknown;
  try {
    koerper = await anfrage.json();
  } catch {
    return 'invalid_request';
  }
  if (typeof koerper !== 'object' || koerper === null) return 'invalid_request';
  const d = koerper as Record<string, unknown>;
  // ABN-011: ohne Code, nur mit dem Admin-Schlüssel (geprüft im Handler).
  if (d['aufgabe'] === 'konten_loeschen') return { aufgabe: 'konten_loeschen' };
  const code = d['code'];
  if (typeof code !== 'string' || !CODE_MUSTER.test(code)) return 'invitation_invalid';

  if (d['aufgabe'] === 'einloesen') {
    const email = typeof d['email'] === 'string' ? d['email'].trim().toLowerCase() : '';
    const kennwort = d['kennwort'];
    if (email.length > 254 || !ADRESS_MUSTER.test(email)) return 'invalid_request';
    if (typeof kennwort !== 'string' || kennwort.length > MAX_KENNWORT) return 'invalid_request';
    if (kennwort.length < MIN_KENNWORT) return 'weak_password';
    return { aufgabe: 'einloesen', code, email, kennwort };
  }
  if (d['aufgabe'] === 'versenden') {
    const einladungId = d['einladungId'];
    if (typeof einladungId !== 'string' || !UUID.test(einladungId)) return 'invalid_request';
    return { aufgabe: 'versenden', einladungId, code };
  }
  return 'invalid_request';
}

export function erstelleHandler({
  anmeldedienst,
  versand,
  appUrl,
}: HandlerOptionen): (anfrage: Request) => Promise<Response> {
  return async (anfrage) => {
    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (anfrage.method !== 'POST') return antwort({ ok: false, error: 'invalid_request' }, 405);

    const auftrag = await liesAnfrage(anfrage);
    if (typeof auftrag === 'string') return fehler(auftrag);

    if (anmeldedienst === null) return fehler('not_configured');

    if (auftrag.aufgabe === 'konten_loeschen') {
      if (!anmeldedienst.istDienstaufruf(anfrage.headers.get('Authorization'))) {
        return fehler('not_allowed');
      }
      const geloescht = await kontenLoeschen(anmeldedienst);
      if (!geloescht.ok) return fehler(geloescht.error);
      return antwort({ ok: true, value: geloescht.value }, 200);
    }

    const ergebnis =
      auftrag.aufgabe === 'einloesen'
        ? await einloesen(anmeldedienst, auftrag)
        : await versenden(anmeldedienst, versand, appUrl, anfrage, auftrag);

    if (!ergebnis.ok) return fehler(ergebnis.error);
    return antwort({ ok: true, value: ergebnis.value }, 200);
  };
}

type Ausgang<T> = { ok: true; value: T } | { ok: false; error: ZugangsFehler };

/**
 * Einlösen: nachschlagen, Konto anlegen oder bestätigen, binden.
 *
 * Die Datenbank prüft beim Binden alles noch einmal (Code, Zustand,
 * Praxiskonto, Person). An die Datenbank geht nur der Hash des Codes.
 *
 * **Eine Auskunft für „Adresse vergeben" und „Konto passt nicht"**
 * (Zweitreview): Sonst verriete der Unterschied, ob ein Kennwort zu einer
 * fremden Adresse passt. Jeder solche Fehlversuch zählt an der Einladung;
 * nach fünf ist sie verbraucht.
 */
async function einloesen(
  dienst: Anmeldedienst,
  auftrag: Extract<Auftrag, { aufgabe: 'einloesen' }>,
): Promise<Ausgang<{ purpose: 'activate' | 'reset'; organizationName: string }>> {
  const hash = await codeHash(auftrag.code);
  const gefunden = await dienst.nachschlagen(hash);
  if (!gefunden.ok) return gefunden;
  if (gefunden.value === null) return { ok: false, error: 'invitation_invalid' };
  const { purpose, accountUserId, organizationName } = gefunden.value;

  if (purpose === 'reset') {
    // Ein neues Kennwort für das gebundene Konto (ADR-023 Punkt 10). Erst
    // einlösen, dann setzen (Zweitreview): So ist der Code verbraucht, bevor
    // sich etwas am Konto ändert, und ein zweiter Aufruf mit demselben Code
    // setzt nichts. Die Datenbank beendet dabei die laufenden Sitzungen.
    if (accountUserId === null) return { ok: false, error: 'invitation_invalid' };
    const gebunden = await dienst.einloesen(hash, accountUserId);
    if (!gebunden.ok) return gebunden;
    const gesetzt = await dienst.kennwortSetzen(accountUserId, auftrag.kennwort);
    if (!gesetzt.ok) {
      return {
        ok: false,
        error: gesetzt.error === 'weak_password' ? 'weak_password' : 'password_not_set',
      };
    }
    return { ok: true, value: { purpose, organizationName } };
  }

  let kontoId: string;
  let neuAngelegt = false;
  const angelegt = await dienst.kontoAnlegen(auftrag.email, auftrag.kennwort);
  if (angelegt.ok) {
    kontoId = angelegt.value;
    neuAngelegt = true;
  } else if (angelegt.error === 'email_taken') {
    // Ein Konto je Person (Punkt 4): Wer schon eines hat, bestätigt es mit
    // seinem Kennwort. Ob es derselben Person gehört, prüft die Datenbank.
    const geprueft = await dienst.kennwortPruefen(auftrag.email, auftrag.kennwort);
    if (!geprueft.ok) return geprueft;
    if (geprueft.value === null) {
      await dienst.fehlversuch(hash);
      return { ok: false, error: 'email_taken' };
    }
    kontoId = geprueft.value;
  } else {
    return angelegt;
  }

  const gebunden = await dienst.einloesen(hash, kontoId);
  if (!gebunden.ok) {
    // Aufgeräumt wird nur bei einer klaren Absage der Datenbank. Bei
    // `unavailable` ist offen, ob die Bindung schon steht - dann bleibt das
    // Konto, und der Löschlauf nimmt es, falls es ungebunden bleibt (ANN-189).
    const abgesagt =
      gebunden.error === 'invitation_invalid' || gebunden.error === 'account_conflict';
    if (neuAngelegt && abgesagt) await dienst.kontoEntfernen(kontoId);
    if (gebunden.error === 'account_conflict') {
      await dienst.fehlversuch(hash);
      return { ok: false, error: 'email_taken' };
    }
    return gebunden;
  }
  return { ok: true, value: { purpose, organizationName } };
}

/**
 * Konten löschen (ABN-011, BEF-115): die Aufträge des Löschlaufs abholen, je
 * Konto über die Admin-API entfernen und bestätigen. Was scheitert, bleibt
 * im Auftrag und kommt beim nächsten Aufruf wieder; die Antwort zählt nur,
 * sie nennt keine Kennungen.
 */
async function kontenLoeschen(
  dienst: Anmeldedienst,
): Promise<Ausgang<{ deleted: number; pending: number }>> {
  const auftraege = await dienst.loeschauftraege();
  if (!auftraege.ok) return auftraege;
  let geloescht = 0;
  for (const kontoId of auftraege.value) {
    const entfernt = await dienst.kontoEntfernen(kontoId);
    if (!entfernt.ok) continue;
    const bestaetigt = await dienst.loeschungBestaetigen(kontoId);
    if (bestaetigt.ok) geloescht += 1;
  }
  return { ok: true, value: { deleted: geloescht, pending: auftraege.value.length - geloescht } };
}

/** Versenden: Adresse vom Server, Text von hier, Zustellung über den Adapter. */
async function versenden(
  dienst: Anmeldedienst,
  versand: Versandweg | null,
  appUrl: string,
  anfrage: Request,
  auftrag: Extract<Auftrag, { aufgabe: 'versenden' }>,
): Promise<Ausgang<{ sent: true }>> {
  const authorization = anfrage.headers.get('Authorization');
  if (authorization === null || !/^Bearer \S+$/.test(authorization)) {
    return { ok: false, error: 'session_invalid' };
  }
  // Ohne Versandweg wird gar nicht erst nachgefragt: Die Einladung bleibt
  // offen und kann vor Ort übergeben werden.
  if (versand === null || appUrl.trim() === '') return { ok: false, error: 'not_configured' };

  const mail = await dienst.einladungsmail(
    authorization,
    auftrag.einladungId,
    await codeHash(auftrag.code),
  );
  if (!mail.ok) return mail;

  const inhalt = einladungstext(
    appUrl,
    mail.value.organizationName,
    auftrag.code,
    mail.value.expiresAt,
  );
  const gesendet = await versand.sende({ an: mail.value.email, ...inhalt });
  if (!gesendet.ok) return gesendet;
  return { ok: true, value: { sent: true } };
}
