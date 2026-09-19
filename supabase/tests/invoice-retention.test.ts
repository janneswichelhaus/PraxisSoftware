import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, resetDatabase } from './helpers/db';

/**
 * Aufbewahrung der Rechnungen (ABR-003, ADR-008).
 *
 * Die Leistung fiel noch ohne eigene Regel mit der Akte: Zehn Jahre ab
 * Abschluss der Versorgung sind nie kuerzer als acht Jahre ab dem
 * Leistungsjahr. **Die Rechnung kann die Akte ueberdauern**, weil sie spaeter
 * entsteht - und dann hat die gesetzliche Aufbewahrung Vorrang (ADR-008
 * Punkt 2, Par. 147 AO).
 *
 * Geprueft wird beides: dass der Lauf eine Akte mit laufender Rechnungsfrist
 * stehen laesst, und dass er sie nach Ablauf mitsamt Rechnung, Zeilen und
 * Empfaengern loescht.
 */

const { users, patients, organizationId } = SEED;

async function lauf(): Promise<number> {
  const { rows } = await asPostgres<{ anzahl: number }>(
    'select public.apply_retention() as anzahl',
  );
  return Number(rows[0]?.anzahl ?? 0);
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ count: string }>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function abgeschlossenVor(patientId: string, jahre: number) {
  await asPostgres(
    `update public.patients
        set care_started_on   = (current_date - ($2::int + 1) * interval '1 year')::date,
            care_concluded_on = (current_date - $2::int * interval '1 year')::date,
            care_concluded_at = now(),
            care_concluded_by = $3::uuid
      where id = $1`,
    [patientId, jahre, users.therapist],
  );
}

/**
 * Legt eine ausgestellte Rechnung mit Leistung und Zeile an.
 *
 * Der Weg geht ueber die Tabellen und nicht ueber `issue_invoice`, weil das
 * Ausstellungsdatum hier Jahre zurueckliegen soll. Die Reihenfolge ist die
 * einzige, die der Trigger zulaesst: erst Entwurf mit Zeilen, dann ausstellen
 * - eine ausgestellte Rechnung nimmt keine Zeile mehr an (ADR-009 Punkt 9).
 */
async function rechnungVor(patientId: string, jahre: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `with dienst as (
       insert into public.billable_services
         (organization_id, patient_id, appointment_id, catalog_item_id, performed_on, created_by)
       select a.organization_id, a.patient_id, a.id,
              'cccccccc-cccc-4ccc-8ccc-000000000001'::uuid,
              (a.starts_at at time zone 'Europe/Berlin')::date, $2::uuid
       from public.appointments a
       where a.patient_id = $1::uuid
       order by a.starts_at
       limit 1
       returning id, organization_id, performed_on
     ),
     rechnung as (
       insert into public.invoices
         (organization_id, patient_id, period_month, created_by)
       select d.organization_id, $1::uuid,
              date_trunc('month', d.performed_on)::date, $2::uuid
       from dienst d
       returning id
     )
     insert into public.invoice_items
       (organization_id, invoice_id, billable_service_id, sort_order)
     select d.organization_id, r.id, d.id, 1
     from dienst d, rechnung r
     returning invoice_id as id`,
    [patientId, users.office],
  );

  const id = rows[0]!.id;

  await asPostgres(
    `update public.invoices
        set status = 'issued',
            invoice_number = 'RG-TEST-' || left(id::text, 4),
            issued_on = (current_date - $2::int * interval '1 year')::date,
            issued_at = now(),
            due_on = (current_date - $2::int * interval '1 year')::date + 14,
            total_cents = 4500,
            tax_total_cents = 0,
            currency = 'EUR',
            snapshot = jsonb_build_object('schema_version', 1)
      where id = $1`,
    [id, jahre],
  );

  await asPostgres(
    "update public.billable_services set status = 'invoiced' where patient_id = $1",
    [patientId],
  );

  return id;
}

describe('Aufbewahrung der Rechnungen', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('fuehrt alle fuenf neuen Tabellen im Retention Schedule (ADR-008)', async () => {
    expect(
      await anzahl(
        `select count(*) from public.retention_assignments
          where class_key = 'abrechnungsdaten'
            and table_name in ('invoices', 'invoice_items', 'invoice_recipients',
                               'practice_billing_profiles', 'invoice_number_series')`,
      ),
    ).toBe(5);
  });

  it('fuehrt auch das Stornodokument im Retention Schedule (ABR-003c)', async () => {
    expect(
      await anzahl(
        `select count(*) from public.retention_assignments
          where class_key = 'abrechnungsdaten' and table_name = 'invoice_cancellations'`,
      ),
    ).toBe(1);
  });

  it('loescht das Stornodokument mit und journalisiert es', async () => {
    // Es zeigt mit RESTRICT auf die Rechnung: Ohne eigenen Schritt im Lauf
    // scheiterte die Loeschung der ganzen Akte (ADR-008 Punkt 8).
    const rechnung = await rechnungVor(patients.max, 9);
    await asPostgres(
      `insert into public.invoice_cancellations
         (organization_id, invoice_id, cancellation_number, reason, cancelled_on, created_by)
       values ($1, $2, 'RG-TEST-STORNO', 'Testgrund', current_date, $3)`,
      [organizationId, rechnung, users.office],
    );
    await abgeschlossenVor(patients.max, 11);

    await lauf();

    expect(await anzahl('select count(*) from public.invoice_cancellations')).toBe(0);
    expect(
      await anzahl(
        `select count(*) from public.deletion_journal
          where target_table = 'invoice_cancellations' and retention_class = 'abrechnungsdaten'`,
      ),
    ).toBe(1);

    // Die Wiederanwendung kennt die Tabelle - sonst scheiterte sie mit
    // "references tables without a reapply order".
    const { rows } = await asPostgres<{ anzahl: number }>(
      'select public.reapply_deletion_journal() as anzahl',
    );
    expect(Number(rows[0]?.anzahl)).toBe(0);
  });

  it('loescht die Zahlungserinnerung mit und journalisiert sie (ABR-003d)', async () => {
    const rechnung = await rechnungVor(patients.max, 9);
    await asPostgres(
      `insert into public.invoice_payment_reminders
         (organization_id, invoice_id, reminder_on, due_on, outstanding_cents, currency, created_by)
       values ($1, $2, current_date - 20, current_date - 6, 4500, 'EUR', $3)`,
      [organizationId, rechnung, users.office],
    );
    await abgeschlossenVor(patients.max, 11);

    await lauf();

    expect(await anzahl('select count(*) from public.invoice_payment_reminders')).toBe(0);
    expect(
      await anzahl(
        `select count(*) from public.deletion_journal
          where target_table = 'invoice_payment_reminders'
            and retention_class = 'abrechnungsdaten'`,
      ),
    ).toBe(1);

    const { rows } = await asPostgres<{ anzahl: number }>(
      'select public.reapply_deletion_journal() as anzahl',
    );
    expect(Number(rows[0]?.anzahl)).toBe(0);
  });

  it('haelt eine faellige Akte zurueck, solange die Frist einer Rechnung laeuft', async () => {
    await rechnungVor(patients.max, 2);
    await abgeschlossenVor(patients.max, 11);

    await lauf();

    expect(await anzahl('select count(*) from public.patients where id = $1', [patients.max])).toBe(
      1,
    );
  });

  it('nennt die Sperre getrennt vom Legal Hold im Protokoll (ADR-010)', async () => {
    await rechnungVor(patients.max, 2);
    await abgeschlossenVor(patients.max, 11);

    await lauf();

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where action = 'retention.applied'
        order by occurred_at desc limit 1`,
    );
    expect(rows[0]?.context.steuerfrist_gehalten).toBe(1);
    expect(rows[0]?.context.legal_hold_gehalten).toBe(0);
  });

  it('loescht Akte und Rechnung, sobald auch die steuerliche Frist abgelaufen ist', async () => {
    await rechnungVor(patients.max, 9);
    await abgeschlossenVor(patients.max, 11);

    await lauf();

    expect(await anzahl('select count(*) from public.patients where id = $1', [patients.max])).toBe(
      0,
    );
    expect(
      await anzahl('select count(*) from public.invoices where patient_id = $1', [patients.max]),
    ).toBe(0);
    expect(await anzahl('select count(*) from public.invoice_items')).toBe(0);
  });

  it('journalisiert Rechnung und Zeilen als Abrechnungsdaten', async () => {
    await rechnungVor(patients.max, 9);
    await abgeschlossenVor(patients.max, 11);

    await lauf();

    expect(
      await anzahl(
        `select count(*) from public.deletion_journal
          where target_table = 'invoices' and retention_class = 'abrechnungsdaten'`,
      ),
    ).toBe(1);
    expect(
      await anzahl(
        `select count(*) from public.deletion_journal
          where target_table = 'invoice_items' and retention_class = 'abrechnungsdaten'`,
      ),
    ).toBe(1);
  });

  it('nimmt den Rechnungsempfaenger mit und zieht ihn nach einem Restore nach', async () => {
    await asPostgres(
      `insert into public.invoice_recipients
         (organization_id, patient_id, recipient_kind, name, created_by)
       values ($1, $2, 'private_insurer', 'Testversicherung AG', $3)`,
      [organizationId, patients.max, users.office],
    );
    await abgeschlossenVor(patients.max, 11);

    await lauf();

    expect(
      await anzahl('select count(*) from public.invoice_recipients where patient_id = $1', [
        patients.max,
      ]),
    ).toBe(0);

    // Die Wiederanwendung kennt die Tabelle - sonst scheiterte sie mit
    // "references tables without a reapply order" (ADR-008 Punkt 8).
    const { rows } = await asPostgres<{ anzahl: number }>(
      'select public.reapply_deletion_journal() as anzahl',
    );
    expect(Number(rows[0]?.anzahl)).toBe(0);
  });
});
