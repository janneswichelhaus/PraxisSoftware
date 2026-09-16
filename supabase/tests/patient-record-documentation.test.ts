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
 * Dokumentation in der Akte (DOK-003, ROL-001).
 *
 * Zwei Sichten auf dieselben Termine, zwei Rueckgabetypen (ADR-004):
 *
 *   * Der Behandlungsnachweis (PROJECT_PRINCIPLES.md 4.4) liefert den
 *     Dokumentationsstand je Termin - und an keiner Stelle klinischen Inhalt.
 *     Seit E15 ist er keine Zugriffsgrenze mehr, sondern die Rechnungssicht
 *     (ADR-004 Fassung 2 Punkt 4).
 *   * Die klinische Sicht liefert allen vier Praxisrollen - seit E15 auch
 *     office - die Eintraege samt Inhalt und kommt nicht an der
 *     Protokollierung vorbei (ADR-010, ADR-016 Punkt 9).
 *
 * Beide teilen sich die Seitenregel: welche Termine zur Akte gehoeren, die
 * Reihenfolge und das Blaettern. Sie wird deshalb am Nachweis geprueft und an
 * der klinischen Sicht nur gegengeprueft.
 *
 * Alle Inhalte in dieser Datei sind erkennbar synthetisch und stammen aus
 * keinem realen Behandlungsfall (PROJECT_PRINCIPLES.md 3.1).
 */

const { users, organizationId, patients } = SEED;

const STAFF = {
  anna: '55555555-5555-4555-8555-000000000002',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const TERMIN_ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const TERMIN_ABSAGEN =
  'select public.cancel_appointment($1::uuid, $2::timestamptz, $3, null::date, null::time) as id';
const TERMIN_ABSCHLIESSEN = 'select public.complete_appointment($1::uuid, $2::timestamptz) as id';

const ANLEGEN = 'select public.create_treatment_note($1::uuid, $2) as id';
const FINALISIEREN = 'select public.finalize_treatment_note($1::uuid, $2::timestamptz) as id';
const NACHTRAGEN = 'select public.create_treatment_note_addendum($1::uuid, $2) as id';

const NACHWEIS =
  'select * from public.list_patient_treatment_evidence($1::uuid, $2::integer, $3::timestamptz, $4::uuid)';
const AKTE =
  'select * from public.list_patient_treatment_notes($1::uuid, $2::integer, $3::timestamptz, $4::uuid)';

const TEXT = 'Synthetischer Testinhalt: Uebungen angeleitet, Belastung gesteigert.';

/** Roher updated_at-Wert inklusive Bruchteilen - Grundlage der Konfliktpruefung. */
const ROH_UPDATED_AT =
  'to_char(updated_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"+00"\') as updated_at';

interface Stand {
  id: string;
  updated_at: string;
}

interface NachweisZeile {
  appointment_id: string;
  starts_at: Date;
  ends_at: Date;
  appointment_type: string;
  appointment_status: string;
  staff_given_name: string;
  staff_family_name: string;
  organization_time_zone: string;
  documentation_status: string;
  documented_at: Date | null;
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

/**
 * Legt einen Termin an. Jeder Aufruf bekommt einen eigenen Kalendertag -
 * sonst griffe der Ueberschneidungsschutz aus CAL-001.
 */
let laufend = 0;

async function termin(
  opts: { staff?: string; patient?: string; actor?: string } = {},
): Promise<Stand> {
  laufend += 1;
  const { rows } = await asUserCommitted<{ id: string }>(
    opts.actor ?? users.office,
    TERMIN_ANLEGEN,
    [
      opts.patient ?? patients.max,
      opts.staff ?? STAFF.anna,
      'video',
      tagInTagen(30 + laufend),
      '09:00',
      '10:00',
      null,
    ],
  );
  return terminStand(rows[0]!.id);
}

/**
 * Ein Termin in der Vergangenheit.
 *
 * create_appointment weist vergangene Tage ab - die Akte braucht sie aber,
 * denn genau dort liegt der Behandlungsverlauf. Der Termin wird deshalb wie
 * ueblich angelegt und anschliessend als Testvorbereitung zurueckdatiert:
 * `tageZurueck` Tage vor heute, um genau so viele Tage frueher, wie er
 * angelegt wurde. Die Kalendertage bleiben dabei je Aufruf verschieden.
 */
async function vergangenerTermin(
  tageZurueck: number,
  opts: { staff?: string; patient?: string } = {},
): Promise<Stand> {
  const t = await termin(opts);
  await asPostgres(
    `update public.appointments
        set starts_at = starts_at - make_interval(days => $2),
            ends_at   = ends_at   - make_interval(days => $2)
      where id = $1`,
    [t.id, 30 + laufend + tageZurueck],
  );
  return terminStand(t.id);
}

async function entwurf(terminId: string, text = TEXT): Promise<Stand> {
  const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
    terminId,
    text,
  ]);
  return dokuStand(rows[0]!.id);
}

async function finalisiert(terminId: string, text = TEXT): Promise<Stand> {
  const d = await entwurf(terminId, text);
  await asUserCommitted(users.therapist, FINALISIEREN, [d.id, d.updated_at]);
  return dokuStand(d.id);
}

async function nachweis(
  actor: string,
  patient: string,
  limit = 20,
  cursor: { startsAt: Date; id: string } | null = null,
): Promise<NachweisZeile[]> {
  const { rows } = await asUserCommitted<NachweisZeile>(actor, NACHWEIS, [
    patient,
    limit,
    cursor?.startsAt.toISOString() ?? null,
    cursor?.id ?? null,
  ]);
  return rows;
}

interface AkteEintrag {
  id: string;
  appointment_id: string;
  addendum_to_note_id: string | null;
  status: string;
  content: string;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  version_count: number;
  author_name: string | null;
  last_editor_name: string | null;
  finalized_by_name: string | null;
}

interface AkteZeile {
  appointment_id: string;
  starts_at: Date;
  ends_at: Date;
  appointment_type: string;
  appointment_status: string;
  staff_given_name: string;
  staff_family_name: string;
  organization_time_zone: string;
  notes: AkteEintrag[];
}

async function akte(
  actor: string,
  patient: string,
  limit = 20,
  cursor: { startsAt: Date; id: string } | null = null,
): Promise<AkteZeile[]> {
  const { rows } = await asUserCommitted<AkteZeile>(actor, AKTE, [
    patient,
    limit,
    cursor?.startsAt.toISOString() ?? null,
    cursor?.id ?? null,
  ]);
  return rows;
}

async function auditEintraege(action: string) {
  const { rows } = await asPostgres<{
    subject_id: string;
    actor_user_id: string;
    outcome: string;
    context: Record<string, unknown>;
  }>(
    'select subject_id, actor_user_id, outcome, context from public.audit_log where action = $1 order by occurred_at',
    [action],
  );
  return rows;
}

async function auditAnzahl(): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(
    'select count(*)::text as n from public.audit_log',
  );
  return Number(rows[0]!.n);
}

// =============================================================================
// Behandlungsnachweis
// =============================================================================

describe('DOK-003: Behandlungsnachweis in der Akte', () => {
  /** Drei vergangene Termine von Erika: finalisiert, Entwurf, ohne Dokumentation. */
  let finalTermin: Stand;
  let entwurfTermin: Stand;
  let leererTermin: Stand;
  let finalDoku: Stand;

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    // Erika statt Max, damit die Seitenregel-Tests unten ihre eigenen Termine
    // an Max haengen koennen, ohne diese drei mitzuzaehlen.
    leererTermin = await vergangenerTermin(30, { patient: patients.erika });
    entwurfTermin = await vergangenerTermin(20, { patient: patients.erika, staff: STAFF.tim });
    finalTermin = await vergangenerTermin(10, { patient: patients.erika });
    await entwurf(
      entwurfTermin.id,
      'Synthetisch: Geheimer Entwurf, gehoert nicht in den Nachweis.',
    );
    finalDoku = await finalisiert(
      finalTermin.id,
      'Synthetisch: Geheimer Inhalt, gehoert nicht in den Nachweis.',
    );
  }, 120_000);

  it('liefert office je Termin den Dokumentationsstand, neueste zuerst', async () => {
    const zeilen = await nachweis(users.office, patients.erika);

    expect(zeilen.map((z) => z.appointment_id)).toEqual([
      finalTermin.id,
      entwurfTermin.id,
      leererTermin.id,
    ]);
    expect(zeilen[0]).toMatchObject({
      appointment_type: 'video',
      // Der Termin mit finalisierter Dokumentation steht seit CAL-008d auf
      // documented (ADR-018 Punkt 3).
      appointment_status: 'documented',
      staff_given_name: 'Anna',
      staff_family_name: 'Beispiel',
      organization_time_zone: 'Europe/Berlin',
      documentation_status: 'final',
    });
    expect(zeilen[0]!.documented_at).toBeInstanceOf(Date);
    expect(zeilen[1]).toMatchObject({
      staff_given_name: 'Tim',
      documentation_status: 'draft',
      documented_at: null,
    });
    expect(zeilen[2]).toMatchObject({ documentation_status: 'none', documented_at: null });
  });

  it('nennt fuer einen finalisierten Eintrag den Zeitpunkt der Finalisierung', async () => {
    const zeilen = await nachweis(users.office, patients.erika);
    const { rows } = await asPostgres<{ finalized_at: Date }>(
      'select finalized_at from public.treatment_notes where id = $1',
      [finalDoku.id],
    );
    expect(zeilen[0]!.documented_at?.getTime()).toBe(rows[0]!.finalized_at.getTime());
  });

  it('enthaelt an keiner Stelle klinischen Inhalt oder Verfassernamen (4.3, 4.4)', async () => {
    const zeilen = await nachweis(users.office, patients.erika);

    const spalten = Object.keys(zeilen[0]!).sort();
    expect(spalten).toEqual(
      [
        'appointment_id',
        'appointment_status',
        'appointment_type',
        'documentation_status',
        'documented_at',
        'ends_at',
        'organization_time_zone',
        'staff_family_name',
        'staff_given_name',
        'starts_at',
      ].sort(),
    );
    expect(JSON.stringify(zeilen)).not.toContain('Geheimer');

    // Auch der deklarierte Rueckgabetyp kennt keine Inhaltsspalte - nicht nur
    // die gelieferten Zeilen.
    const { rows } = await asPostgres<{ ergebnis: string }>(`
      select pg_get_function_result(p.oid) as ergebnis
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'list_patient_treatment_evidence'
    `);
    expect(rows[0]!.ergebnis).not.toMatch(/content|author|editor|finalized_by|reason|version/);
  });

  it('zaehlt nur den Haupteintrag: ein Nachtrag im Entwurf aendert den Stand nicht', async () => {
    const t = await vergangenerTermin(5, { patient: patients.erika });
    const d = await finalisiert(t.id);
    await asUserCommitted(users.therapist, NACHTRAGEN, [d.id, 'Synthetisch: Nachtrag.']);

    const zeilen = await nachweis(users.office, patients.erika);
    const eigene = zeilen.find((z) => z.appointment_id === t.id);
    expect(eigene).toMatchObject({ documentation_status: 'final' });
    expect(zeilen.filter((z) => z.appointment_id === t.id)).toHaveLength(1);
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('laesst %s den Nachweis ebenfalls lesen', async (_rolle, actor) => {
    const zeilen = await nachweis(actor, patients.erika);
    expect(zeilen.length).toBeGreaterThanOrEqual(3);
  });

  it('laesst ein Patientenkonto nicht lesen (4.6)', async () => {
    await expect(nachweis(users.patientErika, patients.erika)).rejects.toThrow(
      /not allowed to read treatment evidence/,
    );
  });

  it('laesst einen nicht angemeldeten Zugriff nicht zu', async () => {
    await expect(asAnon(NACHWEIS, [patients.erika, 20, null, null])).rejects.toThrow(
      /permission denied|not authenticated/,
    );
    await expect(asUser(null, NACHWEIS, [patients.erika, 20, null, null])).rejects.toThrow(
      /not authenticated/,
    );
  });

  it('liefert fuer einen unbekannten Patienten dasselbe leere Ergebnis', async () => {
    const zeilen = await nachweis(users.office, '66666666-6666-4666-8666-00000000eeee');
    expect(zeilen).toEqual([]);
  });

  it('schreibt keinen Auditeintrag - der Nachweis enthaelt keinen klinischen Inhalt', async () => {
    const vorher = await auditAnzahl();
    await nachweis(users.office, patients.erika);
    expect(await auditAnzahl()).toBe(vorher);
  });

  it('laeuft als SECURITY DEFINER mit leerem search_path', async () => {
    const { rows } = await asPostgres<{
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(
      `select p.proname, p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where (n.nspname = 'public'
              and p.proname in ('list_patient_treatment_evidence', 'list_patient_treatment_notes'))
          or (n.nspname = 'app' and p.proname in ('patient_record_page', 'can_read_treatment_evidence'))
       order by p.proname`,
    );
    expect(rows.map((r) => r.proname)).toEqual([
      'can_read_treatment_evidence',
      'list_patient_treatment_evidence',
      'list_patient_treatment_notes',
      'patient_record_page',
    ]);
    for (const fn of rows) {
      expect(fn.prosecdef, fn.proname).toBe(true);
      expect(fn.proconfig, fn.proname).toContain('search_path=""');
    }
  });

  it('laesst die Seitenregel nicht direkt aufrufen', async () => {
    await expect(
      asUser(
        users.therapist,
        'select * from app.patient_record_page($1::uuid, $2::uuid, 20, null, null)',
        [organizationId, patients.erika],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

// =============================================================================
// Klinische Sicht
// =============================================================================

describe('DOK-003: Klinische Sicht der Akte', () => {
  let finalTermin: Stand;
  let entwurfTermin: Stand;
  let leererTermin: Stand;
  let finalDoku: Stand;
  let nachtragId: string;
  let entwurfDoku: Stand;

  const GEHEIM = 'Synthetisch: Geheimer Inhalt fuer die Akte.';

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    leererTermin = await vergangenerTermin(30, { patient: patients.erika });
    entwurfTermin = await vergangenerTermin(20, { patient: patients.erika, staff: STAFF.tim });
    finalTermin = await vergangenerTermin(10, { patient: patients.erika });
    entwurfDoku = await entwurf(entwurfTermin.id, 'Synthetisch: Entwurf in der Akte.');
    finalDoku = await finalisiert(finalTermin.id, GEHEIM);
    const { rows } = await asUserCommitted<{ id: string }>(users.teamLead, NACHTRAGEN, [
      finalDoku.id,
      'Synthetisch: Nachtrag in der Akte.',
    ]);
    nachtragId = rows[0]!.id;
  }, 120_000);

  it('liefert therapist je Termin die Eintraege samt Inhalt - Haupteintrag zuerst', async () => {
    const zeilen = await akte(users.therapist, patients.erika);

    expect(zeilen.map((z) => z.appointment_id)).toEqual([
      finalTermin.id,
      entwurfTermin.id,
      leererTermin.id,
    ]);
    expect(zeilen[0]).toMatchObject({
      appointment_type: 'video',
      staff_given_name: 'Anna',
      organization_time_zone: 'Europe/Berlin',
    });

    const [haupt, nachtrag] = zeilen[0]!.notes;
    expect(zeilen[0]!.notes).toHaveLength(2);
    expect(haupt).toMatchObject({
      id: finalDoku.id,
      appointment_id: finalTermin.id,
      addendum_to_note_id: null,
      status: 'final',
      content: GEHEIM,
      version_count: 1,
      author_name: 'Anna Beispiel',
      last_editor_name: 'Anna Beispiel',
      finalized_by_name: 'Anna Beispiel',
    });
    expect(typeof haupt!.created_at).toBe('string');
    expect(haupt!.finalized_at).not.toBeNull();
    expect(nachtrag).toMatchObject({
      id: nachtragId,
      addendum_to_note_id: finalDoku.id,
      status: 'draft',
      content: 'Synthetisch: Nachtrag in der Akte.',
      version_count: 0,
      author_name: 'Tim Teamleitung',
      finalized_at: null,
      finalized_by_name: null,
    });

    expect(zeilen[1]!.notes).toHaveLength(1);
    expect(zeilen[1]!.notes[0]).toMatchObject({ id: entwurfDoku.id, status: 'draft' });
    expect(zeilen[2]!.notes).toEqual([]);
  });

  it('protokolliert je gelesenem Eintrag treatment_note.viewed - ohne Inhalt (ADR-010)', async () => {
    const vorher = (await auditEintraege('treatment_note.viewed')).length;

    await akte(users.teamLead, patients.erika);

    const eintraege = await auditEintraege('treatment_note.viewed');
    const neue = eintraege.slice(vorher);
    // Haupteintrag, Nachtrag und der Entwurf des zweiten Termins: drei
    // Eintraege, keiner fuer den Termin ohne Dokumentation.
    expect(neue.map((e) => e.subject_id).sort()).toEqual(
      [finalDoku.id, nachtragId, entwurfDoku.id].sort(),
    );
    for (const e of neue) {
      expect(e).toMatchObject({ actor_user_id: users.teamLead, outcome: 'success' });
      expect(e.context).toMatchObject({ surface: 'web', patient_id: patients.erika });
      expect(typeof e.context.appointment_id).toBe('string');
      expect(JSON.stringify(e.context)).not.toContain('Geheim');
      expect(JSON.stringify(e.context)).not.toContain('Nachtrag in der Akte');
    }
  });

  it('protokolliert nichts, wenn die Seite keine Dokumentation enthaelt', async () => {
    // Petra hat im Seed keine Termine - die Seite ist leer.
    const vorher = await auditAnzahl();
    expect(await akte(users.therapist, patients.petra)).toEqual([]);
    expect(await auditAnzahl()).toBe(vorher);
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['team_lead', users.teamLead],
  ])('laesst %s lesen', async (_rolle, actor) => {
    const zeilen = await akte(actor, patients.erika);
    expect(zeilen[0]!.notes[0]!.content).toBe(GEHEIM);
  });

  it('laesst office lesen und protokolliert je Eintrag (E15, ADR-004 Fassung 2)', async () => {
    const vorher = (await auditEintraege('treatment_note.viewed')).length;

    const zeilen = await akte(users.office, patients.erika);
    expect(zeilen[0]!.notes[0]!.content).toBe(GEHEIM);

    // Dieselbe Protokollierung wie bei den therapeutischen Rollen: drei
    // gelesene Eintraege, drei Auditeintraege - ohne Inhalt.
    const neue = (await auditEintraege('treatment_note.viewed')).slice(vorher);
    expect(neue.map((e) => e.subject_id).sort()).toEqual(
      [finalDoku.id, nachtragId, entwurfDoku.id].sort(),
    );
    for (const e of neue) {
      expect(e).toMatchObject({ actor_user_id: users.office, outcome: 'success' });
      expect(JSON.stringify(e.context)).not.toContain('Geheim');
    }
  });

  it('laesst ein Patientenkonto nicht lesen (4.6)', async () => {
    await expect(akte(users.patientErika, patients.erika)).rejects.toThrow(
      /not allowed to read treatment documentation/,
    );
  });

  it('laesst einen nicht angemeldeten Zugriff nicht zu', async () => {
    await expect(asAnon(AKTE, [patients.erika, 20, null, null])).rejects.toThrow(
      /permission denied|not authenticated/,
    );
  });

  it('haelt dieselbe Seitenregel wie der Nachweis', async () => {
    const nachweisSeite = await nachweis(users.therapist, patients.erika, 2);
    const akteSeite = await akte(users.therapist, patients.erika, 2);
    expect(akteSeite.map((z) => z.appointment_id)).toEqual(
      nachweisSeite.map((z) => z.appointment_id),
    );

    const letzte = akteSeite[akteSeite.length - 1]!;
    const cursor = { startsAt: letzte.starts_at, id: letzte.appointment_id };
    const naechsteNachweis = await nachweis(users.therapist, patients.erika, 2, cursor);
    const naechsteAkte = await akte(users.therapist, patients.erika, 2, cursor);
    expect(naechsteAkte.map((z) => z.appointment_id)).toEqual(
      naechsteNachweis.map((z) => z.appointment_id),
    );
    expect(naechsteAkte.map((z) => z.appointment_id)).toEqual([leererTermin.id]);
  });

  it('weist ein Limit ausserhalb von 1 bis 50 ab', async () => {
    await expect(akte(users.therapist, patients.erika, 51)).rejects.toThrow(/limit out of range/);
  });
});

// =============================================================================
// Seitenregel: Zugehoerigkeit, Reihenfolge, Blaettern
// =============================================================================

describe('DOK-003: Seitenregel der Akte', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('nimmt begonnene, dokumentierte und abgesagte Termine auf - rein zukuenftige nicht', async () => {
    const vergangen = await vergangenerTermin(3);
    const abgesagt = await vergangenerTermin(2);
    await asUserCommitted(users.office, TERMIN_ABSAGEN, [
      abgesagt.id,
      abgesagt.updated_at,
      'other',
    ]);
    const abgeschlossen = await vergangenerTermin(1);
    await asUserCommitted(users.office, TERMIN_ABSCHLIESSEN, [
      abgeschlossen.id,
      abgeschlossen.updated_at,
    ]);
    // Zukuenftig, aber schon dokumentiert - etwa der laufende Hausbesuch.
    const zukuenftigDokumentiert = await termin();
    await entwurf(zukuenftigDokumentiert.id);
    // Zukuenftig und undokumentiert: gehoert in den Kalender, nicht in die Akte.
    const zukuenftig = await termin();

    const zeilen = await nachweis(users.office, patients.max);
    const ids = zeilen.map((z) => z.appointment_id);

    expect(ids).toEqual([zukuenftigDokumentiert.id, abgeschlossen.id, abgesagt.id, vergangen.id]);
    expect(ids).not.toContain(zukuenftig.id);
    expect(zeilen.find((z) => z.appointment_id === abgesagt.id)).toMatchObject({
      appointment_status: 'cancelled',
      documentation_status: 'none',
    });
    expect(zeilen.find((z) => z.appointment_id === abgeschlossen.id)).toMatchObject({
      appointment_status: 'completed',
    });
  });

  it('blaettert ueber den Cursor ohne Luecke und ohne Doppelung', async () => {
    const alle = await nachweis(users.office, patients.max, 50);
    expect(alle.length).toBeGreaterThanOrEqual(4);

    const gesehen: string[] = [];
    let cursor: { startsAt: Date; id: string } | null = null;
    for (let runde = 0; runde < 10; runde += 1) {
      const seite: NachweisZeile[] = await nachweis(users.office, patients.max, 2, cursor);
      if (seite.length === 0) break;
      expect(seite.length).toBeLessThanOrEqual(2);
      gesehen.push(...seite.map((z) => z.appointment_id));
      const letzte = seite[seite.length - 1]!;
      cursor = { startsAt: letzte.starts_at, id: letzte.appointment_id };
    }

    expect(gesehen).toEqual(alle.map((z) => z.appointment_id));
    expect(new Set(gesehen).size).toBe(gesehen.length);
  });

  it('weist ein Limit ausserhalb von 1 bis 50 ab', async () => {
    await expect(nachweis(users.office, patients.max, 0)).rejects.toThrow(/limit out of range/);
    await expect(nachweis(users.office, patients.max, 51)).rejects.toThrow(/limit out of range/);
    await expect(asUser(users.office, NACHWEIS, [patients.max, null, null, null])).rejects.toThrow(
      /limit out of range/,
    );
  });

  it('weist einen halben Cursor ab', async () => {
    await expect(
      asUser(users.office, NACHWEIS, [patients.max, 20, new Date().toISOString(), null]),
    ).rejects.toThrow(/cursor is incomplete/);
    await expect(
      asUser(users.office, NACHWEIS, [patients.max, 20, null, patients.max]),
    ).rejects.toThrow(/cursor is incomplete/);
  });
});

// =============================================================================
// Mandantentrennung
// =============================================================================

describe('DOK-003: Mandantentrennung', () => {
  const fremdeOrg = '22222222-2222-4222-8222-0000000000e1';
  const fremderTherapeut = '11111111-1111-4111-8111-0000000000e1';
  const fremdePerson = '44444444-4444-4444-8444-0000000000e1';
  const fremdePatientPerson = '44444444-4444-4444-8444-0000000000e2';
  const fremderStaff = '55555555-5555-4555-8555-0000000000e1';
  const fremderPatient = '66666666-6666-4666-8666-0000000000e1';

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

    const t = await termin({
      patient: fremderPatient,
      staff: fremderStaff,
      actor: fremderTherapeut,
    });
    await asUserCommitted(fremderTherapeut, ANLEGEN, [
      t.id,
      'Synthetischer Inhalt einer fremden Praxis.',
    ]);
  }, 120_000);

  it('liefert den Nachweis eines fremden Patienten nicht - auch nicht leer mit Hinweis', async () => {
    expect(await nachweis(users.office, fremderPatient)).toEqual([]);
    expect(await nachweis(users.ownerTherapist, fremderPatient)).toEqual([]);
  });

  it('sieht die fremde Praxis ihren eigenen Nachweis', async () => {
    const zeilen = await nachweis(fremderTherapeut, fremderPatient);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ documentation_status: 'draft' });
  });

  it('liefert die klinische Sicht eines fremden Patienten nicht', async () => {
    expect(await akte(users.therapist, fremderPatient)).toEqual([]);
    expect(await akte(users.ownerTherapist, fremderPatient)).toEqual([]);
    // E15 oeffnet office die eigene Praxis, keine fremde - und ohne gelesenen
    // Eintrag entsteht auch kein Auditeintrag.
    const vorher = await auditAnzahl();
    expect(await akte(users.office, fremderPatient)).toEqual([]);
    expect(await auditAnzahl()).toBe(vorher);

    const eigene = await akte(fremderTherapeut, fremderPatient);
    expect(eigene).toHaveLength(1);
    expect(eigene[0]!.notes[0]!.content).toBe('Synthetischer Inhalt einer fremden Praxis.');
  });
});
