import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * TRN-008: Die Rechnung haengt am Trainingsverhaeltnis (TRN-EPIC-003).
 *
 *   * Eine Trainingsleistung landet auf einer Rechnung **im Kreis TR** - am
 *     Trainingsverhaeltnis, nie an der Akte (ADR-021 Punkte 3 und 5).
 *   * Par. 14c-Riegel, Befreiungsgrund, Nummernkreis je Bereich,
 *     Sammelrechnung (ANN-077) und die Auswertung bleiben unveraendert - hier
 *     belegt am Training.
 *   * Die Rechnung geht an die Kund:in selbst, mit der Anschrift aus dem
 *     Training und ohne Geburtsdatum (ANN-182).
 *   * Die Belegfrist haelt das Verhaeltnis im Loeschlauf (ANN-183).
 *   * Kein Durchgriff: Trainingsbetreuung und Behandlungsrollen erreichen
 *     keine Rechnung; eine Zeile gehoert zum Verhaeltnis ihrer Rechnung.
 */

const { users, organizationId, patients, trainingRelationships } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const STAFF_TOM = '55555555-5555-4555-8555-000000000006';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';

const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  personalTraining: 'cccccccc-cccc-4ccc-8ccc-000000000009',
} as const;

const ERFASSEN = 'select public.record_billable_services($1::uuid, $2::jsonb) as n';
const TRAININGSENTWURF = 'select public.create_training_invoice_draft($1::uuid, $2::date) as id';
const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date, $3::text) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const KANDIDATEN = 'select * from public.list_invoice_candidates(100)';
const LAUF = 'select public.apply_retention() as anzahl';

/** Der erste Tag des laufenden Monats in der Zeitzone der Praxis. */
async function monat(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

/** Ein durchgefuehrter Trainingstermin im laufenden Monat. */
async function trainingstermin(verhaeltnis: string, stunde: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, kind, training_relationship_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, completed_at, completed_by
     ) values (
       $1, 'training', $2, $3, $4, 'practice', 'completed',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int)) at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int + 1)) at time zone 'Europe/Berlin',
       now(), $6
     ) returning id`,
    [organizationId, verhaeltnis, STAFF_TOM, LOCATION, stunde, users.trainer],
  );
  return rows[0]!.id;
}

/** Erfasst eine Trainingsstunde als Leistung und gibt den Termin zurueck. */
async function trainingsleistung(verhaeltnis: string, stunde = 30): Promise<string> {
  const termin = await trainingstermin(verhaeltnis, stunde);
  await asUserCommitted(users.office, ERFASSEN, [
    termin,
    JSON.stringify([{ catalog_item_id: KATALOG.personalTraining, quantity: 1 }]),
  ]);
  return termin;
}

/** Eine dokumentierte Behandlung an Erikas Akte, als Leistung erfasst. */
async function behandlungsleistung(stunde = 40): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int)) at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int + 1)) at time zone 'Europe/Berlin',
       $6, now(), $7
     ) returning id`,
    [
      organizationId,
      patients.erika,
      STAFF_ANNA,
      LOCATION,
      stunde,
      GRUNDLAGE_FRISCH,
      users.ownerTherapist,
    ],
  );
  await asUserCommitted(users.office, ERFASSEN, [
    rows[0]!.id,
    JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
  ]);
  return rows[0]!.id;
}

async function trainingsentwurf(verhaeltnis: string = trainingRelationships.tina): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.office, TRAININGSENTWURF, [
    verhaeltnis,
    await monat(),
  ]);
  return rows[0]!.id;
}

type Dokument = {
  service_area: string;
  recipient: Record<string, unknown>;
  patient: { name: string; date_of_birth: string | null };
  treatment_bases: unknown[];
  items: { code: string; tax_treatment: string }[];
  tax_groups: { tax_treatment: string; tax_cents: number; exemption_reason?: string | null }[];
  totals: { total_cents: number; tax_total_cents: number };
  invoice_number?: string;
};

async function dokument(invoiceId: string): Promise<Dokument> {
  const { rows } = await asUser<{ ansicht: { document: Dokument } }>(
    users.office,
    'select public.get_invoice($1::uuid) as ansicht',
    [invoiceId],
  );
  return rows[0]!.ansicht.document;
}

describe('TRN-008: Rechnung am Trainingsverhaeltnis', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  describe('Buendeln und Entwurf', () => {
    it('buendelt Trainingsleistungen am Verhaeltnis mit dem Namen aus dem Training', async () => {
      await trainingsleistung(trainingRelationships.tina, 30);
      await trainingsleistung(trainingRelationships.tina, 34);

      const { rows } = await asUser<{
        patient_id: string | null;
        training_relationship_id: string | null;
        patient_name: string;
        service_area: string;
        service_count: number;
        total_cents: number;
      }>(users.office, KANDIDATEN);

      expect(rows).toEqual([
        expect.objectContaining({
          patient_id: null,
          training_relationship_id: trainingRelationships.tina,
          patient_name: 'Tina Trainingskundin',
          service_area: 'training',
          service_count: 2,
          total_cents: 15_000,
        }),
      ]);
    });

    it('legt den Entwurf am Verhaeltnis an - ohne Patientin und ohne Empfaenger', async () => {
      await trainingsleistung(trainingRelationships.tina);
      const id = await trainingsentwurf();

      const { rows } = await asPostgres<{
        patient_id: string | null;
        training_relationship_id: string | null;
        service_area: string;
        recipient_id: string | null;
      }>(
        'select patient_id, training_relationship_id, service_area, recipient_id from public.invoices where id = $1',
        [id],
      );
      expect(rows[0]).toEqual({
        patient_id: null,
        training_relationship_id: trainingRelationships.tina,
        service_area: 'training',
        recipient_id: null,
      });

      const { rows: audit } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log where action = 'invoice.draft_created' and subject_id = $1`,
        [id],
      );
      expect(audit[0]?.context).toMatchObject({
        training_relationship_id: trainingRelationships.tina,
        service_area: 'training',
        item_count: 1,
      });
      expect(audit[0]?.context).not.toHaveProperty('patient_id');
    });

    it('laesst je Kundin und Monat hoechstens einen Entwurf zu (ANN-077)', async () => {
      await trainingsleistung(trainingRelationships.tina, 30);
      await trainingsentwurf();
      await trainingsleistung(trainingRelationships.tina, 34);

      await expect(
        asUser(users.office, TRAININGSENTWURF, [trainingRelationships.tina, await monat()]),
      ).rejects.toThrow(/invoices_training_draft_period_key/);
    });

    it('findet ohne Trainingsleistung im Monat nichts zum Abrechnen', async () => {
      await expect(
        asUser(users.office, TRAININGSENTWURF, [trainingRelationships.tina, await monat()]),
      ).rejects.toThrow(/no billable services for this training client and month/);
    });

    it('gibt einer Person mit beiden Verhaeltnissen zwei Rechnungen - die Trainingsrechnung ohne Akte', async () => {
      // ADR-009, Konsequenz zu Punkt 16: zwei Rechnungen im Monat, keine Summe
      // ueber zwei Steuerregime. Und ADR-021 Punkt 3: Die Trainingsrechnung
      // kennt Erikas Akte nicht.
      await behandlungsleistung();
      await trainingsleistung(trainingRelationships.erika);

      const { rows: kandidaten } = await asUser<{
        patient_id: string | null;
        training_relationship_id: string | null;
        service_area: string;
      }>(users.office, KANDIDATEN);
      expect(kandidaten).toHaveLength(2);
      expect(kandidaten).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            patient_id: patients.erika,
            training_relationship_id: null,
            service_area: 'therapy',
          }),
          expect.objectContaining({
            patient_id: null,
            training_relationship_id: trainingRelationships.erika,
            service_area: 'training',
          }),
        ]),
      );

      const therapie = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
        'therapy',
      ]);
      const training = await trainingsentwurf(trainingRelationships.erika);

      const { rows } = await asPostgres<{ id: string; patient_id: string | null }>(
        'select id, patient_id from public.invoices where id = any($1::uuid[]) order by service_area',
        [[therapie.rows[0]!.id, training]],
      );
      expect(rows.map((r) => r.patient_id)).toEqual([patients.erika, null]);
    });

    it('nimmt ueber den Behandlungsweg keine Trainingsleistung auf', async () => {
      // Der alte Weg mit Bereich `training` an Erikas Akte findet nichts: Die
      // Trainingsleistung haengt nicht an der Akte.
      await trainingsleistung(trainingRelationships.erika);
      await expect(
        asUser(users.office, ENTWURF, [patients.erika, await monat(), 'training']),
      ).rejects.toThrow(/training invoices are drafted for the training relationship/);
    });
  });

  describe('das Dokument (ANN-182)', () => {
    it('geht an die Kundin selbst, mit der Anschrift aus dem Training und ohne Geburtsdatum', async () => {
      // Tina hat im Training ein Geburtsdatum - es gehoert trotzdem nicht auf
      // die Rechnung.
      await asPostgres(
        `update public.training_contact_details set date_of_birth = '1990-04-01'
         where training_relationship_id = $1`,
        [trainingRelationships.tina],
      );
      await trainingsleistung(trainingRelationships.tina);
      const doc = await dokument(await trainingsentwurf());

      expect(doc.service_area).toBe('training');
      expect(doc.recipient).toEqual({
        kind: 'self',
        name: 'Tina Trainingskundin',
        street: 'Trainingsweg 5',
        house_number: null,
        postal_code: '72076',
        city: 'Tuebingen',
        reference: null,
      });
      expect(doc.patient).toEqual({ name: 'Tina Trainingskundin', date_of_birth: null });
      expect(doc.treatment_bases).toEqual([]);
    });

    it('nimmt bei einer Person mit Akte nichts aus der Akte', async () => {
      // Erika hat Kontaktdaten und Geburtsdatum in der Akte, im Training
      // keinen Kontakt. Auf der Trainingsrechnung steht davon nichts.
      await trainingsleistung(trainingRelationships.erika);
      const doc = await dokument(await trainingsentwurf(trainingRelationships.erika));

      const akte = await asPostgres<{ street: string | null; date_of_birth: string | null }>(
        'select street, date_of_birth::text from public.patient_contact_details where patient_id = $1',
        [patients.erika],
      );
      expect(doc.recipient).toMatchObject({ name: 'Erika Beispiel', street: null, city: null });
      expect(doc.patient.date_of_birth).toBeNull();
      const text = JSON.stringify(doc);
      for (const wert of [akte.rows[0]?.street, akte.rows[0]?.date_of_birth]) {
        if (wert) expect(text).not.toContain(wert);
      }
    });

    it('laesst an der Trainingsrechnung keinen Empfaenger aus der Akte setzen', async () => {
      const { rows: empf } = await asUserCommitted<{ id: string }>(
        users.office,
        `select public.save_invoice_recipient(null, $1::uuid, 'aid_authority', 'Beihilfestelle Test',
                                             null, null, null, null, 'BH-1', false) as id`,
        [patients.erika],
      );
      await trainingsleistung(trainingRelationships.erika);
      const id = await trainingsentwurf(trainingRelationships.erika);

      await expect(
        asUser(users.office, 'select public.set_invoice_recipient($1::uuid, $2::uuid)', [
          id,
          empf[0]!.id,
        ]),
      ).rejects.toThrow(/recipient does not belong to this patient/);
    });
  });

  describe('Ausstellen, Storno und Zahlung bleiben, wie sie sind', () => {
    it('stellt im Kreis TR aus und weist die Umsatzsteuer der steuerpflichtigen Stunde aus', async () => {
      await trainingsleistung(trainingRelationships.tina);
      const id = await trainingsentwurf();

      const { rows } = await asUserCommitted<{ nummer: string }>(users.office, AUSSTELLEN, [id]);
      const jahr = new Date().getFullYear();
      expect(rows[0]?.nummer).toBe(`TR-${jahr}-0001`);

      const doc = await dokument(id);
      expect(doc.invoice_number).toBe(`TR-${jahr}-0001`);
      // 75,00 EUR brutto zu 19 %: 11,97 EUR enthaltene Steuer. Kein
      // Befreiungsgrund an einer steuerpflichtigen Gruppe (ABR-006).
      expect(doc.tax_groups).toEqual([
        expect.objectContaining({ tax_treatment: 'taxable', tax_cents: 1197 }),
      ]);
      expect(doc.tax_groups[0]?.exemption_reason ?? null).toBeNull();
      expect(doc.totals).toEqual({ total_cents: 7500, tax_total_cents: 1197 });

      const { rows: leistung } = await asPostgres<{ status: string }>(
        'select status from public.billable_services where training_relationship_id = $1',
        [trainingRelationships.tina],
      );
      expect(leistung.map((l) => l.status)).toEqual(['invoiced']);
    });

    it('zaehlt den Kreis der Behandlung unabhaengig weiter', async () => {
      await behandlungsleistung();
      await trainingsleistung(trainingRelationships.erika);
      const therapie = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
        'therapy',
      ]);
      const training = await trainingsentwurf(trainingRelationships.erika);

      const jahr = new Date().getFullYear();
      const a = await asUserCommitted<{ nummer: string }>(users.office, AUSSTELLEN, [training]);
      const b = await asUserCommitted<{ nummer: string }>(users.office, AUSSTELLEN, [
        therapie.rows[0]!.id,
      ]);
      expect(a.rows[0]?.nummer).toBe(`TR-${jahr}-0001`);
      expect(b.rows[0]?.nummer).toBe(`RG-${jahr}-0001`);
    });

    it('weist unter der Kleinunternehmerregelung auch im Training keine Steuer aus (Par. 14c)', async () => {
      await asPostgres(
        'update public.practice_billing_profiles set small_business = true where organization_id = $1',
        [organizationId],
      );
      await trainingsleistung(trainingRelationships.tina);
      const id = await trainingsentwurf();
      await asUserCommitted(users.office, AUSSTELLEN, [id]);

      const doc = await dokument(id);
      expect(doc.totals.tax_total_cents).toBe(0);
      expect(doc.tax_groups.every((g) => g.tax_cents === 0)).toBe(true);
    });

    it('storniert im Kreis TR und korrigiert am selben Verhaeltnis', async () => {
      await trainingsleistung(trainingRelationships.tina);
      const id = await trainingsentwurf();
      await asUserCommitted(users.office, AUSSTELLEN, [id]);

      const { rows: storno } = await asUserCommitted<{ nummer: string }>(
        users.office,
        'select public.cancel_invoice($1::uuid, $2) as nummer',
        [id, 'Falscher Monat'],
      );
      expect(storno[0]?.nummer).toMatch(/^TR-\d{4}-0002$/);

      const { rows: korrektur } = await asUserCommitted<{ id: string }>(
        users.office,
        'select public.create_correction_draft($1::uuid) as id',
        [id],
      );
      const { rows } = await asPostgres<{
        patient_id: string | null;
        training_relationship_id: string | null;
        service_area: string;
        items: number;
      }>(
        `select i.patient_id, i.training_relationship_id, i.service_area,
                (select count(*)::int from public.invoice_items it where it.invoice_id = i.id) as items
         from public.invoices i where i.id = $1`,
        [korrektur[0]!.id],
      );
      expect(rows[0]).toEqual({
        patient_id: null,
        training_relationship_id: trainingRelationships.tina,
        service_area: 'training',
        items: 1,
      });
    });

    it('fuehrt die Trainingsrechnung in Rechnungen, offenen Posten, Zahlungen und Einnahmen', async () => {
      await trainingsleistung(trainingRelationships.tina);
      const id = await trainingsentwurf();
      await asUserCommitted(users.office, AUSSTELLEN, [id]);

      const rechnungen = await asUser<{
        id: string;
        patient_id: string | null;
        training_relationship_id: string | null;
        patient_name: string;
        recipient_name: string;
      }>(users.office, 'select * from public.list_invoices(100)');
      expect(rechnungen.rows.find((r) => r.id === id)).toMatchObject({
        patient_id: null,
        training_relationship_id: trainingRelationships.tina,
        patient_name: 'Tina Trainingskundin',
        recipient_name: 'Tina Trainingskundin',
      });

      const offen = await asUser<{ id: string; service_area: string; patient_name: string }>(
        users.office,
        'select * from public.list_open_items(100)',
      );
      expect(offen.rows.find((r) => r.id === id)).toMatchObject({
        service_area: 'training',
        patient_name: 'Tina Trainingskundin',
      });

      await asUserCommitted(
        users.office,
        `select public.record_payment($1::uuid, 7500, current_date, 'bank_transfer')`,
        [id],
      );
      const zahlungen = await asUser<{ invoice_id: string; patient_name: string }>(
        users.office,
        'select * from public.list_payments(100)',
      );
      expect(zahlungen.rows.find((r) => r.invoice_id === id)?.patient_name).toBe(
        'Tina Trainingskundin',
      );

      // ADR-009 Punkt 19: getrennt je Bereich, aus dem Snapshot.
      const einnahmen = await asUser<{ service_area: string; gross_cents: number }>(
        users.ownerTherapist,
        `select * from public.list_revenue_by_service_area('accrual', $1::int)`,
        [new Date().getFullYear()],
      );
      const training = einnahmen.rows.filter((r) => r.service_area === 'training');
      expect(training.reduce((s, r) => s + Number(r.gross_cents), 0)).toBe(7500);
    });
  });

  describe('kein Durchgriff (ADR-021 Punkt 6)', () => {
    it('laesst Trainingsbetreuung und Therapeutin keinen Entwurf anlegen und keine Rechnung lesen', async () => {
      await trainingsleistung(trainingRelationships.tina);
      for (const rolle of [users.trainer, users.therapist]) {
        await expect(
          asUser(rolle, TRAININGSENTWURF, [trainingRelationships.tina, await monat()]),
        ).rejects.toThrow(/not allowed to manage invoices/);
        const { rows } = await asUser(rolle, KANDIDATEN);
        expect(rows).toEqual([]);
      }
    });

    it('weist ein Patientenkonto an Entwurf und Listen ab', async () => {
      await trainingsleistung(trainingRelationships.tina);
      await expect(
        asUser(users.patientErika, TRAININGSENTWURF, [trainingRelationships.erika, await monat()]),
      ).rejects.toThrow(/not allowed to manage invoices/);
      for (const sql of [
        KANDIDATEN,
        'select * from public.list_invoices(100)',
        'select * from public.list_open_items(100)',
      ]) {
        const { rows } = await asUser(users.patientErika, sql);
        expect(rows).toEqual([]);
      }
    });

    it('findet das Verhaeltnis einer fremden Praxis nicht', async () => {
      await fremdeOrganisation();
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.persons (organization_id, given_name, family_name)
         values ($1, 'Fremde', 'Kundin') returning id`,
        [FREMDE_ORGANISATION.organizationId],
      );
      const { rows: fremd } = await asPostgres<{ id: string }>(
        `insert into public.training_relationships (organization_id, person_id, contract_started_on)
         values ($1, $2, current_date) returning id`,
        [FREMDE_ORGANISATION.organizationId, rows[0]!.id],
      );
      await expect(
        asUser(users.office, TRAININGSENTWURF, [fremd[0]!.id, await monat()]),
      ).rejects.toThrow(/training relationship not found/);
    });
  });

  describe('schemaseitig', () => {
    it('weist eine Trainingsrechnung mit Patientenbezug ab', async () => {
      await trainingsleistung(trainingRelationships.erika);
      const id = await trainingsentwurf(trainingRelationships.erika);
      await expect(
        asPostgres('update public.invoices set patient_id = $1 where id = $2', [
          patients.erika,
          id,
        ]),
      ).rejects.toThrow(/invoices_party/);
    });

    it('nimmt keine Leistung eines anderen Verhaeltnisses auf - auch am Schreibweg vorbei', async () => {
      await trainingsleistung(trainingRelationships.erika, 30);
      const id = await trainingsentwurf(trainingRelationships.erika);
      // Tinas Stunde auf Erikas Trainingsrechnung: gleicher Bereich, falsche
      // Person. Die Fremdschluessel lassen das zu - der Trigger nicht.
      const tinasTermin = await trainingsleistung(trainingRelationships.tina, 34);

      await expect(
        asPostgres(
          `insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
           select $1, $2, b.id, 9 from public.billable_services b where b.appointment_id = $3`,
          [organizationId, id, tinasTermin],
        ),
      ).rejects.toThrow(/does not belong to the relationship of its invoice/);
    });

    it('nimmt keine Behandlungsleistung auf eine Trainingsrechnung', async () => {
      const behandlung = await behandlungsleistung();
      await trainingsleistung(trainingRelationships.erika);
      const id = await trainingsentwurf(trainingRelationships.erika);

      await expect(
        asPostgres(
          `insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
           select $1, $2, b.id, 9 from public.billable_services b where b.appointment_id = $3`,
          [organizationId, id, behandlung],
        ),
      ).rejects.toThrow();
    });
  });

  describe('Loeschlauf (ANN-183)', () => {
    /** Stellt Tinas Rechnung vor `jahre` Jahren aus und beendet den Vertrag vor vier Jahren. */
    async function ausgestelltVor(jahre: number): Promise<string> {
      await trainingsleistung(trainingRelationships.tina);
      const id = await trainingsentwurf();
      // Am Schreibweg vorbei, weil eine ausgestellte Rechnung unveraenderlich
      // ist: Das Datum wird beim Ausstellen gesetzt, hier in der
      // Vergangenheit (wie invoice-retention.test.ts).
      await asPostgres(
        `update public.invoices
            set status = 'issued',
                invoice_number = 'TR-TEST-' || left(id::text, 4),
                issued_on = (current_date - $2::int * interval '1 year')::date,
                issued_at = now(),
                due_on = (current_date - $2::int * interval '1 year')::date + 14,
                total_cents = 7500,
                tax_total_cents = 1197,
                currency = 'EUR',
                snapshot = jsonb_build_object('schema_version', 3)
          where id = $1`,
        [id, jahre],
      );
      await asPostgres(
        `update public.training_relationships
            set contract_started_on = (current_date - interval '6 years')::date,
                contract_ended_on   = (current_date - interval '4 years')::date,
                status              = 'inactive'
          where id = $1`,
        [trainingRelationships.tina],
      );
      return id;
    }

    it('haelt das Verhaeltnis, solange die Belegfrist laeuft', async () => {
      const id = await ausgestelltVor(4);
      await asPostgres(LAUF);

      const { rows } = await asPostgres<{ n: number }>(
        `select (select count(*)::int from public.training_relationships where id = $1)
              + (select count(*)::int from public.invoices where id = $2) as n`,
        [trainingRelationships.tina, id],
      );
      expect(rows[0]?.n).toBe(2);

      const { rows: audit } = await asPostgres<{ kontext: Record<string, unknown> }>(
        `select context as kontext from public.audit_log
          where action = 'retention.applied' order by occurred_at desc limit 1`,
      );
      expect(audit[0]?.kontext.steuerfrist_gehalten).toBe(1);
      expect(audit[0]?.kontext.trainingsverhaeltnis).toBe(0);
    });

    it('loescht Belege und Verhaeltnis gemeinsam nach Ablauf der Belegfrist', async () => {
      const id = await ausgestelltVor(10);
      await asPostgres(LAUF);

      const { rows } = await asPostgres<{ n: number }>(
        `select (select count(*)::int from public.training_relationships where id = $1)
              + (select count(*)::int from public.invoices where id = $2)
              + (select count(*)::int from public.billable_services where training_relationship_id = $1) as n`,
        [trainingRelationships.tina, id],
      );
      expect(rows[0]?.n).toBe(0);

      const { rows: journal } = await asPostgres<{ target_table: string; retention_class: string }>(
        `select target_table, retention_class from public.deletion_journal
          where target_table in ('invoices', 'invoice_items', 'billable_services')
          order by target_table`,
      );
      expect(journal).toEqual([
        { target_table: 'billable_services', retention_class: 'abrechnungsdaten' },
        { target_table: 'invoice_items', retention_class: 'abrechnungsdaten' },
        { target_table: 'invoices', retention_class: 'abrechnungsdaten' },
      ]);
    });
  });
});
