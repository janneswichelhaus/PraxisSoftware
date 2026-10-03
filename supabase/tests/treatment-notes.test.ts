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
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Behandlungsdokumentation zum Termin (DOK-001).
 *
 * Das ist der erste klinische Freitext im System. Geprueft werden deshalb vor
 * allem die Zusagen, die es vorher nicht zu pruefen gab:
 *
 *   * office und Patientenkonten kommen an klinische Inhalte nicht heran
 *     (PROJECT_PRINCIPLES.md 4.3, 4.6),
 *   * es gibt keinen Lesepfad an der Protokollierung vorbei (ADR-010),
 *   * ein Entwurf wird nicht still ueberschrieben (ADR-001),
 *   * im Auditlog steht kein Behandlungsinhalt (ADR-010, ADR-011).
 *
 * Alle Inhalte in dieser Datei sind erkennbar synthetisch und stammen aus
 * keinem realen Behandlungsfall (PROJECT_PRINCIPLES.md 3.1).
 */

const { users, organizationId, patients } = SEED;

const STAFF = {
  anna: '55555555-5555-4555-8555-000000000002',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

// Mit Arbeitszeitbestaetigung: die Arbeitszeitregeln haben eigene Tests, hier
// waeren sie nur Rauschen (CAL-005).
const TERMIN_ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const TERMIN_ABSAGEN =
  'select public.cancel_appointment($1::uuid, $2::timestamptz, $3, null::date, null::time) as id';
const TERMIN_ABSCHLIESSEN = 'select public.complete_appointment($1::uuid, $2::timestamptz) as id';

const ANLEGEN = 'select public.create_treatment_note($1::uuid, $2) as id';
const AENDERN = 'select public.update_treatment_note($1::uuid, $2::timestamptz, $3) as id';
const LESEN = 'select * from public.get_treatment_note($1::uuid)';

const TEXT = 'Synthetischer Testinhalt: Uebungen angeleitet, Belastung gesteigert.';

interface Stand {
  id: string;
  updated_at: string;
}

/** Roher updated_at-Wert inklusive Bruchteilen - Grundlage der Konfliktpruefung. */
const ROH_UPDATED_AT =
  'to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at';

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

/**
 * Legt einen Termin an. Jeder Aufruf bekommt einen eigenen Kalendertag -
 * sonst griffe der Ueberschneidungsschutz aus CAL-001.
 */
let laufend = 0;

async function termin(opts: { staff?: string; patient?: string } = {}): Promise<Stand> {
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
  return terminStand(rows[0]!.id);
}

async function dokuZeile(id: string) {
  const { rows } = await asPostgres<Record<string, unknown>>(
    'select * from public.treatment_notes where id = $1',
    [id],
  );
  return rows[0];
}

async function auditEintraege(action: string) {
  const { rows } = await asPostgres<{
    subject_type: string;
    subject_id: string;
    actor_user_id: string;
    outcome: string;
    context: Record<string, unknown>;
  }>(
    'select subject_type, subject_id, actor_user_id, outcome, context from public.audit_log where action = $1 order by occurred_at',
    [action],
  );
  return rows;
}

/** Alle Auditzeilen zu einem Eintrag, samt Inhalt als Text (LOG-EPIC-001). */
async function auditZumEintrag(id: string) {
  const { rows } = await asPostgres<{ action: string }>(
    'select action from public.audit_log where subject_id = $1',
    [id],
  );
  return rows;
}

/** Das gesamte Auditlog als Text - fuer die Pruefung, dass kein Inhalt darin steht. */
async function auditAlsText(): Promise<string> {
  const { rows } = await asPostgres<{ eintrag: string }>(
    'select row_to_json(a)::text as eintrag from public.audit_log a',
  );
  return rows.map((r) => r.eintrag).join('\n');
}

// =============================================================================
// Anlegen
// =============================================================================

describe('DOK-001: Behandlungsdokumentation anlegen', () => {
  // Ein Zugang mit ausschliesslich der Rolle owner. Im Seed traegt Jannes
  // zusaetzlich 'therapist'; ohne diesen zweiten Zugang liesse sich nicht
  // pruefen, dass die Praxisleitung liest, aber nicht dokumentiert.
  const nurOwner = '11111111-1111-4111-8111-0000000000d1';
  const nurOwnerPerson = '44444444-4444-4444-8444-0000000000d1';

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${nurOwner}', 'olaf.ohnetherapie@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.persons (id, organization_id, given_name, family_name)
        values ('${nurOwnerPerson}', '${organizationId}', 'Olaf', 'Ohnetherapie');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${nurOwner}', '${organizationId}', '${nurOwnerPerson}', 'Olaf Ohnetherapie');
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('${nurOwner}', '${organizationId}', 'owner');
    `);
  }, 120_000);

  it('legt zu einem geplanten Termin einen Entwurf an', async () => {
    const t = await termin();
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
      t.id,
      `  ${TEXT}  `,
    ]);

    const zeile = await dokuZeile(rows[0]!.id);
    expect(zeile).toMatchObject({
      appointment_id: t.id,
      organization_id: organizationId,
      status: 'draft',
      // Fuehrende und abschliessende Leerzeichen werden serverseitig entfernt.
      content: TEXT,
      created_by: users.therapist,
      updated_by: users.therapist,
    });
  });

  it('weist das Anlegen am Eintrag nach und schreibt keinen Auditeintrag, also keinen Inhalt (LOG-EPIC-001)', async () => {
    const t = await termin();
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
      t.id,
      'Synthetisch: Geheimer Inhalt, der nirgends im Auditlog stehen darf.',
    ]);

    // Wer und wann stehen am Eintrag (ANN-230).
    const zeile = await dokuZeile(rows[0]!.id);
    expect(zeile).toMatchObject({
      appointment_id: t.id,
      created_by: users.therapist,
    });
    expect(zeile?.['created_at']).toBeInstanceOf(Date);

    expect(await auditZumEintrag(rows[0]!.id)).toEqual([]);
    expect(await auditAlsText()).not.toContain('Geheimer Inhalt');
  });

  it('erlaubt die Dokumentation eines abgeschlossenen Termins', async () => {
    const t = await termin();
    await asUserCommitted(users.office, TERMIN_ABSCHLIESSEN, [t.id, t.updated_at]);

    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [t.id, TEXT]);
    expect(await dokuZeile(rows[0]!.id)).toMatchObject({ status: 'draft' });
  });

  it('weist einen abgesagten Termin ab', async () => {
    const t = await termin();
    await asUserCommitted(users.office, TERMIN_ABSAGEN, [t.id, t.updated_at, 'other']);

    await expect(asUser(users.therapist, ANLEGEN, [t.id, TEXT])).rejects.toThrow(
      /cancelled appointment cannot be documented/,
    );
  });

  it('laesst zu einem Termin nur eine Dokumentation zu', async () => {
    const t = await termin();
    await asUserCommitted(users.therapist, ANLEGEN, [t.id, TEXT]);

    await expect(asUser(users.teamLead, ANLEGEN, [t.id, 'Zweiter Versuch.'])).rejects.toThrow(
      /treatment note already exists/,
    );
  });

  it('laesst office nicht dokumentieren (PROJECT_PRINCIPLES.md 4.3)', async () => {
    const t = await termin();
    await expect(asUser(users.office, ANLEGEN, [t.id, TEXT])).rejects.toThrow(
      /not allowed to write treatment documentation/,
    );
    const { rows } = await asPostgres(
      'select id from public.treatment_notes where appointment_id = $1',
      [t.id],
    );
    expect(rows).toEqual([]);
  });

  it('laesst ein Patientenkonto nicht dokumentieren (4.6)', async () => {
    const t = await termin();
    await expect(asUser(users.patientMax, ANLEGEN, [t.id, TEXT])).rejects.toThrow(
      /not allowed to write treatment documentation/,
    );
  });

  it('laesst einen reinen owner-Zugang nicht dokumentieren (4.1 gegen 4.2)', async () => {
    const t = await termin();
    await expect(asUser(nurOwner, ANLEGEN, [t.id, TEXT])).rejects.toThrow(
      /not allowed to write treatment documentation/,
    );
  });

  it('laesst team_lead dokumentieren (4.5)', async () => {
    const t = await termin({ staff: STAFF.tim });
    const { rows } = await asUserCommitted<{ id: string }>(users.teamLead, ANLEGEN, [t.id, TEXT]);
    expect(await dokuZeile(rows[0]!.id)).toMatchObject({ created_by: users.teamLead });
  });

  it('weist einen leeren Inhalt ab', async () => {
    const t = await termin();
    await expect(asUser(users.therapist, ANLEGEN, [t.id, '   \n  '])).rejects.toThrow(
      /documentation must not be empty/,
    );
  });

  it('weist einen zu langen Inhalt ab', async () => {
    const t = await termin();
    await expect(asUser(users.therapist, ANLEGEN, [t.id, 'x'.repeat(20_001)])).rejects.toThrow(
      /documentation is too long/,
    );
  });

  it('weist einen unbekannten Termin ab', async () => {
    await expect(
      asUser(users.therapist, ANLEGEN, ['77777777-7777-4777-8777-00000000eeee', TEXT]),
    ).rejects.toThrow(/appointment not found/);
  });

  it('laesst einen nicht angemeldeten Zugriff nicht zu', async () => {
    const t = await termin();
    await expect(asAnon(ANLEGEN, [t.id, TEXT])).rejects.toThrow(
      /permission denied|not authenticated/,
    );
  });
});

// =============================================================================
// Bearbeiten
// =============================================================================

describe('DOK-001: Entwurf bearbeiten', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  async function entwurf(): Promise<Stand> {
    const t = await termin();
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [t.id, TEXT]);
    return dokuStand(rows[0]!.id);
  }

  it('aendert den Inhalt und fuehrt die aendernde Person mit', async () => {
    const d = await entwurf();
    await asUserCommitted(users.teamLead, AENDERN, [d.id, d.updated_at, 'Ergaenzter Testinhalt.']);

    expect(await dokuZeile(d.id)).toMatchObject({
      content: 'Ergaenzter Testinhalt.',
      // Angelegt hat therapist, geaendert team_lead - beide bleiben sichtbar
      // (PROJECT_PRINCIPLES.md 5).
      created_by: users.therapist,
      updated_by: users.teamLead,
    });
  });

  it('weist das Aendern am Eintrag nach und schreibt keinen Auditeintrag, also keinen Inhalt (LOG-EPIC-001)', async () => {
    const d = await entwurf();
    await asUserCommitted(users.therapist, AENDERN, [
      d.id,
      d.updated_at,
      'Synthetisch: Zweiter geheimer Inhalt.',
    ]);

    // Wer und wann stehen am Eintrag (ANN-230).
    const danach = await dokuStand(d.id);
    expect(danach.updated_at).not.toBe(d.updated_at);
    expect(await dokuZeile(d.id)).toMatchObject({ updated_by: users.therapist });

    expect(await auditZumEintrag(d.id)).toEqual([]);
    expect(await auditAlsText()).not.toContain('geheimer Inhalt');
  });

  it('weist eine Aenderung auf veraltetem Stand ab und laesst den Text stehen (ADR-001)', async () => {
    const d = await entwurf();
    await asUserCommitted(users.therapist, AENDERN, [d.id, d.updated_at, 'Erste Aenderung.']);

    // Zweiter Versuch auf demselben, inzwischen ueberholten Stand.
    await expect(
      asUser(users.teamLead, AENDERN, [d.id, d.updated_at, 'Zweite Aenderung.']),
    ).rejects.toThrow(/treatment note was changed meanwhile/);

    expect(await dokuZeile(d.id)).toMatchObject({ content: 'Erste Aenderung.' });
  });

  it('schreibt bei unveraendertem Inhalt weder Daten noch Auditeintrag', async () => {
    const d = await entwurf();
    await asUserCommitted(users.therapist, AENDERN, [d.id, d.updated_at, `  ${TEXT}  `]);

    const danach = await dokuStand(d.id);
    expect(danach.updated_at).toBe(d.updated_at);

    expect(await auditZumEintrag(d.id)).toEqual([]);
  });

  it('verlangt einen erwarteten Stand', async () => {
    const d = await entwurf();
    await expect(asUser(users.therapist, AENDERN, [d.id, null, 'Ohne Stand.'])).rejects.toThrow(
      /expected updated_at is required/,
    );
  });

  it('weist einen leeren Inhalt ab', async () => {
    const d = await entwurf();
    await expect(asUser(users.therapist, AENDERN, [d.id, d.updated_at, '  '])).rejects.toThrow(
      /documentation must not be empty/,
    );
    expect(await dokuZeile(d.id)).toMatchObject({ content: TEXT });
  });

  it('laesst office nicht aendern', async () => {
    const d = await entwurf();
    await expect(
      asUser(users.office, AENDERN, [d.id, d.updated_at, 'Fremde Aenderung.']),
    ).rejects.toThrow(/not allowed to write treatment documentation/);
    expect(await dokuZeile(d.id)).toMatchObject({ content: TEXT });
  });

  it('weist eine unbekannte Dokumentation ab', async () => {
    const d = await entwurf();
    await expect(
      asUser(users.therapist, AENDERN, [
        '88888888-8888-4888-8888-00000000eeee',
        d.updated_at,
        'Irgendwas.',
      ]),
    ).rejects.toThrow(/treatment note not found/);
  });
});

// =============================================================================
// Lesen und Protokollierung
// =============================================================================

describe('DOK-001: Lesen', () => {
  /** Termin mit Dokumentation. */
  let terminId: string;
  /** Termin ohne Dokumentation. */
  let ohneDoku: Stand;

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    const t = await termin();
    terminId = t.id;
    await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [t.id, TEXT]);
    ohneDoku = await termin();
  }, 120_000);

  it('liefert therapist den Inhalt samt Urheberschaft', async () => {
    const { rows } = await asUserCommitted<{
      content: string;
      status: string;
      author_name: string;
      last_editor_name: string;
    }>(users.therapist, LESEN, [terminId]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      content: TEXT,
      status: 'draft',
      author_name: 'Anna Beispiel',
      last_editor_name: 'Anna Beispiel',
    });
  });

  it('protokolliert das Lesen als Öffnen der Akte, einmal am Tag (ADR-010, LOG-EPIC-001)', async () => {
    await asUserCommitted(users.teamLead, LESEN, [terminId]);
    await asUserCommitted(users.teamLead, LESEN, [terminId]);

    const eintraege = (await auditEintraege('patient_record.viewed')).filter(
      (e) => e.actor_user_id === users.teamLead,
    );
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toMatchObject({ subject_type: 'patient', subject_id: patients.max });
    expect(JSON.stringify(eintraege[0]?.context)).not.toContain('Uebungen angeleitet');
    expect(await auditEintraege('treatment_note.viewed')).toEqual([]);
  });

  it('laesst owner lesen (4.1)', async () => {
    const { rows } = await asUserCommitted<{ content: string }>(users.ownerTherapist, LESEN, [
      terminId,
    ]);
    expect(rows[0]?.content).toBe(TEXT);
  });

  it('laesst office lesen und protokolliert den Zugriff (E15, ADR-004 Fassung 2)', async () => {
    const { rows } = await asUserCommitted<{ content: string }>(users.office, LESEN, [terminId]);
    expect(rows[0]?.content).toBe(TEXT);

    const eintraege = (await auditEintraege('patient_record.viewed')).filter(
      (e) => e.actor_user_id === users.office,
    );
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toMatchObject({ subject_type: 'patient', subject_id: patients.max });
    expect(JSON.stringify(eintraege[0]?.context)).not.toContain('Uebungen angeleitet');
  });

  it('laesst ein Patientenkonto nicht lesen und protokolliert den Versuch (4.6, G6a)', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.patientMax,
      LESEN,
      [terminId],
      'treatment_note.viewed',
    );
  });

  it('liefert fuer einen Termin ohne Dokumentation nichts und protokolliert nichts', async () => {
    const vorher = (await auditEintraege('patient_record.viewed')).length;
    const { rows } = await asUserCommitted(users.therapist, LESEN, [ohneDoku.id]);
    expect(rows).toEqual([]);
    expect((await auditEintraege('patient_record.viewed')).length).toBe(vorher);
  });

  it('liefert fuer einen unbekannten Termin dasselbe leere Ergebnis', async () => {
    const { rows } = await asUserCommitted(users.therapist, LESEN, [
      '77777777-7777-4777-8777-00000000eeee',
    ]);
    expect(rows).toEqual([]);
  });

  it('laesst die Tabelle selbst nicht lesen - auch nicht mit therapeutischer Rolle', async () => {
    await expect(
      asUser(users.therapist, 'select content from public.treatment_notes'),
    ).rejects.toThrow(/permission denied/i);
    await expect(asAnon('select content from public.treatment_notes')).rejects.toThrow(
      /permission denied/i,
    );
  });
});

// =============================================================================
// Mandantentrennung
// =============================================================================

describe('DOK-001: Mandantentrennung', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000e1';
  const fremderTherapeut = '11111111-1111-4111-8111-0000000000e1';
  const fremdePerson = '44444444-4444-4444-8444-0000000000e1';
  const fremdePatientPerson = '44444444-4444-4444-8444-0000000000e2';
  const fremderStaff = '55555555-5555-4555-8555-0000000000e1';
  const fremderPatient = '66666666-6666-4666-8666-0000000000e1';

  let fremderTermin: string;
  let fremdeDoku: Stand;

  beforeAll(async () => {
    await resetDatabaseOhneTermine();

    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderTherapeut}', 'thea.fremd@praxis.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Andernorts', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name) values
        ('${fremdePerson}',        '${fremdeOrg}', 'Thea',  'Fremd'),
        ('${fremdePatientPerson}', '${fremdeOrg}', 'Fritz', 'Fremdpatient');
      insert into public.staff_members (id, organization_id, person_id)
        values ('${fremderStaff}', '${fremdeOrg}', '${fremdePerson}');
      insert into public.patients (id, organization_id, person_id, status)
        values ('${fremderPatient}', '${fremdeOrg}', '${fremdePatientPerson}', 'active');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderTherapeut}', '${fremdeOrg}', '${fremdePerson}', 'Thea Fremd');
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('${fremderTherapeut}', '${fremdeOrg}', 'therapist');
    `);

    const { rows: termine } = await asUserCommitted<{ id: string }>(
      fremderTherapeut,
      TERMIN_ANLEGEN,
      [fremderPatient, fremderStaff, 'video', tagInTagen(400), '09:00', '10:00', null],
    );
    fremderTermin = termine[0]!.id;

    const { rows: doku } = await asUserCommitted<{ id: string }>(fremderTherapeut, ANLEGEN, [
      fremderTermin,
      'Synthetischer Inhalt einer fremden Praxis.',
    ]);
    fremdeDoku = await dokuStand(doku[0]!.id);
  }, 120_000);

  it('laesst zum Termin einer fremden Praxis nichts anlegen', async () => {
    await expect(asUser(users.therapist, ANLEGEN, [fremderTermin, TEXT])).rejects.toThrow(
      /appointment not found/,
    );
  });

  it('liefert die Dokumentation einer fremden Praxis nicht', async () => {
    const { rows } = await asUserCommitted(users.therapist, LESEN, [fremderTermin]);
    expect(rows).toEqual([]);
  });

  it('liefert office Eintrag und Verlauf einer fremden Praxis nicht und protokolliert nichts (E15)', async () => {
    // E15 oeffnet office die eigene Praxis, keine fremde (ADR-003, ADR-004).
    const { rows: eintrag } = await asUserCommitted(users.office, LESEN, [fremderTermin]);
    expect(eintrag).toEqual([]);

    const { rows: verlauf } = await asUserCommitted(
      users.office,
      'select * from public.get_treatment_note_versions($1::uuid)',
      [fremdeDoku.id],
    );
    expect(verlauf).toEqual([]);

    const { rows: audit } = await asPostgres(
      'select id from public.audit_log where subject_id = $1 and actor_user_id = $2',
      [fremdeDoku.id, users.office],
    );
    expect(audit).toEqual([]);
  });

  it('laesst die Dokumentation einer fremden Praxis nicht aendern', async () => {
    await expect(
      asUser(users.therapist, AENDERN, [fremdeDoku.id, fremdeDoku.updated_at, 'Fremdzugriff.']),
    ).rejects.toThrow(/treatment note not found/);

    expect(await dokuZeile(fremdeDoku.id)).toMatchObject({
      content: 'Synthetischer Inhalt einer fremden Praxis.',
    });
  });
});
