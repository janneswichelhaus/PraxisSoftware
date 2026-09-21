import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * Die Rechnung entsteht aus Leistungen (ABR-003).
 *
 * Fuenf Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Keine Doppelabrechnung**: Eine Leistung steht auf hoechstens einer
 *     Rechnung, und je Patientin und Monat gibt es hoechstens einen Entwurf
 *     (ADR-009 Punkt 4, PROJECT_PRINCIPLES.md 13).
 *   * **Die Nummer entsteht beim Ausstellen**, lueckenlos und nie zweimal
 *     (Punkt 8, ANN-075).
 *   * **Ausgestellt ist unveraenderlich** (Punkt 9) - die Sperre sitzt am
 *     Trigger und gilt damit fuer jeden Weg in die Tabelle.
 *   * **Der Snapshot haelt das Dokument fest** (Punkt 10): Eine spaetere
 *     Aenderung an den Stammdaten aendert eine ausgestellte Rechnung nicht.
 *   * **Kein klinischer Inhalt geht an Dritte**: Der Verordnungsbezug steht
 *     ohne Diagnose im Dokument (ADR-004 Fassung 2).
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Behandlungsgrundlage aus supabase/seed.sql: Erika, 10 Termine, 0 genutzt. */
const GRUNDLAGE_FRISCH = '88888888-8888-4888-8888-000000000004';

/** Katalogpositionen aus supabase/seed.sql, Preisliste 2026. */
const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  mt: 'cccccccc-cccc-4ccc-8ccc-000000000003',
  /** Steuerpflichtig mit 19 Prozent - der Fall, an dem sich Steuer zeigt.
   *  Seit ABR-008 ausdruecklich im Bereich `therapy`: eine Selbstzahlerleistung
   *  an eine Patientin, keine Trainingsleistung (ADR-021 Punkt 2). */
  selbstzahler: 'cccccccc-cccc-4ccc-8ccc-000000000007',
} as const;

/** Rechnungsempfaenger aus supabase/seed.sql: Betreuung von Petra. */
const BETREUUNG = 'dddddddd-dddd-4ddd-8ddd-000000000001';

const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const DOKUMENT = 'select public.get_invoice($1::uuid) as rechnung';
const LISTE = 'select * from public.list_invoices(100)';
const KANDIDATEN = 'select * from public.list_invoice_candidates(100)';

interface Dokument {
  id: string;
  status: string;
  invoice_number: string | null;
  due_on: string | null;
  document: {
    currency: string;
    issuer: Record<string, unknown>;
    recipient: Record<string, unknown>;
    patient: Record<string, unknown>;
    items: Record<string, unknown>[];
    tax_groups: {
      tax_treatment: string;
      tax_cents: number;
      net_cents: number;
      exemption_reason: string | null;
    }[];
    totals: { total_cents: number; tax_total_cents: number };
    treatment_bases: Record<string, unknown>[];
    invoice_number?: string;
  };
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
async function termin(opts: {
  stundeImMonat: number;
  patient?: string;
  grundlage?: string | null;
}): Promise<string> {
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
      opts.patient ?? patients.erika,
      STAFF_ANNA,
      LOCATION,
      opts.stundeImMonat,
      opts.grundlage === undefined ? GRUNDLAGE_FRISCH : opts.grundlage,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/** Erfasst Leistungen an einem frischen Termin und liefert dessen Kennung. */
async function leistung(
  position: string,
  opts: { stundeImMonat: number; patient?: string; grundlage?: string | null },
): Promise<string> {
  const id = await termin(opts);
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

describe('Rechnung', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.invoice_items');
    await asPostgres('delete from public.invoices');
    await asPostgres('delete from public.invoice_number_series');
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.appointments');
    await asPostgres('update public.treatment_base_items set used_quantity = 0');
    await asPostgres("delete from public.audit_log where action like 'invoice%'");
  });

  describe('Arbeitsliste', () => {
    it('buendelt offene Leistungen nach Person und Monat', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      await leistung(KATALOG.mt, { stundeImMonat: 28 });

      const { rows } = await asUser<{
        patient_id: string;
        service_count: number;
        total_cents: number;
        has_draft: boolean;
      }>(users.office, KANDIDATEN);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.patient_id).toBe(patients.erika);
      expect(rows[0]?.service_count).toBe(2);
      // Krankengymnastik 45,00 + Manuelle Therapie 55,00
      expect(rows[0]?.total_cents).toBe(10_000);
      expect(rows[0]?.has_draft).toBe(false);
    });

    it('zeigt eine abgerechnete Leistung nicht mehr', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [entwurf[0]!.id]);

      const { rows } = await asUser(users.office, KANDIDATEN);
      expect(rows).toHaveLength(0);
    });

    it('weist die Therapeutin ab (ANN-076)', async () => {
      await expect(asUser(users.therapist, KANDIDATEN)).rejects.toThrow(
        /not allowed to read invoices/,
      );
    });
  });

  describe('Entwurf', () => {
    it('liegt bei jedem Versatz im Monat, den der Entwurf verlangt (R3-005)', async () => {
      // Die Fixture-Termine lagen relativ zu now(), der Entwurf verlangte
      // aber den laufenden Kalendermonat. Am Monatsersten - und bei grossem
      // Versatz an jedem Tag - fiel die Leistung damit in den Vormonat, und
      // create_invoice_draft brach mit 'no billable services for this
      // patient and month' ab. Das Pflichtgate pnpm test:db war an diesen
      // Tagen rot, ohne dass sich am Code etwas geaendert haette.
      //
      // 600 Stunden sind 25 Tage: Der groesste Versatz muss auch im
      // kuerzesten Monat noch hineinpassen.
      for (const stundeImMonat of [10, 30, 200, 600]) {
        const id = await termin({ stundeImMonat });

        const { rows } = await asPostgres<{ monat: string }>(
          `select to_char(date_trunc('month', app.appointment_performed_on($1::uuid)), 'YYYY-MM-DD') as monat`,
          [id],
        );
        expect(rows[0]!.monat).toBe(await monat());
      }
    });

    it('nimmt alle offenen Leistungen des Monats auf', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      await leistung(KATALOG.mt, { stundeImMonat: 28 });

      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      const { rows: zeilen } = await asPostgres<{ anzahl: string }>(
        'select count(*) as anzahl from public.invoice_items where invoice_id = $1',
        [rows[0]!.id],
      );
      expect(Number(zeilen[0]!.anzahl)).toBe(2);
    });

    it('bleibt ohne Nummer - die gibt es erst beim Ausstellen (ADR-009 Punkt 8)', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      const { rows: dok } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [
        rows[0]!.id,
      ]);
      expect(dok[0]?.rechnung.status).toBe('draft');
      expect(dok[0]?.rechnung.invoice_number).toBeNull();
    });

    it('entsteht nicht zweimal fuer denselben Monat', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const m = await monat();
      await asUserCommitted(users.office, ENTWURF, [patients.erika, m]);

      await leistung(KATALOG.mt, { stundeImMonat: 28 });
      await expect(asUser(users.office, ENTWURF, [patients.erika, m])).rejects.toThrow();
    });

    it('entsteht nicht ohne offene Leistung', async () => {
      await expect(asUser(users.office, ENTWURF, [patients.erika, await monat()])).rejects.toThrow(
        /no billable services/,
      );
    });

    it('laesst sich verwerfen und gibt die Leistungen wieder frei', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      await asUserCommitted(users.office, 'select public.delete_invoice_draft($1::uuid)', [
        rows[0]!.id,
      ]);

      const { rows: offen } = await asUser<{ service_count: number }>(users.office, KANDIDATEN);
      expect(offen[0]?.service_count).toBe(1);
    });

    it('haelt die Leistungen fest, solange er steht', async () => {
      const terminId = await leistung(KATALOG.kg, { stundeImMonat: 30 });
      await asUserCommitted(users.office, ENTWURF, [patients.erika, await monat()]);

      await expect(
        asUser(users.office, 'select public.delete_billable_services($1::uuid)', [terminId]),
      ).rejects.toThrow(/part of an invoice draft/);
    });

    it('uebernimmt den hinterlegten Empfaenger als Vorgabe (ANN-076)', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30, patient: patients.petra, grundlage: null });

      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.petra,
        await monat(),
      ]);

      const { rows: dok } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [
        rows[0]!.id,
      ]);
      expect(dok[0]?.rechnung.document.recipient.kind).toBe('guardian');
      expect(dok[0]?.rechnung.document.recipient.reference).toBe('BT-2026-0042');
    });

    it('geht ohne hinterlegten Empfaenger an die Patientin selbst', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      const { rows: dok } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [
        rows[0]!.id,
      ]);
      expect(dok[0]?.rechnung.document.recipient.kind).toBe('self');
      expect(dok[0]?.rechnung.document.recipient.name).toBe('Erika Beispiel');
    });

    it('haelt den gewaehlten Empfaenger fest - er ist Teil des Belegs (ABR-003a)', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30, patient: patients.petra, grundlage: null });
      await asUserCommitted(users.office, ENTWURF, [patients.petra, await monat()]);

      await expect(
        asUser(users.office, 'select public.delete_invoice_recipient($1::uuid)', [BETREUUNG]),
      ).rejects.toThrow();
    });

    it('weist einen Empfaenger einer anderen Patientin ab (PROJECT_PRINCIPLES.md 13)', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      await expect(
        asUser(users.office, 'select public.set_invoice_recipient($1::uuid, $2::uuid)', [
          rows[0]!.id,
          BETREUUNG,
        ]),
      ).rejects.toThrow(/does not belong to this patient/);
    });
  });

  describe('Ausstellen', () => {
    async function ausgestellt(position: string = KATALOG.kg): Promise<Dokument> {
      await leistung(position, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);
      const { rows: dok } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [
        rows[0]!.id,
      ]);
      return dok[0]!.rechnung;
    }

    it('vergibt eine Nummer aus Kuerzel, Jahr und laufender Zahl (ANN-075)', async () => {
      const rechnung = await ausgestellt();
      expect(rechnung.status).toBe('issued');
      expect(rechnung.invoice_number).toMatch(/^RG-\d{4}-0001$/);
    });

    it('vergibt die naechste Nummer lueckenlos', async () => {
      await ausgestellt();

      await leistung(KATALOG.mt, { stundeImMonat: 200, patient: patients.max, grundlage: null });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.max,
        await monat(),
      ]);
      const { rows: nummer } = await asUserCommitted<{ nummer: string }>(users.office, AUSSTELLEN, [
        rows[0]!.id,
      ]);

      expect(nummer[0]?.nummer).toMatch(/^RG-\d{4}-0002$/);
    });

    it('setzt die Leistungen auf "invoiced"', async () => {
      await ausgestellt();
      const { rows } = await asPostgres<{ status: string }>(
        'select status from public.billable_services',
      );
      expect(rows.map((zeile) => zeile.status)).toEqual(['invoiced']);
    });

    it('setzt ein Faelligkeitsdatum aus dem Zahlungsziel der Stammdaten', async () => {
      const rechnung = await ausgestellt();
      const { rows } = await asPostgres<{ tage: number }>(
        `select (i.due_on - i.issued_on) as tage from public.invoices i where i.id = $1`,
        [rechnung.id],
      );
      expect(rows[0]?.tage).toBe(14);
    });

    it('haelt die Stammdaten im Snapshot fest (ADR-009 Punkt 10)', async () => {
      const rechnung = await ausgestellt();
      expect(rechnung.document.issuer.legal_name).toBe('Test Praxis Tuebingen');

      // Der Absender aendert sich - die ausgestellte Rechnung nicht.
      await asPostgres(
        `update public.practice_billing_profiles set legal_name = 'Praxis Umbenannt'`,
      );

      const { rows } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [rechnung.id]);
      expect(rows[0]?.rechnung.document.issuer.legal_name).toBe('Test Praxis Tuebingen');
    });

    it('nennt den Verordnungsbezug ohne Diagnose (ADR-004 Fassung 2)', async () => {
      const rechnung = await ausgestellt();
      expect(rechnung.document.treatment_bases).toHaveLength(1);

      const { rows } = await asPostgres<{ diagnosis: string | null }>(
        'select diagnosis from public.treatment_bases where id = $1',
        [GRUNDLAGE_FRISCH],
      );
      expect(rows[0]?.diagnosis).toBeTruthy();
      expect(JSON.stringify(rechnung.document)).not.toContain(rows[0]!.diagnosis);
    });

    it('rechnet die enthaltene Umsatzsteuer aus dem Endpreis heraus (ANN-074)', async () => {
      const rechnung = await ausgestellt(KATALOG.selbstzahler);

      // Trainingseinheit 60,00 brutto, 19 Prozent enthalten: 9,58 Steuer.
      expect(rechnung.document.totals.total_cents).toBe(6000);
      expect(rechnung.document.totals.tax_total_cents).toBe(958);
      expect(rechnung.document.tax_groups[0]?.net_cents).toBe(5042);
    });

    it('trennt zwei Steuergruppen auf einer Rechnung (R3-025)', async () => {
      // Der Fall, den es im Betrieb wirklich gibt: Behandlung steuerfrei,
      // Trainingseinheit steuerpflichtig - auf einem Blatt.
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      await leistung(KATALOG.selbstzahler, { stundeImMonat: 34 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);
      const { rows: dok } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [
        rows[0]!.id,
      ]);
      const rechnung = dok[0]!.rechnung;

      // Krankengymnastik 45,00 steuerfrei + Training 60,00 mit 9,58 Steuer.
      expect(rechnung.document.tax_groups).toHaveLength(2);
      expect(rechnung.document.totals.total_cents).toBe(10_500);
      expect(rechnung.document.totals.tax_total_cents).toBe(958);

      const steuerfrei = rechnung.document.tax_groups.find(
        (gruppe) => gruppe.tax_treatment === 'exempt_healthcare',
      );
      expect(steuerfrei?.tax_cents).toBe(0);
      expect(steuerfrei?.net_cents).toBe(4500);
    });

    it('weist bei einer Heilbehandlung keine Umsatzsteuer aus', async () => {
      const rechnung = await ausgestellt(KATALOG.kg);
      expect(rechnung.document.totals.tax_total_cents).toBe(0);
      expect(rechnung.document.tax_groups[0]?.tax_treatment).toBe('exempt_healthcare');
    });

    it('weist unter der Kleinunternehmerregelung keine Umsatzsteuer aus (Par. 19 UStG)', async () => {
      await asPostgres('update public.practice_billing_profiles set small_business = true');
      const rechnung = await ausgestellt(KATALOG.selbstzahler);

      expect(rechnung.document.totals.tax_total_cents).toBe(0);
      expect(rechnung.document.issuer.small_business).toBe(true);
      await asPostgres('update public.practice_billing_profiles set small_business = false');
    });

    it('scheitert ohne Praxis-Stammdaten und sagt, was fehlt', async () => {
      await asPostgres('delete from public.practice_billing_profiles');
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      await expect(asUser(users.office, AUSSTELLEN, [rows[0]!.id])).rejects.toThrow(
        /practice billing profile missing/,
      );

      await asPostgres(
        `insert into public.practice_billing_profiles
           (organization_id, legal_name, street, house_number, postal_code, city,
            tax_number, small_business, iban)
         values ($1, 'Test Praxis Tuebingen', 'Musterallee', '1', '72070', 'Tuebingen',
                 '86123/45678', false, 'DE02120300000000202051')`,
        [organizationId],
      );
    });

    it('protokolliert das Ausstellen mit Nummer und Betrag (ADR-010)', async () => {
      await ausgestellt();
      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log where action = 'invoice.issued'
          order by occurred_at desc limit 1`,
      );
      expect(rows[0]?.context.invoice_number).toMatch(/^RG-/);
      expect(rows[0]?.context.total_cents).toBe(4500);
    });
  });

  describe('Unveraenderlichkeit (ADR-009 Punkt 9)', () => {
    async function ausgestellteId(): Promise<string> {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);
      return rows[0]!.id;
    }

    it('laesst sich nicht ein zweites Mal ausstellen', async () => {
      const id = await ausgestellteId();
      await expect(asUser(users.office, AUSSTELLEN, [id])).rejects.toThrow(/already issued/);
    });

    it('laesst sich nicht verwerfen', async () => {
      const id = await ausgestellteId();
      await expect(
        asUser(users.office, 'select public.delete_invoice_draft($1::uuid)', [id]),
      ).rejects.toThrow(/cannot be deleted/);
    });

    it('weist auch den direkten Weg in die Tabelle ab - die Sperre sitzt am Trigger', async () => {
      const id = await ausgestellteId();
      await expect(
        asPostgres(`update public.invoices set total_cents = 1 where id = $1`, [id]),
      ).rejects.toThrow(/cannot be changed/);
    });

    it('nimmt keine weitere Zeile an', async () => {
      const id = await ausgestellteId();
      const terminId = await leistung(KATALOG.mt, { stundeImMonat: 28 });
      const { rows } = await asPostgres<{ id: string }>(
        'select id from public.billable_services where appointment_id = $1',
        [terminId],
      );

      await expect(
        asPostgres(
          `insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
           values ($1, $2, $3, 99)`,
          [organizationId, id, rows[0]!.id],
        ),
      ).rejects.toThrow(/cannot be changed/);
    });

    it('bekommt den Empfaenger nicht mehr gewechselt', async () => {
      const id = await ausgestellteId();
      await expect(
        asUser(users.office, 'select public.set_invoice_recipient($1::uuid, null)', [id]),
      ).rejects.toThrow(/cannot be changed/);
    });
  });

  describe('Keine Doppelabrechnung (ADR-009 Punkt 4)', () => {
    it('nimmt dieselbe Leistung kein zweites Mal auf', async () => {
      const terminId = await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows: dienst } = await asPostgres<{ id: string }>(
        'select id from public.billable_services where appointment_id = $1',
        [terminId],
      );
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      // Eine zweite Rechnung im selben Monat gibt es nicht; der direkte Weg
      // scheitert am eindeutigen Index.
      await expect(
        asPostgres(
          `insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
           values ($1, $2, $3, 2)`,
          [organizationId, rows[0]!.id, dienst[0]!.id],
        ),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Befreiungsgrund und Par. 14c-Riegel (ADR-009 Punkt 18, ABR-006/ABR-007)
  //
  // Der Testfall ist nach Punkt 18 **verbindlich**: Wer an einem steuerfreien
  // Posten Umsatzsteuer ausweist, schuldet sie nach Par. 14c UStG - unabhaengig
  // davon, ob sie je gezahlt wurde und ob der Ausweis ein Versehen war. Und wer
  // den Grund der Befreiung nicht nennt, stellt eine unvollstaendige Rechnung
  // aus (Par. 14 Abs. 4 Nr. 8 UStG, BEF-019). Beides laesst sich nach dem
  // Ausstellen nicht mehr heilen, sondern nur stornieren (Punkt 9).
  // ---------------------------------------------------------------------------
  describe('Befreiungsgrund und Par. 14c-Riegel', () => {
    const RIEGEL = 'select app.assert_invoice_tax_lawful($1::jsonb)';
    const HEILBEHANDLUNG = 'Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG';

    /**
     * Ein Dokument in der Hand des Tests.
     *
     * Der Riegel ist eine reine Funktion ueber sein Argument - er laesst sich
     * deshalb mit einem gebauten Dokument pruefen, ohne eine Rechnung dafuer
     * anzulegen. Genau das ist der Fall, den es im Betrieb nicht geben darf:
     * ein Dokument, das `build_invoice_document` so nie liefern wuerde.
     */
    function dokument(
      gruppen: Record<string, unknown>[],
      opts: {
        kleinunternehmer?: boolean;
        zeilen?: Record<string, unknown>[];
        steuersumme?: number;
      } = {},
    ): string {
      const summe =
        opts.steuersumme ??
        gruppen.reduce((stand, gruppe) => stand + Number(gruppe.tax_cents ?? 0), 0);
      return JSON.stringify({
        issuer: { small_business: opts.kleinunternehmer ?? false },
        items: opts.zeilen ?? [],
        tax_groups: gruppen,
        totals: { total_cents: 10_000, tax_total_cents: summe },
      });
    }

    const STEUERFREI_SAUBER = {
      tax_treatment: 'exempt_healthcare',
      tax_rate_permille: 0,
      exemption_reason: HEILBEHANDLUNG,
      gross_cents: 4500,
      tax_cents: 0,
      net_cents: 4500,
    };

    it('laesst ein sauberes Dokument durch', async () => {
      await expect(asPostgres(RIEGEL, [dokument([STEUERFREI_SAUBER])])).resolves.toBeDefined();
    });

    it('weist Steuer an einer steuerfreien Steuergruppe ab', async () => {
      await expect(
        asPostgres(RIEGEL, [dokument([{ ...STEUERFREI_SAUBER, tax_cents: 958 }])]),
      ).rejects.toThrow(/Par\. 14c UStG/);
    });

    it('weist Steuer an einer nicht steuerbaren Steuergruppe ab (Ausfallhonorar)', async () => {
      await expect(
        asPostgres(RIEGEL, [
          dokument([
            {
              tax_treatment: 'not_taxable',
              tax_rate_permille: 0,
              exemption_reason: 'Nicht steuerbar, kein Leistungsaustausch (§ 1 Abs. 1 Nr. 1 UStG)',
              gross_cents: 4500,
              tax_cents: 718,
              net_cents: 3782,
            },
          ]),
        ]),
      ).rejects.toThrow(/Par\. 14c UStG/);
    });

    it('weist Steuer an einer steuerfreien Zeile ab', async () => {
      // Zeilen fuehren heute keinen Steuerbetrag mit. Der Riegel haelt das
      // fest, statt sich darauf zu verlassen - "nicht an der Zeile" steht so
      // in Punkt 18.
      await expect(
        asPostgres(RIEGEL, [
          dokument([STEUERFREI_SAUBER], {
            zeilen: [{ tax_treatment: 'exempt_healthcare', tax_rate_permille: 0, tax_cents: 958 }],
          }),
        ]),
      ).rejects.toThrow(/Par\. 14c UStG/);
    });

    it('weist einen Steuersatz an einer steuerfreien Zeile ab', async () => {
      await expect(
        asPostgres(RIEGEL, [
          dokument([STEUERFREI_SAUBER], {
            zeilen: [{ tax_treatment: 'exempt_healthcare', tax_rate_permille: 190 }],
          }),
        ]),
      ).rejects.toThrow(/Par\. 14c UStG/);
    });

    it('weist eine Summe ab, die nicht zu den Steuergruppen passt', async () => {
      await expect(
        asPostgres(RIEGEL, [dokument([STEUERFREI_SAUBER], { steuersumme: 958 })]),
      ).rejects.toThrow(/tax total does not match/);
    });

    it('weist unter Par. 19 UStG jeden Steuerbetrag ab - auch am steuerpflichtigen Posten', async () => {
      await expect(
        asPostgres(RIEGEL, [
          dokument(
            [
              {
                tax_treatment: 'taxable',
                tax_rate_permille: 190,
                exemption_reason: null,
                gross_cents: 6000,
                tax_cents: 958,
                net_cents: 5042,
              },
            ],
            { kleinunternehmer: true },
          ),
        ]),
      ).rejects.toThrow(/Par\. 19 UStG/);
    });

    it('verlangt den Grund der Steuerbefreiung als Pflichtangabe (BEF-019)', async () => {
      await expect(
        asPostgres(RIEGEL, [dokument([{ ...STEUERFREI_SAUBER, exemption_reason: null }])]),
      ).rejects.toThrow(/Par\. 14 Abs\. 4 Nr\. 8 UStG/);
    });

    it('nennt den Grund im Snapshot und nicht erst in der Darstellung', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);

      const { rows: gespeichert } = await asPostgres<{ grund: string | null }>(
        `select i.snapshot -> 'tax_groups' -> 0 ->> 'exemption_reason' as grund
           from public.invoices i where i.id = $1`,
        [rows[0]!.id],
      );
      expect(gespeichert[0]?.grund).toBe(HEILBEHANDLUNG);

      const { rows: dok } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [
        rows[0]!.id,
      ]);
      expect(dok[0]?.rechnung.document.tax_groups[0]?.exemption_reason).toBe(HEILBEHANDLUNG);
    });

    it('laesst die steuerpflichtige Gruppe ohne Grund - dort steht die Steuer', async () => {
      await leistung(KATALOG.selbstzahler, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);

      const { rows: dok } = await asUser<{ rechnung: Dokument }>(users.office, DOKUMENT, [
        rows[0]!.id,
      ]);
      expect(dok[0]?.rechnung.document.tax_groups[0]?.exemption_reason).toBeNull();
      expect(dok[0]?.rechnung.document.tax_groups[0]?.tax_cents).toBe(958);
    });

    it('sperrt die Ausstellung, wenn das Dokument unzulaessig Steuer ausweist', async () => {
      // Der Beweis, dass die Sperre im Ausstellungsweg haengt und nicht nur
      // als Funktion danebensteht (Punkt 18: "vor der Ausstellung",
      // "serverseitig"). Dafuer liefert `build_invoice_document` fuer die
      // Dauer dieses Falls ein Dokument mit Steuer an der steuerfreien
      // Gruppe; das Original wird umbenannt und danach wortgleich
      // zurueckgeholt - kein zweiter Funktionskoerper im Test.
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      await asPostgres(
        `alter function app.build_invoice_document(uuid) rename to build_invoice_document_echt`,
      );
      try {
        await asPostgres(
          `create function app.build_invoice_document(p_invoice_id uuid)
             returns jsonb language sql stable security definer set search_path = '' as $$
               select jsonb_set(d, '{tax_groups,0,tax_cents}', '958'::jsonb)
                 from app.build_invoice_document_echt(p_invoice_id) d
             $$`,
        );

        await expect(asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id])).rejects.toThrow(
          /Par\. 14c UStG/,
        );
      } finally {
        await asPostgres('drop function if exists app.build_invoice_document(uuid)');
        await asPostgres(
          `alter function app.build_invoice_document_echt(uuid) rename to build_invoice_document`,
        );
      }

      // Die Rechnung ist Entwurf geblieben, und keine Nummer ist verbraucht.
      const { rows: stand } = await asPostgres<{ status: string; invoice_number: string | null }>(
        'select status, invoice_number from public.invoices where id = $1',
        [rows[0]!.id],
      );
      expect(stand[0]?.status).toBe('draft');
      expect(stand[0]?.invoice_number).toBeNull();
      expect((await asPostgres('select * from public.invoice_number_series')).rows).toEqual([]);
    });
  });

  describe('Liste', () => {
    it('zeigt Entwurf und ausgestellte Rechnung mit Betrag', async () => {
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      const { rows: entwurf } = await asUser<{ status: string; total_cents: number }>(
        users.office,
        LISTE,
      );
      expect(entwurf[0]?.status).toBe('draft');
      expect(entwurf[0]?.total_cents).toBe(4500);

      await asUserCommitted(users.office, AUSSTELLEN, [rows[0]!.id]);

      const { rows: fertig } = await asUser<{ status: string; total_cents: number }>(
        users.office,
        LISTE,
      );
      expect(fertig[0]?.status).toBe('issued');
      expect(fertig[0]?.total_cents).toBe(4500);
    });

    it('weist die Therapeutin ab', async () => {
      await expect(asUser(users.therapist, LISTE)).rejects.toThrow(/not allowed to read invoices/);
    });
  });

  // ---------------------------------------------------------------------------
  // Mandantengrenze (ADR-003, R3-025)
  // ---------------------------------------------------------------------------
  describe('Fremde Organisation', () => {
    it('sieht keine Rechnung der Testpraxis und stellt keine aus', async () => {
      const fremd = await fremdeOrganisation();
      await leistung(KATALOG.kg, { stundeImMonat: 30 });
      const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        await monat(),
      ]);

      expect((await asUser(fremd.owner, LISTE)).rows).toEqual([]);
      expect((await asUser(fremd.owner, KANDIDATEN)).rows).toEqual([]);
      await expect(asUser(fremd.owner, AUSSTELLEN, [entwurf[0]!.id])).rejects.toThrow(
        /invoice not found/,
      );
      await expect(asUser(fremd.owner, ENTWURF, [patients.erika, await monat()])).rejects.toThrow();
    });
  });
});
