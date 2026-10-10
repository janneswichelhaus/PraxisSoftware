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
import { authMailInhalt, liesAuthMail, pruefeSignatur } from './authmail.ts';
import { einladungstext, type Versandweg } from './versand.ts';
import { codeHash, ADRESS_MUSTER, CODE_MUSTER, type ZugangsFehler } from './typen.ts';

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
  account_conflict: 409,
  sign_in_not_created: 502,
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
  /** ABN-012: Geheimnis des Mail-Hooks; leer heißt, der Hook ist nicht eingerichtet. */
  readonly hookGeheimnis?: string;
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
      /** Leer, wenn mit Sitzung eingelöst wird; dann zählt das Konto der Sitzung. */
      readonly email: string;
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
    if (email !== '' && (email.length > 254 || !ADRESS_MUSTER.test(email))) {
      return 'invalid_request';
    }
    // Ein Kennwort nimmt der Dienst nicht mehr an (ADR-025 Punkt 9).
    if ('kennwort' in d) return 'invalid_request';
    return { aufgabe: 'einloesen', code, email };
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
  hookGeheimnis = '',
}: HandlerOptionen): (anfrage: Request) => Promise<Response> {
  // Zweitreview B5: gesehene Hook-Aufrufe, je Instanz für die Toleranz der
  // Signatur gemerkt. Eine Wiederholung bekommt Erfolg und keine zweite Mail.
  const gesehen = new Map<string, number>();
  return async (anfrage) => {
    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (anfrage.method !== 'POST') return antwort({ ok: false, error: 'invalid_request' }, 405);

    // ABN-012: Ein signierter Aufruf ist der Mail-Hook des Anmeldedienstes.
    if (anfrage.headers.has('webhook-signature')) {
      return authMail(anfrage, { anmeldedienst, versand, appUrl, hookGeheimnis }, gesehen);
    }

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
        ? await einloesen(anmeldedienst, auftrag, anfrage.headers.get('Authorization'))
        : await versenden(anmeldedienst, versand, appUrl, anfrage, auftrag);

    if (!ergebnis.ok) return fehler(ergebnis.error);
    return antwort({ ok: true, value: ergebnis.value }, 200);
  };
}

type Ausgang<T> = { ok: true; value: T } | { ok: false; error: ZugangsFehler };

/** Was das Einlösen zurückgibt: `tokenHash` ist die Einmal-Anmeldung, `null` mit Sitzung. */
interface Eingeloest {
  readonly purpose: 'activate' | 'reset';
  readonly organizationName: string;
  readonly tokenHash: string | null;
}

/**
 * Einlösen: nachschlagen, Konto anlegen oder das der Sitzung nehmen, binden,
 * anmelden (ADR-025 Fassung 2, Punkt 13; ADR-023 Fassung 4, Punkte 7 bis 10).
 *
 * Es gibt kein Kennwort mehr. Ein neues Konto entsteht ohne Kennwort, und
 * zurück kommt eine Einmal-Anmeldung (`token_hash` einer `magiclink`-Anmeldung,
 * ohne Mail erzeugt), mit der die Seite anmeldet und sofort Passkey und PIN
 * einrichtet. Der Code ist dabei der Ausweis - so wie er bisher das Kennwort
 * setzen durfte.
 *
 * **Ein bestehendes Konto wird nie über seine Adresse übernommen.** Wer schon
 * eines hat, meldet sich vorher mit dem Passkey an und löst mit seiner Sitzung
 * ein; ohne Sitzung heißt eine vergebene Adresse `email_taken`, und der
 * Versuch zählt an der Einladung. Die Datenbank prüft beim Binden alles noch
 * einmal (Code, Zustand, Praxiskonto, Person). An die Datenbank geht nur der
 * Hash des Codes.
 */
async function einloesen(
  dienst: Anmeldedienst,
  auftrag: Extract<Auftrag, { aufgabe: 'einloesen' }>,
  authorization: string | null,
): Promise<Ausgang<Eingeloest>> {
  const hash = await codeHash(auftrag.code);
  const gefunden = await dienst.nachschlagen(hash);
  if (!gefunden.ok) return gefunden;
  if (gefunden.value === null) return { ok: false, error: 'invitation_invalid' };
  const { purpose, accountUserId, organizationName } = gefunden.value;

  if (purpose === 'reset') {
    // Passkey verloren (ADR-025 Punkt 12, ADR-023 Punkt 10): eine
    // Einmal-Anmeldung für das gebundene Konto. Erst einlösen, dann anmelden
    // (Zweitreview POR-003): So ist der Code verbraucht, bevor es eine
    // Anmeldung gibt. Die Datenbank beendet dabei die laufenden Sitzungen.
    if (accountUserId === null) return { ok: false, error: 'invitation_invalid' };
    const gebunden = await dienst.einloesen(hash, accountUserId);
    if (!gebunden.ok) return gebunden;
    const anmeldung = await dienst.anmeldecode(accountUserId);
    if (!anmeldung.ok) return { ok: false, error: 'sign_in_not_created' };
    return { ok: true, value: { purpose, organizationName, tokenHash: anmeldung.value } };
  }

  // Mit Sitzung: das eigene, schon bestehende Konto (Punkt 4).
  const eigenes = await dienst.sitzungskonto(authorization);
  if (!eigenes.ok) return eigenes;
  if (eigenes.value !== null) {
    const gebunden = await dienst.einloesen(hash, eigenes.value);
    if (!gebunden.ok) {
      if (gebunden.error === 'account_conflict') await dienst.fehlversuch(hash);
      return gebunden;
    }
    return { ok: true, value: { purpose, organizationName, tokenHash: null } };
  }

  if (auftrag.email === '') return { ok: false, error: 'invalid_request' };
  const angelegt = await dienst.kontoAnlegen(auftrag.email);
  if (!angelegt.ok) {
    if (angelegt.error === 'email_taken') await dienst.fehlversuch(hash);
    return angelegt;
  }
  const kontoId = angelegt.value;

  const gebunden = await dienst.einloesen(hash, kontoId);
  if (!gebunden.ok) {
    // Aufgeräumt wird nur bei einer klaren Absage der Datenbank. Bei
    // `unavailable` ist offen, ob die Bindung schon steht - dann bleibt das
    // Konto, und der Löschlauf nimmt es, falls es ungebunden bleibt (ANN-189).
    const abgesagt =
      gebunden.error === 'invitation_invalid' || gebunden.error === 'account_conflict';
    if (abgesagt) await dienst.kontoEntfernen(kontoId);
    if (gebunden.error === 'account_conflict') {
      await dienst.fehlversuch(hash);
      return { ok: false, error: 'email_taken' };
    }
    return gebunden;
  }
  const anmeldung = await dienst.anmeldecode(kontoId);
  if (!anmeldung.ok) return { ok: false, error: 'sign_in_not_created' };
  return { ok: true, value: { purpose, organizationName, tokenHash: anmeldung.value } };
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

/** Die Antwort an den Anmeldedienst im Fehlerfall (Format der Auth-Hooks). */
function hookFehler(status: number, code: ZugangsFehler): Response {
  return antwort({ error: { http_code: status, message: code } }, status);
}

/**
 * Der Mail-Hook (ABN-012, BEF-118): signiert prüfen, die Datenbank fragen,
 * dann verschicken oder stumm verwerfen. Erfolg ist für den Anmeldedienst ein
 * leeres Objekt — in beiden Fällen.
 */
async function authMail(
  anfrage: Request,
  {
    anmeldedienst,
    versand,
    appUrl,
    hookGeheimnis,
  }: Required<Pick<HandlerOptionen, 'appUrl' | 'hookGeheimnis'>> &
    Pick<HandlerOptionen, 'anmeldedienst' | 'versand'>,
  gesehen: Map<string, number>,
): Promise<Response> {
  if (hookGeheimnis.trim() === '' || anmeldedienst === null) {
    return hookFehler(503, 'not_configured');
  }
  const koerper = await anfrage.text();
  if (!(await pruefeSignatur(hookGeheimnis, anfrage.headers, koerper))) {
    return hookFehler(401, 'session_invalid');
  }
  const jetzt = Date.now();
  for (const [id, zeit] of gesehen) if (jetzt - zeit > 600_000) gesehen.delete(id);
  const nachricht = anfrage.headers.get('webhook-id') ?? '';
  if (gesehen.has(nachricht)) return antwort({}, 200);
  const mail = liesAuthMail(koerper);
  if (mail === null) return hookFehler(400, 'invalid_request');
  gesehen.set(nachricht, jetzt);
  // Kein Kennwort, keine Wiederherstellung per Mail (ADR-025 Punkt 9): Ein
  // solcher Link wäre eine Anmeldung allein per Mail. Stumm verworfen, für
  // jedes Konto gleich - die Antwort verrät nichts.
  if (mail.art === 'recovery') return antwort({}, 200);

  const erlaubt = await anmeldedienst.authMailErlaubt(mail.kontoId, mail.art);
  if (!erlaubt.ok) return hookFehler(502, 'unavailable');
  // Stumm verworfen: Die Antwort verrät nicht, dass es ein Plattformkonto ist.
  if (!erlaubt.value) return antwort({}, 200);

  if (versand === null || appUrl.trim() === '') return hookFehler(503, 'not_configured');
  const gesendet = await versand.sende({ an: mail.an, ...authMailInhalt(mail, appUrl) });
  if (!gesendet.ok) return hookFehler(502, 'unavailable');
  return antwort({}, 200);
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
