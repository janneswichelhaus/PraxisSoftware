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
 * Storno und Korrektur sind eigene Dokumente (ABR-003c).
 *
 * ADR-009 Punkt 9: "Eine ausgestellte Rechnung ist unveraenderbar. Korrekturen
 * erfolgen durch nachvollziehbare Korrektur-/Stornodokumente und
 * gegebenenfalls eine neue Rechnung." Fuenf Zusagen stehen hier im
 * Mittelpunkt (**ANN-079**):
 *
 *   * **Die Rechnung selbst wird nicht angefasst.** "Storniert" ist ein
 *     abgeleiteter Zustand - eine Zeile in `invoice_cancellations` -, kein
 *     dritter Wert in `invoices.status` und keine Aenderung am Snapshot.
 *   * **Das Stornodokument traegt eine eigene Nummer** aus demselben
 *     lueckenlosen Nummernkreis (ADR-009 Punkt 8).
 *   * **Das Storno gibt die Leistungen frei, ohne eine Zeile zu loeschen.**
 *     Danach stehen sie wieder unter "Abzurechnen", und die alte
 *     Rechnungszeile bleibt lesbar.
 *   * **Zuerst das Geld, dann das Dokument:** Eine Rechnung mit stehender
 *     Zahlung laesst sich nicht stornieren.
 *   * **Die Kette ist in beide Richtungen lesbar:** Die Korrekturrechnung
 *     zeigt auf die Rechnung, die sie ersetzt.
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
const STORNIEREN = 'select public.cancel_invoice($1::uuid, $2::text) as nummer';
const KORREKTUR = 'select public.create_correction_draft($1::uuid) as id';
const BUCHEN =
  'select public.record_payment($1::uuid, $2::int, $3::date, $4::text, $5::text, $6::text) as id';
const LISTE = 'select * from public.list_invoices(100)';
const POSTEN = 'select * from public.list_open_items(100)';
const KANDIDATEN = 'select * from public.list_invoice_candidates(100)';
const ANSICHT = 'select public.get_invoice($1::uuid) as dokument';

interface Rechnungszeile {
  id: string;
  status: string;
  invoice_number: string | null;
  cancelled: boolean;
  overdue: boolean;
}

interface Kandidat {
  patient_id: string;
  period_month: string;
  service_count: number;
  has_draft: boolean;
  draft_id: string | null;
}

interface Ansicht {
  status: string;
  cancellation: { cancellation_number: string; reason: string; cancelled_on: string } | null;
  replaces_invoice_id: string | null;
  replaces_invoice_number: string | null;
  correction_invoice_id: string | null;
  overdue: boolean;
}

/**
 * Legt einen dokumentierten Termin an.
 *
 * `stundeImMonat` zaehlt vom **Monatsanfang** der Praxiszeitzone vorwaerts:
 * 30 ist der 2. des Monats, 06:00. So liegt jeder Termin in seinem eigenen
 * Zeitfenster - und immer in dem Monat, den der Entwurf verlangt (R3-005).
 * Relativ zu now() gerechnet fiel er am Monatsersten in den Vormonat, und
 * create_invoice_draft brach ab.
 */
async function termin(stundeImMonat: number): Promise<string> {
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
      stundeImMonat,
      GRUNDLAGE_FRISCH,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/** Erfasst eine Leistung an einem frischen Termin und liefert die Terminkennung. */
async function leistung(position: string, stundeImMonat: number): Promise<string> {
  const id = await termin(stundeImMonat);
  await asUserCommitted(
    users.ownerTherapist,
    'select public.record_billable_services($1::uuid, $2::jsonb)',
    [id, JSON.stringify([{ catalog_item_id: position, quantity: 1 }])],
  );
  return id;
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

/** Eine ausgestellte Rechnung ueber genau eine Leistung. */
async function ausgestellteRechnung(
  position: string = KATALOG.kg,
  stundeImMonat = 30,
): Promise<{ id: string; nummer: string; betrag: number }> {
  await leistung(position, stundeImMonat);
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
    patients.erika,
    await monat(),
  ]);
  const id = rows[0]!.id;
  const { rows: nummer } = await asUserCommitted<{ nummer: string }>(users.office, AUSSTELLEN, [
    id,
  ]);

  const { rows: betrag } = await asPostgres<{ total_cents: number }>(
    'select total_cents from public.invoices where id = $1',
    [id],
  );
  return { id, nummer: nummer[0]!.nummer, betrag: betrag[0]!.total_cents };
}

async function storniere(id: string, grund = 'Falscher Empfaenger'): Promise<string> {
  const { rows } = await asUserCommitted<{ nummer: string }>(users.office, STORNIEREN, [id, grund]);
  return rows[0]!.nummer;
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

async function ansicht(id: string): Promise<Ansicht> {
  const { rows } = await asUser<{ dokument: Ansicht }>(users.office, ANSICHT, [id]);
  return rows[0]!.dokument;
}

describe('Storno und Korrektur', () => {
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
    await asPostgres("delete from public.audit_log where action like 'invoice%'");
  });

  describe('Das Stornodokument', () => {
    it('laesst die Rechnung selbst unveraendert', async () => {
      // Die tragende Zusage: Die ausgestellte Rechnung ist unveraenderbar
      // (ADR-009 Punkt 9). Storniert wird sie durch ein zweites Dokument.
      const { id, nummer } = await ausgestellteRechnung();
      const { rows: vorher } = await asPostgres<{ status: string; snapshot: unknown }>(
        'select status, snapshot from public.invoices where id = $1',
        [id],
      );

      await storniere(id);

      const { rows: nachher } = await asPostgres<{ status: string; snapshot: unknown }>(
        'select status, snapshot from public.invoices where id = $1',
        [id],
      );
      expect(nachher[0]!.status).toBe('issued');
      expect(nachher[0]!.snapshot).toStrictEqual(vorher[0]!.snapshot);
      expect(nachher[0]!.status).toBe(vorher[0]!.status);

      const { rows: storno } = await asPostgres<{ invoice_number: string; reason: string }>(
        `select c.cancellation_number as invoice_number, c.reason
           from public.invoice_cancellations c where c.invoice_id = $1`,
        [id],
      );
      expect(storno[0]!.reason).toBe('Falscher Empfaenger');
      expect(storno[0]!.invoice_number).not.toBe(nummer);
    });

    it('nimmt die naechste Nummer aus demselben lueckenlosen Kreis', async () => {
      const erste = await ausgestellteRechnung(KATALOG.kg, 30);
      const stornonummer = await storniere(erste.id);

      await leistung(KATALOG.mt, 20);
      const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      const { rows: zweite } = await asUserCommitted<{ nummer: string }>(users.office, AUSSTELLEN, [
        entwurf[0]!.id,
      ]);

      // Drei Dokumente, drei aufeinanderfolgende Nummern: keine Luecke, keine
      // zweite Zaehlung daneben (ADR-009 Punkt 8, ANN-079).
      const laufend = (wert: string) => Number(wert.slice(-4));
      expect(laufend(stornonummer)).toBe(laufend(erste.nummer) + 1);
      expect(laufend(zweite[0]!.nummer)).toBe(laufend(stornonummer) + 1);
    });

    it('verlangt einen Grund', async () => {
      const { id } = await ausgestellteRechnung();
      await expect(storniere(id, '  ')).rejects.toThrow(/a cancellation needs a reason/);
    });

    it('weist einen Entwurf ab — der wird verworfen, nicht storniert', async () => {
      await leistung(KATALOG.kg, 30);
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      await expect(storniere(rows[0]!.id)).rejects.toThrow(
        /only an issued invoice can be cancelled/,
      );
    });

    it('storniert keine Rechnung zweimal', async () => {
      const { id } = await ausgestellteRechnung();
      await storniere(id);

      await expect(storniere(id, 'Nochmal')).rejects.toThrow(/invoice is already cancelled/);
    });

    it('laesst sich selbst nicht mehr aendern', async () => {
      // Gebucht ist gebucht - dieselbe Bauart wie bei Rechnung und Zahlung.
      // Die Sperre sitzt am Trigger und gilt auch fuer postgres.
      const { id } = await ausgestellteRechnung();
      await storniere(id);

      await expect(
        asPostgres(
          "update public.invoice_cancellations set reason = 'anders' where invoice_id = $1",
          [id],
        ),
      ).rejects.toThrow(/a cancellation document cannot be changed/);
    });

    it('bleibt der Therapeutin verwehrt (ANN-076)', async () => {
      const { id } = await ausgestellteRechnung();

      await expect(asUserCommitted(users.therapist, STORNIEREN, [id, 'Versuch'])).rejects.toThrow(
        /not allowed to manage invoices/,
      );
    });
  });

  describe('Zahlungen zuerst', () => {
    it('weist das Storno ab, solange eine Zahlung steht', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      await asUserCommitted(users.office, BUCHEN, [
        id,
        betrag,
        await heute(),
        'bank_transfer',
        'incoming',
        null,
      ]);

      await expect(storniere(id)).rejects.toThrow(/void the payments of this invoice first/);
    });

    it('laesst es zu, sobald die Zahlung storniert ist', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      const { rows } = await asUserCommitted<{ id: string }>(users.office, BUCHEN, [
        id,
        betrag,
        await heute(),
        'bank_transfer',
        'incoming',
        null,
      ]);
      await asUserCommitted(users.office, 'select public.void_payment($1::uuid, $2::text)', [
        rows[0]!.id,
        'Zahlung war einer anderen Rechnung zugeordnet',
      ]);

      await expect(storniere(id)).resolves.toMatch(/-\d{4}$/);
    });
  });

  describe('Die Leistungen werden wieder frei', () => {
    it('stellt sie zurueck unter „Abzurechnen", ohne die Rechnungszeile zu loeschen', async () => {
      const { id } = await ausgestellteRechnung();

      const { rows: vorher } = await asUser<Kandidat>(users.office, KANDIDATEN);
      expect(vorher).toHaveLength(0);

      await storniere(id);

      const { rows: nachher } = await asUser<Kandidat>(users.office, KANDIDATEN);
      expect(nachher).toHaveLength(1);
      expect(nachher[0]!.service_count).toBe(1);

      // Die Zeile bleibt - sie sagt weiter, auf welcher Rechnung die Leistung
      // einmal stand. Nur die Sperre gegen Doppelabrechnung ist geloest.
      const { rows: zeilen } = await asPostgres<{ anzahl: string; frei: string }>(
        `select count(*) as anzahl, count(released_at) as frei
           from public.invoice_items where invoice_id = $1`,
        [id],
      );
      expect(Number(zeilen[0]!.anzahl)).toBe(1);
      expect(Number(zeilen[0]!.frei)).toBe(1);

      const { rows: dienst } = await asPostgres<{ status: string }>(
        'select status from public.billable_services',
      );
      expect(dienst[0]!.status).toBe('billable');
    });

    it('haelt die Zeilen sonst eingefroren — auch fuer postgres', async () => {
      // Die Ausnahme im Trigger gilt genau einer Spalte und nur in eine
      // Richtung. Alles andere bleibt verboten (ADR-009 Punkt 9).
      const { id } = await ausgestellteRechnung();

      await expect(
        asPostgres('update public.invoice_items set sort_order = 9 where invoice_id = $1', [id]),
      ).rejects.toThrow(/the items of an issued invoice cannot be changed/);

      await storniere(id);

      await expect(
        asPostgres('update public.invoice_items set released_at = null where invoice_id = $1', [
          id,
        ]),
      ).rejects.toThrow(/the items of an issued invoice cannot be changed/);
    });

    it('laesst die Leistung danach wieder vom Termin entfernen', async () => {
      // Der eigentliche Zweck der Freigabe: Wurde die falsche Leistung
      // erfasst, kommt die Korrektur erst durch das Storno in Reichweite.
      const terminId = await leistung(KATALOG.kg, 30);
      const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [entwurf[0]!.id]);

      await expect(
        asUserCommitted(users.ownerTherapist, 'select public.delete_billable_services($1::uuid)', [
          terminId,
        ]),
      ).rejects.toThrow(/already invoiced/);

      await storniere(entwurf[0]!.id);

      const { rows } = await asUserCommitted<{ delete_billable_services: number }>(
        users.ownerTherapist,
        'select public.delete_billable_services($1::uuid)',
        [terminId],
      );
      expect(Number(rows[0]!.delete_billable_services)).toBe(1);
    });
  });

  describe('Die stornierte Rechnung in den Listen', () => {
    it('steht in keinem offenen Posten und wird nicht ueberfaellig', async () => {
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

      const { rows: vorher } = await asUser<{ id: string }>(users.office, POSTEN);
      expect(vorher.map((p) => p.id)).toContain(id);

      await storniere(id);

      const { rows: nachher } = await asUser<{ id: string }>(users.office, POSTEN);
      expect(nachher.map((p) => p.id)).not.toContain(id);

      const zeile = await rechnungszeile(id);
      expect(zeile.cancelled).toBe(true);
      expect(zeile.overdue).toBe(false);
      expect(await ansicht(id).then((a) => a.overdue)).toBe(false);
    });

    it('liefert Nummer, Grund und Tag des Stornos an der Rechnung', async () => {
      const { id } = await ausgestellteRechnung();
      const nummer = await storniere(id, 'Leistung doppelt erfasst');

      const gelesen = await ansicht(id);
      expect(gelesen.cancellation?.cancellation_number).toBe(nummer);
      expect(gelesen.cancellation?.reason).toBe('Leistung doppelt erfasst');
      expect(gelesen.cancellation?.cancelled_on).toBe(await heute());
    });

    it('protokolliert das Storno ohne den Grund (ADR-011)', async () => {
      // Ein freier Text kann Patientenbezug tragen; Logs fuehren keinen.
      const { id } = await ausgestellteRechnung();
      await storniere(id, 'Anschrift der Beihilfestelle falsch');

      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log
          where action = 'invoice.cancelled' and subject_id = $1`,
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.context.cancellation_number).toMatch(/-\d{4}$/);
      expect(JSON.stringify(rows[0]!.context)).not.toContain('Beihilfestelle');
    });
  });

  describe('Die Korrekturrechnung', () => {
    it('nennt auch bei zwei gleichzeitigen Aufrufen den Grund (R3-009)', async () => {
      // Ohne Sperre liefen beide Aufrufe an der Entwurfspruefung vorbei und
      // endeten erst im Teilindex invoices_draft_period_key - mit einer
      // technischen Meldung statt mit dem Satz, der sagt, was los ist.
      const { id } = await ausgestellteRechnung();
      await storniere(id);

      const erste = new Client({ connectionString: testDatabaseUrl() });
      const zweite = new Client({ connectionString: testDatabaseUrl() });
      await erste.connect();
      await zweite.connect();

      try {
        await alsOffice(erste);
        await alsOffice(zweite);

        await erste.query(KORREKTUR, [id]);

        const laeuft = zweite
          .query(KORREKTUR, [id])
          .then(() => null)
          .catch((fehler: unknown) => fehler as Error);

        await new Promise((fertig) => setTimeout(fertig, 200));
        await erste.query('commit');

        const fehler = await laeuft;
        await zweite.query(fehler === null ? 'commit' : 'rollback');

        expect(fehler?.message).toMatch(/a draft for this patient and month already exists/);
      } finally {
        await erste.query('rollback').catch(() => undefined);
        await erste.end();
        await zweite.end();
      }
    });

    it('entsteht aus der stornierten Rechnung und zeigt auf sie', async () => {
      const { id } = await ausgestellteRechnung();
      await storniere(id);

      const { rows } = await asUserCommitted<{ id: string }>(users.office, KORREKTUR, [id]);
      const neu = rows[0]!.id;

      const gelesen = await ansicht(neu);
      expect(gelesen.status).toBe('draft');
      expect(gelesen.replaces_invoice_id).toBe(id);
      expect(gelesen.replaces_invoice_number).not.toBeNull();

      // Und in die andere Richtung: Die alte Rechnung kennt ihre Korrektur.
      expect(await ansicht(id).then((a) => a.correction_invoice_id)).toBe(neu);

      const { rows: zeilen } = await asPostgres<{ count: string }>(
        'select count(*) from public.invoice_items where invoice_id = $1',
        [neu],
      );
      expect(Number(zeilen[0]!.count)).toBe(1);
    });

    it('nimmt auch die nachgereichte Leistung des Monats auf (ANN-077)', async () => {
      const { id } = await ausgestellteRechnung(KATALOG.kg, 30);
      await storniere(id);
      await leistung(KATALOG.mt, 20);

      const { rows } = await asUserCommitted<{ id: string }>(users.office, KORREKTUR, [id]);

      const { rows: zeilen } = await asPostgres<{ count: string }>(
        'select count(*) from public.invoice_items where invoice_id = $1',
        [rows[0]!.id],
      );
      expect(Number(zeilen[0]!.count)).toBe(2);
    });

    it('gibt es nur zu einer stornierten Rechnung', async () => {
      const { id } = await ausgestellteRechnung();

      await expect(asUserCommitted(users.office, KORREKTUR, [id])).rejects.toThrow(
        /only a cancelled invoice can be corrected/,
      );
    });

    it('legt keinen zweiten Entwurf fuer denselben Monat an', async () => {
      const { id } = await ausgestellteRechnung();
      await storniere(id);
      await asUserCommitted(users.office, KORREKTUR, [id]);

      await expect(asUserCommitted(users.office, KORREKTUR, [id])).rejects.toThrow(
        /a draft for this patient and month already exists/,
      );
    });

    it('bleibt der Therapeutin verwehrt (ANN-076)', async () => {
      const { id } = await ausgestellteRechnung();
      await storniere(id);

      await expect(asUserCommitted(users.therapist, KORREKTUR, [id])).rejects.toThrow(
        /not allowed to manage invoices/,
      );
    });
  });

  describe('Der Weg zum vorhandenen Entwurf (BEF-018)', () => {
    it('fuehrt von der Arbeitsliste zum Entwurf desselben Monats', async () => {
      await leistung(KATALOG.kg, 30);
      const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      // Eine nachgereichte Leistung: Die Zeile steht wieder in der
      // Arbeitsliste, und der Entwurf dazu existiert bereits.
      await leistung(KATALOG.mt, 20);

      const { rows } = await asUser<Kandidat>(users.office, KANDIDATEN);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.has_draft).toBe(true);
      expect(rows[0]!.draft_id).toBe(entwurf[0]!.id);
    });

    it('laesst die Kennung weg, wo es keinen Entwurf gibt', async () => {
      await leistung(KATALOG.kg, 30);

      const { rows } = await asUser<Kandidat>(users.office, KANDIDATEN);
      expect(rows[0]!.has_draft).toBe(false);
      expect(rows[0]!.draft_id).toBeNull();
    });
  });
});
