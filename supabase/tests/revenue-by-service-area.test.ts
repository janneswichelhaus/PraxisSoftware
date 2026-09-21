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

/**
 * Einnahmen je Leistungsart (ABR-011, ADR-009 Fassung 2 Punkt 19).
 *
 * Sechs Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Ohne genannte Grundlage keine Zahl.** `p_basis` ist Pflicht, ein
 *     unbekannter Wert wird abgewiesen, und jede Zeile traegt ihre Grundlage
 *     mit.
 *   * **Die beiden Grundlagen mischen sich nie.** Eine ausgestellte, nicht
 *     bezahlte Rechnung steht in der Rechnungsstellung und im Zufluss nicht -
 *     und umgekehrt.
 *   * **Gerechnet wird aus Dokumenten**, nicht aus dem Katalog von heute: aus
 *     dem Snapshot der ausgestellten Rechnung, dem Stornodokument und der
 *     gebuchten Zahlung. Ein Entwurf ist kein Dokument.
 *   * **Das Storno kehrt um, es loescht nicht** - und es tut das am Tag des
 *     Stornos, nicht ruecklaufend im Jahr der Rechnung.
 *   * **Eine Teilzahlung wird centgenau verteilt** (ANN-088): Die Summe der
 *     Anteile ist der gezahlte Betrag, nie ein Cent daneben.
 *   * **Die Auswertung liegt bei owner und office** (ADR-004, Par. 4.3) und
 *     endet an der Organisationsgrenze.
 *
 * Eine Rechnung im **Trainingsbereich** laesst sich heute nicht ueber einen
 * Schreibweg bauen - es gibt keinen (E18 Schritt 7), und `billable_services`
 * bleibt patientengebunden. Die Trennung der Bereiche ist aber die Zusage
 * dieses Loops; sie wird deshalb an einer direkt eingesetzten Rechnung
 * geprueft. Getestet wird damit, was die Auswertung mit zwei Bereichen tut,
 * und nicht ein Weg, den es nicht gibt.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Behandlungsgrundlage aus supabase/seed.sql: Erika, 10 Termine, 0 genutzt. */
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';

/** Katalogpositionen aus supabase/seed.sql, Preisliste 2026. */
const KATALOG = {
  /** Krankengymnastik, 45,00 Euro, steuerfreie Heilbehandlung. */
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  /** Manuelle Therapie, 55,00 Euro, steuerfreie Heilbehandlung. */
  mt: 'cccccccc-cccc-4ccc-8ccc-000000000003',
  /** Selbstzahlerleistung ohne Heilbehandlungszweck, 60,00 Euro, 19 Prozent. */
  szl: 'cccccccc-cccc-4ccc-8ccc-000000000007',
  /** Ausfallhonorar, 45,00 Euro, nicht steuerbar. */
  ausfall: 'cccccccc-cccc-4ccc-8ccc-000000000008',
} as const;

const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const BUCHEN =
  'select public.record_payment($1::uuid, $2::int, $3::date, $4::text, $5::text, $6::text) as id';
const ZAHLUNG_STORNIEREN = 'select public.void_payment($1::uuid, $2::text)';
const RECHNUNG_STORNIEREN = 'select public.cancel_invoice($1::uuid, $2::text) as nummer';
const AUSWERTUNG = 'select * from public.list_revenue_by_service_area($1::text, $2::int)';
const JAHRE = 'select * from public.list_revenue_years()';

interface Zeile {
  basis: string;
  year: number;
  service_area: string;
  tax_treatment: string;
  tax_rate_permille: number;
  currency: string;
  gross_cents: string;
  tax_cents: string;
  net_cents: string;
  document_count: number;
}

/** `bigint` kommt als Zeichenkette aus `pg`; die Tests rechnen mit Zahlen. */
function betraege(zeile: Zeile): { brutto: number; steuer: number; netto: number } {
  return {
    brutto: Number(zeile.gross_cents),
    steuer: Number(zeile.tax_cents),
    netto: Number(zeile.net_cents),
  };
}

async function auswertung(grundlage: string, jahr: number | null = null): Promise<Zeile[]> {
  const { rows } = await asUser<Zeile>(users.office, AUSWERTUNG, [grundlage, jahr]);
  return rows;
}

function zeile(zeilen: Zeile[], kennzeichen: string, satz = 0): Zeile | undefined {
  return zeilen.find((z) => z.tax_treatment === kennzeichen && z.tax_rate_permille === satz);
}

function summe(zeilen: Zeile[]): number {
  return zeilen.reduce((wert, z) => wert + Number(z.gross_cents), 0);
}

/** Legt einen dokumentierten Behandlungstermin an. */
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

/**
 * Legt einen abgesagten Termin mit Gebuehrenanlass an.
 *
 * Das Ausfallhonorar entsteht nur daraus (ANN-072); an einem dokumentierten
 * Termin weist die Erfassung es ab.
 */
async function ausfalltermin(stundeImMonat: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       cancelled_at, cancelled_by, cancellation_reason, cancellation_received_at, fee_basis
     ) values (
       $1, $2, $3, $4, 'practice', 'cancelled',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int)) at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $5::int + 1)) at time zone 'Europe/Berlin',
       $6, now(), $7, 'patient_request', now(), 'late_cancellation'
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

/** Erfasst eine Leistung an einem frischen Termin. */
async function leistung(position: string, stundeImMonat: number): Promise<void> {
  const id =
    position === KATALOG.ausfall ? await ausfalltermin(stundeImMonat) : await termin(stundeImMonat);
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

/** Das laufende Kalenderjahr in der Zeitzone der Praxis. */
async function jahr(): Promise<number> {
  const { rows } = await asPostgres<{ jahr: number }>(
    `select extract(year from (now() at time zone 'Europe/Berlin'))::int as jahr`,
  );
  return rows[0]!.jahr;
}

/** Ein Entwurf ueber die angegebenen Positionen, jede genau einmal. */
async function entwurf(positionen: readonly string[]): Promise<string> {
  let stunde = 30;
  for (const position of positionen) {
    await leistung(position, stunde);
    stunde += 2;
  }
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
    patients.erika,
    await monat(),
  ]);
  return rows[0]!.id;
}

/** Eine ausgestellte Rechnung ueber die angegebenen Positionen. */
async function ausgestellteRechnung(
  positionen: readonly string[] = [KATALOG.kg],
): Promise<{ id: string; betrag: number }> {
  const id = await entwurf(positionen);
  await asUserCommitted(users.office, AUSSTELLEN, [id]);

  const { rows } = await asPostgres<{ total_cents: number }>(
    'select total_cents from public.invoices where id = $1',
    [id],
  );
  return { id, betrag: rows[0]!.total_cents };
}

async function buche(
  rechnung: string,
  betrag: number,
  opts: { richtung?: string; tag?: string } = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.office, BUCHEN, [
    rechnung,
    betrag,
    opts.tag ?? (await heute()),
    'bank_transfer',
    opts.richtung ?? 'incoming',
    null,
  ]);
  return rows[0]!.id;
}

describe('Einnahmen je Leistungsart', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  describe('die Grundlage wird genannt, nicht gewaehlt', () => {
    it('weist einen Aufruf ohne Grundlage ab', async () => {
      await expect(auswertung(null as unknown as string)).rejects.toThrow(/unknown revenue basis/);
    });

    it('weist eine erfundene Grundlage ab', async () => {
      await expect(auswertung('gewinn')).rejects.toThrow(/unknown revenue basis/);
    });

    it('traegt die Grundlage und das Jahr in jeder Zeile', async () => {
      await ausgestellteRechnung();
      const heuer = await jahr();

      const zeilen = await auswertung('accrual', heuer);
      expect(zeilen.length).toBeGreaterThan(0);
      expect(zeilen.every((z) => z.basis === 'accrual')).toBe(true);
      expect(zeilen.every((z) => z.year === heuer)).toBe(true);
    });

    it('nimmt ohne Jahresangabe das laufende Jahr der Praxis', async () => {
      await ausgestellteRechnung();
      const ohne = await auswertung('accrual');
      const mit = await auswertung('accrual', await jahr());
      expect(ohne).toEqual(mit);
    });

    it('mischt die beiden Grundlagen nie in einer Zahl', async () => {
      // Ausgestellt, nicht bezahlt: Die Rechnungsstellung kennt den Betrag,
      // der Zufluss nicht. Genau das ist der Unterschied, den Punkt 19 meint.
      const { betrag } = await ausgestellteRechnung();

      expect(summe(await auswertung('accrual'))).toBe(betrag);
      expect(summe(await auswertung('cash'))).toBe(0);
    });
  });

  describe('Grundlage Rechnungsstellung', () => {
    it('zaehlt einen Entwurf nirgends mit', async () => {
      await entwurf([KATALOG.kg]);
      expect(await auswertung('accrual')).toEqual([]);
    });

    it('schluesselt eine gemischte Rechnung je Kennzeichen und Satz auf', async () => {
      // KG ist steuerfrei (45,00), SZL steuerpflichtig zu 19 Prozent (60,00).
      await ausgestellteRechnung([KATALOG.kg, KATALOG.szl]);
      const zeilen = await auswertung('accrual');

      const frei = zeile(zeilen, 'exempt_healthcare');
      const pflichtig = zeile(zeilen, 'taxable', 190);

      expect(betraege(frei!)).toEqual({ brutto: 4500, steuer: 0, netto: 4500 });
      // 6000 * 190 / 1190 = 957,98 -> 958.
      expect(betraege(pflichtig!)).toEqual({ brutto: 6000, steuer: 958, netto: 5042 });
    });

    it('fuehrt das Ausfallhonorar in seinem Bereich unter seinem Kennzeichen', async () => {
      // Die offene Folgefrage der Fassung 2 braucht keine eigene Mechanik: Das
      // Ausfallhonorar haengt an einer Katalogposition und traegt von dort
      // `not_taxable` und den Behandlungsbereich.
      await ausgestellteRechnung([KATALOG.ausfall]);
      const zeilen = await auswertung('accrual');

      expect(zeilen).toHaveLength(1);
      expect(zeilen[0]!.tax_treatment).toBe('not_taxable');
      expect(zeilen[0]!.service_area).toBe('therapy');
      expect(betraege(zeilen[0]!)).toEqual({ brutto: 4500, steuer: 0, netto: 4500 });
    });

    it('rechnet aus dem Snapshot und nicht aus dem Katalog von heute', async () => {
      const { betrag } = await ausgestellteRechnung([KATALOG.kg]);

      // Der Preis von morgen aendert die Rechnung von gestern nicht
      // (ADR-009 Punkt 5 und 10). Am Schreibweg vorbei gesetzt, weil die
      // veroeffentlichte Preisliste unveraenderlich ist.
      await asPostgres('alter table public.service_catalog_items disable trigger all');
      await asPostgres(
        'update public.service_catalog_items set unit_price_cents = 9900 where id = $1',
        [KATALOG.kg],
      );
      await asPostgres('alter table public.service_catalog_items enable trigger all');

      expect(summe(await auswertung('accrual'))).toBe(betrag);
    });

    it('nimmt mit dem Storno zurueck, was die Rechnung gebracht hat', async () => {
      const { id } = await ausgestellteRechnung([KATALOG.kg]);
      await asUserCommitted(users.office, RECHNUNG_STORNIEREN, [id, 'Falscher Empfaenger']);

      const zeilen = await auswertung('accrual');
      expect(summe(zeilen)).toBe(0);
      // Die Zeile bleibt stehen und nennt zwei Dokumente: Es ist etwas
      // ausgestellt und wieder zurueckgenommen worden. Das ist etwas anderes
      // als "nichts passiert".
      expect(zeilen).toHaveLength(1);
      expect(zeilen[0]!.document_count).toBe(2);
    });

    it('laesst das Storno im Jahr des Stornos stehen, nicht im Jahr der Rechnung', async () => {
      const { id, betrag } = await ausgestellteRechnung([KATALOG.kg]);
      const heuer = await jahr();

      // Am Schreibweg vorbei: cancel_invoice storniert immer heute. Geprueft
      // wird die Zuordnung ueber die Jahresgrenze - im naechsten Jahr
      // storniert heisst: im naechsten Jahr abgezogen.
      await asPostgres(
        `insert into public.invoice_cancellations
           (organization_id, invoice_id, cancellation_number, reason, cancelled_on)
         values ($1, $2, 'RG-STORNO-1', 'Spaete Ruecknahme', make_date($3::int, 2, 1))`,
        [organizationId, id, heuer + 1],
      );

      expect(summe(await auswertung('accrual', heuer))).toBe(betrag);
      expect(summe(await auswertung('accrual', heuer + 1))).toBe(-betrag);
    });

    it('liefert fuer ein Jahr ohne Dokumente nichts', async () => {
      await ausgestellteRechnung();
      expect(await auswertung('accrual', (await jahr()) - 1)).toEqual([]);
    });
  });

  describe('Grundlage Zufluss', () => {
    it('zeigt die Vollzahlung mit den Steuergruppen ihres Dokuments', async () => {
      const { id, betrag } = await ausgestellteRechnung([KATALOG.kg, KATALOG.szl]);
      await buche(id, betrag);

      const nachDokument = await auswertung('accrual');
      const nachZufluss = await auswertung('cash');

      // Dieselbe Rechnung, vollstaendig bezahlt: Beide Grundlagen kommen auf
      // dieselben Gruppen. Das ist kein Mischen - es sind zwei Aufrufe.
      expect(nachZufluss.map(betraege)).toEqual(nachDokument.map(betraege));
    });

    it('verteilt eine Teilzahlung centgenau auf die Steuergruppen', async () => {
      // 45,00 steuerfrei und 60,00 steuerpflichtig, gezahlt werden 50,00.
      const { id } = await ausgestellteRechnung([KATALOG.kg, KATALOG.szl]);
      await buche(id, 5000);

      const zeilen = await auswertung('cash');
      expect(summe(zeilen)).toBe(5000);

      // 5000 * 4500 / 10500 = 2142,857... -> 2142 plus den einen offenen Cent,
      // weil ihr Rest der groessere ist. 5000 * 6000 / 10500 = 2857,14 -> 2857.
      expect(betraege(zeile(zeilen, 'exempt_healthcare')!).brutto).toBe(2143);
      expect(betraege(zeile(zeilen, 'taxable', 190)!).brutto).toBe(2857);
      // Steuer nur dort, wo das Dokument welche ausweist (Punkt 18).
      expect(betraege(zeile(zeilen, 'exempt_healthcare')!).steuer).toBe(0);
      expect(betraege(zeile(zeilen, 'taxable', 190)!).steuer).toBe(456);
    });

    it('laesst die Rueckzahlung den Eingang genau aufheben', async () => {
      const { id, betrag } = await ausgestellteRechnung([KATALOG.kg, KATALOG.szl]);
      await buche(id, betrag);
      await buche(id, betrag, { richtung: 'refund' });

      const zeilen = await auswertung('cash');
      expect(summe(zeilen)).toBe(0);
      expect(zeilen.every((z) => betraege(z).steuer === 0)).toBe(true);
    });

    it('laesst eine stornierte Zahlung aus jeder Summe heraus', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      const zahlung = await buche(id, betrag);
      await asUserCommitted(users.office, ZAHLUNG_STORNIEREN, [zahlung, 'Falsch gebucht']);

      expect(summe(await auswertung('cash'))).toBe(0);
    });

    it('bucht eine Zahlung in das Jahr ihres Eingangs', async () => {
      const { id, betrag } = await ausgestellteRechnung();
      const heuer = await jahr();
      // record_payment weist die Zukunft ab, die Vergangenheit nicht.
      await buche(id, betrag, { tag: `${heuer - 1}-12-30` });

      expect(summe(await auswertung('cash', heuer))).toBe(0);
      expect(summe(await auswertung('cash', heuer - 1))).toBe(betrag);
    });

    it('verteilt jede Teilzahlung ohne Cent-Verlust, ueber alle Betraege', async () => {
      const { id } = await ausgestellteRechnung([KATALOG.kg, KATALOG.szl]);
      // Drei Teilzahlungen mit unbequemen Betraegen: Die Summe der verteilten
      // Anteile ist der gezahlte Betrag - das ist die Zusage aus ANN-088.
      for (const teil of [1, 3333, 4567]) {
        await buche(id, teil);
      }

      expect(summe(await auswertung('cash'))).toBe(1 + 3333 + 4567);
    });
  });

  describe('die Bereiche bleiben getrennt', () => {
    it('fuehrt Behandlung und Training in eigenen Zeilen', async () => {
      const { betrag } = await ausgestellteRechnung([KATALOG.kg]);
      const heuer = await jahr();

      // Am Schreibweg vorbei gebaut, weil es fuer Training noch keinen gibt
      // (E18 Schritt 7). Der Snapshot hat die Form, die
      // app.build_invoice_document liefert.
      await asPostgres(
        `insert into public.invoices (
           organization_id, patient_id, service_area, status, period_month,
           invoice_number, issued_on, due_on, total_cents, tax_total_cents,
           currency, snapshot
         ) values (
           $1, $2, 'training', 'issued', date_trunc('month', current_date),
           'TR-1-0001', current_date, current_date, 8000, 1277, 'EUR',
           jsonb_build_object(
             'schema_version', 3,
             'service_area', 'training',
             'tax_groups', jsonb_build_array(jsonb_build_object(
               'tax_treatment', 'taxable',
               'tax_rate_permille', 190,
               'gross_cents', 8000,
               'tax_cents', 1277,
               'net_cents', 6723
             ))
           )
         )`,
        [organizationId, patients.erika],
      );

      const zeilen = await auswertung('accrual', heuer);
      const behandlung = zeilen.filter((z) => z.service_area === 'therapy');
      const training = zeilen.filter((z) => z.service_area === 'training');

      expect(summe(behandlung)).toBe(betrag);
      expect(summe(training)).toBe(8000);
      // Keine Zeile traegt beides: Bereich, Kennzeichen und Satz sind der
      // Schluessel, und die Summe steht nie darueber.
      expect(
        zeilen.every((z) => z.service_area === 'therapy' || z.service_area === 'training'),
      ).toBe(true);
    });
  });

  describe('wer sie sehen darf', () => {
    it('laesst owner und office rechnen', async () => {
      await ausgestellteRechnung();
      for (const nutzer of [users.ownerTherapist, users.office]) {
        const { rows } = await asUser<Zeile>(nutzer, AUSWERTUNG, ['accrual', null]);
        expect(rows.length).toBeGreaterThan(0);
      }
    });

    it('weist Therapie und Trainingsbetreuung ab', async () => {
      for (const nutzer of [users.therapist, users.trainer]) {
        await expect(asUser(nutzer, AUSWERTUNG, ['accrual', null])).rejects.toThrow(
          /not allowed to read invoicing figures/,
        );
        await expect(asUser(nutzer, JAHRE)).rejects.toThrow(
          /not allowed to read invoicing figures/,
        );
      }
    });

    it('weist die nicht angemeldete Sitzung ab', async () => {
      await expect(asAnon(AUSWERTUNG, ['accrual', null])).rejects.toThrow();
      await expect(asAnon(JAHRE)).rejects.toThrow();
    });

    it('endet an der Organisationsgrenze', async () => {
      const { betrag } = await ausgestellteRechnung();
      const fremd = await fremdeOrganisation();

      // Die zweite Praxis sieht die Zahlen der ersten nicht - und die erste
      // ihre eigenen unveraendert.
      const { rows } = await asUser<Zeile>(fremd.owner, AUSWERTUNG, ['accrual', null]);
      expect(rows).toEqual([]);
      expect(summe(await auswertung('accrual'))).toBe(betrag);
    });
  });

  describe('die Jahre zur Auswahl', () => {
    it('nennt nur Jahre, in denen ein Dokument oder eine Zahlung liegt', async () => {
      const heuer = await jahr();
      const { id, betrag } = await ausgestellteRechnung();
      await buche(id, betrag, { tag: `${heuer - 1}-12-30` });

      const { rows } = await asUser<{ year: number }>(users.office, JAHRE);
      expect(rows.map((z) => z.year)).toEqual([heuer, heuer - 1]);
    });

    it('nennt ohne Dokument gar kein Jahr', async () => {
      const { rows } = await asUser<{ year: number }>(users.office, JAHRE);
      expect(rows).toEqual([]);
    });
  });
});
