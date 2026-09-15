import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabaseOhneTermine,
  tagInTagen,
} from './helpers/db';

/**
 * Automatische Finalisierung nach Frist (DOK-004, ADR-016 Punkt 7).
 *
 * Geprueft werden die Zusagen, die ohne Test nur Behauptungen waeren:
 *
 *   * ein ueberfaelliger Entwurf wird unveraendert zur Version 1, mit der
 *     zuletzt schreibenden Person als Urheberin und ohne erfundene
 *     finalisierende Person,
 *   * die Frist zaehlt gegen Mitternacht der Praxiszeitzone, und ein spaeter
 *     angelegter Eintrag bekommt seine eigene Frist (ANN-008),
 *   * der Vorgang ist idempotent und fuer keine Anwendungsrolle ausfuehrbar
 *     (ANN-007),
 *   * das Auditlog traegt einen Systemakteur ohne Account und ohne Inhalt
 *     (ANN-009, ADR-010).
 *
 * Alle Inhalte in dieser Datei sind erkennbar synthetisch und stammen aus
 * keinem realen Behandlungsfall (PROJECT_PRINCIPLES.md 3.1).
 */

const { users, organizationId, patients } = SEED;

const STAFF = {
  anna: '55555555-5555-4555-8555-000000000002',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const ZEITZONE = 'Europe/Berlin';

const TERMIN_ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const ANLEGEN = 'select public.create_treatment_note($1::uuid, $2) as id';
const AENDERN = 'select public.update_treatment_note($1::uuid, $2::timestamptz, $3) as id';
const FINALISIEREN = 'select public.finalize_treatment_note($1::uuid, $2::timestamptz) as id';
const NACHTRAGEN = 'select public.create_treatment_note_addendum($1::uuid, $2) as id';
const LESEN = 'select * from public.get_treatment_note($1::uuid)';
const AKTE = 'select * from public.list_patient_treatment_notes($1::uuid, 20, null, null)';
const NACHWEIS = 'select * from public.list_patient_treatment_evidence($1::uuid, 20, null, null)';
const UEBERFAELLIGE = 'select public.finalize_overdue_treatment_notes() as n';
const FRIST_SETZEN = 'select public.set_documentation_deadline($1::smallint) as tage';

const TEXT = 'Synthetischer Testinhalt: Uebungen angeleitet, Belastung gesteigert.';

/** Roher updated_at-Wert inklusive Bruchteilen - Grundlage der Konfliktpruefung. */
const ROH_UPDATED_AT =
  'to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at';

interface Stand {
  id: string;
  updated_at: string;
}

async function terminStand(id: string): Promise<Stand> {
  const { rows } = await asPostgres<Stand>(
    `select id, ${ROH_UPDATED_AT} from public.appointments where id = $1`,
    [id],
  );
  return rows[0]!;
}

async function dokuStand(id: string): Promise<Stand> {
  const { rows } = await asPostgres<Stand>(
    `select id, ${ROH_UPDATED_AT} from public.treatment_notes where id = $1`,
    [id],
  );
  return rows[0]!;
}

async function dokuZeile(id: string) {
  const { rows } = await asPostgres<Record<string, unknown>>(
    'select * from public.treatment_notes where id = $1',
    [id],
  );
  return rows[0]!;
}

async function versionen(noteId: string) {
  const { rows } = await asPostgres<{
    version_no: number;
    content: string;
    change_reason: string | null;
    author_id: string;
  }>(
    `select version_no, content, change_reason, author_id
     from public.treatment_note_versions where note_id = $1 order by version_no`,
    [noteId],
  );
  return rows;
}

async function auditEintraege(action: string) {
  const { rows } = await asPostgres<{
    subject_type: string;
    subject_id: string;
    actor_user_id: string | null;
    actor_kind: string;
    outcome: string;
    context: Record<string, unknown>;
  }>(
    `select subject_type, subject_id, actor_user_id, actor_kind, outcome, context
     from public.audit_log where action = $1 order by occurred_at`,
    [action],
  );
  return rows;
}

/** Laesst den zeitgesteuerten Vorgang so laufen, wie es der Scheduler taete. */
async function lauf(): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(UEBERFAELLIGE);
  return Number(rows[0]!.n);
}

/**
 * 09:00 Ortszeit der Praxis an einem Kalendertag relativ zu HEUTE in der
 * Praxiszeitzone. Bewusst nicht ueber UTC-Kalendertage: nach 22 Uhr UTC ist in
 * Berlin schon der naechste Tag, und die Frist zaehlt gegen Berliner
 * Mitternacht.
 */
const ORTSZEIT_VOR_TAGEN = `((date_trunc('day', now() at time zone '${ZEITZONE}') - make_interval(days => $2) + interval '9 hours') at time zone '${ZEITZONE}')`;

let laufend = 0;

/**
 * Legt einen Termin an und datiert ihn auf `tageZurueck` Tage vor heute
 * (09:00 Ortszeit). create_appointment weist vergangene Tage ab - die Frist
 * braucht sie aber; das Zurueckdatieren ist Testvorbereitung.
 */
async function terminVorTagen(
  tageZurueck: number,
  opts: { staff?: string; patient?: string } = {},
): Promise<Stand> {
  laufend += 1;
  const { rows } = await asUserCommitted<{ id: string }>(users.office, TERMIN_ANLEGEN, [
    opts.patient ?? patients.max,
    opts.staff ?? STAFF.anna,
    'video',
    tagInTagen(30 + laufend),
    '09:00',
    '10:00',
    null,
  ]);
  await asPostgres(
    `update public.appointments
        set starts_at = ${ORTSZEIT_VOR_TAGEN},
            ends_at   = ${ORTSZEIT_VOR_TAGEN} + interval '45 minutes'
      where id = $1`,
    [rows[0]!.id, tageZurueck],
  );
  return terminStand(rows[0]!.id);
}

/** Entwurf, dessen Anlage `tageZurueck` Tage zurueckliegt (null: jetzt). */
async function entwurf(
  terminId: string,
  tageZurueck: number | null,
  text = TEXT,
  actor = users.therapist,
): Promise<Stand> {
  const { rows } = await asUserCommitted<{ id: string }>(actor, ANLEGEN, [terminId, text]);
  if (tageZurueck !== null) {
    await asPostgres(
      `update public.treatment_notes
          set created_at = ${ORTSZEIT_VOR_TAGEN},
              updated_at = ${ORTSZEIT_VOR_TAGEN}
        where id = $1`,
      [rows[0]!.id, tageZurueck],
    );
  }
  return dokuStand(rows[0]!.id);
}

async function fristSetzen(tage: number): Promise<void> {
  await asPostgres(
    'update public.organizations set documentation_auto_finalize_days = $2 where id = $1',
    [organizationId, tage],
  );
}

// =============================================================================
// Finalisierer
// =============================================================================

describe('DOK-004: Automatische Finalisierung nach Frist', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('finalisiert einen ueberfaelligen Entwurf unveraendert als Version 1 ohne handelnde Person', async () => {
    const t = await terminVorTagen(3);
    const d = await entwurf(t.id, 3);
    // Die zuletzt schreibende Person ist team_lead - sie ist Urheberin der
    // Version 1, nicht die anlegende (ADR-016 Punkt 1).
    await asUserCommitted(users.teamLead, AENDERN, [d.id, d.updated_at, `${TEXT} Ergaenzt.`]);

    expect(await lauf()).toBe(1);

    const zeile = await dokuZeile(d.id);
    expect(zeile).toMatchObject({
      status: 'final',
      finalisation_kind: 'automatic',
      finalized_by: null,
      content: `${TEXT} Ergaenzt.`,
      updated_by: users.teamLead,
    });
    expect(zeile.finalized_at).toBeInstanceOf(Date);

    expect(await versionen(d.id)).toEqual([
      {
        version_no: 1,
        content: `${TEXT} Ergaenzt.`,
        change_reason: null,
        author_id: users.teamLead,
      },
    ]);
  });

  it('protokolliert treatment_note.auto_finalized mit Systemakteur, Fristende und ohne Inhalt (ADR-010)', async () => {
    const t = await terminVorTagen(4);
    const d = await entwurf(t.id, 4, 'Synthetisch: Geheimer Inhalt, gehoert nicht ins Auditlog.');

    await lauf();

    const eintrag = (await auditEintraege('treatment_note.auto_finalized')).find(
      (e) => e.subject_id === d.id,
    );
    expect(eintrag).toMatchObject({
      subject_type: 'treatment_note',
      actor_user_id: null,
      actor_kind: 'system',
      outcome: 'success',
    });
    expect(eintrag?.context).toMatchObject({
      surface: 'scheduler',
      appointment_id: t.id,
      patient_id: patients.max,
    });
    expect(typeof eintrag?.context.due_at).toBe('string');
    expect(JSON.stringify(eintrag?.context)).not.toContain('Geheimer');
  });

  it('laesst einen Entwurf innerhalb der Frist unberuehrt', async () => {
    // Behandlung gestern: Frist endet morgen um Mitternacht.
    const t = await terminVorTagen(1);
    const d = await entwurf(t.id, 1);

    await lauf();

    expect(await dokuZeile(d.id)).toMatchObject({ status: 'draft', finalisation_kind: null });
    expect(await versionen(d.id)).toEqual([]);
  });

  it('rechnet die Frist gegen Mitternacht: zwei Tage zurueck ist gerade ueberfaellig', async () => {
    // Behandlung vorgestern: Frist endete heute um Mitternacht.
    const t = await terminVorTagen(2);
    const d = await entwurf(t.id, 2);

    await lauf();

    expect(await dokuZeile(d.id)).toMatchObject({
      status: 'final',
      finalisation_kind: 'automatic',
    });
  });

  it('gibt einem spaet angelegten Entwurf eine eigene Frist ab Anlage (ANN-008)', async () => {
    // Behandlung vor zehn Tagen, Dokumentation erst jetzt: die Frist laeuft
    // ab heute, nicht ab der Behandlung.
    const t = await terminVorTagen(10);
    const d = await entwurf(t.id, null);

    await lauf();

    expect(await dokuZeile(d.id)).toMatchObject({ status: 'draft' });
  });

  it('finalisiert einen Nachtrag im Entwurf nach seiner eigenen Frist und laesst den Haupteintrag unberuehrt', async () => {
    const t = await terminVorTagen(12, { staff: STAFF.tim });
    const d = await entwurf(t.id, 12);
    await asUserCommitted(users.therapist, FINALISIEREN, [d.id, d.updated_at]);
    const { rows } = await asUserCommitted<{ id: string }>(users.teamLead, NACHTRAGEN, [
      d.id,
      'Synthetisch: Nachtrag.',
    ]);
    const nachtrag = rows[0]!.id;
    await asPostgres(
      `update public.treatment_notes
          set created_at = ${ORTSZEIT_VOR_TAGEN}, updated_at = ${ORTSZEIT_VOR_TAGEN}
        where id = $1`,
      [nachtrag, 3],
    );

    await lauf();

    expect(await dokuZeile(nachtrag)).toMatchObject({
      status: 'final',
      finalisation_kind: 'automatic',
      finalized_by: null,
    });
    expect(await versionen(nachtrag)).toMatchObject([{ version_no: 1, author_id: users.teamLead }]);
    expect(await dokuZeile(d.id)).toMatchObject({
      status: 'final',
      finalisation_kind: 'manual',
      finalized_by: users.therapist,
    });
  });

  it('respektiert die Frist der Organisation: 0 heisst Ende des Behandlungstages', async () => {
    await fristSetzen(0);
    try {
      const t = await terminVorTagen(1, { staff: STAFF.tim });
      const d = await entwurf(t.id, 1);

      await lauf();

      expect(await dokuZeile(d.id)).toMatchObject({
        status: 'final',
        finalisation_kind: 'automatic',
      });
    } finally {
      await fristSetzen(1);
    }
  });

  it('ist idempotent: ein zweiter Lauf findet nichts mehr', async () => {
    const t = await terminVorTagen(5);
    await entwurf(t.id, 5);

    expect(await lauf()).toBe(1);
    expect(await lauf()).toBe(0);
  });

  it('weist nach der automatischen Finalisierung eine Entwurfsaenderung ab (PROJECT_PRINCIPLES.md 5)', async () => {
    const t = await terminVorTagen(6);
    const d = await entwurf(t.id, 6);

    await lauf();

    await expect(
      asUser(users.therapist, AENDERN, [d.id, d.updated_at, 'Zu spaet.']),
    ).rejects.toThrow(/finalized treatment note requires a revision/);
  });

  it('liefert die Art der Finalisierung am Termin, in der Akte und im Nachweis', async () => {
    const t = await terminVorTagen(7, { patient: patients.erika });
    const d = await entwurf(t.id, 7);
    await lauf();

    const { rows: termin } = await asUserCommitted<{
      finalisation_kind: string;
      finalized_by_name: string | null;
    }>(users.therapist, LESEN, [t.id]);
    expect(termin[0]).toMatchObject({ finalisation_kind: 'automatic', finalized_by_name: null });

    const { rows: akte } = await asUserCommitted<{
      notes: { id: string; finalisation_kind: string }[];
    }>(users.therapist, AKTE, [patients.erika]);
    expect(akte[0]!.notes[0]).toMatchObject({ id: d.id, finalisation_kind: 'automatic' });

    const { rows: nachweis } = await asUserCommitted<{
      documentation_status: string;
      documented_at: Date;
    }>(users.office, NACHWEIS, [patients.erika]);
    expect(nachweis[0]!.documentation_status).toBe('final');
    expect(nachweis[0]!.documented_at).toBeInstanceOf(Date);
  });

  it('traegt bei manueller Finalisierung die Art manual samt Person', async () => {
    const t = await terminVorTagen(8);
    const d = await entwurf(t.id, null);
    await asUserCommitted(users.teamLead, FINALISIEREN, [d.id, d.updated_at]);

    expect(await dokuZeile(d.id)).toMatchObject({
      status: 'final',
      finalisation_kind: 'manual',
      finalized_by: users.teamLead,
    });
  });

  it('laesst die Constraint keine Mischformen zu', async () => {
    const t = await terminVorTagen(9);
    const d = await entwurf(t.id, null);
    await asUserCommitted(users.teamLead, FINALISIEREN, [d.id, d.updated_at]);

    // automatisch, aber mit Person
    await expect(
      asPostgres(
        "update public.treatment_notes set finalisation_kind = 'automatic' where id = $1",
        [d.id],
      ),
    ).rejects.toThrow(/treatment_notes_finalisation_consistent/);
    // finalisiert ohne Art
    await expect(
      asPostgres('update public.treatment_notes set finalisation_kind = null where id = $1', [
        d.id,
      ]),
    ).rejects.toThrow(/treatment_notes_finalisation_consistent/);
  });

  it('ist fuer Anwendungsrollen nicht ausfuehrbar (ANN-007)', async () => {
    for (const actor of [users.ownerTherapist, users.therapist, users.office]) {
      await expect(asUser(actor, UEBERFAELLIGE)).rejects.toThrow(/permission denied/i);
    }
    await expect(asAnon(UEBERFAELLIGE)).rejects.toThrow(/permission denied/i);
  });

  it('laeuft als SECURITY DEFINER mit leerem search_path', async () => {
    const { rows } = await asPostgres<{
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(
      `select p.proname, p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'finalize_overdue_treatment_notes'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.prosecdef).toBe(true);
    expect(rows[0]!.proconfig).toContain('search_path=""');
  });

  it('begrenzt die Frist der Organisation auf 0 bis 30 Tage', async () => {
    await expect(fristSetzen(31)).rejects.toThrow(/documentation_auto_finalize_days/);
    await expect(fristSetzen(-1)).rejects.toThrow(/documentation_auto_finalize_days/);
  });
});

// =============================================================================
// Systemakteur im Auditlog
// =============================================================================

describe('DOK-004: Systemakteur im Auditlog', () => {
  let dokuId: string;

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    const t = await terminVorTagen(3);
    const d = await entwurf(t.id, 3);
    dokuId = d.id;
    await lauf();
  }, 120_000);

  it('zeigt owner das Systemereignis ohne Account und ohne Klarnamen', async () => {
    const { rows } = await asUser<{
      subject_id: string;
      actor_user_id: string | null;
      actor_kind: string;
      actor_display_name: string | null;
    }>(
      users.ownerTherapist,
      "select * from public.list_audit_events(null, null, null, 'treatment_note.auto_finalized')",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subject_id: dokuId,
      actor_user_id: null,
      actor_kind: 'system',
      actor_display_name: null,
    });
  });

  it('blendet Systemereignisse im Benutzerfilter aus', async () => {
    const { rows } = await asUser(
      users.ownerTherapist,
      "select * from public.list_audit_events(null, null, $1, 'treatment_note.auto_finalized')",
      [users.therapist],
    );
    expect(rows).toEqual([]);
  });

  it('fuehrt Benutzerereignisse weiterhin als user mit Account', async () => {
    const eintraege = await auditEintraege('treatment_note.created');
    expect(eintraege.length).toBeGreaterThan(0);
    for (const e of eintraege) {
      expect(e.actor_kind).toBe('user');
      expect(e.actor_user_id).not.toBeNull();
    }
  });

  it('verlangt bei user einen Account und verbietet bei system einen (ANN-009)', async () => {
    await expect(
      asPostgres(
        `insert into public.audit_log (organization_id, actor_user_id, actor_kind, action, subject_type, subject_id)
         values ($1, null, 'user', 'audit_log.read', 'organization', $1)`,
        [organizationId],
      ),
    ).rejects.toThrow(/audit_log_actor_consistent/);
    await expect(
      asPostgres(
        `insert into public.audit_log (organization_id, actor_user_id, actor_kind, action, subject_type, subject_id)
         values ($1, $2, 'system', 'audit_log.read', 'organization', $1)`,
        [organizationId, users.ownerTherapist],
      ),
    ).rejects.toThrow(/audit_log_actor_consistent/);
  });
});

// =============================================================================
// Frist konfigurieren
// =============================================================================

describe('DOK-004: Frist konfigurieren', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  async function frist(): Promise<number> {
    const { rows } = await asPostgres<{ tage: number }>(
      'select documentation_auto_finalize_days as tage from public.organizations where id = $1',
      [organizationId],
    );
    return rows[0]!.tage;
  }

  it('steht in der Voreinstellung auf dem Ende des Folgetages (ADR-016 Punkt 7)', async () => {
    expect(await frist()).toBe(1);
  });

  it('laesst owner die Frist setzen und protokolliert Alt- und Neuwert (ANN-004)', async () => {
    const { rows } = await asUserCommitted<{ tage: number }>(
      users.ownerTherapist,
      FRIST_SETZEN,
      [3],
    );
    expect(rows[0]!.tage).toBe(3);
    expect(await frist()).toBe(3);

    const eintraege = await auditEintraege('organization.documentation_deadline_changed');
    expect(eintraege.at(-1)).toMatchObject({
      subject_type: 'organization',
      subject_id: organizationId,
      actor_user_id: users.ownerTherapist,
      actor_kind: 'user',
      outcome: 'success',
    });
    expect(eintraege.at(-1)?.context).toMatchObject({ surface: 'web', previous_days: 1, days: 3 });

    await asUserCommitted(users.ownerTherapist, FRIST_SETZEN, [1]);
  });

  it('schreibt bei unveraendertem Wert weder Daten noch Auditeintrag', async () => {
    const vorher = (await auditEintraege('organization.documentation_deadline_changed')).length;
    await asUserCommitted(users.ownerTherapist, FRIST_SETZEN, [1]);
    expect((await auditEintraege('organization.documentation_deadline_changed')).length).toBe(
      vorher,
    );
  });

  it('wirkt unmittelbar auf den Finalisierer', async () => {
    // Behandlung gestern: mit Frist 1 noch offen, mit Frist 0 ueberfaellig.
    const t = await terminVorTagen(1);
    const d = await entwurf(t.id, 1);
    await lauf();
    expect(await dokuZeile(d.id)).toMatchObject({ status: 'draft' });

    await asUserCommitted(users.ownerTherapist, FRIST_SETZEN, [0]);
    try {
      await lauf();
      expect(await dokuZeile(d.id)).toMatchObject({
        status: 'final',
        finalisation_kind: 'automatic',
      });
    } finally {
      await asUserCommitted(users.ownerTherapist, FRIST_SETZEN, [1]);
    }
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
    ['patient', users.patientMax],
  ])('laesst %s die Frist nicht setzen (4.1)', async (_rolle, actor) => {
    await expect(asUser(actor, FRIST_SETZEN, [2])).rejects.toThrow(
      /not allowed to change the documentation deadline/,
    );
    expect(await frist()).toBe(1);
  });

  it('weist Werte ausserhalb von 0 bis 30 ab', async () => {
    await expect(asUser(users.ownerTherapist, FRIST_SETZEN, [31])).rejects.toThrow(
      /unsupported documentation deadline/,
    );
    await expect(asUser(users.ownerTherapist, FRIST_SETZEN, [-1])).rejects.toThrow(
      /unsupported documentation deadline/,
    );
    await expect(asUser(users.ownerTherapist, FRIST_SETZEN, [null])).rejects.toThrow(
      /unsupported documentation deadline/,
    );
  });

  it('laesst einen nicht angemeldeten Zugriff nicht zu', async () => {
    await expect(asAnon(FRIST_SETZEN, [2])).rejects.toThrow(/permission denied|not authenticated/);
  });
});

// =============================================================================
// Scheduler
// =============================================================================

describe('DOK-004: Scheduler-Registrierung (ANN-007)', () => {
  it('registriert den Job genau dann, wenn pg_cron verfuegbar ist', async () => {
    const { rows: verfuegbar } = await asPostgres<{ n: string }>(
      "select count(*)::text as n from pg_available_extensions where name = 'pg_cron'",
    );
    const { rows: installiert } = await asPostgres<{ n: string }>(
      "select count(*)::text as n from pg_extension where extname = 'pg_cron'",
    );

    if (Number(verfuegbar[0]!.n) === 0) {
      // Die Wegwerf-Datenbank der Tests: keine Erweiterung, keine
      // Registrierung, aber eine gueltige Migration.
      expect(Number(installiert[0]!.n)).toBe(0);
      return;
    }

    expect(Number(installiert[0]!.n)).toBe(1);
    const { rows: jobs } = await asPostgres<{ schedule: string; command: string }>(
      "select schedule, command from cron.job where jobname = 'finalize-overdue-treatment-notes'",
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      schedule: '*/15 * * * *',
      command: 'select public.finalize_overdue_treatment_notes()',
    });
  });
});
