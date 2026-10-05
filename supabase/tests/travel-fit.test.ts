import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, fremdeOrganisation, resetDatabase } from './helpers/db';

/**
 * UBK-012: „Passt es?“ für einen geplanten Termin (ANN-238).
 *
 * `check_travel_fit` rechnet mit derselben Rundung wie der Fahrpuffer
 * (§8.1): Luft ist Beginn des Folgetermins minus (Ende plus Fahrzeit,
 * aufgerundet aufs Raster). `get_visit_position` gibt die Koordinate der
 * Patientenadresse für einen neuen Hausbesuch - nur sie.
 */

const { users, patients, organizationId } = SEED;
const FIT = 'select * from public.check_travel_fit($1::jsonb)';
const POSITION = 'select * from public.get_visit_position($1::uuid)';

/** Ortszeit Europe/Berlin am 10.09.2026 (Sommerzeit, UTC+2) als ISO-Zeitpunkt. */
function um(zeit: string): string {
  return `2026-09-10T${zeit}:00+02:00`;
}

interface Ergebnis {
  item_index: number;
  starts_at: Date;
  arrival_earliest_start: Date | null;
  arrival_slack_minutes: number | null;
  next_earliest_start: Date | null;
  departure_slack_minutes: number | null;
}

async function pruefen(items: unknown[], konto: string = users.office): Promise<Ergebnis[]> {
  const { rows } = await asUser<Ergebnis>(konto, FIT, [JSON.stringify(items)]);
  return rows;
}

function hhmm(t: Date | null): string | null {
  return t === null
    ? null
    : t.toLocaleTimeString('de-DE', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
      });
}

describe('check_travel_fit', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('rechnet den Testfall aus §8.1: 09:05-10:05 plus 12 Minuten, Folgetermin 10:30', async () => {
    const [e] = await pruefen([
      {
        index: 0,
        // Der geplante Termin 09:05-10:05 ...
        starts_at: um('09:05'),
        duration_minutes: 60,
        // ... und weiter zu einem Termin um 10:30, 12 Minuten Fahrt.
        next_start: um('10:30'),
        travel_from_seconds: 12 * 60,
      },
    ]);
    // 10:05 + 12 Min. = 10:17, aufgerundet 10:20 - zehn Minuten Luft.
    expect(hhmm(e!.next_earliest_start)).toBe('10:20');
    expect(e!.departure_slack_minutes).toBe(10);
    expect(e!.arrival_slack_minutes).toBeNull();
  });

  it('nennt eine zu knappe Anfahrt negativ und den fruehesten Beginn', async () => {
    const [e] = await pruefen([
      {
        index: 7,
        starts_at: um('10:15'),
        duration_minutes: 45,
        previous_end: um('10:05'),
        travel_to_seconds: 12 * 60,
      },
    ]);
    expect(e!.item_index).toBe(7);
    expect(hhmm(e!.arrival_earliest_start)).toBe('10:20');
    expect(e!.arrival_slack_minutes).toBe(-5);
  });

  it('nimmt ohne festen Beginn den fruehesten nach der Anfahrt (Lueckenfinder)', async () => {
    const [e] = await pruefen([
      {
        index: 1,
        duration_minutes: 60,
        previous_end: um('08:00'),
        travel_to_seconds: 600,
        next_start: um('09:30'),
        travel_from_seconds: 600,
      },
    ]);
    // 08:10 bis 09:10, weiter 10 Minuten: 09:20, zehn Minuten Luft.
    expect(hhmm(e!.starts_at)).toBe('08:10');
    expect(e!.arrival_slack_minutes).toBe(0);
    expect(e!.departure_slack_minutes).toBe(10);
  });

  it('folgt dem Raster der Praxis', async () => {
    await asPostgres(
      'update public.organizations set appointment_grid_minutes = 15 where id = $1',
      [organizationId],
    );
    try {
      const [e] = await pruefen([
        {
          index: 0,
          starts_at: um('10:30'),
          duration_minutes: 30,
          previous_end: um('10:05'),
          travel_to_seconds: 12 * 60,
        },
      ]);
      expect(hhmm(e!.arrival_earliest_start)).toBe('10:30');
      expect(e!.arrival_slack_minutes).toBe(0);
    } finally {
      await asPostgres(
        'update public.organizations set appointment_grid_minutes = 5 where id = $1',
        [organizationId],
      );
    }
  });

  it('laesst eine Seite ohne Fahrzeit leer - nie „passt“', async () => {
    const [e] = await pruefen([
      {
        index: 0,
        starts_at: um('10:30'),
        duration_minutes: 30,
        previous_end: um('10:05'),
        next_start: um('12:00'),
      },
    ]);
    expect(e!.arrival_slack_minutes).toBeNull();
    expect(e!.departure_slack_minutes).toBeNull();
  });

  it.each([
    ['ohne Beginn und ohne Anfahrt', { index: 0, duration_minutes: 30 }],
    ['ohne Dauer', { index: 0, starts_at: '2026-09-10T10:00:00+02:00' }],
    [
      'mit negativer Fahrzeit',
      {
        index: 0,
        duration_minutes: 30,
        starts_at: '2026-09-10T10:00:00+02:00',
        previous_end: '2026-09-10T09:00:00+02:00',
        travel_to_seconds: -1,
      },
    ],
    ['mit Text statt Zeit', { index: 0, duration_minutes: 30, starts_at: 'morgen' }],
    [
      'mit Sekundenbruchteilen - ganze Sekunden wie beim Fahrpuffer',
      {
        index: 0,
        duration_minutes: 30,
        starts_at: '2026-09-10T10:00:00+02:00',
        previous_end: '2026-09-10T09:00:00+02:00',
        travel_to_seconds: 600.5,
      },
    ],
    [
      'mit Text statt Index',
      { index: 'a', duration_minutes: 30, starts_at: '2026-09-10T10:00:00+02:00' },
    ],
  ])('weist einen Eintrag %s ab', async (_, eintrag) => {
    await expect(pruefen([eintrag])).rejects.toMatchObject({ code: '22023' });
  });

  it('nimmt hoechstens 50 Eintraege', async () => {
    const viele = Array.from({ length: 51 }, (_, i) => ({
      index: i,
      starts_at: um('10:00'),
      duration_minutes: 30,
    }));
    await expect(pruefen(viele)).rejects.toMatchObject({ code: '22023' });
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('rechnet fuer %s', async (_, konto) => {
    const zeilen = await pruefen(
      [{ index: 0, starts_at: um('10:00'), duration_minutes: 30 }],
      konto,
    );
    expect(zeilen).toHaveLength(1);
  });

  it.each([
    ['die Trainingsbetreuung', users.trainer],
    ['das Patientenkonto', users.patientMax],
  ])('rechnet nicht fuer %s', async (_, konto) => {
    expect(
      await pruefen([{ index: 0, starts_at: um('10:00'), duration_minutes: 30 }], konto),
    ).toEqual([]);
  });

  it('weist ohne Sitzung und ein Plattformkonto ab', async () => {
    await expect(asUser(null, FIT, ['[]'])).rejects.toMatchObject({ code: '42501' });
    // Ohne Praxisprofil endet schon die Abweisung in einer Ausnahme (ADR-023 Punkt 21).
    await expect(asUser(users.plattformErika, FIT, ['[]'])).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('liest keine Termine und schreibt nichts', async () => {
    const vorher = await asPostgres<{ n: string }>('select count(*) as n from public.appointments');
    await pruefen([{ index: 0, starts_at: um('10:00'), duration_minutes: 30 }]);
    const nachher = await asPostgres<{ n: string }>(
      'select count(*) as n from public.appointments',
    );
    expect(nachher.rows[0]!.n).toBe(vorher.rows[0]!.n);
  });
});

describe('get_visit_position', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(
      `update public.patient_contact_details
          set lat = 48.52, lon = 9.05, geocode_precision = 'address'
        where patient_id = $1`,
      [patients.max],
    );
    await asPostgres(
      `update public.patient_contact_details
          set lat = null, lon = null, geocode_precision = null
        where patient_id = $1`,
      [patients.erika],
    );
  }, 120_000);

  it('gibt die Koordinate der Patientenadresse - und nur sie', async () => {
    const { rows } = await asUser(users.office, POSITION, [patients.max]);
    expect(rows).toEqual([{ lat: 48.52, lon: 9.05 }]);
  });

  it('gibt fuer eine nicht verortete Adresse eine Zeile ohne Koordinate', async () => {
    const { rows } = await asUser(users.therapist, POSITION, [patients.erika]);
    expect(rows).toEqual([{ lat: null, lon: null }]);
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('gibt sie %s', async (_, konto) => {
    const { rows } = await asUser<{ lat: number }>(konto, POSITION, [patients.max]);
    expect(rows[0]!.lat).toBe(48.52);
  });

  it.each([
    ['der Trainingsbetreuung (anderer Leistungsbereich)', users.trainer],
    ['dem Patientenkonto', users.patientMax],
  ])('gibt sie nicht %s', async (_, konto) => {
    const { rows } = await asUser(konto, POSITION, [patients.max]);
    expect(rows).toEqual([]);
  });

  it('gibt sie keinem Plattformkonto, auch nicht fuer eine fremde Person', async () => {
    // Erikas Plattformkonto fragt nach Max: abgewiesen, bevor eine Kennung zählt.
    await expect(asUser(users.plattformErika, POSITION, [patients.max])).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('weist eine fehlende Kennung ab wie eine unbekannte', async () => {
    await expect(asUser(users.office, POSITION, [null])).rejects.toMatchObject({
      code: 'P0002',
    });
  });

  it('findet eine Person einer fremden Praxis nicht', async () => {
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, POSITION, [patients.max])).rejects.toMatchObject({
      code: 'P0002',
    });
    await expect(asUser(users.office, POSITION, [fremd.patient])).rejects.toMatchObject({
      code: 'P0002',
    });
  });
});
