import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabaseOhneTermine,
  testDatabaseUrl,
} from './helpers/db';

/**
 * Zahlungen sind eigene Transaktionen (ABR-004).
 *
 * Fuenf Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Der Zahlungsstand wird gerechnet, nicht gepflegt** (ADR-009 Punkt 12,
 *     Konsequenz: "Der Zahlungsstatus ist damit abgeleitet, nicht gesetzt").
 *     Keine Spalte an der Rechnung kann von den Transaktionen abweichen, weil
 *     es keine gibt.
 *   * **Teilzahlung und Ueberzahlung sind normal**, eine Rueckzahlung ueber
 *     dem Eingang nicht.
 *   * **Gebucht ist gebucht**: Eine Zahlung laesst sich stornieren, aber nicht
 *     aendern - und die Sperre sitzt am Trigger, gilt also fuer jeden Weg in
 *     die Tabelle.
 *   * **Eine Zahlung haengt an einer ausgestellten Rechnung**, nie an einem
 *     Entwurf.
 *   * **Die Therapeutin bleibt aussen vor** (ANN-076): Rechnungen und
 *     Zahlungsstatus liegen bei owner und office.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Behandlungsgrundlage aus supabase/seed.sql: Erika, 10 Termine, 0 genutzt. */
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';

/** Katalogpositionen aus supabase/seed.sql, Preisliste 2026. */
const KATALOG = {
  /** Krankengymnastik, 45,00 Euro. */
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  /** Manuelle Therapie, 55,00 Euro. */
  mt: 'cccccccc-cccc-4ccc-8ccc-000000000003',
} as const;

const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const BUCHEN =
  'select public.record_payment($1::uuid, $2::int, $3::date, $4::text, $5::text, $6::text) as id';
const STORNIEREN = 'select public.void_payment($1::uuid, $2::text)';
const RECHNUNG_STORNIEREN = 'select public.cancel_invoice($1::uuid, $2::text) as nummer';
const LISTE = 'select * from public.list_invoices(100)';
const POSTEN = 'select * from public.list_open_items(100)';
const ZAHLUNGEN = 'select * from public.list_payments(100)';

interface Rechnungszeile {
  id: string;
  status: string;
  total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  payment_state: string;
  overdue: boolean;
}

interface Posten {
  id: string;
  invoice_number: string;
  total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  overdue: boolean;
  open_total_cents: number;
}

/** Legt einen dokumentierten Termin an; `stunden` zaehlt rueckwaerts. */
async function termin(vorStunden: number, patient?: string): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       date_trunc('hour', now()) - make_interval(hours => $5::int),
       date_trunc('hour', now()) - make_interval(hours => $5::int - 1),
       $6, now(), $7
     ) returning id`,
    [
      organizationId,
      patient ?? patients.erika,
      STAFF_ANNA,
      LOCATION,
      vorStunden,
      patient === undefined ? GRUNDLAGE_FRISCH : null,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/** Erfasst eine Leistung an einem frischen Termin. */
async function leistung(position: string, vorStunden: number, patient?: string): Promise<void> {
  const id = await termin(vorStunden, patient);
  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [id, JSON.stringify([{ catalog_item_id: position, quantity: 1 }])],
  );
}

/** Der erste Tag des laufenden Monats in der Zeitzone der Praxis. */
async function monat(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone 'Europe/Berlin')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

/** Heute in der Zeitzone der Praxis. */
async function heute(): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD') as tag`,
  );
  return rows[0]!.tag;
}

/**
 * Eine ausgestellte Rechnung ueber genau eine Leistung.
 *
 * Liefert Kennung und Betrag - die Tests rechnen gegen den echten Betrag und
 * nicht gegen eine im Test wiederholte Zahl, die beim naechsten Seed
 * auseinanderlaeuft.
 */
async function ausgestellteRechnung(
  position: string = KATALOG.kg,
  vorStunden = 30,
): Promise<{ id: string; betrag: number }> {
  await leistung(position, vorStunden);
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
    patients.erika,
    await monat(),
  ]);
  const id = rows[0]!.id;
  await asUserCommitted(users.office, AUSSTELLEN, [id]);

  const { rows: betrag } = await asPostgres<{ total_cents: number }>(
    'select total_cents from public.invoices where id = $1',
    [id],
  );
  return { id, betrag: betrag[0]!.total_cents };
}

async function buche(
  rechnung: string,
  betrag: number,
  opts: { richtung?: string; tag?: string; weg?: string; notiz?: string | null } = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.office, BUCHEN, [
    rechnung,
    betrag,
    opts.tag ?? (await heute()),
    opts.weg ?? 'bank_transfer',
    opts.richtung ?? 'incoming',
    opts.notiz ?? null,
  ]);
  return rows[0]!.id;
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

async function rechnungszeile(id: string): Promise<Rechnungszeile> {
  const { rows } = await asUser<Rechnungszeile>(users.office, LISTE);
  const zeile = rows.find((r) => r.id === id);
  if (zeile === undefined) throw new Error('Rechnung steht nicht in der Liste');
  return zeile;
}

describe('Zahlung', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.payments');
    await asPostgres('delete from public.invoice_cancellations');
    await asPostgres('delete from public.invoice_items');
    await asPostgres('delete from public.invoices');
    await asPostgres('delete from public.invoice_number_series');
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.appointments');
    await asPostgres('update public.treatment_base_items set used_quantity = 0');
    await asPostgres("delete from public.audit_log where action like 'payment%'");
  });

  describe('Erfassen', () => {
    it('macht aus einer ausgestellten Rechnung eine teilweise bezahlte', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await buche(id, betrag - 1000);

      const zeile = await rechnungszeile(id);
      expect(zeile.paid_cents).toBe(betrag - 1000);
      expect(zeile.outstanding_cents).toBe(1000);
      expect(zeile.payment_state).toBe('partially_paid');
    });

    it('zaehlt zwei Teilzahlungen zusammen bis auf bezahlt (ADR-009 Punkt 12)', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await buche(id, 2000);
      await buche(id, betrag - 2000);

      const zeile = await rechnungszeile(id);
      expect(zeile.paid_cents).toBe(betrag);
      expect(zeile.outstanding_cents).toBe(0);
      expect(zeile.payment_state).toBe('paid');
    });

    it('laesst eine Ueberzahlung zu und nennt sie so', async () => {
      // ADR-009 nennt die Ueberzahlung in der Konsequenz zu Punkt 12
      // ausdruecklich: Sie kommt vor und ist kein Eingabefehler.
      const { id, betrag } = await ausgestellteRechnung();
      await buche(id, betrag + 500);

      const zeile = await rechnungszeile(id);
      expect(zeile.payment_state).toBe('overpaid');
      expect(zeile.outstanding_cents).toBe(-500);
    });

    it('schreibt den Zahlungsstand an keine Stelle der Rechnung', async () => {
      // Die tragende Zusage: Es gibt keine Spalte, die abweichen koennte.
      const { rows } = await asPostgres<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'invoices'`,
      );
      const spalten = rows.map((r) => r.column_name);
      expect(spalten).not.toContain('paid_cents');
      expect(spalten).not.toContain('payment_state');

      const { rows: zustand } = await asPostgres<{ consrc: string }>(
        `select pg_get_constraintdef(c.oid) as consrc
           from pg_constraint c
          where c.conrelid = 'public.invoices'::regclass
            and pg_get_constraintdef(c.oid) like '%status%'`,
      );
      // Zwei Zustaende, nicht sieben: partially_paid und paid entstehen aus
      // den Transaktionen und nicht als Wert in der Spalte (ANN-077).
      expect(zustand.map((r) => r.consrc).join(' ')).not.toContain('partially_paid');
    });

    it('weist eine Zahlung am Entwurf ab', async () => {
      await leistung(KATALOG.kg, 30);
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      await expect(buche(rows[0]!.id, 1000)).rejects.toThrow(
        /a payment belongs to an issued invoice/,
      );
    });

    it('weist eine Zahlung an einer stornierten Rechnung ab - auch am Schreibweg vorbei', async () => {
      // Eine stornierte Rechnung ist keine Forderung mehr. Ein Eingang darauf
      // waere Geld ohne Grund, und die Ansicht wuerde die stornierte Rechnung
      // anschliessend als bezahlt fuehren. Der Zustand "storniert" steht am
      // Stornodokument und nicht an invoices.status - deshalb reicht die
      // Pruefung auf 'issued' hier nicht.
      const { id, betrag } = await ausgestellteRechnung();
      await asUserCommitted(users.office, RECHNUNG_STORNIEREN, [
        id,
        'Falsche Leistung abgerechnet',
      ]);

      await expect(buche(id, betrag)).rejects.toThrow(/a cancelled invoice takes no payment/);

      // Dieselbe Zusage am Trigger, damit sie fuer jeden Weg in die Tabelle
      // gilt - dieselbe Bauart wie 'a payment belongs to an issued invoice'.
      await expect(
        asPostgres(
          `insert into public.payments (
             organization_id, invoice_id, direction, amount_cents, currency, paid_on, method
           ) values ($1, $2, 'incoming', $3, 'EUR', current_date, 'bank_transfer')`,
          [organizationId, id, betrag],
        ),
      ).rejects.toThrow(/a cancelled invoice takes no payment/);

      const { rows } = await asPostgres<{ bezahlt: number }>(
        'select app.invoice_paid_cents($1::uuid) as bezahlt',
        [id],
      );
      expect(rows[0]!.bezahlt).toBe(0);
    });

    it('weist Betrag null, negativen Betrag und unbekannten Weg ab', async () => {
      const { id } = await ausgestellteRechnung();

      await expect(buche(id, 0)).rejects.toThrow(/positive amount/);
      await expect(buche(id, -500)).rejects.toThrow(/positive amount/);
      await expect(buche(id, 100, { weg: 'cash' })).rejects.toThrow(/unknown payment method/);
    });

    it('weist ein Datum in der Zukunft ab', async () => {
      const { id } = await ausgestellteRechnung();
      const { rows } = await asPostgres<{ tag: string }>(
        `select to_char((now() at time zone 'Europe/Berlin')::date + 1, 'YYYY-MM-DD') as tag`,
      );

      await expect(buche(id, 1000, { tag: rows[0]!.tag })).rejects.toThrow(
        /cannot be dated in the future/,
      );
    });

    it('traegt den Zahlungsstand auch an der einzelnen Rechnung', async () => {
      // Die Rechnungsansicht rechnet nichts im Browser nach: Sie bekommt den
      // Stand von derselben Funktion, die auch die Listen speist.
      const { id, betrag } = await ausgestellteRechnung();
      await buche(id, 2000);

      const { rows } = await asUser<{
        rechnung: { paid_cents: number; outstanding_cents: number; payment_state: string };
      }>(users.office, 'select public.get_invoice($1::uuid) as rechnung', [id]);

      expect(rows[0]?.rechnung.paid_cents).toBe(2000);
      expect(rows[0]?.rechnung.outstanding_cents).toBe(betrag - 2000);
      expect(rows[0]?.rechnung.payment_state).toBe('partially_paid');
    });

    it('uebernimmt die Waehrung der Rechnung statt sie entgegenzunehmen', async () => {
      const { id } = await ausgestellteRechnung();
      const zahlung = await buche(id, 1000);

      const { rows } = await asPostgres<{ currency: string }>(
        'select currency from public.payments where id = $1',
        [zahlung],
      );
      expect(rows[0]?.currency).toBe('EUR');
    });
  });

  describe('Rueckzahlung', () => {
    it('senkt den bezahlten Betrag', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await buche(id, betrag);
      await buche(id, 1500, { richtung: 'refund' });

      const zeile = await rechnungszeile(id);
      expect(zeile.paid_cents).toBe(betrag - 1500);
      expect(zeile.payment_state).toBe('partially_paid');
    });

    it('darf die eingegangene Summe nicht uebersteigen', async () => {
      const { id } = await ausgestellteRechnung();
      await buche(id, 2000);

      await expect(buche(id, 2001, { richtung: 'refund' })).rejects.toThrow(
        /refund cannot exceed the payments received/,
      );
    });

    it('steht als eigene Richtung in der Tabelle, nicht als negativer Betrag', async () => {
      const { id } = await ausgestellteRechnung();
      await buche(id, 2000);
      const zahlung = await buche(id, 500, { richtung: 'refund' });

      const { rows } = await asPostgres<{ direction: string; amount_cents: number }>(
        'select direction, amount_cents from public.payments where id = $1',
        [zahlung],
      );
      expect(rows[0]?.direction).toBe('refund');
      expect(rows[0]?.amount_cents).toBe(500);
    });
  });

  describe('Storno', () => {
    it('nimmt die Zahlung aus der Summe und laesst die Zeile stehen', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      const zahlung = await buche(id, betrag);
      await asUserCommitted(users.office, STORNIEREN, [zahlung, 'Falscher Betrag erfasst']);

      const zeile = await rechnungszeile(id);
      expect(zeile.paid_cents).toBe(0);
      expect(zeile.payment_state).toBe('unpaid');

      const { rows } = await asUser<{ id: string; void_reason: string | null }>(
        users.office,
        'select * from public.list_invoice_payments($1::uuid)',
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.void_reason).toBe('Falscher Betrag erfasst');
    });

    it('geht nur einmal und nur mit Grund', async () => {
      const { id } = await ausgestellteRechnung();
      const zahlung = await buche(id, 1000);

      await expect(asUserCommitted(users.office, STORNIEREN, [zahlung, 'ab'])).rejects.toThrow(
        /a void needs a reason/,
      );

      await asUserCommitted(users.office, STORNIEREN, [zahlung, 'Doppelt erfasst']);
      await expect(
        asUserCommitted(users.office, STORNIEREN, [zahlung, 'Noch einmal']),
      ).rejects.toThrow(/already voided/);
    });

    it('laesst keine Rueckzahlung ohne Eingang zurueck', async () => {
      const { id } = await ausgestellteRechnung();
      const eingang = await buche(id, 2000);
      await buche(id, 2000, { richtung: 'refund' });

      await expect(
        asUserCommitted(users.office, STORNIEREN, [eingang, 'Eingang war falsch']),
      ).rejects.toThrow(/refunds without payments received/);
    });

    it('laeuft nicht an einer gleichzeitigen Buchung vorbei (R3-015)', async () => {
      // Zwei Vorgaenge an derselben Rechnung, wie zwei Personen an einem
      // Vormittag: eine storniert den Eingang, die andere bucht die
      // Rueckzahlung. record_payment sperrt die Rechnung, void_payment tat es
      // nicht - also pruefte jeder Vorgang eine Summe, die der andere gerade
      // aenderte, und am Ende stand mehr ausgezahlt als eingegangen.
      const { id, betrag } = await ausgestellteRechnung();
      const eingang = await buche(id, betrag);

      const storno = new Client({ connectionString: testDatabaseUrl() });
      const rueckzahlung = new Client({ connectionString: testDatabaseUrl() });
      await storno.connect();
      await rueckzahlung.connect();

      try {
        await alsOffice(storno);
        await alsOffice(rueckzahlung);

        // Die erste Verbindung storniert und laesst die Transaktion offen.
        await storno.query(STORNIEREN, [eingang, 'Eingang war falsch']);

        // Die zweite bucht gleichzeitig die volle Rueckzahlung. Mit der
        // Sperre wartet sie, bis der Storno steht - und sieht dann keinen
        // Eingang mehr, den sie zurueckzahlen koennte.
        const laeuft = rueckzahlung
          .query(BUCHEN, [id, betrag, await heute(), 'bank_transfer', 'refund', null])
          .then(() => null)
          .catch((fehler: unknown) => fehler as Error);

        await new Promise((fertig) => setTimeout(fertig, 200));
        await storno.query('commit');

        const fehler = await laeuft;
        await rueckzahlung.query(fehler === null ? 'commit' : 'rollback');

        expect(fehler?.message).toMatch(/a refund cannot exceed the payments received/);

        const { rows } = await asPostgres<{ bezahlt: number }>(
          'select app.invoice_paid_cents($1::uuid) as bezahlt',
          [id],
        );
        expect(rows[0]!.bezahlt).toBe(0);
      } finally {
        await storno.query('rollback').catch(() => undefined);
        await storno.end();
        await rueckzahlung.end();
      }
    });

    it('haelt die Zahlung sonst unveraenderlich - auch am Schreibweg vorbei', async () => {
      const { id } = await ausgestellteRechnung();
      const zahlung = await buche(id, 1000);

      // Der Trigger sitzt an der Tabelle, nicht in der Funktion: Auch
      // postgres kommt nicht an den Betrag.
      await expect(
        asPostgres('update public.payments set amount_cents = 9999 where id = $1', [zahlung]),
      ).rejects.toThrow(/can only be voided, not changed/);

      await expect(
        asPostgres("update public.payments set paid_on = date '2020-01-01' where id = $1", [
          zahlung,
        ]),
      ).rejects.toThrow(/can only be voided, not changed/);
    });
  });

  describe('Offene Posten', () => {
    it('fuehrt die ausgestellte Rechnung mit offenem Betrag und ihre Summe', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await buche(id, 1000);

      const { rows } = await asUser<Posten>(users.office, POSTEN);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.outstanding_cents).toBe(betrag - 1000);
      expect(rows[0]?.open_total_cents).toBe(betrag - 1000);
    });

    it('nimmt eine bezahlte Rechnung heraus', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await buche(id, betrag);

      const { rows } = await asUser(users.office, POSTEN);
      expect(rows).toHaveLength(0);
    });

    it('fuehrt einen Entwurf nie - an ihm kann niemand zahlen', async () => {
      await leistung(KATALOG.kg, 30);
      await asUserCommitted(users.office, ENTWURF, [patients.erika, await monat()]);

      const { rows } = await asUser(users.office, POSTEN);
      expect(rows).toHaveLength(0);
    });

    it('kennzeichnet eine Rechnung nach dem Faelligkeitstag als ueberfaellig', async () => {
      const { id } = await ausgestellteRechnung();
      // Das Zahlungsziel kommt aus den Stammdaten; hier wird es zurueckdatiert,
      // damit der Test nicht vierzehn Tage warten muss. Der Trigger laesst
      // eine ausgestellte Rechnung nicht aendern - also ueber ihn hinweg.
      await asPostgres('alter table public.invoices disable trigger invoices_frozen');
      await asPostgres(
        "update public.invoices set due_on = (now() at time zone 'Europe/Berlin')::date - 1 where id = $1",
        [id],
      );
      await asPostgres('alter table public.invoices enable trigger invoices_frozen');

      const { rows } = await asUser<Posten>(users.office, POSTEN);
      expect(rows[0]?.overdue).toBe(true);
      expect((await rechnungszeile(id)).overdue).toBe(true);
    });
  });

  describe('Berechtigung (ANN-076)', () => {
    it('weist die Therapeutin beim Lesen und beim Buchen ab', async () => {
      const { id } = await ausgestellteRechnung();

      await expect(asUser(users.therapist, POSTEN)).rejects.toThrow(/not allowed to read invoices/);
      await expect(asUser(users.therapist, ZAHLUNGEN)).rejects.toThrow(
        /not allowed to read invoices/,
      );
      await expect(
        asUserCommitted(users.therapist, BUCHEN, [
          id,
          100,
          await heute(),
          'bank_transfer',
          'incoming',
          null,
        ]),
      ).rejects.toThrow(/not allowed to manage invoices/);
    });

    it('gibt der angemeldeten Rolle kein Tabellenrecht auf Zahlungen (ADR-004)', async () => {
      const { rows } = await asPostgres<{ privilege_type: string }>(
        `select privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and table_name = 'payments'
            and grantee in ('authenticated', 'anon')`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('Auditspur (ADR-010)', () => {
    it('protokolliert Erfassen und Stornieren', async () => {
      const { id } = await ausgestellteRechnung();
      const zahlung = await buche(id, 1000);
      await asUserCommitted(users.office, STORNIEREN, [zahlung, 'Falsch erfasst']);

      const { rows } = await asPostgres<{ action: string; subject_type: string; context: unknown }>(
        `select action, subject_type, context from public.audit_log
          where subject_id = $1 order by occurred_at`,
        [zahlung],
      );
      expect(rows.map((r) => r.action)).toEqual(['payment.recorded', 'payment.voided']);
      expect(rows.every((r) => r.subject_type === 'payment')).toBe(true);
    });

    it('schreibt keinen Namen und keinen klinischen Inhalt in den Kontext (ADR-011)', async () => {
      const { id } = await ausgestellteRechnung();
      const zahlung = await buche(id, 1000, { notiz: 'Ueberweisung Sparkasse' });

      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        'select context from public.audit_log where subject_id = $1',
        [zahlung],
      );
      const text = JSON.stringify(rows[0]?.context);
      expect(text).not.toContain('Erika');
      expect(text).not.toContain('Beispiel');
      // Auch die Notiz bleibt draussen: Sie ist Freitext und koennte alles
      // enthalten, was jemand hineinschreibt.
      expect(text).not.toContain('Sparkasse');
    });
  });

  describe('Liste der Zahlungen', () => {
    it('fuehrt Eingang und Storno mit Rechnungsbezug', async () => {
      const { id } = await ausgestellteRechnung();
      const zahlung = await buche(id, 1000);
      await asUserCommitted(users.office, STORNIEREN, [zahlung, 'Falsch erfasst']);

      const { rows } = await asUser<{
        invoice_number: string;
        patient_name: string;
        voided_at: string | null;
      }>(users.office, ZAHLUNGEN);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.invoice_number).toMatch(/^RG-/);
      expect(rows[0]?.patient_name).toBe('Erika Beispiel');
      // Eine stornierte Buchung bleibt in der Liste - eine Liste, aus der
      // eine Buchung verschwindet, erklaert nichts mehr.
      expect(rows[0]?.voided_at).not.toBeNull();
    });
  });

  /**
   * Steht bewusst am Ende: Der Loeschlauf raeumt die Akte ab, auf der alle
   * anderen Tests ihre Termine anlegen. `beforeEach` stellt sie nicht wieder
   * her - das tut nur der Seed.
   */
  describe('Aufbewahrung (ADR-008)', () => {
    it('ordnet die Zahlung den Abrechnungsdaten zu', async () => {
      const { rows } = await asPostgres<{ class_key: string; deletion_mode: string }>(
        `select class_key, deletion_mode from public.retention_assignments
          where table_name = 'payments'`,
      );
      expect(rows[0]?.class_key).toBe('abrechnungsdaten');
      expect(rows[0]?.deletion_mode).toBe('ueber_elterndatensatz');
    });

    it('nimmt die Zahlung mit der Akte mit und schreibt sie ins Journal', async () => {
      const { id } = await ausgestellteRechnung();
      const zahlung = await buche(id, 1000);

      const { rows } = await asPostgres<{ anzahl: number }>(
        'select app.delete_patient_record($1::uuid, $2::uuid, now()) as anzahl',
        [patients.erika, '99999999-9999-4999-8999-000000000099'],
      );
      expect(Number(rows[0]!.anzahl)).toBeGreaterThan(0);

      const { rows: uebrig } = await asPostgres('select id from public.payments where id = $1', [
        zahlung,
      ]);
      expect(uebrig).toHaveLength(0);

      const { rows: journal } = await asPostgres<{ retention_class: string }>(
        `select retention_class from public.deletion_journal
          where target_table = 'payments' and target_id = $1`,
        [zahlung],
      );
      expect(journal[0]?.retention_class).toBe('abrechnungsdaten');
    });
  });
});
