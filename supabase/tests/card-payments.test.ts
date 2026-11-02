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

// Kartenzahlung beim Hausbesuch hinter einem Adapter (ANN-837): Vorprüfung vor dem Terminal und
// Buchen danach, beides mit dem Token der Person; die Kennung des Terminals macht das Buchen wiederholbar.
const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';

const VORPRUEFUNG = 'select public.card_payment_preflight($1::uuid, $2::int) as waehrung';
const BUCHEN = 'select public.record_card_payment($1::uuid, $2::int, $3::text) as id';

async function monat(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

/** Eine ausgestellte Rechnung (oder ein Entwurf) über eine Krankengymnastik an Erika, mit Betrag. */
async function ausgestellteRechnung(
  stundeImMonat = 30,
  ausstellen = true,
): Promise<{ id: string; betrag: number }> {
  const { rows: termin } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone 'Europe/Berlin') + make_interval(hours => $5::int))
         at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin') + make_interval(hours => $5::int + 1))
         at time zone 'Europe/Berlin',
       now(), $6
     ) returning id`,
    [organizationId, patients.erika, STAFF_ANNA, LOCATION, stundeImMonat, users.ownerTherapist],
  );
  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [termin[0]!.id, JSON.stringify([{ catalog_item_id: KG, quantity: 1 }])],
  );
  const { rows } = await asUserCommitted<{ id: string }>(
    users.office,
    'select public.create_invoice_draft($1::uuid, $2::date) as id',
    [patients.erika, await monat()],
  );
  const id = rows[0]!.id;
  if (!ausstellen) return { id, betrag: 0 };
  await asUserCommitted(users.office, 'select public.issue_invoice($1::uuid)', [id]);
  const { rows: summe } = await asPostgres<{ total_cents: number }>(
    'select total_cents from public.invoices where id = $1',
    [id],
  );
  return { id, betrag: summe[0]!.total_cents };
}

interface Kartenzahlung {
  invoice_id: string;
  method: string;
  direction: string;
  amount_cents: number;
  terminal_transaction: string | null;
  heute: boolean;
  created_by: string | null;
}

async function zahlungen(rechnung: string): Promise<Kartenzahlung[]> {
  const { rows } = await asPostgres<Kartenzahlung>(
    `select invoice_id, method, direction, amount_cents, terminal_transaction, created_by,
            paid_on = (now() at time zone 'Europe/Berlin')::date as heute
       from public.payments where invoice_id = $1 order by created_at`,
    [rechnung],
  );
  return rows;
}

describe('Kartenzahlung beim Hausbesuch (PRX-047)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  });

  describe('Vorprüfung vor dem Terminal', () => {
    it('nennt owner und Büro die Währung und bucht nichts', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      for (const konto of [users.office, users.ownerTherapist]) {
        const { rows } = await asUser<{ waehrung: string }>(konto, VORPRUEFUNG, [id, betrag]);
        expect(rows[0]!.waehrung).toBe('EUR');
      }
      expect(await zahlungen(id)).toEqual([]);
    });

    it('lässt am Terminal nie mehr als offen zu und keinen Betrag null', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await expect(asUser(users.office, VORPRUEFUNG, [id, betrag + 1])).rejects.toThrow(
        /cannot exceed the open amount/,
      );
      await expect(asUser(users.office, VORPRUEFUNG, [id, 0])).rejects.toThrow(/positive amount/);

      // Nach einer Teilzahlung gilt der Rest.
      await asUserCommitted(
        users.office,
        'select public.record_payment($1::uuid, 1000, current_date, $2::text)',
        [id, 'bank_transfer'],
      );
      await expect(asUser(users.office, VORPRUEFUNG, [id, betrag - 999])).rejects.toThrow(
        /cannot exceed the open amount/,
      );
      const { rows } = await asUser<{ waehrung: string }>(users.office, VORPRUEFUNG, [
        id,
        betrag - 1000,
      ]);
      expect(rows[0]!.waehrung).toBe('EUR');
    });

    it('weist einen Entwurf ab', async () => {
      const { id } = await ausgestellteRechnung(30, false);
      await expect(asUser(users.office, VORPRUEFUNG, [id, 100])).rejects.toThrow(/issued invoice/);
      await expect(asUserCommitted(users.office, BUCHEN, [id, 100, 'tx-0'])).rejects.toThrow(
        /issued invoice/,
      );
    });

    it('weist eine stornierte Rechnung ab', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2::text)', [
        id,
        'Falsche Leistung abgerechnet',
      ]);
      await expect(asUser(users.office, VORPRUEFUNG, [id, betrag])).rejects.toThrow(
        /cancelled invoice takes no payment/,
      );
    });
  });

  describe('Buchen nach dem Terminal', () => {
    it('bucht Eingang, heute, Weg Karte, mit der Kennung des Terminals', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await asUserCommitted(users.ownerTherapist, BUCHEN, [id, betrag, 'mock-7f3a']);
      expect(await zahlungen(id)).toEqual([
        {
          invoice_id: id,
          method: 'card',
          direction: 'incoming',
          amount_cents: betrag,
          terminal_transaction: 'mock-7f3a',
          heute: true,
          created_by: users.ownerTherapist,
        },
      ]);
    });

    it('bucht dieselbe Kennung zweimal gesendet genau einmal', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      const erste = await asUserCommitted<{ id: string }>(users.office, BUCHEN, [
        id,
        betrag,
        'tx-1',
      ]);
      const zweite = await asUserCommitted<{ id: string }>(users.office, BUCHEN, [
        id,
        betrag,
        'tx-1',
      ]);
      expect(zweite.rows[0]!.id).toBe(erste.rows[0]!.id);
      expect(await zahlungen(id)).toHaveLength(1);
    });

    it('weist dieselbe Kennung an anderer Rechnung oder mit anderem Betrag ab', async () => {
      const a = await ausgestellteRechnung(30);
      const b = await ausgestellteRechnung(60);
      await asUserCommitted(users.office, BUCHEN, [a.id, a.betrag, 'tx-2']);
      await expect(asUserCommitted(users.office, BUCHEN, [b.id, b.betrag, 'tx-2'])).rejects.toThrow(
        /already booked/,
      );
      await expect(asUserCommitted(users.office, BUCHEN, [a.id, 100, 'tx-2'])).rejects.toThrow(
        /already booked/,
      );
      await expect(
        asUserCommitted(users.office, BUCHEN, [a.id, 100, 'mit leerzeichen']),
      ).rejects.toThrow(/needs its terminal transaction/);
      await expect(asUserCommitted(users.office, BUCHEN, [a.id, 100, null])).rejects.toThrow(
        /needs its terminal transaction/,
      );
    });

    it('bucht auch über dem offenen Betrag, wenn inzwischen anderes Geld kam - abgebucht ist abgebucht', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await asUserCommitted(
        users.office,
        'select public.record_payment($1::uuid, $2::int, current_date, $3::text)',
        [id, betrag, 'bank_transfer'],
      );
      await asUserCommitted(users.office, BUCHEN, [id, betrag, 'tx-3']);
      const { rows } = await asPostgres<{ bezahlt: number }>(
        'select app.invoice_paid_cents($1::uuid) as bezahlt',
        [id],
      );
      expect(rows[0]!.bezahlt).toBe(2 * betrag);
    });

    it('nimmt an einer stornierten Rechnung nichts an', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2::text)', [
        id,
        'Falsche Leistung abgerechnet',
      ]);
      await expect(asUserCommitted(users.office, BUCHEN, [id, betrag, 'tx-4'])).rejects.toThrow(
        /cancelled invoice takes no payment/,
      );
      expect(await zahlungen(id)).toEqual([]);
    });
  });

  describe('Wer kassieren darf', () => {
    it('weist alle anderen Rollen, Plattformkonten und anon ab - ohne Buchung', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      for (const konto of [
        users.therapist,
        users.teamLead,
        users.trainer,
        users.patientErika,
        users.plattformErika,
        users.plattformPaula,
      ]) {
        await expect(asUser(konto, VORPRUEFUNG, [id, betrag])).rejects.toThrow(
          /not allowed to manage invoices/,
        );
        await expect(asUser(konto, BUCHEN, [id, betrag, 'tx-5'])).rejects.toThrow(
          /not allowed to manage invoices/,
        );
      }
      await expect(asUser(null, BUCHEN, [id, betrag, 'tx-5'])).rejects.toThrow(/not authenticated/);
      await expect(asAnon(VORPRUEFUNG, [id, betrag])).rejects.toThrow(/permission denied/i);
      await expect(asAnon(BUCHEN, [id, betrag, 'tx-5'])).rejects.toThrow(/permission denied/i);
      expect(await zahlungen(id)).toEqual([]);
    });

    it('endet an der Organisationsgrenze', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      const fremd = await fremdeOrganisation();
      await expect(asUser(fremd.owner, VORPRUEFUNG, [id, betrag])).rejects.toThrow(
        /invoice not found/,
      );
      await expect(asUser(fremd.owner, BUCHEN, [id, betrag, 'tx-6'])).rejects.toThrow(
        /invoice not found/,
      );
    });

    it('lässt die gemeinsame Prüfung für keine Anwendungsrolle direkt aufrufen', async () => {
      const { id } = await ausgestellteRechnung();
      const sql = 'select app.card_payment_invoice($1::uuid, 100)';
      await expect(asUser(users.ownerTherapist, sql, [id])).rejects.toThrow(/permission denied/i);
      await expect(asAnon(sql, [id])).rejects.toThrow(/permission denied/i);
    });
  });

  describe('Die Kennung am Datensatz', () => {
    it('steht in der Auskunft nach Art. 15, in der Akte wie im Training', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await asUserCommitted(users.office, BUCHEN, [id, betrag, 'tx-a15']);
      const { rows } = await asUser<{
        daten: { tabellen: { payments: Record<string, unknown>[] } };
      }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
        patients.erika,
      ]);
      expect(rows[0]!.daten.tabellen.payments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            invoice_id: id,
            method: 'card',
            terminal_transaction: 'tx-a15',
          }),
        ]),
      );
      const { rows: stellen } = await asPostgres<{ akte: boolean; training: boolean }>(
        `select position('terminal_transaction' in
                  pg_get_functiondef('public.export_patient_record(uuid)'::regprocedure)) > 0 as akte,
                position('terminal_transaction' in
                  pg_get_functiondef('public.export_training_record(uuid)'::regprocedure)) > 0 as training`,
      );
      expect(stellen[0]).toEqual({ akte: true, training: true });
    });

    it('steht nur an einer Karte und lässt sich nicht nachträglich ändern', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await expect(
        asPostgres(
          `insert into public.payments (organization_id, invoice_id, direction, amount_cents,
             currency, paid_on, method, terminal_transaction)
           values ($1, $2, 'incoming', 100, 'EUR', current_date, 'bank_transfer', 'tx-7')`,
          [organizationId, id],
        ),
      ).rejects.toThrow(/payments_terminal_transaction_check/);

      await asUserCommitted(users.office, BUCHEN, [id, betrag, 'tx-8']);
      await expect(
        asPostgres(
          `update public.payments set terminal_transaction = 'tx-9' where invoice_id = $1`,
          [id],
        ),
      ).rejects.toThrow(/can only be voided, not changed/);
    });
  });
});
