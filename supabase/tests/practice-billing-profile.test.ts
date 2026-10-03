import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Praxis-Stammdaten fuer Rechnungen (ABR-000).
 *
 * Drei Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Pflegen darf allein die Inhaberin** (ANN-074). Das Office liest sie -
 *     es stellt Rechnungen aus -, die therapeutischen Rollen sehen sie nicht,
 *     und ein Patientenkonto schon gar nicht.
 *   * **Der umsatzsteuerliche Status wird nicht geraten.** Die Spalte hat
 *     keinen Vorgabewert; ohne Angabe entsteht keine Zeile.
 *   * **Geschrieben wird nur ueber die Funktion.** Die Tabelle traegt kein
 *     Schreibrecht, auch nicht fuer die Inhaberin (ADR-004).
 */

const { users, organizationId } = SEED;

const LESEN = 'select * from public.practice_billing_profiles';

const SPEICHERN = `select public.save_practice_billing_profile(
  $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text,
  $8::text, $9::text, $10::boolean, $11::text, $12::text, $13::text, $14::text,
  $15::text, $16::smallint
)`;

/** Ein vollstaendiger, synthetischer Satz Stammdaten. */
function stammdaten(aenderungen: Partial<Record<string, unknown>> = {}): unknown[] {
  const felder: Record<string, unknown> = {
    legal_name: 'Test Praxis Tuebingen',
    street: 'Musterallee',
    house_number: '1',
    postal_code: '72070',
    city: 'Tuebingen',
    phone: '+49 7071 0000000',
    email: 'rechnung@praxis.invalid',
    tax_number: '86123/45678',
    vat_id: null,
    small_business: false,
    bank_name: 'Testbank Tuebingen',
    account_holder: 'Test Praxis Tuebingen',
    iban: 'DE02120300000000202051',
    bic: 'TESTDEFFXXX',
    invoice_number_prefix: 'RG',
    payment_term_days: 14,
    ...aenderungen,
  };

  return [
    felder.legal_name,
    felder.street,
    felder.house_number,
    felder.postal_code,
    felder.city,
    felder.phone,
    felder.email,
    felder.tax_number,
    felder.vat_id,
    felder.small_business,
    felder.bank_name,
    felder.account_holder,
    felder.iban,
    felder.bic,
    felder.invoice_number_prefix,
    felder.payment_term_days,
  ];
}

describe('Praxis-Stammdaten fuer Rechnungen', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Lesen', () => {
    it('sieht die Inhaberin', async () => {
      const { rows } = await asUser(users.ownerTherapist, LESEN);
      expect(rows).toHaveLength(1);
    });

    it('sieht das Office - es stellt die Rechnungen aus', async () => {
      const { rows } = await asUser(users.office, LESEN);
      expect(rows).toHaveLength(1);
    });

    it.each([
      ['Therapeutin', users.therapist],
      ['Teamleitung', users.teamLead],
      ['Patientenkonto', users.patientMax],
    ])('sieht %s nicht', async (_name, userId) => {
      const { rows } = await asUser(userId, LESEN);
      expect(rows).toHaveLength(0);
    });

    it('sieht ohne Anmeldung niemand - die Rolle anon hat kein Tabellenrecht', async () => {
      await expect(asAnon(LESEN)).rejects.toThrow(/permission denied/);
    });
  });

  describe('Pflegen', () => {
    it('speichert die Inhaberin', async () => {
      await asUserCommitted(
        users.ownerTherapist,
        SPEICHERN,
        stammdaten({ legal_name: 'Praxis Neu', payment_term_days: 21 }),
      );

      const { rows } = await asUser<{ legal_name: string; payment_term_days: number }>(
        users.ownerTherapist,
        LESEN,
      );
      expect(rows[0]?.legal_name).toBe('Praxis Neu');
      expect(rows[0]?.payment_term_days).toBe(21);
    });

    it('raeumt die IBAN von Leerzeichen und schreibt sie gross', async () => {
      await asUserCommitted(
        users.ownerTherapist,
        SPEICHERN,
        stammdaten({ iban: 'de02 1203 0000 0000 2020 51' }),
      );

      const { rows } = await asUser<{ iban: string }>(users.ownerTherapist, LESEN);
      expect(rows[0]?.iban).toBe('DE02120300000000202051');
    });

    it('weist eine IBAN mit falscher Pruefziffer ab (R3-010)', async () => {
      // Die IBAN geht in den Snapshot jeder Rechnung, die danach ausgestellt
      // wird (ADR-009 Punkt 10). Ein Zahlendreher faellt sonst erst auf,
      // wenn das Geld nicht ankommt - und steht bis dahin auf jedem Blatt.
      await expect(
        asUser(users.ownerTherapist, SPEICHERN, stammdaten({ iban: 'DE00123456780000000000' })),
      ).rejects.toThrow(/iban checksum/);

      // Auch die Form ohne Leerzeichen und in Kleinbuchstaben wird geprueft,
      // nicht nur die Schreibweise.
      await expect(
        asUser(
          users.ownerTherapist,
          SPEICHERN,
          stammdaten({ iban: 'de02 1203 0000 0000 2020 52' }),
        ),
      ).rejects.toThrow(/iban checksum/);
    });

    it('haelt die Pruefziffer auch an der Tabelle fest - auch fuer postgres (R3-010)', async () => {
      await asUserCommitted(users.ownerTherapist, SPEICHERN, stammdaten());

      await expect(
        asPostgres('update public.practice_billing_profiles set iban = $1', [
          'DE00123456780000000000',
        ]),
      ).rejects.toThrow(/iban/);
    });

    it.each([
      ['Office', users.office],
      ['Therapeutin', users.therapist],
      ['Teamleitung', users.teamLead],
    ])('weist %s ab - das ist Praxiseinstellung (ANN-074)', async (_name, userId) => {
      await expect(asUser(userId, SPEICHERN, stammdaten())).rejects.toThrow(
        /not allowed to manage the billing profile/,
      );
    });

    it('weist einen fehlenden Umsatzsteuerstatus ab, statt ihn zu raten', async () => {
      await expect(
        asUser(users.ownerTherapist, SPEICHERN, stammdaten({ small_business: null })),
      ).rejects.toThrow(/vat status must be stated explicitly/);
    });

    /** ABN-008 (BEF-100): Steuernummer oder USt-IdNr. (Par. 14 Abs. 4 Nr. 2 UStG). */
    it('speichert mit USt-IdNr. ohne Steuernummer', async () => {
      await asUserCommitted(
        users.ownerTherapist,
        SPEICHERN,
        stammdaten({ tax_number: '', vat_id: 'DE123456789' }),
      );
      const { rows } = await asPostgres<{ tax_number: string | null; vat_id: string | null }>(
        'select tax_number, vat_id from public.practice_billing_profiles where organization_id = $1',
        [organizationId],
      );
      expect(rows[0]).toEqual({ tax_number: null, vat_id: 'DE123456789' });
    });

    it('weist Stammdaten ohne Steuernummer und ohne USt-IdNr. ab - auch an der Tabelle', async () => {
      await expect(
        asUserCommitted(
          users.ownerTherapist,
          SPEICHERN,
          stammdaten({ tax_number: '  ', vat_id: null }),
        ),
      ).rejects.toThrow(/a tax number or a vat id is required/);
      await expect(
        asPostgres(
          'update public.practice_billing_profiles set tax_number = null, vat_id = null where organization_id = $1',
          [organizationId],
        ),
      ).rejects.toThrow(/practice_billing_profiles_tax_id_present/);
    });

    it('weist eine unplausible IBAN ab', async () => {
      await expect(
        asUser(users.ownerTherapist, SPEICHERN, stammdaten({ iban: 'kein Konto' })),
      ).rejects.toThrow();
    });

    it('haelt wer/wann der Aenderung am Datensatz fest und schreibt keinen Auditeintrag (LOG-EPIC-001)', async () => {
      const vorher = await asPostgres<{ n: number }>(
        "select count(*)::int as n from public.audit_log where outcome = 'success'",
      );
      await asUserCommitted(users.ownerTherapist, SPEICHERN, stammdaten());

      const { rows } = await asPostgres<{ updated_by: string; updated_at: Date | null }>(
        'select updated_by, updated_at from public.practice_billing_profiles where organization_id = $1',
        [organizationId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.updated_by).toBe(users.ownerTherapist);
      expect(rows[0]?.updated_at).not.toBeNull();

      const nachher = await asPostgres<{ n: number }>(
        "select count(*)::int as n from public.audit_log where outcome = 'success'",
      );
      expect(nachher.rows[0]?.n).toBe(vorher.rows[0]?.n);
      // Die Steuernummer steht in keinem Protokoll (ADR-011).
      const { rows: steuernummer } = await asPostgres(
        "select 1 from public.audit_log where context::text like '%86123%'",
      );
      expect(steuernummer).toEqual([]);
    });
  });

  describe('Tabellenrechte', () => {
    it('laesst auch die Inhaberin nicht direkt schreiben (ADR-004)', async () => {
      await expect(
        asUser(
          users.ownerTherapist,
          `update public.practice_billing_profiles set legal_name = 'Direkt'
            where organization_id = $1`,
          [organizationId],
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('Fremde Organisation (ADR-003, R3-025)', () => {
    it('sieht die Stammdaten der Testpraxis nicht und ueberschreibt sie nicht', async () => {
      const fremd = await fremdeOrganisation();

      expect((await asUser(fremd.owner, LESEN)).rows).toEqual([]);

      await asUserCommitted(fremd.owner, SPEICHERN, stammdaten({ legal_name: 'Praxis Woanders' }));

      const { rows } = await asPostgres<{ legal_name: string; organization_id: string }>(
        'select legal_name, organization_id from public.practice_billing_profiles order by legal_name',
      );
      expect(rows).toHaveLength(2);
      const eigene = rows.find((r) => r.organization_id === organizationId);
      expect(eigene?.legal_name).not.toBe('Praxis Woanders');
    });
  });
});
