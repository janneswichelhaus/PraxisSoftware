import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
  tagInTagen,
} from './helpers/db';

/**
 * ERN-011 (Beratung abrechnen, ANN-622, ANN-664, ANN-665): die
 * Ernährungsberatung als eigener Terminanlass.
 *
 *   * Angelegt allein mit der Fähigkeit „Ernährungsberatung“ (owner) und nur
 *     am laufenden Profil mit Einwilligung - an der Akte im Kontext
 *     'therapy', am Trainingsverhältnis im Kontext 'training' (ADR-022
 *     Punkt 2: kein vierter Kontext).
 *   * Mit dem Haken entsteht die Position „Ernährungsberatung“ des Bereichs;
 *     sie steht auf der Rechnung dieses Bereichs (ADR-027 Punkt 15).
 *   * Keine Behandlungsdoku, kein Trainingsprotokoll, kein Gebührenanlass,
 *     kein Terminhonorar; ein Trainingspaket deckt die Beratung nicht.
 */

const { users, patients, trainingRelationships, organizationId } = SEED;

const PROFIL_ERIKA = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';
const STAFF_JANNES = '55555555-5555-4555-8555-000000000001';
const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  paket3: 'cccccccc-cccc-4ccc-8ccc-000000000014',
  beratung: 'cccccccc-cccc-4ccc-8ccc-000000000024',
  beratungTraining: 'cccccccc-cccc-4ccc-8ccc-000000000025',
} as const;

const ANLEGEN = `select public.create_nutrition_appointment($1::uuid, $2::uuid, 'practice', $3::date,
  $4::time, $5::time, $6::uuid, true, false) as id`;
const HAUSBESUCH = `select public.create_nutrition_appointment($1::uuid, $2::uuid, 'home_visit',
  $3::date, $4::time, $5::time, null, true, false) as id`;
const ABSCHLIESSEN = 'select public.complete_appointment($1::uuid, $2::timestamptz) as id';
const OEFFNEN = 'select public.reopen_appointment($1::uuid, $2::timestamptz) as id';
const ERFASSEN = 'select public.record_billable_services($1::uuid, $2::jsonb) as n';
const VORSCHLAG = 'select * from public.get_billable_service_draft($1::uuid)';
const OFFENE = 'select * from public.list_open_billable_appointments(100)';
const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date, $3::text) as id';
const TRAININGSENTWURF = 'select public.create_training_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const EINWILLIGUNG = 'select public.record_nutrition_consent($1::uuid, $2, $3::date) as id';
const BEENDEN = 'select public.end_nutrition_profile($1::uuid, $2::date)';
const ABSAGEN = `select public.cancel_appointment($1::uuid, $2::timestamptz, 'patient_request',
  (now() at time zone 'Europe/Berlin')::date,
  date_trunc('minute', now() at time zone 'Europe/Berlin')::time) as id`;
const NICHT_ANGETROFFEN = 'select public.record_no_show($1::uuid, $2::timestamptz, false)';
const DOKUMENTIEREN = 'select public.create_treatment_note($1::uuid, $2) as id';
const KALENDER = 'select * from public.list_appointments($1::date, $2::date, null, null, $3)';

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function heute(): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    'select app.training_today($1::uuid)::text as tag',
    [organizationId],
  );
  return rows[0]!.tag;
}

async function stand(id: string): Promise<string> {
  const { rows } = await asPostgres<{ updated_at: string }>(
    'select updated_at::text from public.appointments where id = $1',
    [id],
  );
  return rows[0]!.updated_at;
}

/** Ein Beratungstermin in einer Woche, angelegt von der Beratung. */
async function beratungstermin(
  profil = PROFIL_ERIKA,
  opts: { staff?: string; beginn?: string; tage?: number } = {},
): Promise<string> {
  const beginn = opts.beginn ?? '10:00';
  const [h, m] = beginn.split(':').map(Number) as [number, number];
  const ende = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
    profil,
    opts.staff ?? STAFF_JANNES,
    tagInTagen(opts.tage ?? 7),
    beginn,
    ende,
    LOCATION,
  ]);
  return rows[0]!.id;
}

/** Legt den Termin auf den Anfang des laufenden Monats - für die Monatsrechnung. */
async function inDenLaufendenMonat(id: string, stunde = 9): Promise<string> {
  await asPostgres(
    `update public.appointments
        set starts_at = (date_trunc('month', now() at time zone 'Europe/Berlin')
                           + make_interval(hours => $2::int)) at time zone 'Europe/Berlin',
            ends_at   = (date_trunc('month', now() at time zone 'Europe/Berlin')
                           + make_interval(hours => $2::int + 1)) at time zone 'Europe/Berlin'
      where id = $1`,
    [id, stunde],
  );
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

async function abhaken(id: string, wer: string = users.ownerTherapist): Promise<void> {
  await asUserCommitted(wer, ABSCHLIESSEN, [id, await stand(id)]);
}

async function leistungen(id: string) {
  const { rows } = await asPostgres<{
    catalog_item_id: string;
    service_area: string;
    quantity: number;
    patient_id: string | null;
    training_relationship_id: string | null;
    created_by: string;
  }>(
    `select catalog_item_id, service_area, quantity, patient_id, training_relationship_id, created_by
       from public.billable_services where appointment_id = $1`,
    [id],
  );
  return rows;
}

/**
 * Ein laufendes Profil mit Einwilligung an Tinas Trainingsverhältnis. Die
 * Zuordnung folgt dem Kontext: Am Trainingstermin steht, wer im
 * Trainingskalender geführt wird (ANN-226) - Jannes nimmt sich dort auf.
 */
async function profilTina(): Promise<string> {
  await asPostgres('update public.staff_members set schedulable_training = true where id = $1', [
    STAFF_JANNES,
  ]);
  const { rows } = await asUserCommitted<{ id: string }>(
    users.ownerTherapist,
    `select public.create_nutrition_profile('training', $1::uuid, $2::date, 170::smallint,
       65::numeric, 'female', 1.6::numeric, 'maintain', null, null, null) as id`,
    [trainingRelationships.tina, await heute()],
  );
  return rows[0]!.id;
}

describe('ERN-011: Ernährungsberatung als Terminanlass', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  describe('Anlegen', () => {
    it('legt an der Akte einen Behandlungskontext mit dem Anlass an - ohne Grundlage', async () => {
      const id = await beratungstermin();
      const { rows } = await asPostgres(
        `select kind, occasion, patient_id, training_relationship_id, treatment_basis_id, status
           from public.appointments where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        kind: 'therapy',
        occasion: 'nutrition_counselling',
        patient_id: patients.erika,
        training_relationship_id: null,
        treatment_basis_id: null,
        status: 'confirmed',
      });
    });

    it('legt am Trainingsverhältnis einen Trainingskontext mit dem Anlass an', async () => {
      const profil = await profilTina();
      const id = await beratungstermin(profil);
      const { rows } = await asPostgres(
        'select kind, occasion, patient_id, training_relationship_id from public.appointments where id = $1',
        [id],
      );
      expect(rows[0]).toEqual({
        kind: 'training',
        occasion: 'nutrition_counselling',
        patient_id: null,
        training_relationship_id: trainingRelationships.tina,
      });
    });

    it.each([
      ['Büro', users.office],
      ['Therapie', users.therapist],
      ['Teamleitung', users.teamLead],
      ['Trainingsbetreuung', users.trainer],
    ])('%s legt keinen Beratungstermin an', async (_rolle, wer) => {
      expect(
        await fehler(
          asUser(wer, ANLEGEN, [
            PROFIL_ERIKA,
            STAFF_JANNES,
            tagInTagen(7),
            '10:00',
            '11:00',
            LOCATION,
          ]),
        ),
      ).toBe('42501');
    });

    it('eine fremde Praxis findet das Profil nicht', async () => {
      await fremdeOrganisation();
      expect(
        await fehler(
          asUser(FREMDE_ORGANISATION.owner, ANLEGEN, [
            PROFIL_ERIKA,
            FREMDE_ORGANISATION.staffMember,
            tagInTagen(7),
            '10:00',
            '11:00',
            LOCATION,
          ]),
        ),
      ).toBe('P0002');
    });

    it('ohne Einwilligung und am beendeten Profil entsteht kein Termin', async () => {
      await asUserCommitted(users.ownerTherapist, EINWILLIGUNG, [
        PROFIL_ERIKA,
        'consent_withdrawn',
        await heute(),
      ]);
      const versuch = [PROFIL_ERIKA, STAFF_JANNES, tagInTagen(7), '10:00', '11:00', LOCATION];
      expect(await fehler(asUser(users.ownerTherapist, ANLEGEN, versuch))).toBe('42501');

      await asUserCommitted(users.ownerTherapist, BEENDEN, [PROFIL_ERIKA, await heute()]);
      expect(await fehler(asUser(users.ownerTherapist, ANLEGEN, versuch))).toBe('22023');

      const { rows } = await asPostgres('select count(*)::int as n from public.appointments');
      expect(rows[0]).toEqual({ n: 0 });
    });

    it('die Belegung gilt über alle Kontexte und sagt nur „belegt“', async () => {
      await beratungstermin();
      expect(
        await fehler(
          asUser(users.ownerTherapist, ANLEGEN, [
            PROFIL_ERIKA,
            STAFF_JANNES,
            tagInTagen(7),
            '10:00',
            '11:00',
            LOCATION,
          ]),
        ),
      ).toBe('23P01');
    });

    it('der Anlass steht mit dem Anlegen fest - in beide Richtungen', async () => {
      const id = await beratungstermin();
      expect(
        await fehler(
          asPostgres(`update public.appointments set occasion = 'regular' where id = $1`, [id]),
        ),
      ).toBe('22023');

      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.appointments (organization_id, patient_id, staff_member_id, location_id,
           appointment_type, status, starts_at, ends_at)
         values ($1, $2, $3, $4, 'practice', 'confirmed', now() + interval '3 days',
                 now() + interval '3 days 1 hour') returning id`,
        [organizationId, patients.erika, STAFF_ANNA, LOCATION],
      );
      // Ein Termin aus einer früheren Transaktion wird nicht nachträglich zur Beratung.
      expect(
        await fehler(
          asPostgres(
            `update public.appointments set occasion = 'nutrition_counselling' where id = $1`,
            [rows[0]!.id],
          ),
        ),
      ).toBe('22023');
    });

    it('schemaseitig: keine Grundlage, keine Vereinbarung, kein interner Termin', async () => {
      const { rows: grundlage } = await asPostgres<{ id: string }>(
        'select id from public.treatment_bases where patient_id = $1 limit 1',
        [patients.erika],
      );
      expect(
        await fehler(
          asPostgres(
            `insert into public.appointments (organization_id, patient_id, staff_member_id, location_id,
               appointment_type, status, starts_at, ends_at, occasion, treatment_basis_id)
             values ($1, $2, $3, $4, 'practice', 'confirmed', now() + interval '3 days',
                     now() + interval '3 days 1 hour', 'nutrition_counselling', $5)`,
            [organizationId, patients.erika, STAFF_ANNA, LOCATION, grundlage[0]!.id],
          ),
        ),
      ).toBe('23514');
      expect(
        await fehler(
          asPostgres(
            `insert into public.appointments (organization_id, kind, title, event_group_id,
               staff_member_id, location_id, appointment_type, status, starts_at, ends_at, occasion)
             values ($1, 'internal', 'Besprechung', gen_random_uuid(), $2, $3, 'practice',
                     'confirmed', now() + interval '3 days', now() + interval '3 days 1 hour',
                     'nutrition_counselling')`,
            [organizationId, STAFF_ANNA, LOCATION],
          ),
        ),
      ).toBe('23514');
    });
  });

  describe('Haken, Leistung und Rechnung', () => {
    it('mit dem Haken entsteht die Position der Akte - ohne Terminhonorar - und geht auf die Rechnung', async () => {
      const id = await beratungstermin();
      const monat = await inDenLaufendenMonat(id);
      await abhaken(id);

      expect(await leistungen(id)).toEqual([
        {
          catalog_item_id: KATALOG.beratung,
          service_area: 'therapy',
          quantity: 1,
          patient_id: patients.erika,
          training_relationship_id: null,
          created_by: users.ownerTherapist,
        },
      ]);
      const { rows: honorar } = await asPostgres(
        'select count(*)::int as n from public.appointment_session_fees where appointment_id = $1',
        [id],
      );
      expect(honorar[0]).toEqual({ n: 0 });

      // Nichts mehr „zu erfassen“.
      const { rows: offen } = await asUser<{ appointment_id: string }>(users.office, OFFENE);
      expect(offen.map((r) => r.appointment_id)).not.toContain(id);

      const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        monat,
        'therapy',
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [entwurf[0]!.id]);
      const { rows: ansicht } = await asUser<{
        ansicht: {
          document: {
            service_area: string;
            items: { code: string; tax_treatment: string }[];
            invoice_number?: string;
          };
        };
      }>(users.office, 'select public.get_invoice($1::uuid) as ansicht', [entwurf[0]!.id]);
      const dokument = ansicht[0]!.ansicht.document;
      expect(dokument.service_area).toBe('therapy');
      expect(dokument.items).toEqual([
        expect.objectContaining({ code: 'ERN', tax_treatment: 'taxable' }),
      ]);
      const { rows: status } = await asPostgres(
        'select status from public.billable_services where appointment_id = $1',
        [id],
      );
      expect(status).toEqual([{ status: 'invoiced' }]);
    });

    it('am Trainingsverhältnis: Position des Trainings und Trainingsrechnung', async () => {
      const id = await beratungstermin(await profilTina());
      const monat = await inDenLaufendenMonat(id);
      await abhaken(id);

      expect(await leistungen(id)).toEqual([
        expect.objectContaining({
          catalog_item_id: KATALOG.beratungTraining,
          service_area: 'training',
          patient_id: null,
          training_relationship_id: trainingRelationships.tina,
        }),
      ]);

      await asUserCommitted(users.office, TRAININGSENTWURF, [trainingRelationships.tina, monat]);
      const { rows: posten } = await asPostgres(
        `select i.service_area from public.invoice_items it
           join public.invoices i on i.id = it.invoice_id
           join public.billable_services b on b.id = it.billable_service_id
          where b.appointment_id = $1`,
        [id],
      );
      expect(posten).toEqual([{ service_area: 'training' }]);
    });

    it('ein Trainingspaket deckt die Beratung nicht', async () => {
      const id = await beratungstermin(await profilTina());
      await asUserCommitted(
        users.office,
        'select public.create_training_package($1::uuid, $2::uuid, $3::date)',
        [trainingRelationships.tina, KATALOG.paket3, await heute()],
      );
      await abhaken(id);
      expect(await leistungen(id)).toEqual([
        expect.objectContaining({ catalog_item_id: KATALOG.beratungTraining }),
      ]);
    });

    it('zurück mit dem Haken fällt die Position - in beiden Bereichen', async () => {
      const akte = await beratungstermin();
      const training = await beratungstermin(await profilTina(), { beginn: '12:00' });
      for (const id of [akte, training]) {
        await abhaken(id);
        expect(await leistungen(id)).toHaveLength(1);
        await asUserCommitted(users.ownerTherapist, OEFFNEN, [id, await stand(id)]);
        expect(await leistungen(id)).toEqual([]);
        const { rows } = await asPostgres(
          'select status, occasion from public.appointments where id = $1',
          [id],
        );
        expect(rows[0]).toEqual({ status: 'confirmed', occasion: 'nutrition_counselling' });
      }
    });

    it('ohne erfasste Position steht der abgehakte Termin unter „Zu erfassen“ - mit der Beratung als Vorschlag', async () => {
      const id = await beratungstermin();
      await abhaken(id);
      // Wie ohne Position in der Preisliste: Der Haken hat nichts erfasst.
      await asPostgres('delete from public.billable_services where appointment_id = $1', [id]);

      const { rows: offen } = await asUser<{ appointment_id: string; occasion: string }>(
        users.office,
        OFFENE,
      );
      expect(offen).toContainEqual(
        expect.objectContaining({ appointment_id: id, occasion: 'nutrition_counselling' }),
      );
      const { rows: vorschlag } = await asUser<{ catalog_item_id: string; suggested: boolean }>(
        users.office,
        VORSCHLAG,
        [id],
      );
      expect(vorschlag.every((v) => v.suggested)).toBe(true);
      expect(vorschlag.map((v) => v.catalog_item_id)).toContain(KATALOG.beratung);

      // Eine Heilmittelposition passt nicht zum Anlass.
      expect(
        await fehler(
          asUser(users.office, ERFASSEN, [
            id,
            JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
          ]),
        ),
      ).toBe('22023');
      await asUserCommitted(users.office, ERFASSEN, [
        id,
        JSON.stringify([{ catalog_item_id: KATALOG.beratung, quantity: 1 }]),
      ]);
      expect(await leistungen(id)).toHaveLength(1);
    });

    it('vor dem Haken entsteht nichts, auch nicht im Büro', async () => {
      const id = await beratungstermin();
      expect(
        await fehler(
          asUser(users.office, ERFASSEN, [
            id,
            JSON.stringify([{ catalog_item_id: KATALOG.beratung, quantity: 1 }]),
          ]),
        ),
      ).toBe('22023');
    });

    it('Behandelnde erfassen an der Beratung nichts, auch nicht am eigenen Termin', async () => {
      const id = await beratungstermin(PROFIL_ERIKA, { staff: STAFF_ANNA });
      await abhaken(id);
      await asPostgres('delete from public.billable_services where appointment_id = $1', [id]);
      const { rows } = await asUser(users.therapist, VORSCHLAG, [id]);
      expect(rows).toEqual([]);
      expect(
        await fehler(
          asUser(users.therapist, ERFASSEN, [
            id,
            JSON.stringify([{ catalog_item_id: KATALOG.beratung, quantity: 1 }]),
          ]),
        ),
      ).toBe('42501');
    });

    it('die Position der Beratung steht an keinem anderen Termin', async () => {
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.appointments (organization_id, kind, training_relationship_id,
           staff_member_id, location_id, appointment_type, status, starts_at, ends_at,
           completed_at, completed_by)
         values ($1, 'training', $2, $3, $4, 'practice', 'completed', now() - interval '2 hours',
                 now() - interval '1 hour', now(), $5) returning id`,
        [organizationId, trainingRelationships.erika, STAFF_JANNES, LOCATION, users.ownerTherapist],
      );
      expect(
        await fehler(
          asUser(users.office, ERFASSEN, [
            rows[0]!.id,
            JSON.stringify([{ catalog_item_id: KATALOG.beratungTraining, quantity: 1 }]),
          ]),
        ),
      ).toBe('22023');
      // Am Schreibweg vorbei hält der Trigger.
      expect(
        await fehler(
          asPostgres(
            `insert into public.billable_services (organization_id, training_relationship_id,
               appointment_id, catalog_item_id, quantity, performed_on)
             values ($1, $2, $3, $4, 1, current_date)`,
            [organizationId, trainingRelationships.erika, rows[0]!.id, KATALOG.beratungTraining],
          ),
        ),
      ).toBe('23514');
    });
  });

  describe('Was die Beratung nicht ist', () => {
    it('keine Behandlungsdoku am Beratungstermin', async () => {
      const id = await beratungstermin();
      expect(await fehler(asUser(users.ownerTherapist, DOKUMENTIEREN, [id, 'Text']))).toBe('22023');
    });

    it('kein Trainingsprotokoll am Beratungstermin im Training', async () => {
      const id = await beratungstermin(await profilTina());
      expect(
        await fehler(
          asPostgres(
            `insert into public.training_protocols (organization_id, training_relationship_id,
               appointment_id, content, created_by)
             values ($1, $2, $3, 'Text', $4)`,
            [organizationId, trainingRelationships.tina, id, users.ownerTherapist],
          ),
        ),
      ).toBe('22023');
    });

    it('kurzfristige Absage und Nichtantreffen begründen keinen Gebührenanlass', async () => {
      // Absage zwei Stunden vor dem Beginn - an einer Behandlung ein Anlass.
      const absage = await beratungstermin();
      await asPostgres(
        `update public.appointments set starts_at = now() + interval '2 hours',
           ends_at = now() + interval '3 hours' where id = $1`,
        [absage],
      );
      await asUserCommitted(users.ownerTherapist, ABSAGEN, [absage, await stand(absage)]);

      // Nichtantreffen am Hausbesuch: ohne Protokoll und ohne Forderung.
      const { rows: hb } = await asUserCommitted<{ id: string }>(users.ownerTherapist, HAUSBESUCH, [
        PROFIL_ERIKA,
        STAFF_JANNES,
        tagInTagen(7),
        '14:00',
        '15:00',
      ]);
      const nicht = hb[0]!.id;
      await asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [nicht, await stand(nicht)]);

      const { rows } = await asPostgres(
        'select status, fee_basis from public.appointments where id = any($1::uuid[]) order by status',
        [[absage, nicht]],
      );
      expect(rows).toEqual([
        { status: 'cancelled', fee_basis: null },
        { status: 'no_show', fee_basis: null },
      ]);
    });
  });

  describe('Lesen', () => {
    it('der Kalender nennt den Anlass und an der Beratung keinen Dokumentationsstand', async () => {
      const id = await beratungstermin();
      const { rows } = await asUser<{
        id: string;
        occasion: string;
        documentation_status: string | null;
      }>(users.ownerTherapist, KALENDER, [tagInTagen(6), tagInTagen(9), 'all']);
      expect(rows.find((r) => r.id === id)).toMatchObject({
        occasion: 'nutrition_counselling',
        documentation_status: null,
      });
    });

    it('die Tagesliste nennt den Anlass', async () => {
      const id = await beratungstermin();
      const { rows } = await asUser<{ id: string; occasion: string; documentation_status: null }>(
        users.ownerTherapist,
        'select * from public.list_day_plan($1::date, $2::uuid)',
        [tagInTagen(7), STAFF_JANNES],
      );
      expect(rows.find((r) => r.id === id)).toMatchObject({
        occasion: 'nutrition_counselling',
        documentation_status: null,
      });
    });

    it('der Trainingstermin nennt den Anlass', async () => {
      const id = await beratungstermin(await profilTina());
      const { rows } = await asUser<{ occasion: string }>(
        users.ownerTherapist,
        'select * from public.get_training_appointment($1::uuid)',
        [id],
      );
      expect(rows[0]).toMatchObject({ occasion: 'nutrition_counselling' });
    });
  });
});
