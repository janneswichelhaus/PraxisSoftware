import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Zustandsautomat des Termins (CAL-008, ADR-018).
 *
 * Diese Datei prueft den Automaten als Ganzes: welche Werte es gibt, welche
 * Uebergaenge moeglich sind und - vor allem - welche nicht. Die einzelnen
 * Vorgaenge haben daneben ihre eigenen Dateien (create-appointment,
 * change-appointment, complete-appointment); hier steht, was erst im
 * Zusammenspiel sichtbar wird.
 *
 * Die Zustaende, die heute noch keinen Schreibpfad haben, werden fuer den Test
 * direkt als postgres gesetzt. Das ist kein Schlupfloch der Anwendung: die
 * Rolle `authenticated` hat auf public.appointments ausschliesslich SELECT,
 * jeder Wechsel laeuft ueber eine SECURITY-DEFINER-Funktion. Der Test stellt
 * damit einen Zustand her, den die Anwendung spaeter selbst erzeugt, und
 * prueft, dass die Schreibpfade ihn korrekt abweisen.
 */

const { users, patients } = SEED;

const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const AENDERN =
  'select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, $4, $5::date, $6::time, $7::time, $8::uuid, true) as id';
const ABSAGEN =
  'select public.cancel_appointment($1::uuid, $2::timestamptz, $3, $4::date, $5::time) as id';
const ABSCHLIESSEN = 'select public.complete_appointment($1::uuid, $2::timestamptz) as id';
const OEFFNEN = 'select public.reopen_appointment($1::uuid, $2::timestamptz) as id';
const NICHT_ANGETROFFEN = 'select public.record_no_show($1::uuid, $2::timestamptz) as id';
const DOKUMENTIEREN = 'select public.create_treatment_note($1::uuid, $2) as id';

const ANNA = '55555555-5555-4555-8555-000000000002';

function tagInTagen(tage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const TAG = tagInTagen(70);

interface Termin {
  id: string;
  updated_at: string;
}

async function stand(id: string): Promise<Termin> {
  const { rows } = await asPostgres<{ id: string; updated_at: string }>(
    'select id, to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at from public.appointments where id = $1',
    [id],
  );
  return rows[0]!;
}

async function zustand(id: string): Promise<string> {
  const { rows } = await asPostgres<{ status: string }>(
    'select status from public.appointments where id = $1',
    [id],
  );
  return rows[0]!.status;
}

async function anlegen(von = '09:00', bis = '10:00'): Promise<Termin> {
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
    patients.max,
    ANNA,
    'video',
    TAG,
    von,
    bis,
    null,
  ]);
  return stand(rows[0]!.id);
}

/** Setzt einen Zustand, den heute noch kein Schreibpfad erzeugt. */
async function zustandSetzen(id: string, status: string): Promise<Termin> {
  await asPostgres(
    `update public.appointments
        set status = $2,
            completed_at = case when $2 in ('completed', 'documented') then coalesce(completed_at, now()) else completed_at end,
            completed_by = case when $2 = 'completed' then coalesce(completed_by, $3::uuid) else completed_by end,
            updated_at = now()
      where id = $1`,
    [id, status, users.therapist],
  );
  return stand(id);
}

describe('Wertebereich des Terminzustands (ADR-018 Punkt 1)', () => {
  beforeAll(resetDatabase);

  it('laesst genau die sechs in V1 erreichbaren Werte zu', async () => {
    const { rows } = await asPostgres<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint where conname = 'appointments_status_check'`,
    );
    const definition = rows[0]!.definition;
    for (const wert of [
      'confirmed',
      'cancelled',
      'no_show',
      'completed',
      'documented',
      'invoiced',
    ]) {
      expect(definition).toContain(`'${wert}'`);
    }
  });

  it('kennt angefragt und vorgemerkt nicht - ein Wert ohne Schreiber waere Vorbau (ADR-014)', async () => {
    const { rows } = await asPostgres<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint where conname = 'appointments_status_check'`,
    );
    expect(rows[0]!.definition).not.toContain("'requested'");
    expect(rows[0]!.definition).not.toContain("'tentative'");
  });

  it('weist einen unbekannten Wert auch direkt an der Tabelle ab', async () => {
    const termin = await anlegen();
    await expect(
      asPostgres('update public.appointments set status = $2 where id = $1', [
        termin.id,
        'requested',
      ]),
    ).rejects.toThrow(/appointments_status_check/);
  });

  it('legt einen neuen Termin als bestaetigt an', async () => {
    const termin = await anlegen('11:00', '12:00');
    expect(await zustand(termin.id)).toBe('confirmed');
  });

  it('traegt confirmed als Standard der Spalte', async () => {
    const { rows } = await asPostgres<{ default_wert: string | null }>(
      `select column_default as default_wert
         from information_schema.columns
        where table_schema = 'public' and table_name = 'appointments' and column_name = 'status'`,
    );
    expect(rows[0]!.default_wert).toContain("'confirmed'");
  });
});

describe('Uebergaenge ohne Rueckweg (ADR-018 Punkt 2)', () => {
  beforeEach(resetDatabase);

  it('nimmt eine Absage nicht zurueck - auch nicht ueber das Wiederoeffnen', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'other',
      null,
      null,
    ]);
    const abgesagt = await stand(termin.id);

    await expect(asUser(users.office, OEFFNEN, [abgesagt.id, abgesagt.updated_at])).rejects.toThrow(
      /cannot be reopened/,
    );
    expect(await zustand(termin.id)).toBe('cancelled');
  });

  it('oeffnet einen dokumentierten Termin nicht wieder - korrigiert wird in der Dokumentation', async () => {
    const termin = await anlegen();
    const dokumentiert = await zustandSetzen(termin.id, 'documented');

    await expect(
      asUser(users.office, OEFFNEN, [dokumentiert.id, dokumentiert.updated_at]),
    ).rejects.toThrow(/not completed/);
    expect(await zustand(termin.id)).toBe('documented');
  });

  it('aendert einen dokumentierten Termin nicht', async () => {
    const termin = await anlegen();
    const dokumentiert = await zustandSetzen(termin.id, 'documented');

    await expect(
      asUser(users.office, AENDERN, [
        dokumentiert.id,
        dokumentiert.updated_at,
        ANNA,
        'video',
        TAG,
        '13:00',
        '14:00',
        null,
      ]),
    ).rejects.toThrow(/documented appointment cannot be changed/);
  });

  it('sagt einen dokumentierten Termin nicht ab', async () => {
    const termin = await anlegen();
    const dokumentiert = await zustandSetzen(termin.id, 'documented');

    await expect(
      asUser(users.office, ABSAGEN, [
        dokumentiert.id,
        dokumentiert.updated_at,
        'other',
        null,
        null,
      ]),
    ).rejects.toThrow(/documented appointment cannot be changed/);
  });

  it('schliesst einen dokumentierten Termin nicht noch einmal ab', async () => {
    const termin = await anlegen();
    const dokumentiert = await zustandSetzen(termin.id, 'documented');

    await expect(
      asUser(users.office, ABSCHLIESSEN, [dokumentiert.id, dokumentiert.updated_at]),
    ).rejects.toThrow(/already completed/);
  });

  it('aendert einen abgerechneten Termin nicht', async () => {
    const termin = await anlegen();
    const abgerechnet = await zustandSetzen(termin.id, 'invoiced');

    await expect(
      asUser(users.office, AENDERN, [
        abgerechnet.id,
        abgerechnet.updated_at,
        ANNA,
        'video',
        TAG,
        '13:00',
        '14:00',
        null,
      ]),
    ).rejects.toThrow(/documented appointment cannot be changed/);
  });
});

describe('Zeitraum: nur die Absage gibt ihn frei', () => {
  beforeEach(resetDatabase);

  it('haelt den Zeitraum eines dokumentierten Termins belegt', async () => {
    const termin = await anlegen();
    await zustandSetzen(termin.id, 'documented');

    await expect(
      asUser(users.office, ANLEGEN, [patients.erika, ANNA, 'video', TAG, '09:30', '10:30', null]),
    ).rejects.toThrow(/overlaps/);
  });

  it('gibt den Zeitraum nach einer Absage frei', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'other',
      null,
      null,
    ]);

    const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
      patients.erika,
      ANNA,
      'video',
      TAG,
      '09:00',
      '10:00',
      null,
    ]);
    expect(rows[0]!.id).toBeTruthy();
  });
});

describe('Statusfilter des Kalenderlesepfads', () => {
  beforeEach(resetDatabase);

  const LESEN =
    'select id, status from public.list_appointments($1::date, $2::date, null, null, $3)';

  it('zeigt unter "active" alles ausser der Absage', async () => {
    const bestaetigt = await anlegen('09:00', '10:00');
    const dokumentiert = await anlegen('11:00', '12:00');
    await zustandSetzen(dokumentiert.id, 'documented');
    const abgesagt = await anlegen('13:00', '14:00');
    await asUserCommitted(users.office, ABSAGEN, [
      abgesagt.id,
      abgesagt.updated_at,
      'other',
      null,
      null,
    ]);

    const { rows } = await asUser<{ id: string }>(users.office, LESEN, [
      TAG,
      tagInTagen(71),
      'active',
    ]);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(bestaetigt.id);
    expect(ids).toContain(dokumentiert.id);
    expect(ids).not.toContain(abgesagt.id);
  });

  it('fasst unter "done" die drei erledigten Zustaende zusammen', async () => {
    const bestaetigt = await anlegen('09:00', '10:00');
    const dokumentiert = await anlegen('11:00', '12:00');
    await zustandSetzen(dokumentiert.id, 'documented');
    const abgeschlossen = await anlegen('13:00', '14:00');
    await zustandSetzen(abgeschlossen.id, 'completed');

    const { rows } = await asUser<{ id: string }>(users.office, LESEN, [
      TAG,
      tagInTagen(71),
      'done',
    ]);
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([dokumentiert.id, abgeschlossen.id]));
    expect(ids).not.toContain(bestaetigt.id);
  });

  it('weist einen unbekannten Filterwert ab', async () => {
    await expect(asUser(users.office, LESEN, [TAG, tagInTagen(71), 'requested'])).rejects.toThrow(
      /unknown status filter/,
    );
  });
});

describe('Nicht angetroffen (CAL-008c, ADR-018 Punkt 4)', () => {
  beforeEach(resetDatabase);

  async function zeile(id: string) {
    const { rows } = await asPostgres<Record<string, unknown>>(
      'select * from public.appointments where id = $1',
      [id],
    );
    return rows[0];
  }

  it.each([
    ['owner', 'ownerTherapist'],
    ['therapist', 'therapist'],
    ['team_lead', 'teamLead'],
    ['office', 'office'],
  ] as const)('erlaubt %s den Vermerk', async (_rolle, schluessel) => {
    const termin = await anlegen();
    await asUserCommitted(users[schluessel], NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);
    expect(await zustand(termin.id)).toBe('no_show');
  });

  it('haelt Zeitpunkt und Person fest - und keine Gebuehr', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.therapist, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    expect(await zeile(termin.id)).toMatchObject({
      status: 'no_show',
      no_show_recorded_by: users.therapist,
      // ADR-018 Fassung 2 Punkt 8: Aus dem Vermerk allein entsteht keine
      // Gebuehr. Die Regel dafuer ist offen (E14).
      fee_basis: null,
    });
    expect((await zeile(termin.id))?.no_show_recorded_at).not.toBeNull();
  });

  it('verlangt KEINE Entscheidung ueber eine Gebuehr - ein Tap genuegt', async () => {
    const termin = await anlegen();

    // Bis ADR-018 Fassung 1 war das Ausfallhonorar-Kennzeichen hier eine
    // Pflichtangabe. Jannes hat das am 2026-09-12 geaendert: Das Abhaken vor
    // der Tuer darf keine Entscheidung verlangen, fuer die es noch gar keine
    // Regel gibt.
    await asUserCommitted(users.office, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);
    expect(await zustand(termin.id)).toBe('no_show');
  });

  it('protokolliert appointment.no_show ohne Gebuehrenangabe', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'appointment.no_show' and subject_id = $1`,
      [termin.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.context).toMatchObject({ surface: 'web' });
    // Ein Schluessel, der immer `false` traegt, waere eine Zusicherung, die
    // niemand gegeben hat.
    expect(rows[0]?.context).not.toHaveProperty('fee');
  });

  it('vermerkt einen abgesagten Termin nicht', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'other',
      null,
      null,
    ]);
    const abgesagt = await stand(termin.id);

    await expect(
      asUser(users.office, NICHT_ANGETROFFEN, [abgesagt.id, abgesagt.updated_at]),
    ).rejects.toThrow(/cancelled appointment cannot be recorded as no-show/);
  });

  it('vermerkt einen abgeschlossenen Termin nicht ohne Wiederoeffnen', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, ABSCHLIESSEN, [termin.id, termin.updated_at]);
    const fertig = await stand(termin.id);

    await expect(
      asUser(users.office, NICHT_ANGETROFFEN, [fertig.id, fertig.updated_at]),
    ).rejects.toThrow(/must be reopened first/);
  });

  it('vermerkt keinen Termin, an dem eine Dokumentation haengt', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.therapist, DOKUMENTIEREN, [termin.id, 'Behandlung durchgefuehrt.']);
    const dokumentiert = await stand(termin.id);

    await expect(
      asUser(users.office, NICHT_ANGETROFFEN, [dokumentiert.id, dokumentiert.updated_at]),
    ).rejects.toThrow(/documented appointment cannot be recorded as no-show/);
  });

  it('laesst an einem vermerkten Termin keine Dokumentation zu', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    await expect(asUser(users.therapist, DOKUMENTIEREN, [termin.id, 'Nachtrag.'])).rejects.toThrow(
      /no-show appointment cannot be documented/,
    );
  });

  it('oeffnet den Vermerk wieder und raeumt seine Felder ab', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);
    const vermerkt = await stand(termin.id);

    await asUserCommitted(users.office, OEFFNEN, [vermerkt.id, vermerkt.updated_at]);

    expect(await zeile(termin.id)).toMatchObject({
      status: 'confirmed',
      no_show_recorded_at: null,
      no_show_recorded_by: null,
      fee_basis: null,
    });
  });

  it('haelt den Zeitraum belegt - die Person ist hingefahren', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    await expect(
      asUser(users.office, ANLEGEN, [patients.erika, ANNA, 'video', TAG, '09:30', '10:30', null]),
    ).rejects.toThrow(/overlaps/);
  });

  it('weist ein Patientenkonto ab', async () => {
    const termin = await anlegen();
    await expect(
      asUser(users.patientMax, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]),
    ).rejects.toThrow(/not allowed to record no-shows/);
  });

  it('weist einen unangemeldeten Aufruf ab', async () => {
    const termin = await anlegen();
    await expect(asAnon(NICHT_ANGETROFFEN, [termin.id, termin.updated_at])).rejects.toThrow(
      /permission denied|not authenticated/i,
    );
  });

  it('weist einen veralteten Stand ab', async () => {
    const termin = await anlegen();
    await asUserCommitted(users.office, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    await expect(
      asUser(users.office, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]),
    ).rejects.toThrow(/already recorded as no-show/);
  });
});

describe('Dokumentiert: gesetzt, nicht abgeleitet (CAL-008d, ADR-018 Punkt 3)', () => {
  beforeEach(resetDatabase);

  const FINALISIEREN = 'select public.finalize_treatment_note($1::uuid, $2::timestamptz) as id';
  const NACHTRAG = 'select public.create_treatment_note_addendum($1::uuid, $2) as id';
  const KORREKTUR = 'select public.revise_treatment_note($1::uuid, $2::timestamptz, $3, $4) as id';

  async function notizStand(noteId: string): Promise<string> {
    const { rows } = await asPostgres<{ updated_at: string }>(
      'select to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at from public.treatment_notes where id = $1',
      [noteId],
    );
    return rows[0]!.updated_at;
  }

  /** Schreibt einen Entwurf und gibt dessen Kennung zurueck. */
  async function entwurf(terminId: string, text = 'Synthetischer Befund.'): Promise<string> {
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, DOKUMENTIEREN, [
      terminId,
      text,
    ]);
    return rows[0]!.id;
  }

  /**
   * Die Invariante beider Richtungen ueber ALLE Termine der Datenbank.
   *
   * Absichtlich nicht ueber einen einzelnen Termin: Ein Test, der nur den
   * gerade angefassten Satz prueft, uebersieht genau den Fall, in dem ein
   * anderer Pfad still etwas gesetzt hat.
   */
  async function invarianteGilt(): Promise<boolean> {
    const { rows } = await asPostgres<{ abweichungen: string }>(
      `select count(*)::text as abweichungen
         from public.appointments a
        where (a.status = 'documented') is distinct from exists (
                select 1 from public.treatment_notes t
                 where t.appointment_id = a.id
                   and t.addendum_to_note_id is null
                   and t.status = 'final'
              )`,
    );
    return rows[0]!.abweichungen === '0';
  }

  it('hebt einen abgeschlossenen Termin mit der Finalisierung auf documented', async () => {
    const termin = await anlegen();
    const notiz = await entwurf(termin.id);
    const fertig = await stand(termin.id);
    await asUserCommitted(users.office, ABSCHLIESSEN, [fertig.id, fertig.updated_at]);

    await asUserCommitted(users.therapist, FINALISIEREN, [notiz, await notizStand(notiz)]);

    expect(await zustand(termin.id)).toBe('documented');
    expect(await invarianteGilt()).toBe(true);
  });

  it('hebt auch einen nur bestaetigten Termin auf documented (ANN-036)', async () => {
    const termin = await anlegen();
    const notiz = await entwurf(termin.id);

    await asUserCommitted(users.therapist, FINALISIEREN, [notiz, await notizStand(notiz)]);

    expect(await zustand(termin.id)).toBe('documented');
    expect(await invarianteGilt()).toBe(true);
  });

  it('setzt dabei completed_at, laesst completed_by aber leer - es hat niemand abgeschlossen', async () => {
    const termin = await anlegen();
    const notiz = await entwurf(termin.id);
    await asUserCommitted(users.therapist, FINALISIEREN, [notiz, await notizStand(notiz)]);

    const { rows } = await asPostgres<{ completed_at: string | null; completed_by: string | null }>(
      'select completed_at, completed_by from public.appointments where id = $1',
      [termin.id],
    );
    expect(rows[0]?.completed_at).not.toBeNull();
    expect(rows[0]?.completed_by).toBeNull();
  });

  it('protokolliert appointment.documented genau einmal', async () => {
    const termin = await anlegen();
    const notiz = await entwurf(termin.id);
    await asUserCommitted(users.therapist, FINALISIEREN, [notiz, await notizStand(notiz)]);

    const { rows } = await asPostgres<{ actor_kind: string }>(
      `select actor_kind from public.audit_log
        where action = 'appointment.documented' and subject_id = $1`,
      [termin.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_kind).toBe('user');
  });

  it('laesst den Zustand bei einer Korrektur unveraendert (ADR-018 Punkt 2)', async () => {
    const termin = await anlegen();
    const notiz = await entwurf(termin.id);
    await asUserCommitted(users.therapist, FINALISIEREN, [notiz, await notizStand(notiz)]);

    await asUserCommitted(users.therapist, KORREKTUR, [
      notiz,
      await notizStand(notiz),
      'Korrigierter Befund.',
      'Zahlendreher.',
    ]);

    expect(await zustand(termin.id)).toBe('documented');
    expect(await invarianteGilt()).toBe(true);
  });

  it('erzeugt fuer einen finalisierten Nachtrag kein zweites Ereignis', async () => {
    const termin = await anlegen();
    const notiz = await entwurf(termin.id);
    await asUserCommitted(users.therapist, FINALISIEREN, [notiz, await notizStand(notiz)]);

    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, NACHTRAG, [
      notiz,
      'Nachtrag zum Befund.',
    ]);
    const nachtrag = rows[0]!.id;
    await asUserCommitted(users.therapist, FINALISIEREN, [nachtrag, await notizStand(nachtrag)]);

    const { rows: ereignisse } = await asPostgres<{ anzahl: string }>(
      `select count(*)::text as anzahl from public.audit_log
        where action = 'appointment.documented' and subject_id = $1`,
      [termin.id],
    );
    expect(ereignisse[0]?.anzahl).toBe('1');
    expect(await zustand(termin.id)).toBe('documented');
  });

  it('haelt die Invariante auch fuer die automatische Finalisierung', async () => {
    const termin = await anlegen();
    await entwurf(termin.id);

    // Der Entwurf wird ueber die Frist hinaus zurueckdatiert; der Termin
    // ebenfalls, sonst rechnet die Frist vom Behandlungstag in der Zukunft.
    await asPostgres(
      `update public.appointments
          set starts_at = now() - interval '60 days',
              ends_at   = now() - interval '60 days' + interval '1 hour'
        where id = $1`,
      [termin.id],
    );
    await asPostgres(
      `update public.treatment_notes set created_at = now() - interval '60 days'
        where appointment_id = $1`,
      [termin.id],
    );

    await asPostgres('select public.finalize_overdue_treatment_notes()');

    expect(await zustand(termin.id)).toBe('documented');
    expect(await invarianteGilt()).toBe(true);

    const { rows } = await asPostgres<{ actor_kind: string }>(
      `select actor_kind from public.audit_log
        where action = 'appointment.documented' and subject_id = $1`,
      [termin.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_kind).toBe('system');
  });

  it('haelt die Invariante nach "Behandlung abschliessen" in einem Schritt', async () => {
    const termin = await anlegen();
    await asUserCommitted(
      users.therapist,
      'select public.complete_treatment($1::uuid, $2, $3::timestamptz, $4::timestamptz) as id',
      [termin.id, 'In einem Schritt dokumentiert.', termin.updated_at, null],
    );

    expect(await zustand(termin.id)).toBe('documented');
    expect(await invarianteGilt()).toBe(true);
  });

  it('haelt den internen Zustandswechsel fuer Anwendungsrollen verschlossen', async () => {
    // PostgreSQL gibt EXECUTE auf neue Funktionen an PUBLIC, und
    // `authenticated` hat USAGE auf dem Schema app. Ohne ausdrueckliches
    // REVOKE koennte jedes angemeldete Konto einen beliebigen Termin auf
    // documented heben: app.mark_appointment_documented ist SECURITY DEFINER
    // und prueft keine Rolle - das tut der Aufrufer (ADR-004).
    const { rows } = await asPostgres<{ erlaubt: boolean }>(
      `select has_function_privilege('authenticated', p.oid, 'EXECUTE') as erlaubt
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = 'mark_appointment_documented'`,
    );
    expect(rows[0]?.erlaubt).toBe(false);

    const termin = await anlegen();
    await expect(
      asUser(users.ownerTherapist, 'select app.mark_appointment_documented($1::uuid, null)', [
        termin.id,
      ]),
    ).rejects.toThrow(/permission denied/i);
    expect(await zustand(termin.id)).toBe('confirmed');
  });

  it('laesst einen Termin ohne finalisierte Dokumentation NICHT auf documented stehen', async () => {
    const termin = await anlegen();
    await entwurf(termin.id);
    const fertig = await stand(termin.id);
    await asUserCommitted(users.office, ABSCHLIESSEN, [fertig.id, fertig.updated_at]);

    expect(await zustand(termin.id)).toBe('completed');
    expect(await invarianteGilt()).toBe(true);
  });
});

describe('Tag umplanen (CAL-009)', () => {
  beforeEach(resetDatabase);

  const TAG_UMPLANEN = 'select public.cancel_staff_day($1::uuid, $2::date, $3) as anzahl';
  const TIM = '55555555-5555-4555-8555-000000000004';

  async function anlegenFuer(staff: string, von: string, bis: string): Promise<Termin> {
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
      patients.max,
      staff,
      'video',
      TAG,
      von,
      bis,
      null,
    ]);
    return stand(rows[0]!.id);
  }

  it('sagt alle bestaetigten Termine der Person an diesem Tag ab', async () => {
    const a = await anlegen('09:00', '10:00');
    const b = await anlegen('11:00', '12:00');

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, TAG_UMPLANEN, [
      ANNA,
      TAG,
      'practice_request',
    ]);

    expect(rows[0]!.anzahl).toBe(2);
    expect(await zustand(a.id)).toBe('cancelled');
    expect(await zustand(b.id)).toBe('cancelled');
  });

  it('schreibt den Grund an jede einzelne Zeile', async () => {
    const a = await anlegen('09:00', '10:00');
    const b = await anlegen('11:00', '12:00');
    await asUserCommitted(users.office, TAG_UMPLANEN, [ANNA, TAG, 'practice_request']);

    const { rows } = await asPostgres<{ cancellation_reason: string }>(
      'select cancellation_reason from public.appointments where id = any($1::uuid[]) order by starts_at',
      [[a.id, b.id]],
    );
    expect(rows.map((r) => r.cancellation_reason)).toEqual([
      'practice_request',
      'practice_request',
    ]);
  });

  it('schreibt je Termin ein eigenes appointment.cancelled und kein Sammelereignis', async () => {
    await anlegen('09:00', '10:00');
    await anlegen('11:00', '12:00');
    await asUserCommitted(users.office, TAG_UMPLANEN, [ANNA, TAG, 'practice_request']);

    const { rows } = await asPostgres<{ anzahl: string }>(
      `select count(*)::text as anzahl from public.audit_log
        where action = 'appointment.cancelled'`,
    );
    expect(rows[0]?.anzahl).toBe('2');
  });

  it('laesst die Termine anderer Personen unberuehrt', async () => {
    const anna = await anlegen('09:00', '10:00');
    const tim = await anlegenFuer(TIM, '09:00', '10:00');

    await asUserCommitted(users.office, TAG_UMPLANEN, [ANNA, TAG, 'practice_request']);

    expect(await zustand(anna.id)).toBe('cancelled');
    expect(await zustand(tim.id)).toBe('confirmed');
  });

  it('laesst einen anderen Kalendertag unberuehrt', async () => {
    const heute = await anlegen('09:00', '10:00');
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
      patients.max,
      ANNA,
      'video',
      tagInTagen(71),
      '09:00',
      '10:00',
      null,
    ]);

    await asUserCommitted(users.office, TAG_UMPLANEN, [ANNA, TAG, 'practice_request']);

    expect(await zustand(heute.id)).toBe('cancelled');
    expect(await zustand(rows[0]!.id)).toBe('confirmed');
  });

  it('laesst abgeschlossene und bereits abgesagte Termine stehen', async () => {
    const offen = await anlegen('09:00', '10:00');
    const fertig = await anlegen('11:00', '12:00');
    await asUserCommitted(users.office, ABSCHLIESSEN, [fertig.id, fertig.updated_at]);
    const schonAbgesagt = await anlegen('13:00', '14:00');
    await asUserCommitted(users.office, ABSAGEN, [
      schonAbgesagt.id,
      schonAbgesagt.updated_at,
      'moved',
      null,
      null,
    ]);

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, TAG_UMPLANEN, [
      ANNA,
      TAG,
      'practice_request',
    ]);

    expect(rows[0]!.anzahl).toBe(1);
    expect(await zustand(offen.id)).toBe('cancelled');
    expect(await zustand(fertig.id)).toBe('completed');
    // Der frueher genannte Grund bleibt stehen, er wird nicht ueberschrieben.
    const { rows: grund } = await asPostgres<{ cancellation_reason: string }>(
      'select cancellation_reason from public.appointments where id = $1',
      [schonAbgesagt.id],
    );
    expect(grund[0]?.cancellation_reason).toBe('moved');
  });

  it('verlangt einen gueltigen Grund und schreibt ohne ihn nichts', async () => {
    const a = await anlegen('09:00', '10:00');

    await expect(asUser(users.office, TAG_UMPLANEN, [ANNA, TAG, null])).rejects.toThrow(
      /cancellation reason is required/,
    );
    expect(await zustand(a.id)).toBe('confirmed');
  });

  it('weist ein Patientenkonto ab', async () => {
    await anlegen('09:00', '10:00');
    await expect(
      asUser(users.patientMax, TAG_UMPLANEN, [ANNA, TAG, 'practice_request']),
    ).rejects.toThrow(/not allowed to cancel appointments/);
  });

  it('taugt nicht als Orakel fuer fremde Mitarbeiter-IDs', async () => {
    await expect(
      asUser(users.office, TAG_UMPLANEN, [
        '55555555-5555-4555-8555-0000000000d1',
        TAG,
        'practice_request',
      ]),
    ).rejects.toThrow(/staff member not found/);
  });

  it('zaehlt an einem leeren Tag null und schreibt nichts', async () => {
    const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, TAG_UMPLANEN, [
      ANNA,
      tagInTagen(72),
      'practice_request',
    ]);
    expect(rows[0]!.anzahl).toBe(0);

    const { rows: audit } = await asPostgres<{ anzahl: string }>(
      `select count(*)::text as anzahl from public.audit_log
        where action = 'appointment.cancelled'`,
    );
    expect(audit[0]?.anzahl).toBe('0');
  });
});
