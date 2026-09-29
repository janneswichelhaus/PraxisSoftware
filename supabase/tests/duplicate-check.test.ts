import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asUser, fremdeOrganisation, resetDatabase } from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Dublettenpruefung beim Anlegen (PRX-015, ANN-145): gleicher Nachname und
 * (gleiches Geburtsdatum oder gleicher Vorname), in der Suchform.
 */
const { users, patients } = SEED;

const FINDEN =
  'select id, given_name, family_name from public.find_possible_duplicates($1, $2, $3::date)';

async function finden(
  vorname: string,
  nachname: string,
  geburt: string | null = null,
  konto: string = users.office,
): Promise<string[]> {
  const { rows } = await asUser<{ id: string }>(konto, FINDEN, [vorname, nachname, geburt]);
  return rows.map((r) => r.id);
}

describe('find_possible_duplicates (PRX-015)', () => {
  let geburtMax: string;

  beforeAll(async () => {
    await resetDatabase();
    const { rows } = await asUser<{ date_of_birth: string }>(
      users.ownerTherapist,
      `select to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth from public.patient_directory where id = $1`,
      [patients.max],
    );
    geburtMax = rows[0]!.date_of_birth;
  }, 120_000);

  it('findet gleichen Vor- und Nachnamen, auch in anderer Schreibung', async () => {
    expect(await finden('Max', 'Mustermann')).toContain(patients.max);
    expect(await finden(' max ', 'MUSTERMANN')).toContain(patients.max);
  });

  it('findet gleichen Nachnamen mit gleichem Geburtsdatum, auch bei anderem Vornamen', async () => {
    expect(await finden('Maximilian', 'Mustermann', geburtMax)).toContain(patients.max);
  });

  it('schweigt bei gleichem Nachnamen ohne zweites Merkmal', async () => {
    expect(await finden('Maximilian', 'Mustermann')).not.toContain(patients.max);
    expect(await finden('Maximilian', 'Mustermann', '1901-01-01')).not.toContain(patients.max);
  });

  it('antwortet ohne Nachnamen gar nicht', async () => {
    expect(await finden('Max', '  ')).toEqual([]);
  });

  it('endet an der eigenen Praxis', async () => {
    const fremd = await fremdeOrganisation();
    expect(await finden('Max', 'Mustermann', null, fremd.owner)).toEqual([]);
    expect(await finden('Peter', 'Fremdpatient')).toEqual([]);
  });

  it('antwortet allen vier Praxisrollen', async () => {
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      expect(await finden('Max', 'Mustermann', null, konto), konto).toContain(patients.max);
    }
  });

  it('weist Trainingsbetreuung und Patientenkonto protokolliert ab (G6b)', async () => {
    for (const konto of [users.trainer, users.patientMax]) {
      await erwarteAbgewiesenenLeseversuch(
        konto,
        FINDEN,
        ['Max', 'Mustermann', null],
        'patient_directory.read',
      );
    }
  });

  it('ist ohne Session und fuer anon nicht aufrufbar', async () => {
    await expect(asUser(null, FINDEN, ['Max', 'Mustermann', null])).rejects.toThrow(
      /not authenticated/,
    );
    await expect(asAnon(FINDEN, ['Max', 'Mustermann', null])).rejects.toThrow(/permission denied/i);
  });
});
