import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';
import { gleichzeitig } from './helpers/gleichzeitig';

// Export für die Steuerberatung im DATEV-Format (ANN-828 bis ANN-830): Einstellungen nur owner,
// Buchungen ohne Namen, jedes Dokument genau einmal, Späteres als Nachtrag, Löschung mit dem
// Dokument.

const { users, organizationId, patients, trainingRelationships } = SEED;

const SPEICHERN = 'select public.save_datev_settings($1::int, $2::int, $3::int, $4::text)';
const OFFEN =
  'select b.*, b.document_date::text as document_date from public.list_datev_pending($1::text, $2::date) b';
const ERSTELLEN = 'select public.create_datev_export($1::text, $2::date) as id';
const LAEUFE = 'select * from public.list_datev_exports($1::text, $2::date)';
const LAUF = 'select public.get_datev_export($1::uuid) as lauf';
const OFFENE_MONATE =
  'select period_month::text as monat, document_count from public.list_datev_open_months($1::text)';

const SEPTEMBER = '2026-09-01';

interface Buchung {
  kind: string;
  document_date: string;
  invoice_number: string;
  document_number: string | null;
  tax_treatment: string | null;
  tax_rate_permille: number | null;
  small_business: boolean;
  amount_cents: number | string;
  direction: string | null;
  method: string | null;
  currency: string;
}

interface Gruppe {
  tax_treatment: string;
  tax_rate_permille: number;
  gross_cents: number;
}

/** Eine ausgestellte Rechnung direkt in der Tabelle: Tag und Steuergruppen frei wählbar. */
async function rechnung(
  nummer: string,
  ausgestellt: string,
  gruppen: Gruppe[],
  bereich: 'therapy' | 'training' = 'therapy',
  patientId: string = patients.erika,
): Promise<string> {
  const summe = gruppen.reduce((s, g) => s + g.gross_cents, 0);
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.invoices (
       organization_id, patient_id, training_relationship_id, service_area, status,
       period_month, invoice_number, issued_on, issued_at, issued_by, due_on,
       total_cents, tax_total_cents, currency, snapshot, created_by
     ) values (
       $1, $2, $3, $4, 'issued', date_trunc('month', $6::date)::date, $5, $6::date, now(), $7,
       $6::date + 14, $8, 0, 'EUR',
       jsonb_build_object('schema_version', 6, 'service_area', $4::text,
         'issuer', jsonb_build_object('small_business', false),
         'patient', jsonb_build_object('name', 'Erika Beispiel'),
         'tax_groups', $9::jsonb),
       $7
     ) returning id`,
    [
      organizationId,
      bereich === 'therapy' ? patientId : null,
      bereich === 'training' ? trainingRelationships.tina : null,
      bereich,
      nummer,
      ausgestellt,
      users.office,
      summe,
      JSON.stringify(gruppen.map((g) => ({ ...g, tax_cents: 0, net_cents: g.gross_cents }))),
    ],
  );
  return rows[0]!.id;
}

async function zahlung(
  rechnungId: string,
  betrag: number,
  tag: string,
  weg = 'bank_transfer',
  richtung = 'incoming',
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.payments (
       organization_id, invoice_id, direction, amount_cents, currency, paid_on, method, created_by
     ) values ($1, $2, $3, $4, 'EUR', $5::date, $6, $7) returning id`,
    [organizationId, rechnungId, richtung, betrag, tag, weg, users.office],
  );
  return rows[0]!.id;
}

async function storno(rechnungId: string, nummer: string, tag: string): Promise<void> {
  await asPostgres(
    `insert into public.invoice_cancellations
       (organization_id, invoice_id, cancellation_number, reason, cancelled_on, created_by)
     values ($1, $2, $3, 'Testgrund', $4::date, $5)`,
    [organizationId, rechnungId, nummer, tag, users.office],
  );
}

async function zahlungStornieren(zahlungId: string): Promise<void> {
  await asPostgres(
    `update public.payments set voided_at = now(), voided_by = $2, void_reason = 'Fehlbuchung'
      where id = $1`,
    [zahlungId, users.office],
  );
}

async function offen(konto: string, bereich: string, monat: string): Promise<Buchung[]> {
  return (await asUser<Buchung>(konto, OFFEN, [bereich, monat])).rows;
}

async function exportieren(konto: string, bereich: string, monat: string): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, ERSTELLEN, [bereich, monat]);
  return rows[0]!.id;
}

const BEFREIT: Gruppe = {
  tax_treatment: 'exempt_healthcare',
  tax_rate_permille: 0,
  gross_cents: 14000,
};

describe('DATEV-Export', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Einstellungen', () => {
    it('speichert der owner, office liest, niemand sonst', async () => {
      await asUserCommitted(users.ownerTherapist, SPEICHERN, [29098, 55003, null, 'SKR04']);
      const office = await asUser<{ consultant_number: number; chart_of_accounts: string }>(
        users.office,
        'select consultant_number, chart_of_accounts from public.datev_settings',
      );
      expect(office.rows).toEqual([{ consultant_number: 29098, chart_of_accounts: 'SKR04' }]);

      for (const konto of [
        users.therapist,
        users.teamLead,
        users.trainer,
        users.patientMax,
        users.plattformErika,
      ]) {
        const { rows } = await asUser(konto, 'select * from public.datev_settings');
        expect(rows).toEqual([]);
      }
    });

    it('weist office, Therapeut:in und ein Plattformkonto beim Speichern ab', async () => {
      for (const konto of [users.office, users.therapist, users.plattformErika]) {
        await expect(asUser(konto, SPEICHERN, [1001, 1, 2, 'SKR03'])).rejects.toThrow(
          /not allowed to manage the datev settings/,
        );
      }
    });

    it('verlangt Beraternummer, eine Mandantennummer und einen bekannten Kontenrahmen', async () => {
      const owner = users.ownerTherapist;
      await expect(asUser(owner, SPEICHERN, [999, 1, null, 'SKR03'])).rejects.toThrow(
        /consultant number/,
      );
      await expect(asUser(owner, SPEICHERN, [1001, null, null, 'SKR03'])).rejects.toThrow(
        /at least one client number/,
      );
      await expect(asUser(owner, SPEICHERN, [1001, 100000, null, 'SKR03'])).rejects.toThrow(
        /client number has one to five digits/,
      );
      await expect(asUser(owner, SPEICHERN, [1001, 1, null, 'SKR49'])).rejects.toThrow(
        /unknown chart of accounts/,
      );
    });

    it('zeigt einer anderen Praxis nichts', async () => {
      const fremd = await fremdeOrganisation();
      const { rows } = await asUser(fremd.owner, 'select * from public.datev_settings');
      expect(rows).toEqual([]);
    });
  });

  describe('Buchungen', () => {
    it('liefert Rechnung je Steuergruppe, Zahlung und Erstattung ohne Namen', async () => {
      const r1 = await rechnung('RG-2026-0101', '2026-09-03', [
        BEFREIT,
        { tax_treatment: 'taxable', tax_rate_permille: 190, gross_cents: 2380 },
      ]);
      await zahlung(r1, 16380, '2026-09-20');
      await zahlung(r1, 380, '2026-09-25', 'other', 'refund');

      const zeilen = await offen(users.office, 'therapy', SEPTEMBER);

      expect(zeilen.map((z) => [z.kind, z.document_date, z.amount_cents.toString()])).toEqual([
        ['invoice', '2026-09-03', '14000'],
        ['invoice', '2026-09-03', '2380'],
        ['payment', '2026-09-20', '16380'],
        ['payment', '2026-09-25', '380'],
      ]);
      expect(zeilen[1]).toMatchObject({ tax_treatment: 'taxable', tax_rate_permille: 190 });
      expect(zeilen[3]).toMatchObject({ direction: 'refund', method: 'other' });
      expect(JSON.stringify(zeilen)).not.toMatch(/Erika|Beispiel/);
    });

    it('führt eine Kartenzahlung mit ihrem Weg (ANN-836)', async () => {
      const r = await rechnung('RG-2026-0106', '2026-09-06', [BEFREIT]);
      await zahlung(r, 14000, '2026-09-07', 'card');

      const zeilen = await offen(users.office, 'therapy', SEPTEMBER);
      expect(zeilen.find((z) => z.kind === 'payment')).toMatchObject({
        method: 'card',
        direction: 'incoming',
      });
    });

    it('trennt die Bereiche und lässt andere Monate weg', async () => {
      await rechnung('RG-2026-0102', '2026-09-04', [BEFREIT]);
      await rechnung('RG-2026-0103', '2026-08-31', [BEFREIT]);
      await rechnung(
        'TR-2026-0001',
        '2026-09-05',
        [{ tax_treatment: 'taxable', tax_rate_permille: 190, gross_cents: 9000 }],
        'training',
      );

      const behandlung = await offen(users.office, 'therapy', SEPTEMBER);
      const training = await offen(users.office, 'training', SEPTEMBER);
      expect(behandlung.map((z) => z.invoice_number)).toEqual(['RG-2026-0102']);
      expect(training.map((z) => z.invoice_number)).toEqual(['TR-2026-0001']);
    });

    it('führt das Storno im Monat des Stornos mit der Nummer des Dokuments', async () => {
      const r = await rechnung('RG-2026-0104', '2026-08-10', [BEFREIT]);
      await storno(r, 'RG-2026-0105', '2026-09-02');

      const zeilen = await offen(users.office, 'therapy', SEPTEMBER);
      expect(zeilen).toEqual([
        expect.objectContaining({
          kind: 'cancellation',
          document_date: '2026-09-02',
          invoice_number: 'RG-2026-0104',
          document_number: 'RG-2026-0105',
        }),
      ]);
    });

    it('lässt eine vor dem Export stornierte Zahlung ganz weg', async () => {
      const r = await rechnung('RG-2026-0106', '2026-09-03', [BEFREIT]);
      const z = await zahlung(r, 14000, '2026-09-10');
      await zahlungStornieren(z);

      const zeilen = await offen(users.office, 'therapy', SEPTEMBER);
      expect(zeilen.map((x) => x.kind)).toEqual(['invoice']);
      // Auch im Monat des Stornos erscheint nichts: Die Zahlung ging nie hinaus.
      const { rows } = await asUser<{ monat: string }>(users.office, OFFENE_MONATE, ['therapy']);
      expect(rows.map((r) => r.monat)).toEqual([SEPTEMBER]);
    });
  });

  describe('Exportläufe', () => {
    it('nimmt jedes Dokument genau einmal, Späteres als Nachtrag', async () => {
      const r = await rechnung('RG-2026-0107', '2026-09-03', [BEFREIT]);
      const erster = await exportieren(users.office, 'therapy', SEPTEMBER);
      expect(await offen(users.office, 'therapy', SEPTEMBER)).toEqual([]);

      await expect(asUser(users.office, ERSTELLEN, ['therapy', SEPTEMBER])).rejects.toThrow(
        /nothing new to export/,
      );

      // Eine Zahlung wird später erfasst, aber auf September datiert.
      await zahlung(r, 14000, '2026-09-28');
      expect((await offen(users.office, 'therapy', SEPTEMBER)).map((z) => z.kind)).toEqual([
        'payment',
      ]);
      const zweiter = await exportieren(users.office, 'therapy', SEPTEMBER);

      const laeufe = await asUser<{ id: string; sequence: number; document_count: number }>(
        users.office,
        LAEUFE,
        ['therapy', SEPTEMBER],
      );
      expect(laeufe.rows.map((l) => [l.id, l.sequence, l.document_count])).toEqual([
        [zweiter, 2, 1],
        [erster, 1, 1],
      ]);
    });

    it('bucht das Storno einer exportierten Zahlung im Monat des Stornos', async () => {
      const r = await rechnung('RG-2026-0108', '2026-09-03', [BEFREIT]);
      const z = await zahlung(r, 14000, '2026-09-10');
      await exportieren(users.office, 'therapy', SEPTEMBER);
      await zahlungStornieren(z);

      const { rows } = await asPostgres<{ monat: string }>(
        `select to_char(date_trunc('month', now() at time zone 'Europe/Berlin'), 'YYYY-MM-DD') as monat`,
      );
      const zeilen = await offen(users.office, 'therapy', rows[0]!.monat);
      expect(zeilen).toEqual([
        expect.objectContaining({ kind: 'payment_void', invoice_number: 'RG-2026-0108' }),
      ]);
      expect(await offen(users.office, 'therapy', SEPTEMBER)).toEqual([]);
    });

    it('liefert die Datei mit den Angaben des Tages, auch nach einer Änderung', async () => {
      await rechnung('RG-2026-0109', '2026-09-03', [BEFREIT]);
      const id = await exportieren(users.ownerTherapist, 'therapy', SEPTEMBER);
      await asUserCommitted(users.ownerTherapist, SPEICHERN, [29098, 55003, 7, 'SKR04']);

      const { rows } = await asUser<{ lauf: Record<string, unknown> }>(users.office, LAUF, [id]);
      const lauf = rows[0]!.lauf;
      expect(lauf).toMatchObject({
        service_area: 'therapy',
        period_month: SEPTEMBER,
        sequence: 1,
        consultant_number: 1001,
        client_number: 1,
        chart_of_accounts: 'SKR03',
      });
      expect(lauf.created_stamp).toMatch(/^\d{17}$/);
      expect(lauf.bookings).toEqual([
        expect.objectContaining({ kind: 'invoice', invoice_number: 'RG-2026-0109' }),
      ]);
    });

    it('nennt die Rechnungen und stornierten Rechnungen eines Laufs für den Belegdruck', async () => {
      const a = await rechnung('RG-2026-0110', '2026-09-03', [BEFREIT]);
      const b = await rechnung('RG-2026-0111', '2026-09-04', [BEFREIT]);
      await storno(b, 'RG-2026-0112', '2026-09-05');
      await exportieren(users.office, 'therapy', SEPTEMBER);

      const { rows } = await asUser<{ invoice_ids: string[]; cancelled_invoice_ids: string[] }>(
        users.office,
        LAEUFE,
        ['therapy', SEPTEMBER],
      );
      expect(rows[0]).toMatchObject({ invoice_ids: [a, b], cancelled_invoice_ids: [b] });
    });

    it('nennt die Monate, in denen noch etwas offen ist, auch rückdatiert', async () => {
      const r = await rechnung('RG-2026-0118', '2026-09-03', [BEFREIT]);
      await rechnung('RG-2026-0119', '2026-10-02', [BEFREIT]);
      await exportieren(users.office, 'therapy', SEPTEMBER);
      await zahlung(r, 14000, '2026-09-29');

      const { rows } = await asUser<{ monat: string; document_count: number }>(
        users.office,
        OFFENE_MONATE,
        ['therapy'],
      );
      expect(rows).toEqual([
        { monat: SEPTEMBER, document_count: 1 },
        { monat: '2026-10-01', document_count: 1 },
      ]);
      expect((await asUser(users.office, OFFENE_MONATE, ['training'])).rows).toEqual([]);
    });

    it('lässt zwei gleichzeitige Exporte nacheinander laufen, jedes Dokument einmal', async () => {
      await rechnung('RG-2026-0120', '2026-09-03', [BEFREIT]);
      const fehler = await gleichzeitig(
        { konto: users.office, sql: ERSTELLEN, params: ['therapy', SEPTEMBER] },
        { konto: users.ownerTherapist, sql: ERSTELLEN, params: ['therapy', SEPTEMBER] },
      );
      expect(fehler?.message).toMatch(/nothing new to export/);
      const { rows } = await asPostgres<{ laeufe: string; dokumente: string }>(
        `select (select count(*) from public.datev_exports) as laeufe,
                (select count(*) from public.datev_export_documents) as dokumente`,
      );
      expect(rows[0]).toEqual({ laeufe: '1', dokumente: '1' });
    });

    it('verlangt Einstellungen und die Mandantennummer des Bereichs', async () => {
      await rechnung(
        'TR-2026-0002',
        '2026-09-05',
        [{ tax_treatment: 'taxable', tax_rate_permille: 190, gross_cents: 9000 }],
        'training',
      );
      await asUserCommitted(users.ownerTherapist, SPEICHERN, [1001, 1, null, 'SKR03']);
      await expect(asUser(users.office, ERSTELLEN, ['training', SEPTEMBER])).rejects.toThrow(
        /datev client number missing/,
      );

      await asPostgres('delete from public.datev_settings');
      await expect(asUser(users.office, ERSTELLEN, ['training', SEPTEMBER])).rejects.toThrow(
        /datev settings missing/,
      );
    });

    it('weist einen Monat in der Zukunft und einen Monat ohne Monatsanfang ab', async () => {
      await expect(asUser(users.office, ERSTELLEN, ['therapy', '2099-01-01'])).rejects.toThrow(
        /future/,
      );
      await expect(asUser(users.office, ERSTELLEN, ['therapy', '2026-09-15'])).rejects.toThrow(
        /calendar month/,
      );
    });
  });

  describe('Rechte', () => {
    it('lässt nur owner und office exportieren', async () => {
      await rechnung('RG-2026-0113', '2026-09-03', [BEFREIT]);
      for (const konto of [users.therapist, users.teamLead, users.plattformErika]) {
        await expect(asUser(konto, ERSTELLEN, ['therapy', SEPTEMBER])).rejects.toThrow(
          /not allowed to export bookings/,
        );
      }
    });

    it('weist Lesen ohne Recht mit einem Protokolleintrag ab', async () => {
      await rechnung('RG-2026-0114', '2026-09-03', [BEFREIT]);
      await erwarteAbgewiesenenLeseversuch(
        users.therapist,
        OFFEN,
        ['therapy', SEPTEMBER],
        'invoicing.read',
      );
      await erwarteAbgewiesenenLeseversuch(
        users.patientMax,
        LAEUFE,
        ['therapy', SEPTEMBER],
        'invoicing.read',
      );
    });

    it('zeigt einer anderen Praxis weder Läufe noch Buchungen', async () => {
      await rechnung('RG-2026-0115', '2026-09-03', [BEFREIT]);
      const id = await exportieren(users.office, 'therapy', SEPTEMBER);
      const fremd = await fremdeOrganisation();

      expect((await asUser(fremd.owner, OFFEN, ['therapy', SEPTEMBER])).rows).toEqual([]);
      expect((await asUser(fremd.owner, LAEUFE, ['therapy', SEPTEMBER])).rows).toEqual([]);
      expect((await asUser(fremd.owner, OFFENE_MONATE, ['therapy'])).rows).toEqual([]);
      await expect(asUser(fremd.owner, LAUF, [id])).rejects.toThrow(/export not found/);
    });

    it('lässt eine andere Praxis nur ihre eigenen Angaben und Dokumente anfassen', async () => {
      await rechnung('RG-2026-0121', '2026-09-03', [BEFREIT]);
      const fremd = await fremdeOrganisation();
      await asUserCommitted(fremd.owner, SPEICHERN, [4711, 9, null, 'SKR04']);

      const { rows } = await asPostgres<{ organization_id: string; consultant_number: number }>(
        'select organization_id, consultant_number from public.datev_settings order by 2',
      );
      expect(rows).toEqual([
        { organization_id: organizationId, consultant_number: 1001 },
        { organization_id: fremd.organizationId, consultant_number: 4711 },
      ]);
      await expect(asUser(fremd.owner, ERSTELLEN, ['therapy', SEPTEMBER])).rejects.toThrow(
        /nothing new to export/,
      );
      expect((await offen(users.office, 'therapy', SEPTEMBER)).map((z) => z.kind)).toEqual([
        'invoice',
      ]);
    });

    it('gibt keiner Anwendungsrolle Tabellenrechte an Läufen und Dokumenten', async () => {
      for (const tabelle of ['datev_exports', 'datev_export_documents']) {
        await expect(
          asUser(users.ownerTherapist, `select * from public.${tabelle}`),
        ).rejects.toThrow(/permission denied/);
      }
    });
  });

  describe('Löschung', () => {
    it('lässt den Eintrag mit seinem Dokument fallen, der Lauf bleibt ohne Personenbezug', async () => {
      const r = await rechnung('RG-2026-0116', '2026-09-03', [BEFREIT]);
      const z = await zahlung(r, 14000, '2026-09-10');
      await storno(r, 'RG-2026-0117', '2026-09-12');
      const id = await exportieren(users.office, 'therapy', SEPTEMBER);

      // Der Weg des Löschlaufs: erst Zahlung und Storno, dann die Rechnung (FK restrict).
      await asPostgres('delete from public.payments where id = $1', [z]);
      await asPostgres('delete from public.invoice_cancellations where invoice_id = $1', [r]);
      await asPostgres('delete from public.invoices where id = $1', [r]);

      const { rows } = await asPostgres<{ n: string }>(
        'select count(*) as n from public.datev_export_documents where export_id = $1',
        [id],
      );
      expect(Number(rows[0]!.n)).toBe(0);
      const lauf = await asPostgres('select 1 from public.datev_exports where id = $1', [id]);
      expect(lauf.rows).toHaveLength(1);
    });

    it('fällt im Löschlauf mit der Akte und übersteht die Wiederanwendung des Journals', async () => {
      const vorJahren = (jahre: number) => `(current_date - interval '${jahre} years')::date`;
      const { rows: tag } = await asPostgres<{ t: string }>(
        `select to_char(${vorJahren(9)}, 'YYYY-MM-DD') as t`,
      );
      const r = await rechnung('RG-ALT-0001', tag[0]!.t, [BEFREIT], 'therapy', patients.max);
      const z = await zahlung(r, 14000, tag[0]!.t);
      // Ein Lauf aus dem Jahr der Rechnung, direkt angelegt: so alte Monate exportiert die
      // Anwendung nicht.
      await asPostgres(
        `with lauf as (
           insert into public.datev_exports (organization_id, service_area, period_month, sequence,
             consultant_number, client_number, chart_of_accounts)
           values ($1, 'therapy', date_trunc('month', $2::date)::date, 1, 1001, 1, 'SKR03')
           returning id)
         insert into public.datev_export_documents (export_id, organization_id, invoice_id, payment_id)
         select lauf.id, $1, x.rechnung, x.zahlung from lauf,
           (values ($3::uuid, null::uuid), (null::uuid, $4::uuid)) x(rechnung, zahlung)`,
        [organizationId, tag[0]!.t, r, z],
      );
      await asPostgres(
        `update public.patients
            set care_started_on = ${vorJahren(12)}, care_concluded_on = ${vorJahren(11)},
                care_concluded_at = now(), care_concluded_by = $2
          where id = $1`,
        [patients.max, users.therapist],
      );
      await asPostgres(
        `update public.appointments set starts_at = starts_at - interval '12 years',
                ends_at = ends_at - interval '12 years' where patient_id = $1`,
        [patients.max],
      );
      await asPostgres(
        `update public.billable_services
            set performed_on = (performed_on - interval '12 years')::date where patient_id = $1`,
        [patients.max],
      );

      await asPostgres('select public.apply_retention()');

      expect((await asPostgres('select 1 from public.invoices where id = $1', [r])).rows).toEqual(
        [],
      );
      expect((await asPostgres('select 1 from public.datev_export_documents')).rows).toEqual([]);
      const { rows } = await asPostgres<{ anzahl: number }>(
        'select public.reapply_deletion_journal() as anzahl',
      );
      expect(Number(rows[0]?.anzahl)).toBe(0);
    });
  });
});
