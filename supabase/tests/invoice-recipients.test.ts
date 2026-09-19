import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Rechnungsempfaenger sind eigene Stammdaten (ABR-003a, ADR-009 Punkt 2).
 *
 * Vier Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Die Vorgabe ist die Patientin selbst** - ohne Zeile. Eine hinterlegte
 *     Empfaengerin kann sie ersetzen, und hoechstens eine je Patientin
 *     (ANN-076).
 *   * **Pflegen duerfen owner und office**, die therapeutischen Rollen nicht.
 *   * **Kein Tabellenrecht**: Die Zeile traegt einen Patientenbezug und ist
 *     nur ueber die Funktionen erreichbar (ADR-004).
 *   * **Wer eine Rechnung bekommen hat, bleibt stehen**: Der Empfaenger einer
 *     ausgestellten Rechnung ist Teil ihres Belegs.
 */

const { users, patients } = SEED;

const LISTE = 'select * from public.list_invoice_recipients($1::uuid)';
const SPEICHERN = `select public.save_invoice_recipient(
  $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text,
  $9::text, $10::boolean
) as id`;
const ENTFERNEN = 'select public.delete_invoice_recipient($1::uuid)';

/** Rechnungsempfaenger aus supabase/seed.sql: Betreuung von Petra. */
const BETREUUNG = 'dddddddd-dddd-4ddd-8ddd-000000000001';

function empfaenger(aenderungen: Record<string, unknown> = {}): unknown[] {
  const felder: Record<string, unknown> = {
    id: null,
    patient_id: patients.erika,
    recipient_kind: 'aid_authority',
    name: 'Beihilfestelle Testland',
    street: 'Amtsweg',
    house_number: '5',
    postal_code: '72070',
    city: 'Tuebingen',
    reference: 'BH-2026-0001',
    is_default: false,
    ...aenderungen,
  };

  return [
    felder.id,
    felder.patient_id,
    felder.recipient_kind,
    felder.name,
    felder.street,
    felder.house_number,
    felder.postal_code,
    felder.city,
    felder.reference,
    felder.is_default,
  ];
}

describe('Rechnungsempfaenger', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Lesen', () => {
    it('zeigt die hinterlegte Betreuung des Seeds', async () => {
      const { rows } = await asUser<{ name: string; recipient_kind: string; is_default: boolean }>(
        users.office,
        LISTE,
        [patients.petra],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.recipient_kind).toBe('guardian');
      expect(rows[0]?.is_default).toBe(true);
    });

    it('zeigt fuer eine Patientin ohne Empfaenger nichts - sie zahlt selbst', async () => {
      const { rows } = await asUser(users.office, LISTE, [patients.erika]);
      expect(rows).toHaveLength(0);
    });

    it.each([
      ['Therapeutin', users.therapist],
      ['Teamleitung', users.teamLead],
    ])('weist %s ab (ANN-076)', async (_name, userId) => {
      await expect(asUser(userId, LISTE, [patients.petra])).rejects.toThrow(
        /not allowed to read invoice recipients/,
      );
    });

    it('laesst niemanden direkt in die Tabelle sehen (ADR-004)', async () => {
      await expect(
        asUser(users.ownerTherapist, 'select * from public.invoice_recipients'),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('Pflegen', () => {
    it('legt eine Empfaengerin an', async () => {
      await asUserCommitted(users.office, SPEICHERN, empfaenger());

      const { rows } = await asUser<{ name: string; reference: string }>(users.office, LISTE, [
        patients.erika,
      ]);
      expect(rows[0]?.name).toBe('Beihilfestelle Testland');
      expect(rows[0]?.reference).toBe('BH-2026-0001');
    });

    it('aendert eine bestehende Zeile, statt eine zweite anzulegen', async () => {
      const { rows: neu } = await asUserCommitted<{ id: string }>(
        users.office,
        SPEICHERN,
        empfaenger(),
      );

      await asUserCommitted(
        users.office,
        SPEICHERN,
        empfaenger({ id: neu[0]!.id, name: 'Beihilfestelle Neu' }),
      );

      const { rows } = await asUser<{ name: string }>(users.office, LISTE, [patients.erika]);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('Beihilfestelle Neu');
    });

    it('laesst hoechstens eine Vorgabe je Patientin stehen', async () => {
      await asUserCommitted(users.office, SPEICHERN, empfaenger({ is_default: true }));
      await asUserCommitted(
        users.office,
        SPEICHERN,
        empfaenger({
          name: 'Testversicherung AG',
          recipient_kind: 'private_insurer',
          is_default: true,
        }),
      );

      const { rows } = await asUser<{ name: string; is_default: boolean }>(users.office, LISTE, [
        patients.erika,
      ]);
      expect(rows.filter((zeile) => zeile.is_default)).toHaveLength(1);
      expect(rows.find((zeile) => zeile.is_default)?.name).toBe('Testversicherung AG');
    });

    it('weist die Therapeutin ab', async () => {
      await expect(asUser(users.therapist, SPEICHERN, empfaenger())).rejects.toThrow(
        /not allowed to manage invoice recipients/,
      );
    });

    it('weist eine unbekannte Art ab', async () => {
      await expect(
        asUser(users.office, SPEICHERN, empfaenger({ recipient_kind: 'arbeitgeber' })),
      ).rejects.toThrow();
    });

    it('protokolliert das Anlegen ohne den Namen (ADR-011)', async () => {
      await asUserCommitted(users.office, SPEICHERN, empfaenger());

      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log where action = 'invoice_recipient.created'
          order by occurred_at desc limit 1`,
      );
      expect(rows[0]?.context.recipient_kind).toBe('aid_authority');
      expect(JSON.stringify(rows[0]?.context)).not.toContain('Beihilfestelle');
    });
  });

  describe('Entfernen', () => {
    it('entfernt eine Empfaengerin ohne Rechnung', async () => {
      await asUserCommitted(users.office, ENTFERNEN, [BETREUUNG]);

      const { rows } = await asUser(users.office, LISTE, [patients.petra]);
      expect(rows).toHaveLength(0);
    });

    it('weist die Teamleitung ab', async () => {
      await expect(asUser(users.teamLead, ENTFERNEN, [BETREUUNG])).rejects.toThrow(
        /not allowed to manage invoice recipients/,
      );
    });
  });
});
