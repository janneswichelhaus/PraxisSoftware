import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  jwtClaims,
  resetDatabaseOhneTermine,
  testDatabaseUrl,
} from './helpers/db';

/**
 * B4 und B7 (BEF-154, BEF-157; ADR-009 Fassung 6, ADR-016 Fassung 4, ADR-018
 * Fassung 5, ADR-020 Fassung 2):
 *
 *   * Haken und Doku sind getrennt; kommen beide zusammen - in beliebiger
 *     Reihenfolge -, entsteht die Leistung aus der Grundlage von selbst
 *     (ANN-513). Den Haken zurueckzunehmen nimmt sie mit, solange keine
 *     Rechnung sie fuehrt.
 *   * Ist jeder Termin einer Grundlage abgehakt und dokumentiert, laesst sie
 *     sich „in die Abrechnung stellen“ (ANN-514); danach sind Doku, Zeit,
 *     Haken und Anzahl der Termine gesperrt (ANN-515), bis sie zurueckgeholt
 *     wird - und das geht nur ohne Rechnung.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
/** Erika, Krankengymnastik, 10 Termine, noch nichts genutzt (supabase/seed.sql). */
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';
const POSITION = '99999999-9999-4999-8999-000000000005';

const ABHAKEN = 'select public.complete_appointment($1::uuid, $2::timestamptz) as id';
const ZURUECKNEHMEN = 'select public.reopen_appointment($1::uuid, $2::timestamptz) as id';
const FESTSCHREIBEN =
  'select public.complete_treatment($1::uuid, $2, $3::timestamptz, null, $4::boolean) as id';
const FREIGEBEN = 'select public.release_treatment_basis_for_billing($1::uuid) as zeit';
const ZURUECKHOLEN = 'select public.withdraw_treatment_basis_from_billing($1::uuid)';
const STAND = 'select * from app.treatment_basis_billing($1::uuid)';

/** Roher updated_at-Wert inklusive Bruchteilen - Grundlage der Konfliktpruefung. */
const ROH_UPDATED_AT =
  'to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at';

let stunde = 300;

/** Ein vergangener, bestaetigter Behandlungstermin von Erika bei Anna. */
async function termin(
  opts: { grundlage?: string | null; hausbesuch?: boolean; inStunden?: number } = {},
): Promise<string> {
  stunde += 2;
  const versatz = opts.inStunden !== undefined ? -opts.inStunden : stunde;
  const hausbesuch = opts.hausbesuch ?? false;
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type,
       status, starts_at, ends_at, treatment_basis_id,
       visit_street, visit_house_number, visit_postal_code, visit_city
     ) values (
       $1, $2, $3, case when $6 then null else $4::uuid end,
       case when $6 then 'home_visit' else 'practice' end, 'confirmed',
       date_trunc('hour', now()) - make_interval(hours => $5::int),
       date_trunc('hour', now()) - make_interval(hours => $5::int - 1),
       $7,
       case when $6 then 'Beispielweg' end, case when $6 then '3' end,
       case when $6 then '72070' end, case when $6 then 'Tuebingen' end
     ) returning id`,
    [
      organizationId,
      patients.erika,
      STAFF_ANNA,
      LOCATION,
      versatz,
      hausbesuch,
      opts.grundlage === undefined ? GRUNDLAGE : opts.grundlage,
    ],
  );
  return rows[0]!.id;
}

async function stand(id: string): Promise<string> {
  const { rows } = await asPostgres<{ updated_at: string }>(
    `select ${ROH_UPDATED_AT} from public.appointments where id = $1`,
    [id],
  );
  return rows[0]!.updated_at;
}

async function abhaken(id: string, konto: string = users.therapist) {
  await asUserCommitted(konto, ABHAKEN, [id, await stand(id)]);
}

async function festschreiben(id: string, ohneBehandlung = false) {
  await asUserCommitted(users.therapist, FESTSCHREIBEN, [
    id,
    'Synthetischer Eintrag: Uebungen angeleitet.',
    await stand(id),
    ohneBehandlung,
  ]);
}

async function leistungen(id: string): Promise<string[]> {
  const { rows } = await asPostgres<{ code: string }>(
    `select c.code from public.billable_services b
       join public.service_catalog_items c on c.id = b.catalog_item_id
      where b.appointment_id = $1 order by c.code`,
    [id],
  );
  return rows.map((r) => r.code);
}

async function honorare(id: string): Promise<number> {
  const { rows } = await asPostgres<{ anzahl: string }>(
    'select count(*)::text as anzahl from public.appointment_session_fees where appointment_id = $1',
    [id],
  );
  return Number(rows[0]!.anzahl);
}

async function genutzt(): Promise<number> {
  const { rows } = await asPostgres<{ used_quantity: number }>(
    'select used_quantity from public.treatment_base_items where id = $1',
    [POSITION],
  );
  return rows[0]!.used_quantity;
}

/** Ein Rechnungsentwurf mit den Leistungen eines Termins - direkt, wie das Buero ihn anlegt. */
async function entwurfMit(id: string, grundlage: string | null = null) {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.invoices
       (organization_id, patient_id, period_month, service_area, created_by, treatment_basis_id)
     values ($1, $2, date_trunc('month', current_date)::date, 'therapy', $3, $4)
     returning id`,
    [organizationId, patients.erika, users.office, grundlage],
  );
  await asPostgres(
    `insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
     select b.organization_id, $2, b.id, row_number() over (order by b.id)
       from public.billable_services b where b.appointment_id = $1`,
    [id, rows[0]!.id],
  );
  return rows[0]!.id;
}

async function aufrauemen() {
  await asPostgres('delete from public.invoice_items');
  await asPostgres('delete from public.invoices');
  await asPostgres('delete from public.appointment_session_fees');
  await asPostgres('delete from public.billable_services');
  await asPostgres('delete from public.treatment_note_versions');
  await asPostgres('delete from public.treatment_notes');
  await asPostgres('delete from public.appointments');
  await asPostgres(
    `update public.treatment_bases
        set appointment_count = 10, billing_released_at = null, billing_released_by = null,
            billing_withdrawn_at = null, billing_withdrawn_by = null
      where id = $1`,
    [GRUNDLAGE],
  );
  await asPostgres('update public.treatment_base_items set used_quantity = 0 where id = $1', [
    POSITION,
  ]);
}

describe('Leistung mit dem Haken (B7, ANN-513)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(aufrauemen);

  it('entsteht, wenn Haken und Doku zusammenkommen - erst der Haken', async () => {
    const id = await termin();
    await abhaken(id);
    expect(await leistungen(id)).toEqual([]);

    await festschreiben(id);

    expect(await leistungen(id)).toEqual(['KG']);
    expect(await honorare(id)).toBe(1);
    expect(await genutzt()).toBe(1);
  });

  it('entsteht ebenso, wenn erst die Doku festgeschrieben wird (B4)', async () => {
    const id = await termin();
    await festschreiben(id);
    // Festschreiben hakt nicht ab - ohne Haken ist nichts erbracht.
    expect(await leistungen(id)).toEqual([]);

    await abhaken(id);

    expect(await leistungen(id)).toEqual(['KG']);
    expect(await honorare(id)).toBe(1);
    expect(await genutzt()).toBe(1);
  });

  it('nimmt die Leistung mit dem Haken zurueck - die Doku bleibt', async () => {
    const id = await termin();
    await festschreiben(id);
    await abhaken(id);

    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [id, await stand(id)]);

    expect(await leistungen(id)).toEqual([]);
    expect(await honorare(id)).toBe(0);
    expect(await genutzt()).toBe(0);
    const { rows } = await asPostgres<{ status: string; completed_at: string | null }>(
      'select status, completed_at from public.appointments where id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ status: 'documented', completed_at: null });
  });

  it('haelt den Haken, solange die Leistung in einer Rechnung steht', async () => {
    const id = await termin();
    await festschreiben(id);
    await abhaken(id);
    await entwurfMit(id);

    await expect(asUser(users.therapist, ZURUECKNEHMEN, [id, await stand(id)])).rejects.toThrow(
      /billable services are in billing/,
    );
    expect(await leistungen(id)).toEqual(['KG']);
  });

  it('erfasst ohne Grundlage nichts - das bleibt beim Buero', async () => {
    const id = await termin({ grundlage: null });
    await festschreiben(id);
    await abhaken(id);

    expect(await leistungen(id)).toEqual([]);
    expect(await honorare(id)).toBe(0);
  });

  it('rechnet den Besuch ohne Behandlung normal ab - ohne Ausfallgebuehr (§8, ADR-018 Punkt 9)', async () => {
    const id = await termin({ hausbesuch: true });
    await festschreiben(id, true);
    await abhaken(id);

    expect(await leistungen(id)).toEqual(['KG']);
    expect(await honorare(id)).toBe(1);
    const { rows } = await asPostgres<{ fee_basis: string | null }>(
      'select fee_basis from public.appointments where id = $1',
      [id],
    );
    expect(rows[0]!.fee_basis).toBeNull();
  });

  it('haelt Haken und Doku nicht auf, wenn die Menge erschoepft ist', async () => {
    await asPostgres('update public.treatment_base_items set used_quantity = 10 where id = $1', [
      POSITION,
    ]);
    const id = await termin();
    await festschreiben(id);
    await abhaken(id);

    expect(await leistungen(id)).toEqual([]);
    const { rows } = await asPostgres<{ status: string; completed_at: string | null }>(
      'select status, completed_at from public.appointments where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('documented');
    expect(rows[0]!.completed_at).not.toBeNull();
  });

  it('erfasst nichts, wenn der Haken von jemandem ohne Terminrecht kaeme', async () => {
    const id = await termin();
    await festschreiben(id);
    await expect(asUser(users.trainer, ABHAKEN, [id, await stand(id)])).rejects.toThrow();
    expect(await leistungen(id)).toEqual([]);
  });

  // Zweitreview R3: Ohne Haken ist nichts erbracht - auch das Buero erfasst
  // dann nichts, und nach der Ruecknahme steht der Termin nicht wieder an.
  it('erfasst ohne Haken nichts, auch nicht im Buero, und fuehrt ihn nicht unter „Zu erfassen“', async () => {
    const id = await termin();
    await festschreiben(id);

    const offen = async () => {
      const { rows } = await asUser<{ appointment_id: string }>(
        users.office,
        'select appointment_id from public.list_open_billable_appointments(200)',
      );
      return rows.map((r) => r.appointment_id);
    };
    const { rows: katalog } = await asPostgres<{ id: string }>(
      `select c.id from public.service_catalog_items c
        where c.catalog_version_id = app.active_service_catalog_version($1, current_date)
          and c.code = 'KG'`,
      [organizationId],
    );
    const erfassen = () =>
      asUser(users.office, 'select public.record_billable_services($1::uuid, $2::jsonb)', [
        id,
        JSON.stringify([{ catalog_item_id: katalog[0]!.id, quantity: 1 }]),
      ]);

    expect(await offen()).not.toContain(id);
    await expect(erfassen()).rejects.toThrow(/not checked off/);
    // Auch an der Tabelle selbst, an jedem Weg vorbei.
    await expect(
      asPostgres(
        `insert into public.billable_services
           (organization_id, patient_id, appointment_id, catalog_item_id, performed_on, created_by)
         values ($1, $2, $3, $4, current_date, $5)`,
        [organizationId, patients.erika, id, katalog[0]!.id, users.office],
      ),
    ).rejects.toThrow(/not checked off/);

    await abhaken(id);
    expect(await leistungen(id)).toEqual(['KG']);
    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [id, await stand(id)]);
    expect(await leistungen(id)).toEqual([]);
    expect(await offen()).not.toContain(id);
    await expect(erfassen()).rejects.toThrow(/not checked off/);
  });

  // Zweitreview-Nachpruefung: Die Regel gilt auch, wenn eine Leistung an
  // einen anderen Termin wandert - heute tut das kein Weg, ein kuenftiger
  // haelt sich daran.
  it('haengt keine Leistung an einen Termin ohne Haken um', async () => {
    const abgehakt = await termin();
    await festschreiben(abgehakt);
    await abhaken(abgehakt);
    expect(await leistungen(abgehakt)).toEqual(['KG']);
    const ohneHaken = await termin();

    await expect(
      asPostgres(
        'update public.billable_services set appointment_id = $2 where appointment_id = $1',
        [abgehakt, ohneHaken],
      ),
    ).rejects.toThrow(/not checked off/);
    // Ohne Wechsel des Termins bleibt alles, wie es ist.
    await asPostgres(
      'update public.billable_services set appointment_id = appointment_id where appointment_id = $1',
      [abgehakt],
    );
    expect(await leistungen(abgehakt)).toEqual(['KG']);
    expect(await leistungen(ohneHaken)).toEqual([]);
  });

  // ANN-513 (Zweitreview H1): Der Haken gehoert zum Termin, nicht zur Person.
  // Wer ihn zuruecknehmen darf, nimmt die Leistung mit - auch die einer
  // Kollegin oder die das Buero erfasst hat, solange keine Rechnung sie fuehrt.
  it('nimmt mit dem Haken an einem fremden Termin auch dessen Leistung zurueck', async () => {
    const id = await termin();
    await festschreiben(id);
    await abhaken(id);
    expect(await leistungen(id)).toEqual(['KG']);

    // Der Termin ist Annas; team_lead nimmt den Haken zurueck.
    await asUserCommitted(users.teamLead, ZURUECKNEHMEN, [id, await stand(id)]);
    expect(await leistungen(id)).toEqual([]);
    expect(await honorare(id)).toBe(0);
    expect(await genutzt()).toBe(0);
  });

  // Zweitreview H3: Der naechtliche Lauf schreibt einen Entwurf fest; steht
  // der Haken schon, entsteht dabei die Leistung - ohne den Lauf aufzuhalten.
  it('erfasst die Leistung im naechtlichen Lauf, wenn der Haken vor der Doku stand', async () => {
    const id = await termin();
    await abhaken(id);
    await asUserCommitted(users.therapist, 'select public.create_treatment_note($1::uuid, $2)', [
      id,
      'Synthetischer Entwurf: Uebungen angeleitet.',
    ]);
    await asPostgres(
      "update public.treatment_notes set created_at = created_at - interval '5 days' where appointment_id = $1",
      [id],
    );

    const { rows } = await asPostgres<{ n: number }>(
      'select public.finalize_overdue_treatment_notes() as n',
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1);
    expect(await leistungen(id)).toEqual(['KG']);
    expect(await honorare(id)).toBe(1);
  });
});

describe('In die Abrechnung stellen und Sperre (B7, ANN-514, ANN-515)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await aufrauemen();
    // Eine kleine Grundlage: zwei Termine.
    await asPostgres('update public.treatment_bases set appointment_count = 2 where id = $1', [
      GRUNDLAGE,
    ]);
  });

  /** Beide Termine der Grundlage abgehakt und dokumentiert. */
  async function vollstaendig(): Promise<[string, string]> {
    const a = await termin();
    const b = await termin();
    for (const id of [a, b]) {
      await festschreiben(id);
      await abhaken(id);
    }
    return [a, b];
  }

  it('fuehrt den Stand einer Grundlage an einer Stelle', async () => {
    const offen = await termin();
    let { rows } = await asPostgres<{ state: string; ready: boolean; open_count: number }>(STAND, [
      GRUNDLAGE,
    ]);
    expect(rows[0]).toMatchObject({ state: 'nachholen', ready: false, open_count: 1 });

    await festschreiben(offen);
    await abhaken(offen);
    ({ rows } = await asPostgres(STAND, [GRUNDLAGE]));
    // Einer von zwei: Es fehlen Termine, abrechnen ginge trotzdem schon.
    expect(rows[0]).toMatchObject({ state: 'termine_fehlen', ready: true, open_count: 0 });

    const zweiter = await termin({ inStunden: 48 });
    ({ rows } = await asPostgres(STAND, [GRUNDLAGE]));
    expect(rows[0]).toMatchObject({ state: 'laeuft', ready: false, upcoming: 1 });
    await asPostgres('delete from public.appointments where id = $1', [zweiter]);
  });

  it('stellt eine vollstaendige Grundlage mit einem Tipp in die Abrechnung', async () => {
    await vollstaendig();

    await asUserCommitted(users.therapist, FREIGEBEN, [GRUNDLAGE]);

    const { rows } = await asPostgres<{ billing_released_by: string | null }>(
      'select billing_released_by from public.treatment_bases where id = $1',
      [GRUNDLAGE],
    );
    expect(rows[0]!.billing_released_by).toBe(users.therapist);
    const stand = await asPostgres<{ state: string }>(STAND, [GRUNDLAGE]);
    expect(stand.rows[0]!.state).toBe('in_abrechnung');
  });

  it('weist die Freigabe ab, solange ein Termin offen ist', async () => {
    const fertig = await termin();
    await festschreiben(fertig);
    await abhaken(fertig);
    const ohneHaken = await termin();
    await festschreiben(ohneHaken);

    await expect(asUser(users.therapist, FREIGEBEN, [GRUNDLAGE])).rejects.toThrow(
      /open appointments/,
    );
  });

  it('weist die Freigabe ab, solange ein Nachtrag im Entwurf haengt - der naechtliche Lauf bleibt frei', async () => {
    const [a] = await vollstaendig();
    const { rows: notiz } = await asPostgres<{ id: string }>(
      'select id from public.treatment_notes where appointment_id = $1 and addendum_to_note_id is null',
      [a],
    );
    await asUserCommitted(
      users.therapist,
      'select public.create_treatment_note_addendum($1::uuid, $2)',
      [notiz[0]!.id, 'Synthetischer Nachtrag im Entwurf.'],
    );

    const { rows } = await asPostgres<{ state: string; ready: boolean }>(STAND, [GRUNDLAGE]);
    expect(rows[0]).toMatchObject({ state: 'nachholen', ready: false });
    await expect(asUser(users.therapist, FREIGEBEN, [GRUNDLAGE])).rejects.toThrow(
      /draft documentation/,
    );

    // Der Entwurf ist ueberfaellig: Der Lauf schreibt ihn fest (ADR-016 Punkt 7),
    // danach geht die Freigabe - und der naechste Lauf findet nichts Gesperrtes.
    await asPostgres(
      `update public.treatment_notes set created_at = created_at - interval '5 days'
        where appointment_id = $1 and addendum_to_note_id is not null`,
      [a],
    );
    const lauf = await asPostgres<{ n: number }>(
      'select public.finalize_overdue_treatment_notes() as n',
    );
    expect(lauf.rows[0]!.n).toBeGreaterThanOrEqual(1);
    await asUserCommitted(users.therapist, FREIGEBEN, [GRUNDLAGE]);
    await expect(
      asPostgres('select public.finalize_overdue_treatment_notes() as n'),
    ).resolves.toBeDefined();
  });

  it('sperrt danach Haken, Zeit, neue Termine, Doku und Terminzahl', async () => {
    const [a] = await vollstaendig();
    await asUserCommitted(users.therapist, FREIGEBEN, [GRUNDLAGE]);

    await expect(asUser(users.therapist, ZURUECKNEHMEN, [a, await stand(a)])).rejects.toThrow(
      /treatment basis is in billing/,
    );
    await expect(
      asPostgres(
        "update public.appointments set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = $1",
        [a],
      ),
    ).rejects.toThrow(/treatment basis is in billing/);
    await expect(termin()).rejects.toThrow(/treatment basis is in billing/);
    await expect(
      asPostgres(
        "update public.treatment_notes set content = 'Nachtraeglich geaendert' where appointment_id = $1",
        [a],
      ),
    ).rejects.toThrow(/treatment basis is in billing/);
    await expect(
      asPostgres(
        `insert into public.treatment_note_versions (organization_id, note_id, version_no, content, author_id)
         select organization_id, id, 2, 'Korrektur', $2 from public.treatment_notes where appointment_id = $1`,
        [a, users.therapist],
      ),
    ).rejects.toThrow(/treatment basis is in billing/);
    await expect(
      asPostgres('update public.treatment_bases set appointment_count = 3 where id = $1', [
        GRUNDLAGE,
      ]),
    ).rejects.toThrow(/treatment basis is in billing/);
    await expect(
      asPostgres('update public.treatment_base_items set prescribed_quantity = 12 where id = $1', [
        POSITION,
      ]),
    ).rejects.toThrow(/treatment basis is in billing/);
    // Zweimal freigeben ist keine zweite Freigabe.
    await expect(asUser(users.therapist, FREIGEBEN, [GRUNDLAGE])).rejects.toThrow(
      /already in billing/,
    );
  });

  it('holt ohne Rechnung zurueck und hebt die Sperre auf', async () => {
    const [a] = await vollstaendig();
    await asUserCommitted(users.therapist, FREIGEBEN, [GRUNDLAGE]);

    await asUserCommitted(users.office, ZURUECKHOLEN, [GRUNDLAGE]);

    const { rows } = await asPostgres<{
      billing_released_at: string | null;
      billing_withdrawn_by: string | null;
    }>(
      'select billing_released_at, billing_withdrawn_by from public.treatment_bases where id = $1',
      [GRUNDLAGE],
    );
    expect(rows[0]).toEqual({ billing_released_at: null, billing_withdrawn_by: users.office });
    // Der Haken laesst sich wieder zuruecknehmen.
    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [a, await stand(a)]);
  });

  it('haelt eine Grundlage mit Rechnung in der Abrechnung', async () => {
    const [a] = await vollstaendig();
    await asUserCommitted(users.therapist, FREIGEBEN, [GRUNDLAGE]);
    await entwurfMit(a, GRUNDLAGE);

    await expect(asUser(users.office, ZURUECKHOLEN, [GRUNDLAGE])).rejects.toThrow(/has an invoice/);
  });

  it('laesst Behandelnde und Buero freigeben, sonst niemanden (ADR-004)', async () => {
    await vollstaendig();

    // Trainingsbetreuung, Konto ohne Praxisrolle, Plattformkonto: abgewiesen.
    for (const konto of [users.trainer, users.patientMax, users.plattformErika]) {
      await expect(asUser(konto, FREIGEBEN, [GRUNDLAGE])).rejects.toThrow(
        /not allowed|not authenticated/,
      );
    }
    // Die Praxisinhaber:in einer fremden Praxis kennt die Grundlage nicht.
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, FREIGEBEN, [GRUNDLAGE])).rejects.toThrow(/not found/);
    // Unbekannt und fremd sehen gleich aus.
    await expect(
      asUser(users.office, FREIGEBEN, ['88888888-8888-4888-8888-0000000000ff']),
    ).rejects.toThrow(/not found/);

    await asUserCommitted(users.office, FREIGEBEN, [GRUNDLAGE]);
  });

  it('laesst nur Behandelnde und Buero zurueckholen, sonst niemanden (ADR-004)', async () => {
    await vollstaendig();
    await asUserCommitted(users.therapist, FREIGEBEN, [GRUNDLAGE]);

    for (const konto of [users.trainer, users.patientMax, users.plattformErika]) {
      await expect(asUser(konto, ZURUECKHOLEN, [GRUNDLAGE])).rejects.toThrow(
        /not allowed|not authenticated/,
      );
    }
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, ZURUECKHOLEN, [GRUNDLAGE])).rejects.toThrow(/not found/);
    await expect(
      asUser(users.office, ZURUECKHOLEN, ['88888888-8888-4888-8888-0000000000ff']),
    ).rejects.toThrow(/not found/);
    await expect(asAnon(ZURUECKHOLEN, [GRUNDLAGE])).rejects.toThrow(/permission denied/);
    await expect(asAnon(FREIGEBEN, [GRUNDLAGE])).rejects.toThrow(/permission denied/);

    // Die Freigabe steht unveraendert.
    const { rows } = await asPostgres<{ billing_released_at: string | null }>(
      'select billing_released_at from public.treatment_bases where id = $1',
      [GRUNDLAGE],
    );
    expect(rows[0]!.billing_released_at).not.toBeNull();
  });

  // Zweitreview H2: Loeschen hebelte die Sperre aus - die Termine verloren
  // die Zuordnung und waren wieder frei.
  it('loescht keine Grundlage, die in der Abrechnung steht', async () => {
    await vollstaendig();
    await asUserCommitted(users.therapist, FREIGEBEN, [GRUNDLAGE]);

    await expect(
      asUser(users.ownerTherapist, 'select public.delete_treatment_basis($1::uuid)', [GRUNDLAGE]),
    ).rejects.toThrow(/treatment basis is in billing/);
    const { rows } = await asPostgres<{ anzahl: string }>(
      'select count(*)::text as anzahl from public.treatment_bases where id = $1',
      [GRUNDLAGE],
    );
    expect(rows[0]!.anzahl).toBe('1');
  });

  // Zweitreview-Nachpruefung: Freigabe und Loeschen zur selben Zeit. Das
  // Loeschen wartet auf die Freigabe und weist dann ab, statt die eben
  // freigegebene Grundlage mitzunehmen.
  it('loescht auch bei gleichzeitiger Freigabe nicht', async () => {
    await vollstaendig();
    const freigabe = new Client({ connectionString: testDatabaseUrl() });
    const loeschen = new Client({ connectionString: testDatabaseUrl() });
    await freigabe.connect();
    await loeschen.connect();
    try {
      for (const [verbindung, konto] of [
        [freigabe, users.therapist],
        [loeschen, users.ownerTherapist],
      ] as const) {
        await verbindung.query('begin');
        await verbindung.query("select set_config('role', 'authenticated', true)");
        await verbindung.query("select set_config('request.jwt.claims', $1, true)", [
          jwtClaims(konto),
        ]);
      }
      await freigabe.query(FREIGEBEN, [GRUNDLAGE]);
      const { rows: prozess } = await loeschen.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      );
      const versuch = loeschen
        .query('select public.delete_treatment_basis($1::uuid)', [GRUNDLAGE])
        .then(
          () => null,
          (fehler: Error) => fehler,
        );
      // Das Loeschen steht an der Sperre der noch offenen Freigabe.
      await vi.waitFor(
        async () => {
          const { rows } = await asPostgres<{ wartet: string | null }>(
            'select wait_event_type as wartet from pg_stat_activity where pid = $1',
            [prozess[0]!.pid],
          );
          expect(rows[0]?.wartet).toBe('Lock');
        },
        { timeout: 15_000, interval: 50 },
      );
      await freigabe.query('commit');

      expect((await versuch)?.message).toMatch(/treatment basis is in billing/);
    } finally {
      await freigabe.query('rollback').catch(() => undefined);
      await loeschen.query('rollback').catch(() => undefined);
      await freigabe.end();
      await loeschen.end();
    }
    const { rows } = await asPostgres<{ anzahl: string }>(
      `select count(*)::text as anzahl from public.treatment_bases
        where id = $1 and billing_released_at is not null`,
      [GRUNDLAGE],
    );
    expect(rows[0]!.anzahl).toBe('1');
  });

  it('gibt die Spalten nicht zum direkten Schreiben frei', async () => {
    await expect(
      asUser(
        users.ownerTherapist,
        'update public.treatment_bases set billing_released_at = now(), billing_released_by = $2 where id = $1',
        [GRUNDLAGE, users.ownerTherapist],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
