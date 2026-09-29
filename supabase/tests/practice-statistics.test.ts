import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Fuenf Kennzahlen fuer die Praxisfuehrung (STA-001, STA-EPIC-001).
 *
 * Je Kennzahl stehen hier die Testfaelle der einen Quelle
 * `get_practice_statistics`: was zaehlt, was nicht, und dass die beiden
 * Grundlagen des Umsatzes getrennt bleiben. Gerechnet wird mit Differenzen
 * gegen den Ausgangsstand, damit der Seed die Aussage nicht traegt.
 */
const { users, organizationId, patients } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';
const OLIVIA = '55555555-5555-4555-8555-000000000003';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const PROBST = '77777777-7777-4777-8777-000000000001';
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';
const TZ = 'Europe/Berlin';

const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  ausfall: 'cccccccc-cccc-4ccc-8ccc-000000000008',
} as const;

const KENNZAHLEN = 'select * from public.get_practice_statistics($1::date)';

interface Kennzahlen {
  time_zone: string;
  today: string;
  month: string;
  previous_month: string;
  revenue_cents: string;
  revenue_therapy_cents: string;
  revenue_training_cents: string;
  revenue_previous_cents: string;
  payments_cents: string;
  payments_previous_cents: string;
  open_count: number;
  open_cents: string;
  open_not_due_count: number;
  open_not_due_cents: string;
  open_overdue_1_30_count: number;
  open_overdue_1_30_cents: string;
  open_overdue_31_60_count: number;
  open_overdue_31_60_cents: string;
  open_overdue_over_60_count: number;
  open_overdue_over_60_cents: string;
  utilization_from: string;
  utilization_to: string;
  available_minutes: number;
  booked_minutes: number;
  ending_bases: number;
  uncovered_appointments: number;
  absences_from: string;
  absences_to: string;
  patient_cancellations: number;
  no_shows: number;
  absences_with_fee: number;
  absence_fee_cents: string;
  absences_previous: number;
  absence_fee_previous_cents: string;
}

async function kennzahlen(monat: string | null = null): Promise<Kennzahlen> {
  const { rows } = await asUser<Kennzahlen>(users.ownerTherapist, KENNZAHLEN, [monat]);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

const n = (wert: string | number): number => Number(wert);

/** `date` kommt aus `pg` als Datum um Mitternacht in Ortszeit. */
function tag(wert: unknown): string {
  const d = wert as Date;
  const zwei = (z: number) => String(z).padStart(2, '0');
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** Ein Zeitstempel in Ortszeit der Praxis, Tage ab heute und Uhrzeit. */
function ortszeit(tage: number, uhrzeit: string): string {
  return `((now() at time zone '${TZ}')::date + ${tage} + time '${uhrzeit}') at time zone '${TZ}'`;
}

// -----------------------------------------------------------------------------
// Rechnungen (wie in revenue-by-service-area.test.ts)
// -----------------------------------------------------------------------------
async function dokumentierterTermin(stundeImMonat: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone '${TZ}') + make_interval(hours => $5::int)) at time zone '${TZ}',
       (date_trunc('month', now() at time zone '${TZ}') + make_interval(hours => $5::int + 1)) at time zone '${TZ}',
       $6, now(), $7
     ) returning id`,
    [
      organizationId,
      patients.erika,
      ANNA,
      LOCATION,
      stundeImMonat,
      GRUNDLAGE_FRISCH,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

async function monatsanfang(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone '${TZ}')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

async function heute(): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((now() at time zone '${TZ}')::date, 'YYYY-MM-DD') as tag`,
  );
  return rows[0]!.tag;
}

async function ausgestellteRechnung(stunde: number): Promise<{ id: string; betrag: number }> {
  const termin = await dokumentierterTermin(stunde);
  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [termin, JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }])],
  );
  const { rows } = await asUserCommitted<{ id: string }>(
    users.office,
    'select public.create_invoice_draft($1::uuid, $2::date) as id',
    [patients.erika, await monatsanfang()],
  );
  const id = rows[0]!.id;
  await asUserCommitted(users.office, 'select public.issue_invoice($1::uuid) as nummer', [id]);
  const betrag = await asPostgres<{ total_cents: number }>(
    'select total_cents from public.invoices where id = $1',
    [id],
  );
  return { id, betrag: betrag.rows[0]!.total_cents };
}

async function buche(rechnung: string, betrag: number, tag: string, richtung = 'incoming') {
  await asUserCommitted(
    users.office,
    'select public.record_payment($1::uuid, $2::int, $3::date, $4::text, $5::text, $6::text) as id',
    [rechnung, betrag, tag, 'bank_transfer', richtung, null],
  );
}

// -----------------------------------------------------------------------------
// Termine fuer Auslastung und Ausfaelle
// -----------------------------------------------------------------------------
async function termin(opts: {
  staff?: string;
  patient?: string;
  tage: number;
  von: string;
  bis: string;
  status?: string;
  kind?: string;
  grundlage?: string | null;
  extra?: Record<string, string>;
}): Promise<string> {
  const extraSpalten = Object.keys(opts.extra ?? {});
  const extraWerte = Object.values(opts.extra ?? {});
  const kind = opts.kind ?? 'therapy';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, treatment_basis_id,
       appointment_type, status, kind, title, starts_at, ends_at
       ${extraSpalten.map((s) => `, ${s}`).join('')}
     ) values (
       $1, $2, $3, $4, $5, 'practice', $6, $7, $8,
       ${ortszeit(opts.tage, opts.von)}, ${ortszeit(opts.tage, opts.bis)}
       ${extraWerte.map((w) => `, ${w}`).join('')}
     ) returning id`,
    [
      organizationId,
      kind === 'therapy' ? (opts.patient ?? patients.erika) : null,
      opts.staff ?? ANNA,
      LOCATION,
      opts.grundlage ?? null,
      opts.status ?? 'confirmed',
      kind,
      kind === 'internal' ? 'Teamsitzung' : null,
    ],
  );
  return rows[0]!.id;
}

describe('Kennzahlen der Praxisfuehrung (STA-001)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  describe('(1) Umsatz und Zahlungseingang', () => {
    it('rechnet die ausgestellte Rechnung in den Umsatz und die Zahlung in den Eingang - getrennt', async () => {
      const vorher = await kennzahlen();
      const { id, betrag } = await ausgestellteRechnung(30);

      const ausgestellt = await kennzahlen();
      expect(n(ausgestellt.revenue_cents) - n(vorher.revenue_cents)).toBe(betrag);
      expect(n(ausgestellt.revenue_therapy_cents) - n(vorher.revenue_therapy_cents)).toBe(betrag);
      expect(n(ausgestellt.revenue_training_cents)).toBe(n(vorher.revenue_training_cents));
      // Ohne Zahlung kein Eingang: die beiden Grundlagen mischen sich nicht.
      expect(n(ausgestellt.payments_cents)).toBe(n(vorher.payments_cents));

      await buche(id, 2000, await heute());
      const bezahlt = await kennzahlen();
      expect(n(bezahlt.payments_cents) - n(vorher.payments_cents)).toBe(2000);
      expect(n(bezahlt.revenue_cents)).toBe(n(ausgestellt.revenue_cents));
    });

    it('zieht eine Rueckzahlung ab und laesst eine stornierte Zahlung aussen vor', async () => {
      const vorher = await kennzahlen();
      const { id } = await ausgestellteRechnung(30);
      await buche(id, 2000, await heute());
      await buche(id, 1000, await heute());
      await buche(id, 500, await heute(), 'refund');
      const zweite = await asPostgres<{ id: string }>(
        `select id from public.payments
         where invoice_id = $1 and direction = 'incoming' and amount_cents = 1000`,
        [id],
      );
      expect(n((await kennzahlen()).payments_cents) - n(vorher.payments_cents)).toBe(2500);

      await asUserCommitted(users.office, 'select public.void_payment($1::uuid, $2::text)', [
        zweite.rows[0]!.id,
        'Fehlbuchung',
      ]);
      expect(n((await kennzahlen()).payments_cents) - n(vorher.payments_cents)).toBe(1500);
    });

    it('zieht ein Storno am Tag des Stornos ab', async () => {
      const vorher = await kennzahlen();
      const { id } = await ausgestellteRechnung(30);
      await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2::text)', [
        id,
        'Synthetisch: falscher Empfaenger',
      ]);
      expect(n((await kennzahlen()).revenue_cents)).toBe(n(vorher.revenue_cents));
    });

    it('vergleicht mit dem Vormonat und nimmt einen gewaehlten Monat', async () => {
      const { id } = await ausgestellteRechnung(30);
      const { rows } = await asPostgres<{ tag: string }>(
        `select to_char(date_trunc('month', (now() at time zone '${TZ}')::date)::date - 1, 'YYYY-MM-DD') as tag`,
      );
      const letzterTagVormonat = rows[0]!.tag;
      await buche(id, 1500, letzterTagVormonat);

      const jetzt = await kennzahlen();
      expect(tag(jetzt.month)).toBe(await monatsanfang());
      expect(n(jetzt.payments_previous_cents)).toBe(1500);

      const vormonat = await kennzahlen(letzterTagVormonat);
      expect(tag(vormonat.month)).toBe(letzterTagVormonat.slice(0, 8) + '01');
      expect(n(vormonat.payments_cents)).toBe(1500);
      expect(n(vormonat.revenue_cents)).toBe(0);
    });

    it('zieht das Storno einer Rechnung aus dem Vormonat in diesem Monat ab', async () => {
      const vorher = await kennzahlen();
      const { id, betrag } = await ausgestellteRechnung(30);
      // Ausgestellt am letzten Tag des Vormonats - von Hand, einen anderen Weg
      // in die Vergangenheit gibt es nicht.
      await asPostgres(`
        set session_replication_role = replica;
        update public.invoices
           set issued_on = date_trunc('month', (now() at time zone '${TZ}')::date)::date - 1
         where id = '${id}';
        set session_replication_role = origin;
      `);
      await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2::text)', [
        id,
        'Synthetisch: falscher Empfaenger',
      ]);

      const k = await kennzahlen();
      expect(n(k.revenue_cents) - n(vorher.revenue_cents)).toBe(-betrag);
      expect(n(k.revenue_previous_cents) - n(vorher.revenue_previous_cents)).toBe(betrag);
    });

    it('teilt den Umsatz nach dem Bereich im Snapshot', async () => {
      const vorher = await kennzahlen();
      const { id, betrag } = await ausgestellteRechnung(30);
      // Einen Schreibweg fuer Trainingsrechnungen gibt es noch nicht (siehe
      // revenue-by-service-area.test.ts); der Bereich wird deshalb im
      // Snapshot gesetzt.
      await asPostgres(`
        set session_replication_role = replica;
        update public.invoices
           set snapshot = jsonb_set(snapshot, '{service_area}', '"training"')
         where id = '${id}';
        set session_replication_role = origin;
      `);
      const k = await kennzahlen();
      expect(n(k.revenue_training_cents) - n(vorher.revenue_training_cents)).toBe(betrag);
      expect(n(k.revenue_therapy_cents)).toBe(n(vorher.revenue_therapy_cents));
      expect(n(k.revenue_cents) - n(vorher.revenue_cents)).toBe(betrag);
    });

    it('rechnet den Umsatz wie die Auswertung "Einnahmen je Leistungsart"', async () => {
      const auswertung = async () =>
        (
          await asUser<{ gross_cents: string }>(
            users.office,
            `select gross_cents from public.list_revenue_by_service_area('accrual', null)`,
          )
        ).rows.reduce((summe, zeile) => summe + n(zeile.gross_cents), 0);
      const vorher = {
        statistik: n((await kennzahlen()).revenue_cents),
        auswertung: await auswertung(),
      };
      await ausgestellteRechnung(30);
      await ausgestellteRechnung(40);
      expect(n((await kennzahlen()).revenue_cents) - vorher.statistik).toBe(
        (await auswertung()) - vorher.auswertung,
      );
    });

    it('weist einen Monat ausserhalb jeder Vernunft ab', async () => {
      await expect(kennzahlen('1900-01-01')).rejects.toThrow(/month out of range/);
    });
  });

  describe('(2) Offene Posten', () => {
    it('staffelt offene Rechnungen nach Tagen ueber der Faelligkeit', async () => {
      const vorher = await kennzahlen();
      const a = await ausgestellteRechnung(30);
      const b = await ausgestellteRechnung(40);
      const c = await ausgestellteRechnung(50);
      const d = await ausgestellteRechnung(60);
      // Faelligkeit von Hand: das Zahlungsziel laesst sich sonst nicht altern.
      await asPostgres(`
        set session_replication_role = replica;
        update public.invoices set due_on = (now() at time zone '${TZ}')::date - 10 where id = '${b.id}';
        update public.invoices set due_on = (now() at time zone '${TZ}')::date - 45 where id = '${c.id}';
        update public.invoices set due_on = (now() at time zone '${TZ}')::date - 61 where id = '${d.id}';
        set session_replication_role = origin;
      `);

      const k = await kennzahlen();
      expect(k.open_count - vorher.open_count).toBe(4);
      expect(n(k.open_cents) - n(vorher.open_cents)).toBe(
        a.betrag + b.betrag + c.betrag + d.betrag,
      );
      expect(k.open_not_due_count - vorher.open_not_due_count).toBe(1);
      expect(k.open_overdue_1_30_count - vorher.open_overdue_1_30_count).toBe(1);
      expect(k.open_overdue_31_60_count - vorher.open_overdue_31_60_count).toBe(1);
      expect(k.open_overdue_over_60_count - vorher.open_overdue_over_60_count).toBe(1);
      expect(n(k.open_overdue_over_60_cents) - n(vorher.open_overdue_over_60_cents)).toBe(d.betrag);
    });

    it('zaehlt den offenen Rest einer Teilzahlung und eine bezahlte Rechnung nicht mehr', async () => {
      const vorher = await kennzahlen();
      const teil = await ausgestellteRechnung(30);
      const voll = await ausgestellteRechnung(40);
      await buche(teil.id, 1000, await heute());
      await buche(voll.id, voll.betrag, await heute());

      const k = await kennzahlen();
      expect(k.open_count - vorher.open_count).toBe(1);
      expect(n(k.open_cents) - n(vorher.open_cents)).toBe(teil.betrag - 1000);
    });
  });

  describe('(3) Auslastung der naechsten vierzehn Tage', () => {
    beforeEach(async () => {
      // Ein bekannter Plan: nur Anna, jeden Tag 08:00 bis 10:00 - zwei Stunden.
      await asPostgres(`
        delete from public.staff_working_hour_exceptions;
        delete from public.staff_working_hours;
        insert into public.staff_working_hours (organization_id, staff_member_id, weekday, starts_at, ends_at)
        select '${organizationId}', '${ANNA}', w, time '08:00', time '10:00'
        from generate_series(1, 7) w;
      `);
    });

    it('rechnet die Arbeitszeit aus dem Wochenplan', async () => {
      const k = await kennzahlen();
      expect(k.available_minutes).toBe(14 * 120);
      expect(k.booked_minutes).toBe(0);
      expect(tag(k.utilization_from)).toBe(await heute());
    });

    it('zaehlt gebuchte Zeit nur innerhalb der Arbeitszeit, ohne Absage und ohne interne Termine', async () => {
      await termin({ tage: 1, von: '08:00', bis: '09:00' });
      await termin({ tage: 2, von: '09:30', bis: '10:30' });
      await termin({
        tage: 3,
        von: '08:00',
        bis: '09:00',
        status: 'cancelled',
        extra: {
          cancelled_at: 'now()',
          cancelled_by: `'${users.office}'`,
          cancellation_reason: `'practice_request'`,
        },
      });
      await termin({
        tage: 4,
        von: '08:00',
        bis: '09:00',
        kind: 'internal',
        extra: { event_group_id: 'extensions.gen_random_uuid()' },
      });
      await termin({
        tage: 5,
        von: '08:00',
        bis: '08:45',
        kind: 'training',
        extra: { training_relationship_id: `'${SEED.trainingRelationships.erika}'` },
      });
      // Ausserhalb des Fensters
      await termin({ tage: 20, von: '08:00', bis: '09:00' });

      const k = await kennzahlen();
      expect(k.available_minutes).toBe(14 * 120);
      expect(k.booked_minutes).toBe(60 + 30 + 45);
    });

    it('rechnet heute und die dreizehn Tage danach, nicht den vierzehnten', async () => {
      await termin({ tage: 0, von: '08:00', bis: '08:30' });
      await termin({ tage: 13, von: '08:00', bis: '08:45' });
      await termin({ tage: 14, von: '08:00', bis: '09:00' });
      const k = await kennzahlen();
      expect(k.booked_minutes).toBe(30 + 45);
      expect(tag(k.utilization_to)).toBe(
        (
          await asPostgres<{ t: string }>(
            `select to_char((now() at time zone '${TZ}')::date + 13, 'YYYY-MM-DD') as t`,
          )
        ).rows[0]!.t,
      );
    });

    it('zaehlt ein Nichtantreffen als gebucht (ANN-152)', async () => {
      await termin({
        tage: 1,
        von: '08:00',
        bis: '09:00',
        status: 'no_show',
        extra: { no_show_recorded_at: 'now()', no_show_recorded_by: `'${users.therapist}'` },
      });
      expect((await kennzahlen()).booked_minutes).toBe(60);
    });

    it('nimmt einen abweichenden Tagesblock statt des Wochenplans', async () => {
      await asPostgres(
        `insert into public.staff_working_hour_exceptions
           (organization_id, staff_member_id, on_date, kind, starts_at, ends_at)
         values ($1, $2, (now() at time zone '${TZ}')::date + 2, 'block', time '08:00', time '09:00')`,
        [organizationId, ANNA],
      );
      await termin({ tage: 2, von: '08:30', bis: '09:30' });
      const k = await kennzahlen();
      expect(k.available_minutes).toBe(13 * 120 + 60);
      expect(k.booked_minutes).toBe(30);
    });

    it('nimmt eine Abwesenheit aus der Arbeitszeit und ihre Termine aus der Buchung', async () => {
      await termin({ tage: 1, von: '08:00', bis: '09:00' });
      await asPostgres(
        `insert into public.staff_working_hour_exceptions (organization_id, staff_member_id, on_date, kind)
         values ($1, $2, (now() at time zone '${TZ}')::date + 1, 'unavailable')`,
        [organizationId, ANNA],
      );
      const k = await kennzahlen();
      expect(k.available_minutes).toBe(13 * 120);
      expect(k.booked_minutes).toBe(0);
    });

    it('zaehlt nur Personen, die Termine bekommen koennen', async () => {
      await asPostgres(
        `insert into public.staff_working_hours (organization_id, staff_member_id, weekday, starts_at, ends_at)
         select $1, $2, w, time '08:00', time '10:00' from generate_series(1, 7) w`,
        [organizationId, OLIVIA],
      );
      expect((await kennzahlen()).available_minutes).toBe(14 * 120);
    });
  });

  describe('(4) Verordnungen ohne Anschluss', () => {
    const LENA = '66666666-6666-4666-8666-0000000000e1';

    beforeEach(async () => {
      await asPostgres(`
        insert into public.persons (id, organization_id, given_name, family_name)
          values ('44444444-4444-4444-8444-0000000000e1', '${organizationId}', 'Lena', 'Kennzahl');
        insert into public.patients (id, organization_id, person_id)
          values ('${LENA}', '${organizationId}', '44444444-4444-4444-8444-0000000000e1');
      `);
    });

    async function verordnung(menge: number, art: 'first' | 'self_pay' = 'first'): Promise<string> {
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.treatment_bases
           (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count)
         values ($1, $2, case when $5 = 'self_pay' then null else $3::uuid end, $5,
                 (now() at time zone '${TZ}')::date - 10, $4) returning id`,
        [organizationId, LENA, PROBST, menge, art],
      );
      return rows[0]!.id;
    }

    it('zaehlt ungedeckte Termine eines Selbstzahlers nicht - dort ist niemand anzufragen', async () => {
      const vorher = await kennzahlen();
      const id = await verordnung(1, 'self_pay');
      await termin({ patient: LENA, grundlage: id, tage: 3, von: '11:00', bis: '11:45' });
      await termin({ patient: LENA, grundlage: id, tage: 5, von: '11:00', bis: '11:45' });
      const k = await kennzahlen();
      expect(k.uncovered_appointments).toBe(vorher.uncovered_appointments);
      expect(k.ending_bases).toBe(vorher.ending_bases);
    });

    it('zaehlt dieselben Verordnungen wie die Erinnerung', async () => {
      const vorher = await kennzahlen();
      const id = await verordnung(2);
      await termin({ patient: LENA, grundlage: id, tage: 3, von: '11:00', bis: '11:45' });
      await termin({ patient: LENA, grundlage: id, tage: 10, von: '11:00', bis: '11:45' });

      const k = await kennzahlen();
      expect(k.ending_bases - vorher.ending_bases).toBe(1);
      const erinnerung = await asUser<{ treatment_basis_id: string }>(
        users.ownerTherapist,
        'select treatment_basis_id from public.list_ending_prescriptions()',
      );
      expect(k.ending_bases).toBe(erinnerung.rows.length);
    });

    it('zaehlt kommende Termine, die die Grundlage nicht mehr deckt', async () => {
      const vorher = await kennzahlen();
      const id = await verordnung(1);
      await termin({ patient: LENA, grundlage: id, tage: 3, von: '11:00', bis: '11:45' });
      await termin({ patient: LENA, grundlage: id, tage: 5, von: '11:00', bis: '11:45' });
      await termin({ patient: LENA, grundlage: id, tage: 7, von: '11:00', bis: '11:45' });

      expect((await kennzahlen()).uncovered_appointments - vorher.uncovered_appointments).toBe(2);
    });
  });

  describe('(5) Ausfaelle', () => {
    it('zaehlt Absagen durch Patient:innen und Nichtantreffen der letzten vier Wochen, mit Honorar', async () => {
      const vorher = await kennzahlen();
      const spaet = await termin({
        tage: -3,
        von: '09:00',
        bis: '09:45',
        status: 'cancelled',
        extra: {
          cancelled_at: 'now()',
          cancelled_by: `'${users.office}'`,
          cancellation_reason: `'patient_request'`,
          cancellation_received_at: 'now()',
          fee_basis: `'late_cancellation'`,
        },
      });
      await asUserCommitted(
        users.ownerTherapist,
        'select public.record_billable_services($1::uuid, $2::jsonb)',
        [spaet, JSON.stringify([{ catalog_item_id: KATALOG.ausfall, quantity: 1 }])],
      );
      await termin({
        tage: -5,
        von: '09:00',
        bis: '09:45',
        status: 'cancelled',
        extra: {
          cancelled_at: 'now()',
          cancelled_by: `'${users.office}'`,
          cancellation_reason: `'patient_request'`,
        },
      });
      // Eine Absage der Praxis ist kein Ausfall.
      await termin({
        tage: -6,
        von: '09:00',
        bis: '09:45',
        status: 'cancelled',
        extra: {
          cancelled_at: 'now()',
          cancelled_by: `'${users.office}'`,
          cancellation_reason: `'practice_request'`,
        },
      });
      await termin({
        tage: -10,
        von: '09:00',
        bis: '09:45',
        status: 'no_show',
        extra: { no_show_recorded_at: 'now()', no_show_recorded_by: `'${users.therapist}'` },
      });
      // Die vier Wochen davor, und was noch aelter ist.
      await termin({
        tage: -40,
        von: '09:00',
        bis: '09:45',
        status: 'cancelled',
        extra: {
          cancelled_at: 'now()',
          cancelled_by: `'${users.office}'`,
          cancellation_reason: `'patient_request'`,
        },
      });
      await termin({
        tage: -70,
        von: '09:00',
        bis: '09:45',
        status: 'cancelled',
        extra: {
          cancelled_at: 'now()',
          cancelled_by: `'${users.office}'`,
          cancellation_reason: `'patient_request'`,
        },
      });

      const k = await kennzahlen();
      expect(k.patient_cancellations - vorher.patient_cancellations).toBe(2);
      expect(k.no_shows - vorher.no_shows).toBe(1);
      expect(k.absences_with_fee - vorher.absences_with_fee).toBe(1);
      expect(n(k.absence_fee_cents) - n(vorher.absence_fee_cents)).toBe(4500);
      expect(k.absences_previous - vorher.absences_previous).toBe(1);
      expect(tag(k.absences_to)).toBe(await heute());
    });
  });

  describe('(5) Ausfaelle an den Grenzen der vier Wochen', () => {
    it('zaehlt Tag -27 in diese, -28 und -55 in die vorigen vier Wochen, -56 gar nicht', async () => {
      const vorher = await kennzahlen();
      for (const tage of [-27, -28, -55, -56]) {
        await termin({
          tage,
          von: '09:00',
          bis: '09:45',
          status: 'cancelled',
          extra: {
            cancelled_at: 'now()',
            cancelled_by: `'${users.office}'`,
            cancellation_reason: `'patient_request'`,
          },
        });
      }
      const k = await kennzahlen();
      expect(k.patient_cancellations - vorher.patient_cancellations).toBe(1);
      expect(k.absences_previous - vorher.absences_previous).toBe(2);
    });
  });

  describe('Wer die Zahlen sieht', () => {
    it('liefert nur Summen - keine Person, keine Rechnung, keine Mitarbeiterin', async () => {
      const k = await kennzahlen();
      for (const spalte of Object.keys(k)) {
        expect(spalte).not.toMatch(/(^|_)(id|name|staff|invoice_number)($|_)|^patient_(id|name)/);
      }
    });

    it('zeigt die Kennzahlen allein owner und weist alle anderen protokolliert ab', async () => {
      for (const konto of [
        users.office,
        users.therapist,
        users.teamLead,
        users.trainer,
        users.patientMax,
        users.patientErika,
      ]) {
        await erwarteAbgewiesenenLeseversuch(konto, KENNZAHLEN, [null], 'statistics.read');
      }
      await expect(asAnon(KENNZAHLEN, [null])).rejects.toThrow(/permission denied/i);
    });

    it('endet an der Organisationsgrenze', async () => {
      await ausgestellteRechnung(30);
      expect(n((await kennzahlen()).revenue_cents)).toBeGreaterThan(0);
      const fremd = await fremdeOrganisation();
      const { rows } = await asUser<Kennzahlen>(fremd.owner, KENNZAHLEN, [null]);
      expect(n(rows[0]!.revenue_cents)).toBe(0);
      expect(rows[0]!.open_count).toBe(0);
    });
  });
});
