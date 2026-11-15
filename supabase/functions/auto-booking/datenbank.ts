import type { Auftrag, Buchung, Fahrzeit, Fehlerklasse, Plan, Termin, Weg } from './typen.ts';

// Die Datenbank plant und bucht, mit dem Token der Person und dem öffentlichen Schlüssel: Rolle,
// Organisation, Nachbarn und Wegregel entscheiden `plan_auto_booking` und `book_next_appointment`.

const TIMEOUT_MS = 10_000;

export type Datenbankfehler = { readonly ok: false; readonly grund: Fehlerklasse };

export interface Datenbank {
  readonly plane: (
    authorization: string,
    auftrag: Auftrag,
    versatz: number,
  ) => Promise<{ readonly ok: true; readonly plan: Plan } | Datenbankfehler>;
  readonly buche: (
    authorization: string,
    auftrag: Auftrag,
    versatz: number,
    fahrzeiten: readonly Fahrzeit[],
  ) => Promise<{ readonly ok: true; readonly buchung: Buchung } | Datenbankfehler>;
}

interface Optionen {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Was die Datenbank zu einer Eingabe sagt, als Fehlerklasse der Function. */
const MELDUNGEN: readonly [RegExp, Fehlerklasse][] = [
  [/patient address is not located/, 'address_not_located'],
  [/complete patient address/, 'address_incomplete'],
  [/waitlist entry/, 'waitlist_closed'],
  [/patient not found|staff member not assignable|treatment basis not found/, 'not_found'],
  [
    /invalid duration|date range|invalid time windows|invalid offset|invalid legs/,
    'invalid_request',
  ],
];

const istObjekt = (wert: unknown): wert is Record<string, unknown> =>
  typeof wert === 'object' && wert !== null && !Array.isArray(wert);
const istZahl = (wert: unknown): wert is number =>
  typeof wert === 'number' && Number.isFinite(wert);
const istText = (wert: unknown): wert is string => typeof wert === 'string' && wert !== '';

function punkt(wert: unknown): { lat: number; lon: number } | null {
  if (!istObjekt(wert) || !istZahl(wert['lat']) || !istZahl(wert['lon'])) return null;
  return { lat: wert['lat'], lon: wert['lon'] };
}

function planAus(wert: unknown): Plan | null {
  if (!istObjekt(wert) || !Array.isArray(wert['legs'])) return null;
  const ziel = punkt(wert['target']);
  if (ziel === null || !istZahl(wert['days']) || !istZahl(wert['page_size'])) return null;
  const wege: Weg[] = [];
  for (const eintrag of wert['legs'] as unknown[]) {
    if (!istObjekt(eintrag) || !istText(eintrag['key'])) return null;
    const from = punkt(eintrag['from']);
    const to = punkt(eintrag['to']);
    if (from === null || to === null) return null;
    wege.push({ key: eintrag['key'], from, to });
  }
  return { tage: wert['days'], seitengroesse: wert['page_size'], ziel, wege };
}

function terminAus(wert: Record<string, unknown>): Termin | null {
  const gebiet = wert['territory_status'];
  if (
    !istText(wert['appointment_id']) ||
    !istText(wert['staff_member_id']) ||
    !istText(wert['date']) ||
    !istText(wert['start']) ||
    !istText(wert['end']) ||
    (gebiet !== 'none' && gebiet !== 'match' && gebiet !== 'outside')
  ) {
    return null;
  }
  return {
    id: wert['appointment_id'],
    person: wert['staff_member_id'],
    name: istText(wert['staff_name']) ? wert['staff_name'] : null,
    datum: wert['date'],
    beginn: wert['start'],
    ende: wert['end'],
    gebiet,
  };
}

function buchungAus(wert: unknown): Buchung | null {
  if (!istObjekt(wert)) return null;
  if (wert['outcome'] === 'retry') return { ausgang: 'nochmal' };
  if (wert['outcome'] === 'none') {
    if (!istZahl(wert['unverified']) || !istZahl(wert['tight'])) return null;
    return { ausgang: 'keiner', ungeprueft: wert['unverified'], knapp: wert['tight'] };
  }
  if (wert['outcome'] !== 'booked') return null;
  const termin = terminAus(wert);
  return termin === null ? null : { ausgang: 'gebucht', termin };
}

export function erstelleDatenbank({
  supabaseUrl,
  anonKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: Optionen): Datenbank {
  const adresse = supabaseUrl.trim().replace(/\/+$/, '');
  const schluessel = anonKey.trim();

  async function rufe(
    authorization: string,
    funktion: 'plan_auto_booking' | 'book_next_appointment',
    koerper: Record<string, unknown>,
  ): Promise<{ readonly ok: true; readonly wert: unknown } | Datenbankfehler> {
    if (adresse === '' || schluessel === '') return { ok: false, grund: 'not_configured' };
    let antwort: Response;
    let wert: unknown;
    try {
      antwort = await abrufen(`${adresse}/rest/v1/rpc/${funktion}`, {
        method: 'POST',
        headers: {
          apikey: schluessel,
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(koerper),
        signal: AbortSignal.timeout(timeoutMs),
      });
      wert = await antwort.json();
    } catch {
      return { ok: false, grund: 'unavailable' };
    }
    if (antwort.status === 200) return { ok: true, wert };
    if (antwort.status === 401) return { ok: false, grund: 'session_invalid' };
    if (antwort.status === 403) return { ok: false, grund: 'forbidden' };
    const roh = istObjekt(wert) ? wert['message'] : null;
    const meldung = typeof roh === 'string' ? roh : '';
    const treffer = MELDUNGEN.find(([muster]) => muster.test(meldung));
    return { ok: false, grund: treffer ? treffer[1] : 'unavailable' };
  }

  const eingabe = (auftrag: Auftrag, versatz: number) => ({
    p_patient_id: auftrag.patient,
    p_staff_member_id: auftrag.person,
    p_duration_minutes: auftrag.dauerMinuten,
    p_from: auftrag.von,
    p_to: auftrag.bis,
    p_windows: auftrag.wunschzeiten,
    p_offset: versatz,
  });

  return {
    plane: async (authorization, auftrag, versatz) => {
      const r = await rufe(authorization, 'plan_auto_booking', eingabe(auftrag, versatz));
      if (!r.ok) return r;
      // Ohne Recht nennt die Datenbank keine Wege und vermerkt die Abweisung selbst.
      if (r.wert === null) return { ok: false, grund: 'forbidden' };
      const plan = planAus(r.wert);
      return plan === null ? { ok: false, grund: 'unavailable' } : { ok: true, plan };
    },
    buche: async (authorization, auftrag, versatz, fahrzeiten) => {
      const r = await rufe(authorization, 'book_next_appointment', {
        ...eingabe(auftrag, versatz),
        p_legs: fahrzeiten,
        p_treatment_basis_id: auftrag.grundlage,
        p_waitlist_entry_id: auftrag.warteliste,
      });
      if (!r.ok) return r;
      const buchung = buchungAus(r.wert);
      return buchung === null ? { ok: false, grund: 'unavailable' } : { ok: true, buchung };
    },
  };
}
