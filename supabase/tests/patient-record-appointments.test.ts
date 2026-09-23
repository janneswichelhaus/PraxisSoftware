import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, resetDatabaseOhneTermine } from './helpers/db';

const { users, organizationId, patients } = SEED;

const LESEN =
  'select * from public.list_patient_appointments($1::uuid, $2::boolean, $3::integer, $4::timestamptz, $5::uuid, $6::uuid)';

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const STAFF_JANNES = '55555555-5555-4555-8555-000000000001';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Verordnungen aus dem Seed - dieselben, die die Akte zeigt. */
const VERORDNUNG = {
  maxAusgeschoepft: '88888888-8888-4888-8888-000000000001',
  maxOffen: '88888888-8888-4888-8888-000000000002',
  erikaAlt: '88888888-8888-4888-8888-000000000003',
  erikaFrisch: '88888888-8888-4888-8888-000000000004',
  // Die zweite Bauart im Seed (GRD-001, ADR-020): dieselbe Klammer, aber ohne
  // Verordner:in und ohne klinische Felder.
  erikaSelbstzahler: '88888888-8888-4888-8888-000000000005',
} as const;

interface Zeile {
  id: string;
  starts_at: Date;
  appointment_type: string;
  status: string;
  notification_channels: string[];
  treatment_basis_id: string | null;
  treatment_basis_kind: string | null;
  treatment_basis_issued_on: Date | null;
  organization_time_zone: string;
}

interface Cursor {
  starts_at: Date | null;
  id: string | null;
}

function lesen(
  userId: string | null,
  opts: {
    patient?: string;
    kuenftig?: boolean;
    limit?: number | null;
    cursor?: Cursor;
    verordnung?: string | null;
  } = {},
) {
  return asUser<Zeile>(userId, LESEN, [
    opts.patient ?? patients.max,
    opts.kuenftig ?? false,
    opts.limit === undefined ? 20 : opts.limit,
    opts.cursor?.starts_at ?? null,
    opts.cursor?.id ?? null,
    opts.verordnung ?? null,
  ]);
}

/**
 * Legt einen Termin relativ zu jetzt an - in Stunden, damit "vergangen" und
 * "kuenftig" nicht von einem festen Datum abhaengen, das irgendwann
 * Vergangenheit ist.
 *
 * Gerechnet wird ab der angebrochenen Stunde und nicht ab `now()`: Jeder
 * Aufruf laeuft in einer eigenen Transaktion und damit zu einem etwas anderen
 * `now()`. Zwei "angrenzende" Termine ueberlappten sich dadurch um wenige
 * Millisekunden - und der Ueberschneidungsschutz der Datenbank wies sie
 * zurecht ab.
 */
async function termin(opts: {
  inStunden: number;
  patient?: string;
  status?: 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'documented';
  verordnung?: string;
  person?: string;
}): Promise<string> {
  const status = opts.status ?? 'confirmed';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by, cancelled_at, cancelled_by, cancellation_reason
     ) values (
       $1, $2, $3, $4,
       'practice', $5,
       date_trunc('hour', now()) + make_interval(mins => $6::int),
       date_trunc('hour', now()) + make_interval(mins => $6::int + 60),
       $7,
       case when $5 in ('completed', 'documented') then now() end,
       case when $5 in ('completed', 'documented') then $8::uuid end,
       case when $5 = 'cancelled' then now() end,
       case when $5 = 'cancelled' then $8::uuid end,
       case when $5 = 'cancelled' then 'patient_request' end
     ) returning id`,
    [
      organizationId,
      opts.patient ?? patients.max,
      opts.person ?? STAFF_ANNA,
      LOCATION,
      status,
      Math.round(opts.inStunden * 60),
      opts.verordnung ?? null,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/**
 * Die Terminliste der Akte (AKTE-001).
 *
 * Sie ist die organisatorische Auskunft ueber eine Person in beide Richtungen.
 * Deshalb wird hier drei Dinge geprueft: dass die Richtung stimmt, dass nichts
 * Fremdes und nichts Klinisches mitkommt, und dass der Cursor auch dann
 * traegt, wenn zwei Termine zur selben Sekunde beginnen.
 */
describe('list_patient_appointments', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(LESEN, [patients.max, false, 20, null, null, null])).rejects.toThrow(
      /permission denied/,
    );
  });

  it('weist ein Patientenkonto ab', async () => {
    expect((await lesen(users.patientMax)).rows).toEqual([]);
  });

  it('verlangt eine Patientin und eine sinnvolle Obergrenze', async () => {
    await expect(
      asUser(users.therapist, LESEN, [null, false, 20, null, null, null]),
    ).rejects.toThrow(/patient is required/);
    await expect(lesen(users.therapist, { limit: 0 })).rejects.toThrow(/limit out of range/);
    await expect(lesen(users.therapist, { limit: 51 })).rejects.toThrow(/limit out of range/);
    await expect(lesen(users.therapist, { limit: null })).rejects.toThrow(/limit out of range/);
  });

  it('verlangt den Cursor vollstaendig oder gar nicht', async () => {
    await expect(
      asUser(users.therapist, LESEN, [patients.max, false, 20, new Date(), null, null]),
    ).rejects.toThrow(/cursor is incomplete/);
  });

  it('liefert vergangene Termine, neueste zuerst', async () => {
    const gestern = await termin({ inStunden: -24 });
    const vorhin = await termin({ inStunden: -2 });
    await termin({ inStunden: 24 });

    const { rows } = await lesen(users.therapist);
    expect(rows.map((zeile) => zeile.id)).toEqual([vorhin, gestern]);
  });

  it('liefert kuenftige Termine, naechster zuerst', async () => {
    const spaet = await termin({ inStunden: 72 });
    const frueh = await termin({ inStunden: 24 });
    await termin({ inStunden: -24 });

    const { rows } = await lesen(users.therapist, { kuenftig: true });
    expect(rows.map((zeile) => zeile.id)).toEqual([frueh, spaet]);
  });

  it('zeigt abgesagte Termine - fuer den organisatorischen Streitfall zaehlt gerade das', async () => {
    const abgesagt = await termin({ inStunden: -24, status: 'cancelled' });
    const abgesagtKuenftig = await termin({ inStunden: 24, status: 'cancelled' });

    expect((await lesen(users.therapist)).rows.map((z) => z.id)).toEqual([abgesagt]);
    expect((await lesen(users.therapist, { kuenftig: true })).rows.map((z) => z.id)).toEqual([
      abgesagtKuenftig,
    ]);
  });

  it('zeigt keinen Termin einer anderen Patientin', async () => {
    await termin({ inStunden: -24, patient: patients.erika });
    expect((await lesen(users.therapist)).rows).toEqual([]);
  });

  it('blaettert in beide Richtungen lueckenlos', async () => {
    // Fuenf vergangene Termine, jeweils eine Stunde auseinander.
    const vergangen: string[] = [];
    for (let i = 1; i <= 5; i += 1) vergangen.push(await termin({ inStunden: -i }));

    const erste = await lesen(users.therapist, { limit: 2 });
    expect(erste.rows.map((z) => z.id)).toEqual([vergangen[0], vergangen[1]]);

    const letzte = erste.rows[1]!;
    const zweite = await lesen(users.therapist, {
      limit: 2,
      cursor: { starts_at: letzte.starts_at, id: letzte.id },
    });
    expect(zweite.rows.map((z) => z.id)).toEqual([vergangen[2], vergangen[3]]);
  });

  it('haelt den Cursor auch bei gleicher Startzeit', async () => {
    // Zwei Termine zur selben Sekunde: ohne die id im Cursor faellt einer der
    // beiden beim Blaettern heraus oder kommt doppelt. Zwei behandelnde
    // Personen, weil dieselbe sich nicht ueberschneiden darf.
    const a = await termin({ inStunden: -3 });
    const b = await termin({ inStunden: -3, person: STAFF_JANNES });
    const erwartet = [a, b].sort((x, y) => (x < y ? 1 : -1));

    const erste = await lesen(users.therapist, { limit: 1 });
    expect(erste.rows[0]!.id).toBe(erwartet[0]);

    const zweite = await lesen(users.therapist, {
      limit: 1,
      cursor: { starts_at: erste.rows[0]!.starts_at, id: erste.rows[0]!.id },
    });
    expect(zweite.rows[0]!.id).toBe(erwartet[1]);
  });

  it('filtert auf eine Verordnung und nennt ihr Ausstellungsdatum', async () => {
    const ausSerie = await termin({ inStunden: -24, verordnung: VERORDNUNG.maxOffen });
    await termin({ inStunden: -25 });

    const { rows } = await lesen(users.therapist, { verordnung: VERORDNUNG.maxOffen });
    expect(rows.map((z) => z.id)).toEqual([ausSerie]);
    expect(rows[0]!.treatment_basis_id).toBe(VERORDNUNG.maxOffen);
    expect(rows[0]!.treatment_basis_issued_on).toEqual(new Date('2026-06-18T00:00:00'));

    // Ohne Filter stehen beide da, der freie Termin ohne Verordnungsbezug.
    const alle = await lesen(users.therapist);
    expect(alle.rows.length).toBe(2);
    expect(alle.rows.some((z) => z.treatment_basis_id === null)).toBe(true);
  });

  it('liefert den gueltigen Mitteilungsvermerk und keine Anschrift', async () => {
    const id = await termin({ inStunden: -24 });
    await asPostgres(
      `insert into public.appointment_notifications (organization_id, appointment_id, channel, notified_by)
       values ($1, $2, 'phone', $3)`,
      [organizationId, id, users.ownerTherapist],
    );

    const { rows } = await lesen(users.therapist);
    expect(rows[0]!.notification_channels).toEqual(['phone']);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'appointment_type',
      'ends_at',
      'id',
      'notification_channels',
      'organization_time_zone',
      'staff_family_name',
      'staff_given_name',
      'starts_at',
      'status',
      // CAL-022: die Deckung ist ein Wahrheitswert, kein Inhalt - die Liste
      // bleibt rein organisatorisch.
      'treatment_basis_covered',
      'treatment_basis_id',
      'treatment_basis_issued_on',
      'treatment_basis_kind',
    ]);
  });

  it('laesst office lesen - Terminorganisation ist ihre Aufgabe', async () => {
    await termin({ inStunden: -24 });
    expect((await lesen(users.office)).rows.length).toBe(1);
  });
});

/**
 * Einheiten und Termine je Verordnung (AKTE-002).
 *
 * Die Funktion existiert, damit die Akte beides NEBENEINANDER zeigen kann,
 * ohne es zu vermischen: Leistungseinheiten kommen aus den Positionen,
 * Termine von den Terminen. Genau das pruefen die Faelle hier.
 */
describe('list_patient_treatment_basis_slots', () => {
  const SLOTS = 'select * from public.list_patient_treatment_basis_slots($1::uuid)';

  interface SlotZeile {
    treatment_basis_id: string;
    prescribed: number;
    used: number;
    planned: number;
    upcoming: number;
    remaining: number;
  }

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  function slots(userId: string | null, patient: string = patients.max) {
    return asUser<SlotZeile>(userId, SLOTS, [patient]);
  }

  it('ist fuer anon nicht ausfuehrbar und weist ein Patientenkonto ab', async () => {
    await expect(asAnon(SLOTS, [patients.max])).rejects.toThrow(/permission denied/);
    expect((await slots(users.patientMax)).rows).toEqual([]);
  });

  it('liefert je Verordnung eine Zeile, neueste zuerst', async () => {
    const { rows } = await slots(users.office);
    expect(rows.map((z) => z.treatment_basis_id)).toEqual([
      VERORDNUNG.maxOffen,
      VERORDNUNG.maxAusgeschoepft,
    ]);
  });

  it('zaehlt Einheiten aus den Positionen und Termine von den Terminen', async () => {
    // Verordnung mit 10 verordneten und 7 genutzten Einheiten (Seed).
    await termin({ inStunden: -24, verordnung: VERORDNUNG.maxOffen });
    await termin({ inStunden: 24, verordnung: VERORDNUNG.maxOffen });
    await termin({ inStunden: 48, verordnung: VERORDNUNG.maxOffen });
    // Abgesagt zaehlt nicht: der Platz im Kontingent ist wieder frei.
    await termin({ inStunden: 72, verordnung: VERORDNUNG.maxOffen, status: 'cancelled' });
    // Ein Termin ohne Verordnungsbezug beruehrt keine der Zahlen.
    await termin({ inStunden: 96 });

    const { rows } = await slots(users.office);
    const offen = rows.find((z) => z.treatment_basis_id === VERORDNUNG.maxOffen)!;

    expect(offen.prescribed).toBe(10);
    expect(offen.used).toBe(7);
    expect(offen.planned).toBe(3);
    expect(offen.upcoming).toBe(2);
    // Offen ist verordnet abzueglich des GROESSEREN von genutzt und verplant
    // (ANN-038) - hier also 10 - 7.
    expect(offen.remaining).toBe(3);
  });

  it('rechnet verplante Termine gegen das offene Kontingent, sobald sie ueberwiegen', async () => {
    for (let i = 1; i <= 9; i += 1) {
      await termin({ inStunden: i * 24, verordnung: VERORDNUNG.maxOffen });
    }

    const { rows } = await slots(users.office);
    const offen = rows.find((z) => z.treatment_basis_id === VERORDNUNG.maxOffen)!;
    expect(offen.used).toBe(7);
    expect(offen.planned).toBe(9);
    expect(offen.remaining).toBe(1);
  });

  it('meldet die ausgeschoepfte Verordnung mit null offenen Terminen', async () => {
    // Seit VER-EPIC-002 zaehlen alle drei Zahlen **Termine** (ANN-064): Die
    // Verordnung hat zehn moegliche Termine mit zwei Heilmitteln - nicht
    // zwanzig, weil zwei Positionen darunter haengen.
    const { rows } = await slots(users.office);
    const ausgeschoepft = rows.find((z) => z.treatment_basis_id === VERORDNUNG.maxAusgeschoepft)!;
    expect(ausgeschoepft.prescribed).toBe(10);
    expect(ausgeschoepft.used).toBe(10);
    expect(ausgeschoepft.remaining).toBe(0);
  });

  it('zeigt keine Verordnung einer anderen Patientin', async () => {
    const { rows } = await slots(users.office, patients.erika);
    expect(rows.map((z) => z.treatment_basis_id).sort()).toEqual(
      [VERORDNUNG.erikaFrisch, VERORDNUNG.erikaAlt, VERORDNUNG.erikaSelbstzahler].sort(),
    );
  });
});
