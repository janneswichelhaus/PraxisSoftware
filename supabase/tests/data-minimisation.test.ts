import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asUser, resetDatabase } from './helpers/db';

const { users, patients } = SEED;

/**
 * Datenminimierung nach der Aufteilung von persons.
 *
 * Kernaussage: Der Zugriff auf persons allein gibt niemandem mehr private
 * Daten. Kontakt- und Adressdaten haengen am Rollendatensatz und werden dort
 * getrennt freigegeben.
 */
describe('persons ist auf den Identitaetskern reduziert', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('gibt ueber persons keine Geburts-, Kontakt- oder Adressdaten heraus', async () => {
    const { rows } = await asUser<Record<string, unknown>>(
      users.office,
      'select * from public.persons limit 1',
    );
    const spalten = Object.keys(rows[0] ?? {});
    for (const feld of ['date_of_birth', 'email', 'phone', 'street', 'postal_code', 'city']) {
      expect(spalten).not.toContain(feld);
    }
  });
});

describe('Patientenkontaktdaten', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('sind fuer das Office lesbar - Terminorganisation braucht sie (4.3)', async () => {
    const { rows } = await asUser<{ city: string | null; phone: string | null }>(
      users.office,
      'select city, phone from public.patient_contact_details where patient_id = $1',
      [patients.max],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.city).toBe('Tuebingen');
    expect(rows[0]?.phone).toBe('+49 7071 0000005');
  });

  it('sind fuer therapist und team_lead lesbar', async () => {
    for (const user of [users.therapist, users.teamLead]) {
      const { rows } = await asUser(
        user,
        'select patient_id from public.patient_contact_details order by patient_id',
      );
      expect(rows).toHaveLength(3);
    }
  });

  it('sind fuer Patient:innen nur im eigenen Kontext lesbar', async () => {
    const { rows } = await asUser<{ patient_id: string }>(
      users.patientMax,
      'select patient_id from public.patient_contact_details',
    );
    expect(rows.map((r) => r.patient_id)).toEqual([patients.max]);
  });

  it('sind ohne Session nicht lesbar', async () => {
    expect(
      (await asUser(null, 'select patient_id from public.patient_contact_details')).rows,
    ).toEqual([]);
    await expect(asAnon('select patient_id from public.patient_contact_details')).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('Mitarbeiter-Privatdaten', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  const alle = 'select staff_member_id from public.staff_private_details order by staff_member_id';

  it('sind fuer das Office NICHT lesbar - ausser den eigenen', async () => {
    // Olivia ist selbst Mitarbeiterin; ihr eigener Datensatz bleibt sichtbar.
    // Entscheidend ist, dass die Office-Rolle keinen Zugriff auf fremde
    // Privatdaten verschafft.
    const { rows } = await asUser<{ staff_member_id: string }>(users.office, alle);
    expect(rows.map((r) => r.staff_member_id)).toEqual(['55555555-5555-4555-8555-000000000003']);

    const { rows: fremd } = await asUser(
      users.office,
      'select staff_member_id from public.staff_private_details where staff_member_id <> $1',
      ['55555555-5555-4555-8555-000000000003'],
    );
    expect(fremd).toEqual([]);
  });

  it('sind fuer therapist NICHT lesbar - auch nicht die eigenen Kolleg:innen', async () => {
    const { rows } = await asUser(users.therapist, alle);
    // Anna sieht ausschliesslich ihren eigenen Datensatz.
    expect(rows).toHaveLength(1);
    const { rows: fremd } = await asUser(
      users.therapist,
      'select staff_member_id from public.staff_private_details where staff_member_id <> $1',
      ['55555555-5555-4555-8555-000000000002'],
    );
    expect(fremd).toEqual([]);
  });

  it('sind fuer team_lead NICHT lesbar - Einsatzplanung begruendet keinen Zugriff', async () => {
    const { rows } = await asUser<{ staff_member_id: string }>(users.teamLead, alle);
    expect(rows.map((r) => r.staff_member_id)).toEqual(['55555555-5555-4555-8555-000000000004']);
  });

  it('sind fuer owner vollstaendig lesbar - definierte administrative Berechtigung', async () => {
    const { rows } = await asUser(users.ownerTherapist, alle);
    expect(rows).toHaveLength(4);
  });

  it('sind fuer die betroffene Person selbst lesbar', async () => {
    const { rows } = await asUser<{ private_email: string }>(
      users.office,
      'select private_email from public.staff_private_details where staff_member_id = $1',
      ['55555555-5555-4555-8555-000000000003'],
    );
    expect(rows[0]?.private_email).toBe('olivia.privat@beispiel.invalid');
  });

  it('sind fuer Patient:innen nicht lesbar', async () => {
    expect((await asUser(users.patientMax, alle)).rows).toEqual([]);
  });
});

describe('Dienstliche Erreichbarkeit', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('steht Praxisrollen zur Verfuegung, ohne Privatdaten preiszugeben', async () => {
    const { rows } = await asUser<{ work_email: string | null }>(
      users.office,
      'select work_email from public.staff_members order by work_email',
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]?.work_email).toBe('anna.beispiel@praxis.invalid');
  });

  it('bleibt Patient:innen verborgen', async () => {
    expect(
      (await asUser(users.patientMax, 'select work_email from public.staff_members')).rows,
    ).toEqual([]);
  });
});

describe('Patientensicht patient_directory', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('buendelt Name und Kontaktdaten fuer berechtigte Rollen', async () => {
    const { rows } = await asUser<{ family_name: string; city: string | null }>(
      users.office,
      'select family_name, city from public.patient_directory where id = $1',
      [patients.max],
    );
    expect(rows[0]?.family_name).toBe('Mustermann');
    expect(rows[0]?.city).toBe('Tuebingen');
  });

  it('zeigt Patient:innen ausschliesslich den eigenen Datensatz', async () => {
    const { rows } = await asUser<{ id: string }>(
      users.patientErika,
      'select id from public.patient_directory',
    );
    expect(rows.map((r) => r.id)).toEqual([patients.erika]);
  });

  it('erweitert die Rechte der Basistabellen nicht', async () => {
    expect((await asUser(null, 'select id from public.patient_directory')).rows).toEqual([]);
    await expect(asAnon('select id from public.patient_directory')).rejects.toThrow(
      /permission denied/i,
    );
  });
});
