import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Eigene Rechnungen auf der Plattform (POR-013, DSN-001 D3, ADR-023 Punkt 16,
 * ANN-247).
 *
 * Nur ausgestellte Rechnungen des Verhältnisses, mit Snapshot, Zahlungsstand
 * und Storno-Vermerk; Entwürfe nie. Recht `billing`: die Person selbst, eine
 * Begleitung nur mit Einwilligung zu Rechnungen.
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;
const LISTE = 'select * from public.platform_invoices($1::uuid)';
const BLATT = 'select public.platform_invoice($1::uuid, $2::uuid) as blatt';

const ERIKA_RECHNUNG = 'ffffffff-ffff-4fff-8fff-000000000001';
const ERIKA_ENTWURF = 'ffffffff-ffff-4fff-8fff-000000000002';
const ERIKA_TRAINING = 'ffffffff-ffff-4fff-8fff-000000000003';
const MAX_RECHNUNG = 'ffffffff-ffff-4fff-8fff-000000000004';

function snapshot(name: string, kind = 'self') {
  return JSON.stringify({
    schema_version: 5,
    period_month: '2026-09-01',
    service_period: { from: '2026-09-02', to: '2026-09-23' },
    currency: 'EUR',
    issuer: { legal_name: 'Test Praxis Tuebingen' },
    recipient: { kind, name },
    patient: { name: 'Erika Beispiel', date_of_birth: null },
    treatment_bases: [],
    items: [
      {
        performed_on: '2026-09-02',
        code: 'KG',
        label: 'Krankengymnastik',
        item_kind: 'treatment',
        quantity: 1,
        unit_price_cents: 14000,
        line_total_cents: 14000,
        currency: 'EUR',
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
      },
    ],
    tax_groups: [],
    totals: { total_cents: 14000, tax_total_cents: 0 },
  });
}

async function rechnungen() {
  await asPostgres(
    `insert into public.invoices
       (id, organization_id, patient_id, training_relationship_id, service_area, status, period_month,
        invoice_number, issued_on, issued_at, issued_by, due_on, total_cents, tax_total_cents, currency,
        snapshot, created_by)
     values
       ($1, $5, $6, null, 'therapy', 'issued', '2026-09-01', 'RG-2026-0001',
        '2026-09-25', now(), $8, current_date - 1, 14000, 0, 'EUR', $9::jsonb, $8),
       ($2, $5, $6, null, 'therapy', 'draft', '2026-10-01',
        null, null, null, null, null, null, null, null, null, $8),
       ($3, $5, null, $7, 'training', 'issued', '2026-09-01', 'TR-2026-0001',
        '2026-09-26', now(), $8, current_date + 20, 9900, 0, 'EUR', $10::jsonb, $8),
       ($4, $5, $11, null, 'therapy', 'issued', '2026-09-01', 'RG-2026-0002',
        '2026-09-27', now(), $8, current_date + 10, 14000, 0, 'EUR', $12::jsonb, $8)`,
    [
      ERIKA_RECHNUNG,
      ERIKA_ENTWURF,
      ERIKA_TRAINING,
      MAX_RECHNUNG,
      organizationId,
      patients.erika,
      trainingRelationships.erika,
      users.office,
      // Erikas Behandlungsrechnung geht an die Beihilfestelle (ADR-023 Punkt 16).
      snapshot('Beihilfestelle Tuebingen', 'aid_authority'),
      snapshot('Erika Beispiel'),
      patients.max,
      snapshot('Max Mustermann'),
    ],
  );
  await asPostgres(
    `insert into public.payments (organization_id, invoice_id, direction, amount_cents, paid_on, method, currency, created_by)
     values ($1, $2, 'incoming', 4000, current_date, 'bank_transfer', 'EUR', $3)`,
    [organizationId, ERIKA_RECHNUNG, users.office],
  );
}

interface Zeile {
  id: string;
  invoice_number: string;
  payment_state: string;
  outstanding_cents: number;
  overdue: boolean;
  cancelled: boolean;
  recipient_kind: string;
  recipient_name: string;
}

describe('platform_invoices (POR-013)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await rechnungen();
  }, 120_000);

  it('zeigt der Person ihre ausgestellten Rechnungen mit Zahlungsstand, nie Entwuerfe', async () => {
    const { rows } = await asUser<Zeile>(users.plattformErika, LISTE, [
      platformAccesses.erikaBehandlung,
    ]);
    expect(rows.map((z) => z.id)).toEqual([ERIKA_RECHNUNG]);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        invoice_number: 'RG-2026-0001',
        payment_state: 'partially_paid',
        outstanding_cents: 10000,
        overdue: true,
        cancelled: false,
        recipient_kind: 'aid_authority',
        recipient_name: 'Beihilfestelle Tuebingen',
      }),
    );
    // Feste Spaltenliste: keine Kennung der Akte, kein Empfaengerdatensatz.
    expect(Object.keys(rows[0]!)).not.toContain('patient_id');
    expect(Object.keys(rows[0]!)).not.toContain('recipient_id');
  });

  it('trennt die Bereiche: die Trainingsrechnung nur im Training (4.8)', async () => {
    const training = await asUser<Zeile>(users.plattformErika, LISTE, [
      platformAccesses.erikaTraining,
    ]);
    expect(training.rows.map((z) => z.id)).toEqual([ERIKA_TRAINING]);
    expect(training.rows[0]!.overdue).toBe(false);
  });

  it('liefert das Blatt aus dem Snapshot - nur die eigene Rechnung', async () => {
    const { rows } = await asUser<{ blatt: Record<string, unknown> | null }>(
      users.plattformErika,
      BLATT,
      [platformAccesses.erikaBehandlung, ERIKA_RECHNUNG],
    );
    const blatt = rows[0]!.blatt!;
    expect(blatt).toEqual(
      expect.objectContaining({
        invoice_number: 'RG-2026-0001',
        paid_cents: 4000,
        outstanding_cents: 10000,
        payment_state: 'partially_paid',
        cancellation: null,
      }),
    );
    expect((blatt.document as { totals: { total_cents: number } }).totals.total_cents).toBe(14000);
    // Max' Rechnung und der eigene Entwurf: nichts.
    for (const fremd of [MAX_RECHNUNG, ERIKA_ENTWURF, ERIKA_TRAINING]) {
      const r = await asUser<{ blatt: unknown }>(users.plattformErika, BLATT, [
        platformAccesses.erikaBehandlung,
        fremd,
      ]);
      expect(r.rows[0]!.blatt).toBeNull();
    }
  });

  it('zeigt eine stornierte Rechnung mit Vermerk und ohne Ueberfaelligkeit', async () => {
    await asPostgres(
      `insert into public.invoice_cancellations
         (organization_id, invoice_id, cancellation_number, reason, cancelled_on, created_by)
       values ($1, $2, 'ST-2026-0001', 'Falscher Betrag', current_date, $3)`,
      [organizationId, ERIKA_RECHNUNG, users.office],
    );
    const { rows } = await asUser<Zeile>(users.plattformErika, LISTE, [
      platformAccesses.erikaBehandlung,
    ]);
    expect(rows[0]).toEqual(expect.objectContaining({ cancelled: true, overdue: false }));
    const blatt = await asUser<{ blatt: { cancellation: { cancellation_number: string } } }>(
      users.plattformErika,
      BLATT,
      [platformAccesses.erikaBehandlung, ERIKA_RECHNUNG],
    );
    expect(blatt.rows[0]!.blatt.cancellation.cancellation_number).toBe('ST-2026-0001');
  });

  it('Begleitung ohne Vermoegenssorge, fremde Person, gesperrt, Praxiskonto: nichts', async () => {
    // Paula begleitet Max ohne Einwilligung zu Rechnungen (finance_scope false).
    expect(
      (await asUser(users.plattformPaula, LISTE, [platformAccesses.paulaBegleitungMax])).rows,
    ).toEqual([]);
    const blatt = await asUser<{ blatt: unknown }>(users.plattformPaula, BLATT, [
      platformAccesses.paulaBegleitungMax,
      MAX_RECHNUNG,
    ]);
    expect(blatt.rows[0]!.blatt).toBeNull();
    // Eine zweite Begleitung MIT Einwilligung zu Rechnungen (ABN-010) sieht
    // Max' Rechnung - und wird protokolliert. Art und Nachweis eines Zugangs
    // sind fest, deshalb ein eigener Zugang statt eines Updates.
    const konto = '11111111-1111-4111-8111-0000000000bb';
    const zugang = 'cafecafe-cafe-4afe-8afe-0000000000bb';
    await asPostgres(
      `insert into public.platform_accesses
         (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
          status, created_by, activated_at, access_kind, representative_name, proof_documents,
          proof_recorded_by, proof_recorded_at, consent_text_version, consent_recorded_by,
          consent_recorded_at, consent_earlier_messages, finance_scope)
       values ($1, $2, 'treatment', $3, $3, $4, 'active', $5, now(), 'companion', 'Peter Mustermann',
               array['identity_document'], $5, now(), 'begleitung-2026-10-02b', $5, now(), false, true)`,
      [zugang, organizationId, patients.max, konto, users.office],
    );
    const mit = await asUserCommitted<Zeile>(konto, LISTE, [zugang]);
    expect(mit.rows.map((z) => z.id)).toEqual([MAX_RECHNUNG]);
    const protokoll = await asPostgres(
      `select 1 from public.audit_log where action = 'platform_representation.read'
        and context ->> 'view' = 'invoices'`,
    );
    expect(protokoll.rows).toHaveLength(1);

    expect(
      (await asUser(users.plattformTina, LISTE, [platformAccesses.erikaBehandlung])).rows,
    ).toEqual([]);
    expect((await asUser(users.office, LISTE, [platformAccesses.erikaBehandlung])).rows).toEqual(
      [],
    );
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [platformAccesses.erikaBehandlung],
    );
    expect(
      (await asUser(users.plattformErika, LISTE, [platformAccesses.erikaBehandlung])).rows,
    ).toEqual([]);
  });
});
