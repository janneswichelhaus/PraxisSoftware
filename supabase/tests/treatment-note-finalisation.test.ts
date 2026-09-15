import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabaseOhneTermine,
  tagInTagen,
} from './helpers/db';

/**
 * Finalisierung, Versionierung und Nachtrag (DOK-002, ADR-016 Punkte 4 bis 6).
 *
 * Geprueft werden vor allem die Zusagen, die ohne Test nur Behauptungen waeren:
 *
 *   * ein finalisierter Eintrag laesst sich nicht mehr still ueberschreiben
 *     (PROJECT_PRINCIPLES.md 5),
 *   * der Inhalt jeder frueheren Version bleibt vollstaendig abrufbar
 *     (ADR-016 Punkt 5, 630f Abs. 1 S. 2 und 3 BGB),
 *   * eine Korrektur ohne Begruendung findet nicht statt (Punkt 6),
 *   * der Versionsverlauf ist office und Patientenkonten verschlossen und
 *     kommt nicht an der Protokollierung vorbei (Punkt 8 und 9),
 *   * weder Behandlungstext noch Begruendung stehen im Auditlog (ADR-010,
 *     ADR-011).
 *
 * Alle Inhalte in dieser Datei sind erkennbar synthetisch und stammen aus
 * keinem realen Behandlungsfall (PROJECT_PRINCIPLES.md 3.1).
 */

const { users, organizationId, patients } = SEED;

const STAFF = {
  anna: '55555555-5555-4555-8555-000000000002',
} as const;

const TERMIN_ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';

const ANLEGEN = 'select public.create_treatment_note($1::uuid, $2) as id';
const AENDERN = 'select public.update_treatment_note($1::uuid, $2::timestamptz, $3) as id';
const FINALISIEREN = 'select public.finalize_treatment_note($1::uuid, $2::timestamptz) as id';
const KORRIGIEREN = 'select public.revise_treatment_note($1::uuid, $2::timestamptz, $3, $4) as id';
const NACHTRAGEN = 'select public.create_treatment_note_addendum($1::uuid, $2) as id';
const LESEN = 'select * from public.get_treatment_note($1::uuid)';
const VERLAUF = 'select * from public.get_treatment_note_versions($1::uuid)';

const ENTWURF = 'Synthetisch: Uebungen angeleitet, Belastung in drei Stufen gesteigert.';
const KORREKTUR = 'Synthetisch: Uebungen angeleitet, Belastung in vier Stufen gesteigert.';
const NACHTRAG = 'Synthetisch: Nachgereicht - Heimprogramm auf zwei Einheiten taeglich gesetzt.';

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
  return rows[0];
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
    actor_user_id: string;
    outcome: string;
    context: Record<string, unknown>;
  }>(
    `select subject_type, subject_id, actor_user_id, outcome, context
     from public.audit_log where action = $1 order by occurred_at`,
    [action],
  );
  return rows;
}

/**
 * Legt einen Termin an. Jeder Aufruf bekommt einen eigenen Kalendertag - sonst
 * griffe der Ueberschneidungsschutz aus CAL-001.
 */
let laufend = 0;

async function termin(): Promise<Stand> {
  laufend += 1;
  const { rows } = await asUserCommitted<{ id: string }>(users.office, TERMIN_ANLEGEN, [
    patients.max,
    STAFF.anna,
    'video',
    tagInTagen(400 + laufend),
    '09:00',
    '10:00',
    null,
  ]);
  return terminStand(rows[0]!.id);
}

/** Entwurf zu einem frischen Termin. */
async function entwurf(text = ENTWURF, autor: string = users.therapist): Promise<Stand> {
  const t = await termin();
  const { rows } = await asUserCommitted<{ id: string }>(autor, ANLEGEN, [t.id, text]);
  return dokuStand(rows[0]!.id);
}

/** Finalisierter Eintrag zu einem frischen Termin. */
async function finalisiert(
  text = ENTWURF,
  autor: string = users.therapist,
  finalisierer: string = users.therapist,
): Promise<Stand> {
  const e = await entwurf(text, autor);
  await asUserCommitted(finalisierer, FINALISIEREN, [e.id, e.updated_at]);
  return dokuStand(e.id);
}

// =============================================================================
// Finalisierung (ADR-016 Punkt 4)
// =============================================================================

describe('DOK-002: Finalisierung von Hand', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('setzt den Eintrag auf final und haelt fest, wer wann finalisiert hat', async () => {
    const e = await entwurf();
    await asUserCommitted(users.therapist, FINALISIEREN, [e.id, e.updated_at]);

    const zeile = await dokuZeile(e.id);
    expect(zeile).toMatchObject({
      status: 'final',
      finalized_by: users.therapist,
      content: ENTWURF,
    });
    expect(zeile?.finalized_at).not.toBeNull();
  });

  it('schreibt den Entwurfsstand unveraendert als Version 1 fest (Punkt 5)', async () => {
    const e = await entwurf();
    await asUserCommitted(users.therapist, FINALISIEREN, [e.id, e.updated_at]);

    expect(await versionen(e.id)).toEqual([
      {
        version_no: 1,
        content: ENTWURF,
        // Version 1 ist keine Korrektur und traegt deshalb keine Begruendung.
        change_reason: null,
        author_id: users.therapist,
      },
    ]);
  });

  it('fuehrt als Urheber der Version 1 die schreibende, nicht die finalisierende Person', async () => {
    // ADR-016 Punkt 1: die Urheberschaft je Version bleibt erhalten. Wer
    // vertretungsweise finalisiert, wird dadurch nicht zum Verfasser.
    const e = await entwurf(ENTWURF, users.therapist);
    await asUserCommitted(users.teamLead, FINALISIEREN, [e.id, e.updated_at]);

    const [v1] = await versionen(e.id);
    expect(v1?.author_id).toBe(users.therapist);
    expect(await dokuZeile(e.id)).toMatchObject({ finalized_by: users.teamLead });
  });

  it('laesst eine andere therapeutische Rolle finalisieren (Punkt 4)', async () => {
    const e = await entwurf(ENTWURF, users.therapist);
    await asUserCommitted(users.teamLead, FINALISIEREN, [e.id, e.updated_at]);
    expect(await dokuZeile(e.id)).toMatchObject({ status: 'final' });
  });

  it('weist office ab (PROJECT_PRINCIPLES.md 4.3)', async () => {
    const e = await entwurf();
    await expect(asUser(users.office, FINALISIEREN, [e.id, e.updated_at])).rejects.toThrow(
      /not allowed to write treatment documentation/,
    );
    expect(await dokuZeile(e.id)).toMatchObject({ status: 'draft' });
  });

  it('weist ein Patientenkonto ab (4.6)', async () => {
    const e = await entwurf();
    await expect(asUser(users.patientMax, FINALISIEREN, [e.id, e.updated_at])).rejects.toThrow(
      /not allowed to write treatment documentation/,
    );
  });

  it('weist einen veralteten Stand ab (ADR-001 Punkt 5)', async () => {
    const e = await entwurf();
    await asUserCommitted(users.therapist, AENDERN, [e.id, e.updated_at, 'Synthetisch: ergaenzt.']);

    await expect(asUser(users.teamLead, FINALISIEREN, [e.id, e.updated_at])).rejects.toThrow(
      /treatment note was changed meanwhile/,
    );
    expect(await dokuZeile(e.id)).toMatchObject({ status: 'draft' });
  });

  it('finalisiert nicht zweimal', async () => {
    const f = await finalisiert();
    await expect(asUser(users.therapist, FINALISIEREN, [f.id, f.updated_at])).rejects.toThrow(
      /treatment note is already final/,
    );
    expect(await versionen(f.id)).toHaveLength(1);
  });

  it('protokolliert treatment_note.finalized ohne Behandlungsinhalt (ADR-010)', async () => {
    const e = await entwurf('Synthetisch: Geheimer Inhalt, der nirgends im Auditlog stehen darf.');
    await asUserCommitted(users.therapist, FINALISIEREN, [e.id, e.updated_at]);

    const eigener = (await auditEintraege('treatment_note.finalized')).find(
      (a) => a.subject_id === e.id,
    );
    expect(eigener).toMatchObject({
      subject_type: 'treatment_note',
      actor_user_id: users.therapist,
      outcome: 'success',
    });
    expect(eigener?.context).toMatchObject({ surface: 'web', patient_id: patients.max });
    expect(JSON.stringify(eigener?.context)).not.toContain('Geheimer Inhalt');
  });

  it('weist eine unbekannte Dokumentation wie eine fremde ab', async () => {
    await expect(
      asUser(users.therapist, FINALISIEREN, [
        '99999999-9999-4999-8999-000000000001',
        new Date().toISOString(),
      ]),
    ).rejects.toThrow(/treatment note not found/);
  });
});

// =============================================================================
// Aenderung nach der Finalisierung (ADR-016 Punkt 5 und 6)
// =============================================================================

describe('DOK-002: Korrektur eines finalisierten Eintrags', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('verschliesst den Entwurfsweg fuer finalisierte Eintraege (PROJECT_PRINCIPLES.md 5)', async () => {
    const f = await finalisiert();

    await expect(asUser(users.therapist, AENDERN, [f.id, f.updated_at, KORREKTUR])).rejects.toThrow(
      /finalized treatment note requires a revision/,
    );
    expect(await dokuZeile(f.id)).toMatchObject({ content: ENTWURF });
  });

  it('legt eine neue Version an und laesst die vorherige unveraendert abrufbar', async () => {
    const f = await finalisiert();
    await asUserCommitted(users.teamLead, KORRIGIEREN, [
      f.id,
      f.updated_at,
      KORREKTUR,
      'Zahlendreher bei der Stufenzahl.',
    ]);

    expect(await versionen(f.id)).toEqual([
      { version_no: 1, content: ENTWURF, change_reason: null, author_id: users.therapist },
      {
        version_no: 2,
        content: KORREKTUR,
        change_reason: 'Zahlendreher bei der Stufenzahl.',
        author_id: users.teamLead,
      },
    ]);
    expect(await dokuZeile(f.id)).toMatchObject({ content: KORREKTUR, status: 'final' });
  });

  it('zaehlt weitere Korrekturen fortlaufend hoch', async () => {
    const f = await finalisiert();
    await asUserCommitted(users.therapist, KORRIGIEREN, [f.id, f.updated_at, KORREKTUR, 'Erste.']);
    const nachErster = await dokuStand(f.id);
    await asUserCommitted(users.therapist, KORRIGIEREN, [
      f.id,
      nachErster.updated_at,
      'Synthetisch: dritte Fassung des Eintrags.',
      'Zweite.',
    ]);

    expect((await versionen(f.id)).map((v) => v.version_no)).toEqual([1, 2, 3]);
  });

  it('verlangt eine Begruendung (Punkt 6)', async () => {
    const f = await finalisiert();
    await expect(
      asUser(users.therapist, KORRIGIEREN, [f.id, f.updated_at, KORREKTUR, '   \n ']),
    ).rejects.toThrow(/change reason is required/);
    expect(await versionen(f.id)).toHaveLength(1);
  });

  it('weist eine Korrektur ohne inhaltliche Aenderung ab', async () => {
    const f = await finalisiert();
    await expect(
      asUser(users.therapist, KORRIGIEREN, [f.id, f.updated_at, ENTWURF, 'Nichts geaendert.']),
    ).rejects.toThrow(/documentation is unchanged/);
  });

  it('weist eine Korrektur an einem Entwurf ab', async () => {
    const e = await entwurf();
    await expect(
      asUser(users.therapist, KORRIGIEREN, [e.id, e.updated_at, KORREKTUR, 'Zu frueh.']),
    ).rejects.toThrow(/treatment note is not final/);
  });

  it('weist einen veralteten Stand ab', async () => {
    const f = await finalisiert();
    await asUserCommitted(users.therapist, KORRIGIEREN, [f.id, f.updated_at, KORREKTUR, 'Erste.']);

    await expect(
      asUser(users.teamLead, KORRIGIEREN, [
        f.id,
        f.updated_at,
        'Synthetisch: konkurrierende Fassung.',
        'Zweite.',
      ]),
    ).rejects.toThrow(/treatment note was changed meanwhile/);
    expect(await versionen(f.id)).toHaveLength(2);
  });

  it('laesst office nicht korrigieren (4.3)', async () => {
    const f = await finalisiert();
    await expect(
      asUser(users.office, KORRIGIEREN, [f.id, f.updated_at, KORREKTUR, 'Von der Verwaltung.']),
    ).rejects.toThrow(/not allowed to write treatment documentation/);
  });

  it('haelt Text und Begruendung aus dem Auditlog heraus (ADR-010, ADR-011)', async () => {
    const f = await finalisiert();
    await asUserCommitted(users.therapist, KORRIGIEREN, [
      f.id,
      f.updated_at,
      'Synthetisch: Geheimer Korrekturtext.',
      'Geheime Begruendung.',
    ]);

    const eigener = (await auditEintraege('treatment_note.revised')).find(
      (a) => a.subject_id === f.id,
    );
    expect(eigener).toMatchObject({ actor_user_id: users.therapist, outcome: 'success' });
    expect(eigener?.context).toMatchObject({ version_no: 2, patient_id: patients.max });
    const kontext = JSON.stringify(eigener?.context);
    expect(kontext).not.toContain('Geheimer Korrekturtext');
    expect(kontext).not.toContain('Geheime Begruendung');
  });
});

// =============================================================================
// Nachtrag (ADR-016 Punkt 6)
// =============================================================================

describe('DOK-002: Nachtrag als eigener Eintrag', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('legt den Nachtrag als eigenen Entwurf am selben Termin an', async () => {
    const f = await finalisiert();
    const { rows } = await asUserCommitted<{ id: string }>(users.teamLead, NACHTRAGEN, [
      f.id,
      NACHTRAG,
    ]);

    const eltern = await dokuZeile(f.id);
    expect(await dokuZeile(rows[0]!.id)).toMatchObject({
      addendum_to_note_id: f.id,
      appointment_id: eltern?.appointment_id,
      organization_id: organizationId,
      status: 'draft',
      content: NACHTRAG,
      created_by: users.teamLead,
    });
  });

  it('laesst den Ursprungseintrag unangetastet', async () => {
    const f = await finalisiert();
    await asUserCommitted(users.therapist, NACHTRAGEN, [f.id, NACHTRAG]);

    expect(await dokuZeile(f.id)).toMatchObject({ content: ENTWURF, status: 'final' });
    expect(await versionen(f.id)).toHaveLength(1);
  });

  it('erlaubt mehrere Nachtraege zu demselben Termin', async () => {
    const f = await finalisiert();
    await asUserCommitted(users.therapist, NACHTRAGEN, [f.id, NACHTRAG]);
    await asUserCommitted(users.therapist, NACHTRAGEN, [f.id, 'Synthetisch: zweiter Nachtrag.']);

    const { rows } = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.treatment_notes where addendum_to_note_id = $1',
      [f.id],
    );
    expect(rows[0]?.anzahl).toBe('2');
  });

  it('weist einen Nachtrag zu einem Entwurf ab', async () => {
    const e = await entwurf();
    await expect(asUser(users.therapist, NACHTRAGEN, [e.id, NACHTRAG])).rejects.toThrow(
      /treatment note is not final/,
    );
  });

  it('weist einen Nachtrag zu einem Nachtrag ab', async () => {
    const f = await finalisiert();
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, NACHTRAGEN, [
      f.id,
      NACHTRAG,
    ]);
    const n = await dokuStand(rows[0]!.id);
    await asUserCommitted(users.therapist, FINALISIEREN, [n.id, n.updated_at]);

    await expect(
      asUser(users.therapist, NACHTRAGEN, [n.id, 'Synthetisch: Nachtrag zum Nachtrag.']),
    ).rejects.toThrow(/addendum cannot be extended/);
  });

  it('behandelt den Nachtrag im weiteren Verlauf wie jeden Eintrag', async () => {
    const f = await finalisiert();
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, NACHTRAGEN, [
      f.id,
      NACHTRAG,
    ]);
    const n = await dokuStand(rows[0]!.id);
    await asUserCommitted(users.therapist, FINALISIEREN, [n.id, n.updated_at]);

    expect(await versionen(n.id)).toEqual([
      { version_no: 1, content: NACHTRAG, change_reason: null, author_id: users.therapist },
    ]);
  });

  it('laesst office keinen Nachtrag anlegen (4.3)', async () => {
    const f = await finalisiert();
    await expect(asUser(users.office, NACHTRAGEN, [f.id, NACHTRAG])).rejects.toThrow(
      /not allowed to write treatment documentation/,
    );
  });

  it('protokolliert treatment_note.addendum_created mit dem Ursprungsbezug', async () => {
    const f = await finalisiert();
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, NACHTRAGEN, [
      f.id,
      'Synthetisch: Geheimer Nachtragstext.',
    ]);

    const eigener = (await auditEintraege('treatment_note.addendum_created')).find(
      (a) => a.subject_id === rows[0]!.id,
    );
    expect(eigener?.context).toMatchObject({ parent_note_id: f.id, patient_id: patients.max });
    expect(JSON.stringify(eigener?.context)).not.toContain('Geheimer Nachtragstext');
  });
});

// =============================================================================
// Lesepfade (ADR-016 Punkt 8 und 9)
// =============================================================================

describe('DOK-002: Lesen von Eintrag und Verlauf', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('liefert Haupteintrag und Nachtraege in dieser Reihenfolge', async () => {
    const f = await finalisiert();
    const eltern = await dokuZeile(f.id);
    await asUserCommitted(users.therapist, NACHTRAGEN, [f.id, NACHTRAG]);

    const { rows } = await asUserCommitted<{
      id: string;
      addendum_to_note_id: string | null;
      status: string;
      version_count: number;
    }>(users.therapist, LESEN, [eltern?.appointment_id]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: f.id, addendum_to_note_id: null, status: 'final' });
    expect(rows[0]?.version_count).toBe(1);
    expect(rows[1]).toMatchObject({ addendum_to_note_id: f.id, status: 'draft' });
    expect(rows[1]?.version_count).toBe(0);
  });

  it('protokolliert je gelesenem Eintrag einen Zugriff (ADR-010)', async () => {
    const f = await finalisiert();
    const eltern = await dokuZeile(f.id);
    const { rows: nachtrag } = await asUserCommitted<{ id: string }>(users.therapist, NACHTRAGEN, [
      f.id,
      NACHTRAG,
    ]);

    const vorher = (await auditEintraege('treatment_note.viewed')).length;
    await asUserCommitted(users.ownerTherapist, LESEN, [eltern?.appointment_id]);
    const nachher = await auditEintraege('treatment_note.viewed');

    expect(nachher.length - vorher).toBe(2);
    const eigene = nachher.filter((a) => a.actor_user_id === users.ownerTherapist);
    expect(eigene.map((a) => a.subject_id).sort()).toEqual([f.id, nachtrag[0]!.id].sort());
  });

  it('liefert den Verlauf mit Inhalt, Begruendung und Urheber je Version', async () => {
    const f = await finalisiert();
    await asUserCommitted(users.teamLead, KORRIGIEREN, [
      f.id,
      f.updated_at,
      KORREKTUR,
      'Zahlendreher.',
    ]);

    const { rows } = await asUserCommitted<{
      version_no: number;
      content: string;
      change_reason: string | null;
      author_name: string | null;
    }>(users.therapist, VERLAUF, [f.id]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ version_no: 1, content: ENTWURF, change_reason: null });
    expect(rows[1]).toMatchObject({
      version_no: 2,
      content: KORREKTUR,
      change_reason: 'Zahlendreher.',
    });
    expect(rows[0]?.author_name).toBe('Anna Beispiel');
    expect(rows[1]?.author_name).toBe('Tim Teamleitung');
  });

  it('protokolliert das Lesen des Verlaufs gesondert (Punkt 9)', async () => {
    const f = await finalisiert();
    await asUserCommitted(users.ownerTherapist, VERLAUF, [f.id]);

    const eigener = (await auditEintraege('treatment_note.history_viewed')).find(
      (a) => a.subject_id === f.id,
    );
    expect(eigener).toMatchObject({
      subject_type: 'treatment_note',
      actor_user_id: users.ownerTherapist,
      outcome: 'success',
    });
    expect(eigener?.context).toMatchObject({ patient_id: patients.max });
  });

  it('laesst office den Verlauf nicht lesen (Punkt 8, 4.3)', async () => {
    const f = await finalisiert();
    await expect(asUser(users.office, VERLAUF, [f.id])).rejects.toThrow(
      /not allowed to read treatment documentation/,
    );
  });

  it('laesst ein Patientenkonto den Verlauf nicht lesen (4.6)', async () => {
    const f = await finalisiert();
    await expect(asUser(users.patientMax, VERLAUF, [f.id])).rejects.toThrow(
      /not allowed to read treatment documentation/,
    );
  });

  it('liefert zu einer unbekannten Dokumentation nichts und protokolliert nichts', async () => {
    const vorher = (await auditEintraege('treatment_note.history_viewed')).length;
    const { rows } = await asUserCommitted(users.therapist, VERLAUF, [
      '99999999-9999-4999-8999-000000000002',
    ]);

    expect(rows).toEqual([]);
    expect((await auditEintraege('treatment_note.history_viewed')).length).toBe(vorher);
  });

  it('haelt den Verlauf ueber den Anwendungspfad unerreichbar (ADR-004)', async () => {
    await expect(
      asUser(users.therapist, 'select content from public.treatment_note_versions'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('loescht die Versionen mit dem Eintrag (ADR-008, ADR-016)', async () => {
    // Es gibt heute keinen fachlichen Loeschvorgang - LOE-002 baut ihn. Geprueft
    // wird hier nur, dass das Datenmodell keinen Versionsverlauf zuruecklaesst,
    // der eine spaetere wirksame Loeschung ueberlebt.
    const f = await finalisiert();
    await asPostgres('delete from public.treatment_notes where id = $1', [f.id]);

    expect(await versionen(f.id)).toEqual([]);
  });
});
