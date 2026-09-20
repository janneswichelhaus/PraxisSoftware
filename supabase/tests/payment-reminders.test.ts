import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
  testDatabaseUrl,
} from './helpers/db';

/**
 * Die Zahlungserinnerung ist ein Dokument, kein Mahnlauf (ABR-003d).
 *
 * `IDEA-PRX-012`, bestaetigt am 2026-09-06: aus einer ueberfaelligen Rechnung
 * eine Erinnerung als Dokument - **ohne Stufen, ohne Gebuehren, ohne
 * Automatik**. Vier Zusagen stehen hier im Mittelpunkt (**ANN-080**):
 *
 *   * **Keine Stufen.** Eine zweite Erinnerung ist noch eine Erinnerung und
 *     traegt keinen Rang, keine Gebuehr und keine Zinsen.
 *   * **Erst ab Faelligkeit.** Vor dem Zahlungsziel gibt es nichts zu
 *     erinnern - und an einer bezahlten oder stornierten Rechnung auch nicht.
 *   * **Der offene Betrag steht fest.** Er wird im Dokument gespeichert und
 *     nicht spaeter neu gerechnet; ein Beleg, dessen Zahl sich aendert, ist
 *     keiner.
 *   * **Keine eigene Nummer.** Die Erinnerung verweist auf die
 *     Rechnungsnummer und verbraucht keine aus dem Rechnungskreis.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';
const KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';

const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const ERINNERN = 'select public.create_payment_reminder($1::uuid) as id';
const ERINNERUNGEN = 'select * from public.list_invoice_reminders($1::uuid)';
const DOKUMENT = 'select public.get_payment_reminder($1::uuid) as dokument';
const BUCHEN =
  'select public.record_payment($1::uuid, $2::int, $3::date, $4::text, $5::text, $6::text) as id';

interface Erinnerung {
  id: string;
  reminder_on: string | Date;
  due_on: string | Date;
  outstanding_cents: number;
  currency: string;
}

/**
 * Ein `date` kommt hier als `Date` an, weil der pg-Treiber es so liefert; die
 * Anwendung bekommt ueber PostgREST eine Zeichenkette. Der Test vergleicht
 * deshalb den Tag und nicht die Darstellung.
 */
function alsTag(wert: string | Date): string {
  return wert instanceof Date ? wert.toISOString().slice(0, 10) : wert;
}

async function heute(): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD') as tag`,
  );
  return rows[0]!.tag;
}

async function monat(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

/**
 * Eine ausgestellte Rechnung ueber eine Leistung.
 *
 * Der Termin liegt in der 30. Stunde des laufenden Monats (2., 06:00) statt
 * 30 Stunden vor jetzt: So liegt die Leistung immer in dem Monat, den der
 * Entwurf verlangt - auch am Monatsersten (R3-005).
 */
async function ausgestellteRechnung(): Promise<{ id: string; nummer: string; betrag: number }> {
  const { rows: termin } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone 'Europe/Berlin') + interval '30 hours')
         at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin') + interval '31 hours')
         at time zone 'Europe/Berlin',
       $5, now(), $6
     ) returning id`,
    [organizationId, patients.erika, STAFF_ANNA, LOCATION, GRUNDLAGE_FRISCH, users.ownerTherapist],
  );

  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [termin[0]!.id, JSON.stringify([{ catalog_item_id: KG, quantity: 1 }])],
  );

  const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
    patients.erika,
    await monat(),
  ]);
  const { rows: nummer } = await asUserCommitted<{ nummer: string }>(users.office, AUSSTELLEN, [
    entwurf[0]!.id,
  ]);
  const { rows: betrag } = await asPostgres<{ total_cents: number }>(
    'select total_cents from public.invoices where id = $1',
    [entwurf[0]!.id],
  );

  return { id: entwurf[0]!.id, nummer: nummer[0]!.nummer, betrag: betrag[0]!.total_cents };
}

/**
 * Datiert das Zahlungsziel zurueck, damit der Test nicht vierzehn Tage warten
 * muss. Der Trigger laesst eine ausgestellte Rechnung nicht aendern - also
 * ueber ihn hinweg, wie in `payments.test.ts`.
 */
async function faelligSeit(id: string, tage: number): Promise<void> {
  await asPostgres('alter table public.invoices disable trigger invoices_frozen');
  await asPostgres(
    `update public.invoices
        set due_on = (now() at time zone 'Europe/Berlin')::date - $2::int
      where id = $1`,
    [id, tage],
  );
  await asPostgres('alter table public.invoices enable trigger invoices_frozen');
}

/**
 * Oeffnet auf einer eigenen Verbindung eine Transaktion als office.
 *
 * Nur fuer die Tests, die zwei Vorgaenge wirklich gleichzeitig brauchen: Die
 * Helfer aus helpers/db schliessen ihre Transaktion selbst und koennen keine
 * Sperre halten.
 */
async function alsOffice(client: Client): Promise<void> {
  await client.query('begin');
  await client.query("select set_config('role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: users.office, role: 'authenticated' }),
  ]);
}

async function erinnere(id: string): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ERINNERN, [id]);
  return rows[0]!.id;
}

describe('Zahlungserinnerung', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.invoice_payment_reminders');
    await asPostgres('delete from public.payments');
    await asPostgres('delete from public.invoice_cancellations');
    await asPostgres('delete from public.invoice_items');
    await asPostgres('delete from public.invoices');
    await asPostgres('delete from public.invoice_number_series');
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.appointments');
    await asPostgres('update public.treatment_base_items set used_quantity = 0');
    await asPostgres("delete from public.audit_log where action like 'invoice%'");
  });

  describe('Ausstellen', () => {
    it('haelt den offenen Betrag und eine Frist von vierzehn Tagen fest', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await faelligSeit(id, 3);

      await erinnere(id);

      const { rows } = await asUser<Erinnerung>(users.office, ERINNERUNGEN, [id]);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.outstanding_cents).toBe(betrag);
      expect(alsTag(rows[0]!.reminder_on)).toBe(await heute());

      const { rows: frist } = await asPostgres<{ tage: number }>(
        'select (due_on - reminder_on) as tage from public.invoice_payment_reminders where id = $1',
        [rows[0]!.id],
      );
      expect(Number(frist[0]!.tage)).toBe(14);
    });

    it('rechnet die Teilzahlung heraus', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      await asUserCommitted(users.office, BUCHEN, [
        id,
        1000,
        await heute(),
        'bank_transfer',
        'incoming',
        null,
      ]);

      await erinnere(id);

      const { rows } = await asUser<Erinnerung>(users.office, ERINNERUNGEN, [id]);
      expect(rows[0]!.outstanding_cents).toBe(betrag - 1000);
    });

    it('friert den Betrag ein — eine spaetere Zahlung aendert das Dokument nicht', async () => {
      // Ein Beleg, dessen Zahl sich nachtraeglich aendert, ist keiner
      // (ANN-080). Der heutige Stand steht weiter an der Rechnung.
      const { id, betrag } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      const erinnerung = await erinnere(id);

      await asUserCommitted(users.office, BUCHEN, [
        id,
        betrag,
        await heute(),
        'bank_transfer',
        'incoming',
        null,
      ]);

      const { rows } = await asUser<{ dokument: { outstanding_cents: number } }>(
        users.office,
        DOKUMENT,
        [erinnerung],
      );
      expect(rows[0]!.dokument.outstanding_cents).toBe(betrag);
    });

    it('verbraucht keine Rechnungsnummer', async () => {
      // Die Erinnerung stellt nichts in Rechnung; eine Nummer aus dem
      // Rechnungskreis wuerde eine zweite Forderung vortaeuschen.
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 3);

      const { rows: vorher } = await asPostgres<{ next_number: number }>(
        'select next_number from public.invoice_number_series',
      );
      await erinnere(id);
      const { rows: nachher } = await asPostgres<{ next_number: number }>(
        'select next_number from public.invoice_number_series',
      );

      expect(nachher[0]!.next_number).toBe(vorher[0]!.next_number);
    });

    it('kennt keine Stufen: die zweite Erinnerung ist wie die erste', async () => {
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      const erste = await erinnere(id);

      // Am naechsten Tag noch einmal - dieselbe Bauart, kein Rang, keine
      // Gebuehr. Die Spalten sagen es: Es gibt keine.
      await asPostgres(
        'update public.invoice_payment_reminders set reminder_on = reminder_on - 1 where id = $1',
        [erste],
      ).catch(() => undefined);

      const { rows: spalten } = await asPostgres<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'invoice_payment_reminders'`,
      );
      const namen = spalten.map((s) => s.column_name);
      expect(namen).not.toContain('level');
      expect(namen).not.toContain('stage');
      expect(namen).not.toContain('fee_cents');
    });

    it('schreibt hoechstens eine Erinnerung je Rechnung und Tag', async () => {
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      await erinnere(id);

      await expect(erinnere(id)).rejects.toThrow(/already written today/);
    });

    it('schreibt den Betrag nicht an einer gleichzeitigen Zahlung vorbei (R3-009)', async () => {
      // Der offene Betrag geht auf ein Blatt und steht damit fest (ANN-080).
      // Ohne Sperre las die Erinnerung den Stand, waehrend nebenan die
      // Zahlung lief - und schrieb eine Forderung fest, die es nicht mehr
      // gab.
      const { id, betrag } = await ausgestellteRechnung();
      await faelligSeit(id, 5);

      const zahlung = new Client({ connectionString: testDatabaseUrl() });
      const erinnerung = new Client({ connectionString: testDatabaseUrl() });
      await zahlung.connect();
      await erinnerung.connect();

      try {
        await alsOffice(zahlung);
        await alsOffice(erinnerung);

        // Die Zahlung sperrt die Rechnung und bucht den vollen Betrag,
        // bestaetigt aber noch nicht.
        await zahlung.query(BUCHEN, [id, betrag, await heute(), 'bank_transfer', 'incoming', null]);

        const laeuft = erinnerung
          .query(ERINNERN, [id])
          .then(() => null)
          .catch((fehler: unknown) => fehler as Error);

        await new Promise((fertig) => setTimeout(fertig, 200));
        await zahlung.query('commit');

        const fehler = await laeuft;
        await erinnerung.query(fehler === null ? 'commit' : 'rollback');

        expect(fehler?.message).toMatch(/this invoice has nothing outstanding/);

        const { rows } = await asPostgres<{ anzahl: number }>(
          'select count(*)::int as anzahl from public.invoice_payment_reminders where invoice_id = $1',
          [id],
        );
        expect(rows[0]!.anzahl).toBe(0);
      } finally {
        await zahlung.query('rollback').catch(() => undefined);
        await zahlung.end();
        await erinnerung.end();
      }
    });

    it('nennt auch bei zwei gleichzeitigen Erinnerungen den Grund (R3-009)', async () => {
      // Zwei Klicks im selben Moment liefen bisher in den Unique-Index und
      // endeten mit einer technischen Meldung statt mit dem Satz, der sagt,
      // was los ist.
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 5);

      const erste = new Client({ connectionString: testDatabaseUrl() });
      const zweite = new Client({ connectionString: testDatabaseUrl() });
      await erste.connect();
      await zweite.connect();

      try {
        await alsOffice(erste);
        await alsOffice(zweite);

        await erste.query(ERINNERN, [id]);

        const laeuft = zweite
          .query(ERINNERN, [id])
          .then(() => null)
          .catch((fehler: unknown) => fehler as Error);

        await new Promise((fertig) => setTimeout(fertig, 200));
        await erste.query('commit');

        const fehler = await laeuft;
        await zweite.query(fehler === null ? 'commit' : 'rollback');

        expect(fehler?.message).toMatch(/already written today/);
      } finally {
        await erste.query('rollback').catch(() => undefined);
        await erste.end();
        await zweite.end();
      }
    });
  });

  describe('Wann es keine gibt', () => {
    it('vor der Faelligkeit', async () => {
      const { id } = await ausgestellteRechnung();

      await expect(erinnere(id)).rejects.toThrow(/not overdue yet/);
    });

    it('an einer bezahlten Rechnung', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      await asUserCommitted(users.office, BUCHEN, [
        id,
        betrag,
        await heute(),
        'bank_transfer',
        'incoming',
        null,
      ]);

      await expect(erinnere(id)).rejects.toThrow(/nothing outstanding/);
    });

    it('an einer stornierten Rechnung', async () => {
      // Sie ist keine Forderung mehr (ABR-003c).
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2::text)', [
        id,
        'Falscher Empfaenger',
      ]);

      await expect(erinnere(id)).rejects.toThrow(/cancelled invoice is not reminded/);
    });

    it('an einem Entwurf', async () => {
      const { rows: termin } = await asPostgres<{ id: string }>(
        `insert into public.appointments (
           organization_id, patient_id, staff_member_id, location_id,
           appointment_type, status, starts_at, ends_at, treatment_basis_id,
           completed_at, completed_by
         ) values (
           $1, $2, $3, $4, 'practice', 'documented',
           (date_trunc('month', now() at time zone 'Europe/Berlin') + interval '30 hours')
             at time zone 'Europe/Berlin',
           (date_trunc('month', now() at time zone 'Europe/Berlin') + interval '31 hours')
             at time zone 'Europe/Berlin',
           $5, now(), $6
         ) returning id`,
        [
          organizationId,
          patients.erika,
          STAFF_ANNA,
          LOCATION,
          GRUNDLAGE_FRISCH,
          users.ownerTherapist,
        ],
      );
      await asUserCommitted(
        users.ownerTherapist,
        'select public.record_billable_services($1::uuid, $2::jsonb)',
        [termin[0]!.id, JSON.stringify([{ catalog_item_id: KG, quantity: 1 }])],
      );
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      await expect(erinnere(rows[0]!.id)).rejects.toThrow(/belongs to an issued invoice/);
    });

    it('durch die Therapeutin (ANN-076)', async () => {
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 3);

      await expect(asUserCommitted(users.therapist, ERINNERN, [id])).rejects.toThrow(
        /not allowed to manage invoices/,
      );
    });
  });

  describe('Das Dokument', () => {
    it('bringt den Snapshot der Rechnung mit', async () => {
      const { id, nummer } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      const erinnerung = await erinnere(id);

      const { rows } = await asUser<{
        dokument: {
          invoice_number: string;
          document: { issuer: { legal_name: string }; recipient: { name: string } };
        };
      }>(users.office, DOKUMENT, [erinnerung]);

      expect(rows[0]!.dokument.invoice_number).toBe(nummer);
      expect(rows[0]!.dokument.document.issuer.legal_name.length).toBeGreaterThan(0);
      expect(rows[0]!.dokument.document.recipient.name.length).toBeGreaterThan(0);
    });

    it('laesst sich nicht aendern — auch nicht durch postgres', async () => {
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      const erinnerung = await erinnere(id);

      await expect(
        asPostgres(
          'update public.invoice_payment_reminders set due_on = due_on + 7 where id = $1',
          [erinnerung],
        ),
      ).rejects.toThrow(/a payment reminder cannot be changed/);
    });

    it('steht im Protokoll, ohne den Empfaenger zu nennen (ADR-011)', async () => {
      const { id, nummer } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      await erinnere(id);

      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log
          where action = 'invoice.reminder_created' and subject_id = $1`,
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.context.invoice_number).toBe(nummer);
      expect(JSON.stringify(rows[0]!.context)).not.toContain('Erika');
    });

    it('bleibt fremden Augen verschlossen (ADR-004)', async () => {
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 3);
      const erinnerung = await erinnere(id);

      await expect(asUser(users.therapist, DOKUMENT, [erinnerung])).rejects.toThrow(
        /not allowed to read invoices/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Mandantengrenze (ADR-003, R3-025)
  // ---------------------------------------------------------------------------
  describe('Fremde Organisation', () => {
    it('erinnert nicht an eine fremde Rechnung und liest keine Erinnerung', async () => {
      const fremd = await fremdeOrganisation();
      const { id } = await ausgestellteRechnung();
      await faelligSeit(id, 5);
      await erinnere(id);

      await expect(asUser(fremd.owner, ERINNERN, [id])).rejects.toThrow(/invoice not found/);
      expect((await asUser(fremd.owner, ERINNERUNGEN, [id])).rows).toEqual([]);
    });
  });
});
