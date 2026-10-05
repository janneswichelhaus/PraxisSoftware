import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * Deckung und Uebertragung (CAL-022).
 *
 * Zwei Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Planen ist nicht Verbrauchen.** Ueber das Kontingent hinaus darf
 *     geplant werden, `used_quantity <= prescribed_quantity` bleibt trotzdem
 *     bestehen - und was darueber hinausgeht, heisst ungedeckt und ist an
 *     jeder Stelle sichtbar, an der es vorkommt.
 *   * **Uebertragen ist ein Vorgang, kein Nebeneffekt.** Alles oder nichts,
 *     dieselbe Patient:in, nie ein abgerechneter Termin. Einen Auditeintrag
 *     schreibt er seit LOG-EPIC-001 nicht mehr - der Nachweis ist die
 *     Grundlage am Termin.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Behandlungsgrundlagen aus supabase/seed.sql. */
const GRUNDLAGE = {
  /** Max, 10 moegliche Termine, 10 genutzt. */
  maxAusgeschoepft: '88888888-8888-4888-8888-000000000001',
  /** Max, 10 moegliche Termine, 7 genutzt. */
  maxOffen: '88888888-8888-4888-8888-000000000002',
  /** Erika, 6 moegliche Termine, 2 genutzt. */
  erikaAlt: '88888888-8888-4888-8888-000000000003',
  /** Erika, 10 moegliche Termine, 0 genutzt - die Folgeverordnung. */
  erikaFrisch: '88888888-8888-4888-8888-000000000004',
  /** Erika, Selbstzahler, 8 vereinbarte Termine. */
  erikaSelbstzahler: '88888888-8888-4888-8888-000000000005',
} as const;

const ZAHLEN = 'select * from public.get_treatment_basis_slots($1::uuid)';
const ZAHLEN_AKTE = 'select * from public.list_patient_treatment_basis_slots($1::uuid)';
const LISTE =
  'select * from public.list_patient_appointments($1::uuid, $2::boolean, 50, null, null, $3::uuid)';
const UEBERTRAGEN =
  'select public.transfer_appointments_to_treatment_basis($1::uuid, $2::uuid[]) as anzahl';

/**
 * Erfolgreiche Auditeintraege insgesamt. Schreibvorgaenge protokolliert das
 * Auditlog seit LOG-EPIC-001 nicht mehr; der Nachweis steht im Datenmodell.
 */
async function erfolgreicheAuditeintraege(): Promise<number> {
  const { rows } = await asPostgres<{ anzahl: string }>(
    "select count(*)::text as anzahl from public.audit_log where outcome = 'success'",
  );
  return Number(rows[0]!.anzahl);
}

/** Krankengymnastik aus der geltenden Preisliste (supabase/seed.sql). */
const KATALOG_KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';

interface Kontingent {
  prescribed: number;
  used: number;
  planned: number;
  remaining: number;
  covered: number;
  uncovered: number;
}

interface Listenzeile {
  id: string;
  status: string;
  treatment_basis_id: string | null;
  treatment_basis_covered: boolean | null;
}

/**
 * Legt einen Termin relativ zu jetzt an - in Stunden, damit "vergangen" und
 * "kuenftig" nicht an einem festen Datum haengen. Gerechnet wird ab der
 * angebrochenen Stunde, sonst ueberlappen zwei angrenzende Termine um die
 * Millisekunden zwischen zwei Transaktionen.
 */
async function termin(opts: {
  inStunden: number;
  patient?: string;
  status?: 'confirmed' | 'completed' | 'cancelled' | 'documented' | 'invoiced';
  grundlage?: string | null;
}): Promise<string> {
  const status = opts.status ?? 'confirmed';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by, cancelled_at, cancelled_by, cancellation_reason
     ) values (
       $1, $2, $3, $4,
       'practice', $5,
       date_trunc('hour', now()) + make_interval(mins => $6::int),
       date_trunc('hour', now()) + make_interval(mins => $6::int + 60),
       $7,
       case when $5 in ('completed', 'documented', 'invoiced') then now() end,
       case when $5 in ('completed', 'documented', 'invoiced') then $8::uuid end,
       case when $5 = 'cancelled' then now() end,
       case when $5 = 'cancelled' then $8::uuid end,
       case when $5 = 'cancelled' then 'patient_request' end
     ) returning id`,
    [
      organizationId,
      opts.patient ?? patients.erika,
      STAFF_ANNA,
      LOCATION,
      status,
      Math.round(opts.inStunden * 60),
      opts.grundlage === undefined ? GRUNDLAGE.erikaAlt : opts.grundlage,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/** Legt `anzahl` kuenftige Termine an einer Grundlage an, Stunde fuer Stunde. */
async function termine(anzahl: number, grundlage: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < anzahl; i += 1) {
    ids.push(await termin({ inStunden: 24 + i, grundlage }));
  }
  return ids;
}

async function kontingent(grundlage: string): Promise<Kontingent> {
  const { rows } = await asUser<Kontingent>(users.ownerTherapist, ZAHLEN, [grundlage]);
  return rows[0]!;
}

async function liste(patient: string, grundlage: string | null = null): Promise<Listenzeile[]> {
  const { rows } = await asUser<Listenzeile>(users.ownerTherapist, LISTE, [
    patient,
    true,
    grundlage,
  ]);
  return rows;
}

describe('Deckung einer Behandlungsgrundlage', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('zaehlt gedeckt und ungedeckt, ohne das Verbrauchte anzutasten', async () => {
    // Abnahmefall 4: sechs moegliche Termine, zehn geplant.
    await termine(10, GRUNDLAGE.erikaAlt);

    const zahlen = await kontingent(GRUNDLAGE.erikaAlt);
    expect(zahlen.prescribed).toBe(6);
    expect(zahlen.planned).toBe(10);
    expect(zahlen.covered).toBe(6);
    expect(zahlen.uncovered).toBe(4);
    expect(zahlen.remaining).toBe(0);

    // Planen ist nicht Verbrauchen: die genutzte Menge steht unveraendert da.
    const { rows } = await asPostgres<{ used_quantity: number }>(
      'select used_quantity from public.treatment_base_items where treatment_basis_id = $1 order by sort_order',
      [GRUNDLAGE.erikaAlt],
    );
    expect(rows.map((z) => Number(z.used_quantity))).toEqual([2, 1]);
    // Genutzt zaehlt seit ABN-001 durchgefuehrte Termine, nicht die Menge der
    // Position: hier sind alle zehn erst geplant.
    expect(zahlen.used).toBe(0);
  });

  it('haelt die Constraint used_quantity <= prescribed_quantity aufrecht', async () => {
    await termine(10, GRUNDLAGE.erikaAlt);

    await expect(
      asPostgres(
        'update public.treatment_base_items set used_quantity = 7 where treatment_basis_id = $1 and sort_order = 1',
        [GRUNDLAGE.erikaAlt],
      ),
    ).rejects.toThrow(/used_within_prescribed/);
  });

  it('deckt die frueheren Termine und kennzeichnet die spaeteren', async () => {
    const ids = await termine(8, GRUNDLAGE.erikaAlt);

    const zeilen = await liste(patients.erika, GRUNDLAGE.erikaAlt);
    const nachId = new Map(zeilen.map((z) => [z.id, z.treatment_basis_covered]));

    expect(ids.slice(0, 6).map((id) => nachId.get(id))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(ids.slice(6).map((id) => nachId.get(id))).toEqual([false, false]);
  });

  it('laesst einen abgesagten Termin weder decken noch zaehlen', async () => {
    const ids = await termine(6, GRUNDLAGE.erikaAlt);
    await asPostgres(
      `update public.appointments
          set status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              cancellation_reason = 'patient_request'
        where id = $1`,
      [ids[0], users.ownerTherapist],
    );
    const spaeter = await termin({ inStunden: 40, grundlage: GRUNDLAGE.erikaAlt });

    const zahlen = await kontingent(GRUNDLAGE.erikaAlt);
    expect(zahlen.planned).toBe(6);
    expect(zahlen.uncovered).toBe(0);

    const zeilen = await liste(patients.erika, GRUNDLAGE.erikaAlt);
    const nachId = new Map(zeilen.map((z) => [z.id, z.treatment_basis_covered]));
    // Der abgesagte Termin macht keine Aussage, und der Platz rueckt nach.
    expect(nachId.get(ids[0]!)).toBeNull();
    expect(nachId.get(spaeter)).toBe(true);
  });

  it('sagt an einem Termin ohne Grundlage nichts ueber Deckung', async () => {
    const ohne = await termin({ inStunden: 24, grundlage: null });

    const zeilen = await liste(patients.erika);
    expect(zeilen.find((z) => z.id === ohne)?.treatment_basis_covered).toBeNull();
  });

  it('nennt dieselbe Deckung in der Terminsicht wie in der Liste', async () => {
    const ids = await termine(7, GRUNDLAGE.erikaAlt);

    const { rows } = await asUser<{ id: string; treatment_basis_covered: boolean | null }>(
      users.ownerTherapist,
      'select id, treatment_basis_covered from public.appointment_directory where id = any($1::uuid[])',
      [ids],
    );
    const nachId = new Map(rows.map((z) => [z.id, z.treatment_basis_covered]));
    expect(nachId.get(ids[5]!)).toBe(true);
    expect(nachId.get(ids[6]!)).toBe(false);
  });

  it('traegt gedeckt und ungedeckt auch in der Aktenuebersicht', async () => {
    await termine(9, GRUNDLAGE.erikaAlt);

    const { rows } = await asUser<Kontingent & { treatment_basis_id: string }>(
      users.ownerTherapist,
      ZAHLEN_AKTE,
      [patients.erika],
    );
    const alt = rows.find((z) => z.treatment_basis_id === GRUNDLAGE.erikaAlt)!;
    expect(alt.covered).toBe(6);
    expect(alt.uncovered).toBe(3);

    const frisch = rows.find((z) => z.treatment_basis_id === GRUNDLAGE.erikaFrisch)!;
    expect(frisch.covered).toBe(0);
    expect(frisch.uncovered).toBe(0);
  });
});

describe('transfer_appointments_to_treatment_basis', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.invoice_items');
    await asPostgres('delete from public.invoices');
    await asPostgres('delete from public.invoice_number_series');
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.appointments');
    await asPostgres(
      "delete from public.audit_log where action = 'treatment_basis.appointments_transferred'",
    );
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, []])).rejects.toThrow(
      /permission denied/,
    );
  });

  it('weist ein Patientenkonto ab', async () => {
    const ids = await termine(1, GRUNDLAGE.erikaAlt);
    await expect(
      asUser(users.patientErika, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, ids]),
    ).rejects.toThrow(/not allowed to update appointments/);
  });

  it('uebertraegt die ungedeckten Termine vollstaendig und schreibt keinen Auditeintrag (LOG-EPIC-001)', async () => {
    // Abnahmefall 5: zehn Termine an einer Grundlage mit sechs moeglichen,
    // die vier ungedeckten wandern auf die Folgeverordnung.
    const ids = await termine(10, GRUNDLAGE.erikaAlt);
    const ungedeckt = ids.slice(6);
    const auditVorher = await erfolgreicheAuditeintraege();

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, UEBERTRAGEN, [
      GRUNDLAGE.erikaFrisch,
      ungedeckt,
    ]);
    expect(Number(rows[0]!.anzahl)).toBe(4);

    const alt = await kontingent(GRUNDLAGE.erikaAlt);
    expect(alt.planned).toBe(6);
    expect(alt.uncovered).toBe(0);

    const neu = await kontingent(GRUNDLAGE.erikaFrisch);
    expect(neu.planned).toBe(4);
    expect(neu.covered).toBe(4);
    expect(neu.uncovered).toBe(0);

    // Der Nachweis ist die Grundlage am Termin, nicht ein Auditeintrag.
    const verschoben = await asPostgres<{ treatment_basis_id: string }>(
      'select treatment_basis_id from public.appointments where id = any($1::uuid[])',
      [ungedeckt],
    );
    expect(verschoben.rows.map((z) => z.treatment_basis_id)).toEqual(
      Array(4).fill(GRUNDLAGE.erikaFrisch),
    );
    expect(await erfolgreicheAuditeintraege()).toBe(auditVorher);
    // Ohne klinischen Inhalt: Was im Auditlog steht, nennt weder Diagnose,
    // Notiz noch Namen.
    const protokoll = await asPostgres<{ context: Record<string, unknown> }>(
      'select context from public.audit_log',
    );
    expect(JSON.stringify(protokoll.rows.map((z) => z.context))).not.toMatch(
      /diagnos|Nacken|Erika/i,
    );
  });

  it('laesst den Mitteilungsvermerk stehen - der Zeitpunkt aendert sich nicht', async () => {
    const [id] = await termine(1, GRUNDLAGE.erikaAlt);
    const vorher = await asPostgres<{ updated_at: Date }>(
      'select updated_at from public.appointments where id = $1',
      [id],
    );

    await asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, [id]]);

    const nachher = await asPostgres<{ updated_at: Date }>(
      'select updated_at from public.appointments where id = $1',
      [id],
    );
    expect(nachher.rows[0]!.updated_at).toEqual(vorher.rows[0]!.updated_at);
  });

  it('weist eine Zielgrundlage einer anderen Patient:in ab und schreibt nichts', async () => {
    const ids = await termine(3, GRUNDLAGE.erikaAlt);

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.maxOffen, ids]),
    ).rejects.toThrow(/appointments are not transferable/);

    const unveraendert = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.appointments where treatment_basis_id = $1',
      [GRUNDLAGE.erikaAlt],
    );
    expect(Number(unveraendert.rows[0]!.anzahl)).toBe(3);
  });

  it('uebertraegt keinen abgerechneten Termin - alles oder nichts', async () => {
    const offen = await termin({ inStunden: 24, grundlage: GRUNDLAGE.erikaAlt });
    const abgerechnet = await termin({
      inStunden: 26,
      grundlage: GRUNDLAGE.erikaAlt,
      status: 'invoiced',
    });

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [
        GRUNDLAGE.erikaFrisch,
        [offen, abgerechnet],
      ]),
    ).rejects.toThrow(/appointments are not transferable/);

    const geblieben = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.appointments where treatment_basis_id = $1',
      [GRUNDLAGE.erikaAlt],
    );
    expect(Number(geblieben.rows[0]!.anzahl)).toBe(2);
  });

  it('uebertraegt keinen Termin, dessen Leistung abgerechnet ist (R3-001)', async () => {
    // Der Zustand 'invoiced' am Termin entsteht im Betrieb nicht: Abgerechnet
    // ist die Leistung, nicht der Termin (ANN-081). Geprueft wird deshalb der
    // Weg, den die Anwendung wirklich geht - Leistung erfassen, Entwurf,
    // ausstellen.
    const offen = await termin({ inStunden: 24, grundlage: GRUNDLAGE.erikaAlt });
    const abgerechnet = await termin({
      inStunden: -26,
      grundlage: GRUNDLAGE.erikaAlt,
      status: 'documented',
    });

    await asUserCommitted(
      users.office,
      'select public.record_billable_services($1::uuid, $2::jsonb)',
      [abgerechnet, JSON.stringify([{ catalog_item_id: KATALOG_KG, quantity: 1 }])],
    );
    // ABR-032: Die Rechnung fasst die Leistungen der Grundlage des Termins
    // zusammen, nicht eines Monats.
    const { rows: grundlage } = await asPostgres<{ id: string }>(
      'select a.treatment_basis_id as id from public.appointments a where a.id = $1',
      [abgerechnet],
    );
    const { rows: entwurf } = await asUserCommitted<{ id: string }>(
      users.office,
      'select public.create_invoice_draft_for_basis($1::uuid) as id',
      [grundlage[0]!.id],
    );
    await asUserCommitted(users.office, 'select public.issue_invoice($1::uuid)', [entwurf[0]!.id]);

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [
        GRUNDLAGE.erikaFrisch,
        [offen, abgerechnet],
      ]),
    ).rejects.toThrow(/appointments are not transferable/);

    const geblieben = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.appointments where treatment_basis_id = $1',
      [GRUNDLAGE.erikaAlt],
    );
    expect(Number(geblieben.rows[0]!.anzahl)).toBe(2);
  });

  it('uebertraegt keinen abgesagten Termin', async () => {
    const abgesagt = await termin({
      inStunden: 24,
      grundlage: GRUNDLAGE.erikaAlt,
      status: 'cancelled',
    });

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, [abgesagt]]),
    ).rejects.toThrow(/appointments are not transferable/);
  });

  it('weist eine unbekannte Zielgrundlage ab', async () => {
    const ids = await termine(1, GRUNDLAGE.erikaAlt);
    await expect(
      asUser(users.ownerTherapist, UEBERTRAGEN, ['88888888-8888-4888-8888-0000000000ff', ids]),
    ).rejects.toThrow(/treatment basis not found/);
  });

  it('weist eine leere Auswahl ab', async () => {
    await expect(
      asUser(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, []]),
    ).rejects.toThrow(/non-empty array/);
  });

  it('laesst das Office uebertragen - Terminplanung ist seine Aufgabe', async () => {
    const ids = await termine(2, GRUNDLAGE.erikaAlt);

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, UEBERTRAGEN, [
      GRUNDLAGE.erikaSelbstzahler,
      ids,
    ]);
    expect(Number(rows[0]!.anzahl)).toBe(2);
  });
});

describe('Genutzt zaehlt Termine, Nichtantreffen belegt nichts (ABN-001, BEF-096)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.appointments');
  });

  /** Vermerkt ein Nichtantreffen direkt in der Tabelle (Felder wie record_no_show). */
  async function nichtAngetroffen(id: string): Promise<void> {
    await asPostgres(
      `update public.appointments
          set status = 'no_show', no_show_recorded_at = now(), no_show_recorded_by = $2,
              fee_basis = 'no_show'
        where id = $1`,
      [id, users.ownerTherapist],
    );
  }

  it('zaehlt genutzte Termine, nicht die groesste Leistungsmenge', async () => {
    // Die Folgeverordnung hat 10 moegliche Termine und keine genutzte Menge.
    // Zwei durchgefuehrte Termine - in der Praxis Termin 1 KG, Termin 2 MT -
    // sind zwei genutzte Termine, auch wenn je Heilmittel nur eine Einheit
    // abgerechnet wuerde (ANN-064, ANN-073: getrennte Groessen).
    await termin({ inStunden: -48, status: 'completed', grundlage: GRUNDLAGE.erikaFrisch });
    await termin({ inStunden: -24, status: 'documented', grundlage: GRUNDLAGE.erikaFrisch });
    await termin({ inStunden: 24, grundlage: GRUNDLAGE.erikaFrisch });

    const zahlen = await kontingent(GRUNDLAGE.erikaFrisch);
    expect(zahlen.prescribed).toBe(10);
    expect(zahlen.used).toBe(2);
    expect(zahlen.planned).toBe(3);
    expect(zahlen.remaining).toBe(7);

    // Die Leistungsmenge der Position bleibt, was die Abrechnung geschrieben hat.
    const { rows } = await asPostgres<{ used_quantity: number }>(
      'select used_quantity from public.treatment_base_items where treatment_basis_id = $1',
      [GRUNDLAGE.erikaFrisch],
    );
    expect(rows.map((z) => Number(z.used_quantity))).toEqual([0]);
  });

  it('zaehlt eine Doppelbehandlung oder mehrere Heilmittel im selben Termin einmal', async () => {
    const id = await termin({
      inStunden: -24,
      status: 'completed',
      grundlage: GRUNDLAGE.erikaFrisch,
    });
    // Zwei erfasste Leistungen am selben Termin (KG als Doppelbehandlung).
    await asPostgres(
      `insert into public.billable_services
         (organization_id, patient_id, appointment_id, catalog_item_id, quantity, performed_on, created_by)
       values ($1, $2, $3, $4, 2, current_date - 1, $5)`,
      [organizationId, patients.erika, id, KATALOG_KG, users.ownerTherapist],
    );

    const zahlen = await kontingent(GRUNDLAGE.erikaFrisch);
    expect(zahlen.used).toBe(1);
    expect(zahlen.planned).toBe(1);
  });

  it('laesst ein Nichtantreffen weder belegen noch verbrauchen noch decken', async () => {
    const ids = await termine(6, GRUNDLAGE.erikaAlt);
    await nichtAngetroffen(ids[0]!);
    const spaeter = await termin({ inStunden: 40, grundlage: GRUNDLAGE.erikaAlt });

    const zahlen = await kontingent(GRUNDLAGE.erikaAlt);
    // Sechs moegliche, sechs verplante: der nicht angetroffene zaehlt nicht.
    expect(zahlen.planned).toBe(6);
    expect(zahlen.used).toBe(0);
    expect(zahlen.uncovered).toBe(0);
    expect(zahlen.covered).toBe(6);

    const zeilen = await liste(patients.erika, GRUNDLAGE.erikaAlt);
    const nachId = new Map(zeilen.map((z) => [z.id, z.treatment_basis_covered]));
    expect(nachId.get(ids[0]!)).toBeNull();
    expect(nachId.get(spaeter)).toBe(true);

    // Die Akte zaehlt ihn auch nicht zu den bevorstehenden.
    const { rows } = await asUser<{ treatment_basis_id: string; upcoming: number }>(
      users.ownerTherapist,
      ZAHLEN_AKTE,
      [patients.erika],
    );
    expect(rows.find((z) => z.treatment_basis_id === GRUNDLAGE.erikaAlt)!.upcoming).toBe(6);
  });

  it('haelt die Ueberplanung als ungedeckt sichtbar', async () => {
    const ids = await termine(8, GRUNDLAGE.erikaAlt);
    await nichtAngetroffen(ids[7]!);

    const zahlen = await kontingent(GRUNDLAGE.erikaAlt);
    expect(zahlen.planned).toBe(7);
    expect(zahlen.covered).toBe(6);
    expect(zahlen.uncovered).toBe(1);
  });

  it('heilt sich, wenn ein Nichtantreffen wieder geoeffnet wird', async () => {
    const ids = await termine(2, GRUNDLAGE.erikaFrisch);
    await nichtAngetroffen(ids[0]!);
    expect((await kontingent(GRUNDLAGE.erikaFrisch)).planned).toBe(1);

    await asPostgres(
      `update public.appointments
          set status = 'confirmed', no_show_recorded_at = null, no_show_recorded_by = null,
              fee_basis = null
        where id = $1`,
      [ids[0]],
    );
    expect((await kontingent(GRUNDLAGE.erikaFrisch)).planned).toBe(2);
  });
});

describe('Leistungen ziehen bei einer Uebertragung mit (ABN-002, BEF-097)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.invoice_items');
    await asPostgres('delete from public.invoices');
    await asPostgres('delete from public.invoice_number_series');
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.appointments');
    await asPostgres('update public.treatment_base_items set used_quantity = 0');
    await asPostgres(
      "delete from public.audit_log where action = 'treatment_basis.appointments_transferred'",
    );
  });

  async function mengen(grundlage: string): Promise<Record<string, number>> {
    const { rows } = await asPostgres<{ remedy: string; used_quantity: number }>(
      'select remedy, used_quantity from public.treatment_base_items where treatment_basis_id = $1',
      [grundlage],
    );
    return Object.fromEntries(rows.map((z) => [z.remedy, Number(z.used_quantity)]));
  }

  async function erfassen(terminId: string): Promise<void> {
    await asUserCommitted(
      users.office,
      'select public.record_billable_services($1::uuid, $2::jsonb)',
      [terminId, JSON.stringify([{ catalog_item_id: KATALOG_KG, quantity: 1 }])],
    );
  }

  it('zieht eine erfasste Leistung samt Menge auf die Position des Ziels', async () => {
    // Erika frisch (KG) -> Erika Selbstzahler (KG). Ein durchgefuehrter Termin
    // mit erfasster KG.
    const id = await termin({
      inStunden: -26,
      grundlage: GRUNDLAGE.erikaFrisch,
      status: 'documented',
    });
    await erfassen(id);
    expect((await mengen(GRUNDLAGE.erikaFrisch)).Krankengymnastik).toBe(1);
    const auditVorher = await erfolgreicheAuditeintraege();

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, UEBERTRAGEN, [
      GRUNDLAGE.erikaSelbstzahler,
      [id],
    ]);
    expect(Number(rows[0]!.anzahl)).toBe(1);

    // Die Menge ist gewandert, die Summe beider Grundlagen bleibt.
    expect((await mengen(GRUNDLAGE.erikaFrisch)).Krankengymnastik).toBe(0);
    expect((await mengen(GRUNDLAGE.erikaSelbstzahler)).Krankengymnastik).toBe(1);

    // Die Leistung zeigt auf die Position des Ziels.
    const leistung = await asPostgres<{ basis: string }>(
      `select p.treatment_basis_id as basis
         from public.billable_services b
         join public.treatment_base_items p on p.id = b.treatment_base_item_id
        where b.appointment_id = $1`,
      [id],
    );
    expect(leistung.rows[0]!.basis).toBe(GRUNDLAGE.erikaSelbstzahler);

    // Der durchgefuehrte Termin zaehlt am Ziel als genutzt (ABN-001).
    expect((await kontingent(GRUNDLAGE.erikaSelbstzahler)).used).toBe(1);

    // Die bewegte Menge zeigt das Datenmodell oben; ins Auditlog geht nichts
    // (LOG-EPIC-001).
    expect(await erfolgreicheAuditeintraege()).toBe(auditVorher);
  });

  it('weist ab und aendert nichts, wenn das Ziel keine Position fuer das Heilmittel hat', async () => {
    // Max' Erstverordnung hat KG und Waermetherapie; Erikas Selbstzahler nur
    // KG. Der Weg Max -> Erika scheitert schon an der Patient:in, deshalb
    // ein Ziel derselben Person ohne die Position: Erika frisch (nur KG)
    // bekommt eine Waermetherapie-Leistung von Erika alt.
    const id = await termin({
      inStunden: -26,
      grundlage: GRUNDLAGE.erikaAlt,
      status: 'documented',
    });
    const { rows: katalog } = await asPostgres<{ id: string }>(
      "select i.id from public.service_catalog_items i join public.service_catalog_versions v on v.id = i.catalog_version_id where i.remedy = 'Waermetherapie' and v.published_at is not null limit 1",
    );
    await asUserCommitted(
      users.office,
      'select public.record_billable_services($1::uuid, $2::jsonb)',
      [id, JSON.stringify([{ catalog_item_id: katalog[0]!.id, quantity: 1 }])],
    );

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, [id]]),
    ).rejects.toThrow(/no position for remedy Waermetherapie/);

    expect((await mengen(GRUNDLAGE.erikaAlt)).Waermetherapie).toBe(1);
    const termine = await asPostgres<{ treatment_basis_id: string }>(
      'select treatment_basis_id from public.appointments where id = $1',
      [id],
    );
    expect(termine.rows[0]!.treatment_basis_id).toBe(GRUNDLAGE.erikaAlt);
  });

  it('weist ab, wenn das Kontingent der Zielposition nicht reicht', async () => {
    // Erikas Selbstzahler hat KG 8; wir setzen die Position auf 8 von 8.
    await asPostgres(
      'update public.treatment_base_items set used_quantity = prescribed_quantity where treatment_basis_id = $1',
      [GRUNDLAGE.erikaSelbstzahler],
    );
    const id = await termin({
      inStunden: -26,
      grundlage: GRUNDLAGE.erikaFrisch,
      status: 'documented',
    });
    await erfassen(id);

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.erikaSelbstzahler, [id]]),
    ).rejects.toThrow(/quantity exhausted/);
    expect((await mengen(GRUNDLAGE.erikaFrisch)).Krankengymnastik).toBe(1);
    expect((await mengen(GRUNDLAGE.erikaSelbstzahler)).Krankengymnastik).toBe(8);
  });

  it('zieht ein Ausfallhonorar ohne Mengenbewegung mit und uebertraegt auch durchgefuehrte Termine', async () => {
    const vergangen = await termin({
      inStunden: -50,
      grundlage: GRUNDLAGE.erikaAlt,
      status: 'completed',
    });
    const ohnePosition = await termin({
      inStunden: -26,
      grundlage: GRUNDLAGE.erikaAlt,
      status: 'completed',
    });
    // Eine Leistung ohne Position - wie ein Ausfallhonorar.
    await asPostgres(
      `insert into public.billable_services
         (organization_id, patient_id, appointment_id, catalog_item_id, quantity, performed_on, created_by)
       values ($1, $2, $3, $4, 1, current_date - 1, $5)`,
      [organizationId, patients.erika, ohnePosition, KATALOG_KG, users.ownerTherapist],
    );
    const auditVorher = await erfolgreicheAuditeintraege();

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, UEBERTRAGEN, [
      GRUNDLAGE.erikaFrisch,
      [vergangen, ohnePosition],
    ]);
    expect(Number(rows[0]!.anzahl)).toBe(2);
    expect((await mengen(GRUNDLAGE.erikaFrisch)).Krankengymnastik).toBe(0);

    // Beide Termine und die Leistung ohne Position haengen jetzt am Ziel;
    // ein Auditeintrag entsteht nicht (LOG-EPIC-001).
    const ziel = await asPostgres<{ treatment_basis_id: string }>(
      'select treatment_basis_id from public.appointments where id = any($1::uuid[])',
      [[vergangen, ohnePosition]],
    );
    expect(ziel.rows.map((z) => z.treatment_basis_id)).toEqual([
      GRUNDLAGE.erikaFrisch,
      GRUNDLAGE.erikaFrisch,
    ]);
    const leistungen = await asPostgres<{ anzahl: string }>(
      'select count(*)::text as anzahl from public.billable_services where appointment_id = $1 and treatment_base_item_id is null',
      [ohnePosition],
    );
    expect(Number(leistungen.rows[0]!.anzahl)).toBe(1);
    expect(await erfolgreicheAuditeintraege()).toBe(auditVorher);
  });
});
