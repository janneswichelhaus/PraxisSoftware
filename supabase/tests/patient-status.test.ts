import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, resetDatabase } from './helpers/db';

/**
 * B1 (BEF-151, ANN-510, Auftrag Jannes 14.10.2026): „Nicht in Versorgung“ ist
 * entfallen. Bis dahin schaltete `set_patient_status` eine Akte zwischen
 * 'active' und 'inactive'; die einzige Wirkung war, dass `create_appointment`
 * eine inaktive Akte abwies.
 *
 * Was jetzt gilt und hier festgehalten ist:
 *   * Den Umschalter gibt es fuer niemanden mehr - weder die Serverfunktion
 *     noch ihre Rollenpruefung.
 *   * Die Spalte nimmt nur noch 'active' an; der Datenumzug hat jede Akte
 *     dorthin gestellt.
 *   * Am Tabellenrecht aendert sich nichts: authenticated schreibt weiter nur
 *     ueber Serverfunktionen (ADR-004).
 *   * Jede Akte bleibt fuer die Praxisrollen vollstaendig lesbar und planbar
 *     (create-appointment.test.ts).
 */

const { users, patients } = SEED;

const SETZEN = 'select public.set_patient_status($1::uuid, $2)';

describe('Versorgungsstatus entfaellt (B1, ANN-510)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('kennt set_patient_status nicht mehr - fuer keine Rolle', async () => {
    for (const konto of [
      users.ownerTherapist,
      users.teamLead,
      users.office,
      users.therapist,
      users.patientMax,
    ]) {
      await expect(asUser(konto, SETZEN, [patients.max, 'inactive'])).rejects.toThrow(
        /does not exist/,
      );
    }
    await expect(asAnon(SETZEN, [patients.max, 'inactive'])).rejects.toThrow(
      /does not exist|permission denied/,
    );
  });

  it('kennt auch die Rollenpruefung des Umschalters nicht mehr', async () => {
    const { rows } = await asPostgres(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app')
          and p.proname in ('set_patient_status', 'can_change_patient_status')`,
    );
    expect(rows).toEqual([]);
  });

  it('nimmt in der Spalte nur noch active an', async () => {
    await expect(
      asPostgres("update public.patients set status = 'inactive' where id = $1", [patients.petra]),
    ).rejects.toThrow(/patients_status_active_only/);
    const { rows } = await asPostgres<{ anzahl: string }>(
      "select count(*)::text as anzahl from public.patients where status <> 'active'",
    );
    expect(rows[0]!.anzahl).toBe('0');
  });

  it('gibt authenticated weiterhin kein direktes Schreibrecht', async () => {
    const { rows } = await asPostgres(`
      select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    `);
    expect(rows).toEqual([]);
    await expect(
      asUser(users.ownerTherapist, "update public.patients set status = 'active' where id = $1", [
        patients.max,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it('laesst jede Akte fuer die Praxisrollen vollstaendig lesbar', async () => {
    for (const id of [patients.max, patients.petra]) {
      const { rows } = await asUser<{ family_name: string; status: string }>(
        users.therapist,
        'select family_name, status from public.patient_directory where id = $1',
        [id],
      );
      expect(rows[0]?.family_name).toBeTruthy();
      expect(rows[0]?.status).toBe('active');
    }
  });
});
