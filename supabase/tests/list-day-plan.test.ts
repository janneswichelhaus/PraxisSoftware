import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, resetDatabaseOhneTermine } from './helpers/db';

const { users, organizationId, patients } = SEED;

const LESEN = 'select * from public.list_day_plan($1::date, $2::uuid)';

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
} as const;

const LOCATION = '33333333-3333-4333-8333-000000000001';
const TAG = '2026-09-10';

interface Zeile {
  id: string;
  patient_id: string;
  appointment_type: string;
  status: string;
  starts_at: string;
  patient_family_name: string;
  location_name: string | null;
  visit_street: string | null;
  visit_house_number: string | null;
  visit_postal_code: string | null;
  visit_city: string | null;
  patient_phone: string | null;
  patient_phone_mobile: string | null;
  home_visit_access_note: string | null;
  special_note: string | null;
  documentation_status: string | null;
  organization_time_zone: string;
}

function lesen(userId: string | null, tag = TAG, staff: string = STAFF.anna) {
  return asUser<Zeile>(userId, LESEN, [tag, staff]);
}

/**
 * Legt einen Termin unmittelbar an - nicht ueber create_appointment.
 *
 * Die Tagesliste muss auch vergangene Tage und abgeschlossene Termine zeigen;
 * beim Anlegen wuerden die zu Recht abgewiesen.
 */
async function termin(opts: {
  tag?: string;
  von: string;
  bis: string;
  staff?: string;
  patient?: string;
  typ?: 'home_visit' | 'practice' | 'video';
  status?: 'confirmed' | 'completed' | 'cancelled';
}): Promise<string> {
  const typ = opts.typ ?? 'home_visit';
  const status = opts.status ?? 'confirmed';
  const hausbesuch = typ === 'home_visit';

  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city,
       completed_at, completed_by, cancelled_at, cancelled_by
     ) values (
       $1, $2, $3, $4, $5, $6,
       (($7::date + $8::time) at time zone 'Europe/Berlin'),
       (($7::date + $9::time) at time zone 'Europe/Berlin'),
       $10, $11, $12, $13,
       case when $6 = 'completed' then now() end,
       case when $6 = 'completed' then $14::uuid end,
       case when $6 = 'cancelled' then now() end,
       case when $6 = 'cancelled' then $14::uuid end
     ) returning id`,
    [
      organizationId,
      opts.patient ?? patients.max,
      opts.staff ?? STAFF.anna,
      typ === 'practice' ? LOCATION : null,
      typ,
      status,
      opts.tag ?? TAG,
      opts.von,
      opts.bis,
      hausbesuch ? 'Beispielstrasse' : null,
      hausbesuch ? '12' : null,
      hausbesuch ? '72070' : null,
      hausbesuch ? 'Tuebingen' : null,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/**
 * Die Tagesliste ist der zweite, engere Lesepfad neben dem Kalender (UX-001).
 * Sie liefert mehr Felder als der Kalender, dafuer nur einen Tag und nur eine
 * Person. Genau diese Zweckbindung wird hier geprueft - sie steht in der
 * Datenbank und nicht in der Oberflaeche (ADR-004).
 */
describe('list_day_plan', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.treatment_notes');
    await asPostgres('delete from public.appointments');
  });

  it('ist fuer anon nicht einmal ausfuehrbar', async () => {
    // Kein execute-Recht statt einer Fehlermeldung aus der Funktion heraus:
    // die Abweisung greift eine Ebene frueher (ADR-004).
    await expect(asAnon(LESEN, [TAG, STAFF.anna])).rejects.toThrow(/permission denied/);
  });

  it('weist ein Patientenkonto ab', async () => {
    await expect(lesen(users.patientMax)).rejects.toThrow(/not allowed to read appointments/);
  });

  it('verlangt Tag und Person - es gibt kein "alle Personen"', async () => {
    await expect(asUser(users.therapist, LESEN, [TAG, null])).rejects.toThrow(
      /date and staff member are required/,
    );
    await expect(asUser(users.therapist, LESEN, [null, STAFF.anna])).rejects.toThrow(
      /date and staff member are required/,
    );
  });

  it('liefert genau den angefragten Kalendertag der angefragten Person', async () => {
    const heute = await termin({ von: '09:00', bis: '10:00' });
    await termin({ tag: '2026-09-11', von: '09:00', bis: '10:00' });
    await termin({ von: '11:00', bis: '12:00', staff: STAFF.jannes });

    const { rows } = await lesen(users.therapist);
    expect(rows.map((zeile) => zeile.id)).toEqual([heute]);
  });

  it('zieht die Tagesgrenze in der Zeitzone der Praxis, nicht in UTC', async () => {
    // 23:30 Ortszeit ist am 10.09. noch derselbe Praxistag, in UTC bereits der
    // 10.09.21:30 - und am Folgetag 00:30 Ortszeit ist es der 11.09.
    await termin({ von: '23:00', bis: '23:30' });
    await termin({ tag: '2026-09-11', von: '00:15', bis: '00:45' });

    const { rows } = await lesen(users.therapist);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.organization_time_zone).toBe('Europe/Berlin');
  });

  it('liefert Adresse, Zugangshinweis und Rufnummern zum Hausbesuch', async () => {
    await termin({ von: '09:00', bis: '10:00', patient: patients.max });

    const { rows } = await lesen(users.therapist);
    expect(rows[0]).toMatchObject({
      visit_street: 'Beispielstrasse',
      visit_house_number: '12',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
      patient_phone: '+49 7071 0000005',
      patient_phone_mobile: '+49 160 0000005',
    });
    expect(rows[0]!.home_visit_access_note).toContain('Klingel');
    expect(rows[0]!.special_note).toContain('Hund');
  });

  it('liefert Zugangshinweis und Besonderheit NICHT zum Praxistermin', async () => {
    await termin({ von: '09:00', bis: '10:00', typ: 'practice', patient: patients.max });

    const { rows } = await lesen(users.therapist);
    expect(rows[0]!.home_visit_access_note).toBeNull();
    expect(rows[0]!.special_note).toBeNull();
    expect(rows[0]!.visit_street).toBeNull();
    expect(rows[0]!.location_name).toBe('Hauptstandort Tuebingen');
  });

  it('zeigt abgesagte und abgeschlossene Termine des Tages weiter an', async () => {
    await termin({ von: '09:00', bis: '10:00', status: 'confirmed' });
    await termin({ von: '10:00', bis: '11:00', status: 'completed' });
    await termin({ von: '11:00', bis: '12:00', status: 'cancelled' });

    const { rows } = await lesen(users.therapist);
    expect(rows.map((zeile) => zeile.status)).toEqual(['confirmed', 'completed', 'cancelled']);
  });

  it('liefert den Dokumentationsstand ohne Inhalt', async () => {
    const id = await termin({ von: '09:00', bis: '10:00', status: 'completed' });
    await asPostgres(
      `insert into public.treatment_notes (organization_id, appointment_id, status, content, created_by, updated_by)
       values ($1, $2, 'draft', 'Synthetischer Entwurf', $3, $3)`,
      [organizationId, id, users.therapist],
    );

    const { rows } = await lesen(users.therapist);
    expect(rows[0]!.documentation_status).toBe('draft');
    // Kein Feld dieser Funktion traegt klinischen Freitext.
    expect(JSON.stringify(rows[0])).not.toContain('Synthetischer Entwurf');
  });

  it('meldet einen Termin ohne Dokumentation als "none"', async () => {
    await termin({ von: '09:00', bis: '10:00', status: 'completed' });
    const { rows } = await lesen(users.therapist);
    expect(rows[0]!.documentation_status).toBe('none');
  });

  it('laesst office die Tagesliste lesen - Terminorganisation ist ihre Aufgabe', async () => {
    await termin({ von: '09:00', bis: '10:00' });
    const { rows } = await lesen(users.office);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.home_visit_access_note).toContain('Klingel');
  });

  it('erlaubt den Blick in den Tag einer Kollegin (Vertretung, 4.2)', async () => {
    await termin({ von: '09:00', bis: '10:00', staff: STAFF.jannes });
    const { rows } = await asUser<Zeile>(users.therapist, LESEN, [TAG, STAFF.jannes]);
    expect(rows).toHaveLength(1);
  });

  it('liefert zu einer Person ohne Termine eine leere Liste statt eines Fehlers', async () => {
    const { rows } = await asUser<Zeile>(users.therapist, LESEN, [TAG, STAFF.olivia]);
    expect(rows).toEqual([]);
  });
});
