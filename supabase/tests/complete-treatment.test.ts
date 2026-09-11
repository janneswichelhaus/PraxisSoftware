import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabaseOhneTermine,
} from './helpers/db';

const { users, organizationId, patients } = SEED;

const ABSCHLIESSEN =
  'select public.complete_treatment($1::uuid, $2, $3::timestamptz, $4::timestamptz)';

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

interface Termin {
  id: string;
  status: string;
  updated_at: string;
  completed_at: string | null;
}

interface Notiz {
  id: string;
  status: string;
  content: string;
  updated_at: string;
  finalized_at: string | null;
}

async function termin(status: 'confirmed' | 'completed' | 'cancelled' = 'confirmed') {
  const { rows } = await asPostgres<Termin>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at,
       completed_at, completed_by, cancelled_at, cancelled_by
     ) values (
       $1, $2, $3, $4, 'practice', $5,
       now() - interval '2 hours', now() - interval '1 hour',
       case when $5 = 'completed' then now() end,
       case when $5 = 'completed' then $6::uuid end,
       case when $5 = 'cancelled' then now() end,
       case when $5 = 'cancelled' then $6::uuid end
     ) returning id, status, updated_at::text as updated_at, completed_at`,
    [organizationId, patients.max, STAFF_ANNA, LOCATION, status, users.ownerTherapist],
  );
  return rows[0]!;
}

async function terminLesen(id: string) {
  const { rows } = await asPostgres<Termin>(
    'select id, status, updated_at::text as updated_at, completed_at from public.appointments where id = $1',
    [id],
  );
  return rows[0]!;
}

async function notizLesen(appointmentId: string) {
  const { rows } = await asPostgres<Notiz>(
    `select id, status, content, updated_at::text as updated_at, finalized_at
       from public.treatment_notes
      where appointment_id = $1 and addendum_to_note_id is null`,
    [appointmentId],
  );
  return rows[0] ?? null;
}

/**
 * `updated_at` wird durchgaengig als **Text** gelesen. Ein `Date` in
 * JavaScript kennt nur Millisekunden, PostgreSQL speichert Mikrosekunden: ein
 * zurueckgegebener Zeitstempel waere nach dem Umweg ueber ein Date nicht mehr
 * derselbe, und die Konflikterkennung schluege zu Recht an. Dieselbe
 * Ueberlegung steht im Anwendungscode an `Appointment.updated_at`.
 */

/**
 * Der Abschluss in einem Schritt ist ein zusammengesetzter Schreibvorgang
 * (UX-007). Geprueft wird deshalb nicht nur, dass er das Richtige tut,
 * sondern vor allem, dass er es GANZ oder GAR NICHT tut - ein halber Zustand
 * (finalisierte Dokumentation an einem geplanten Termin) waere genau der
 * Fehler, den PROJECT_PRINCIPLES.md 13 ausschliesst.
 */
describe('complete_treatment', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.treatment_note_versions');
    await asPostgres('delete from public.treatment_notes');
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(ABSCHLIESSEN, [patients.max, 'Text', new Date(), null])).rejects.toThrow(
      /permission denied/,
    );
  });

  it('weist office ab - Dokumentieren ist ein Behandlungsschritt', async () => {
    const t = await termin();
    await expect(
      asUser(users.office, ABSCHLIESSEN, [t.id, 'Synthetischer Text', t.updated_at, null]),
    ).rejects.toThrow(/not allowed to write treatment documentation/);
  });

  it('legt an, finalisiert und schliesst ab - in einem Aufruf', async () => {
    const t = await termin();
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [
      t.id,
      'Synthetischer Behandlungstext',
      t.updated_at,
      null,
    ]);

    const notiz = await notizLesen(t.id);
    expect(notiz).toMatchObject({ status: 'final', content: 'Synthetischer Behandlungstext' });
    expect(notiz!.finalized_at).not.toBeNull();

    const nachher = await terminLesen(t.id);
    expect(nachher.status).toBe('completed');
    expect(nachher.completed_at).not.toBeNull();
  });

  it('schreibt eine Version 1 mit dem abgeschlossenen Stand (ADR-016 Punkt 4)', async () => {
    const t = await termin();
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [
      t.id,
      'Version eins',
      t.updated_at,
      null,
    ]);

    const { rows } = await asPostgres<{ version_no: number; content: string }>(
      `select v.version_no, v.content
         from public.treatment_note_versions v
         join public.treatment_notes t on t.id = v.note_id
        where t.appointment_id = $1`,
      [t.id],
    );
    expect(rows).toEqual([expect.objectContaining({ version_no: 1, content: 'Version eins' })]);
  });

  it('uebernimmt einen bestehenden Entwurf und finalisiert den neuen Text', async () => {
    const t = await termin();
    await asUserCommitted(users.therapist, 'select public.create_treatment_note($1::uuid, $2)', [
      t.id,
      'Erster Entwurf',
    ]);
    const entwurf = await notizLesen(t.id);

    await asUserCommitted(users.therapist, ABSCHLIESSEN, [
      t.id,
      'Ueberarbeiteter Text',
      t.updated_at,
      entwurf!.updated_at,
    ]);

    const notiz = await notizLesen(t.id);
    expect(notiz).toMatchObject({ status: 'final', content: 'Ueberarbeiteter Text' });
  });

  it('weist einen zwischenzeitlich geaenderten Entwurf ab, statt ihn zu ueberschreiben', async () => {
    const t = await termin();
    await asUserCommitted(users.therapist, 'select public.create_treatment_note($1::uuid, $2)', [
      t.id,
      'Fremder Entwurf',
    ]);

    // Der Aufrufer wusste beim Oeffnen nichts von diesem Entwurf.
    await expect(
      asUser(users.therapist, ABSCHLIESSEN, [t.id, 'Mein Text', t.updated_at, null]),
    ).rejects.toThrow(/treatment note was changed meanwhile/);

    expect((await notizLesen(t.id))!.content).toBe('Fremder Entwurf');
  });

  it('weist einen veralteten Terminstand ab und schreibt dann gar nichts', async () => {
    const t = await termin();
    const veraltet = new Date(Date.parse(t.updated_at) - 60_000).toISOString();

    await expect(
      asUser(users.therapist, ABSCHLIESSEN, [t.id, 'Synthetischer Text', veraltet, null]),
    ).rejects.toThrow(/appointment was changed meanwhile/);

    // Entscheidend: die Dokumentation ist NICHT stehen geblieben.
    expect(await notizLesen(t.id)).toBeNull();
    expect((await terminLesen(t.id)).status).toBe('confirmed');
  });

  it('laesst einen leeren Text nicht durch und schreibt dann gar nichts', async () => {
    const t = await termin();
    await expect(
      asUser(users.therapist, ABSCHLIESSEN, [t.id, '   ', t.updated_at, null]),
    ).rejects.toThrow(/documentation must not be empty/);

    expect(await notizLesen(t.id)).toBeNull();
    expect((await terminLesen(t.id)).status).toBe('confirmed');
  });

  it('weist einen abgesagten Termin ab', async () => {
    const t = await termin('cancelled');
    await expect(
      asUser(users.therapist, ABSCHLIESSEN, [t.id, 'Synthetischer Text', t.updated_at, null]),
    ).rejects.toThrow(/cancelled appointment cannot be completed/);
  });

  it('finalisiert am bereits abgeschlossenen Termin nur noch die Dokumentation', async () => {
    const t = await termin('completed');
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [
      t.id,
      'Nachgetragener Text',
      t.updated_at,
      null,
    ]);

    expect((await notizLesen(t.id))!.status).toBe('final');
    expect((await terminLesen(t.id)).status).toBe('completed');
  });

  it('weist eine bereits finalisierte Dokumentation ab', async () => {
    const t = await termin();
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [t.id, 'Erster Text', t.updated_at, null]);
    const nachher = await terminLesen(t.id);
    const notiz = await notizLesen(t.id);

    await expect(
      asUser(users.therapist, ABSCHLIESSEN, [
        t.id,
        'Zweiter Text',
        nachher.updated_at,
        notiz!.updated_at,
      ]),
    ).rejects.toThrow(/treatment note is already final/);
  });

  it('protokolliert dieselben Ereignisse wie die Einzelschritte (ADR-010, ADR-016 Punkt 9)', async () => {
    const t = await termin();
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [
      t.id,
      'Synthetischer Text',
      t.updated_at,
      null,
    ]);

    const { rows } = await asPostgres<{ action: string }>(
      'select action from public.audit_log order by occurred_at, action',
    );
    const aktionen = rows.map((zeile) => zeile.action);
    expect(aktionen).toContain('treatment_note.created');
    expect(aktionen).toContain('treatment_note.finalized');
    expect(aktionen).toContain('appointment.completed');
  });

  it('schreibt bei einem abgewiesenen Aufruf keinen Auditeintrag', async () => {
    const t = await termin();
    await expect(
      asUserCommitted(users.office, ABSCHLIESSEN, [t.id, 'Synthetischer Text', t.updated_at, null]),
    ).rejects.toThrow();

    const { rows } = await asPostgres<{ anzahl: string }>(
      'select count(*)::text as anzahl from public.audit_log',
    );
    expect(rows[0]!.anzahl).toBe('0');
  });
});
