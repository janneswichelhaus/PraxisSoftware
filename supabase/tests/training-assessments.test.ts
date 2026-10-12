import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { praxistag } from './helpers/plaene';

/**
 * Assessments im Training (OUT-002, IDEA-OUT-007, ANN-365).
 *
 *   * Inhaber:in und Trainingsbetreuung halten fest – mit Messbedingungen,
 *     Ergebnissen (ein Wert oder beide Seiten) und geplanter Wiederholung –,
 *     nur mit Einwilligung zu Gesundheitsangaben; das Büro liest.
 *   * Gespeichert wird unverändert, ohne Einordnung; Entfernen bleibt am
 *     Datensatz.
 *   * Kein Durchgriff, keine fremde Organisation, kein Plattformkonto, kein
 *     Tabellenrecht; Lesen steht als Öffnen des Trainingsverhältnisses im
 *     Protokoll.
 */

const { users, trainingRelationships, patients, organizationId } = SEED;

const FESTHALTEN =
  'select public.record_training_assessment($1::uuid, $2, $3::date, $4, $5::date, $6::jsonb) as id';
const ENTFERNEN = 'select public.remove_training_assessment($1::uuid)';
const LESEN = 'select public.get_training_assessments($1::uuid) as daten';

interface Daten {
  today: string;
  can_write: boolean;
  relationship_open: boolean;
  health_consent: boolean;
  assessments: {
    id: string;
    title: string;
    performed_on: string;
    conditions: string | null;
    next_due_on: string | null;
    created_by_name: string | null;
    results: {
      label: string;
      unit: string | null;
      value: number | null;
      left: number | null;
      right: number | null;
    }[];
  }[];
}

const ERGEBNISSE = [
  { label: 'Einbeinsprung weit', unit: 'cm', left: 112, right: 140 },
  { label: 'Kniebeugen in 30 s', value: 18 },
];

async function lesen(konto: string, verhaeltnis: string): Promise<Daten | null> {
  const { rows } = await asUser<{ daten: Daten | null }>(konto, LESEN, [verhaeltnis]);
  return rows[0]!.daten;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function einwilligen(verhaeltnis: string): Promise<void> {
  await asPostgres(
    `insert into public.training_consent_records
       (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
     values ($1, $2, 'consent_granted', 'training_health_data', current_date, $3)`,
    [organizationId, verhaeltnis, users.trainer],
  );
}

async function festhalten(
  konto: string,
  eingabe: {
    verhaeltnis?: string;
    titel?: string;
    tag?: string;
    bedingungen?: string | null;
    wiederholung?: string | null;
    ergebnisse?: unknown;
  } = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, FESTHALTEN, [
    eingabe.verhaeltnis ?? trainingRelationships.tina,
    eingabe.titel ?? 'Sprungtests Knie',
    eingabe.tag ?? (await praxistag(0)),
    eingabe.bedingungen === undefined ? 'Halle, barfuß, 10 min Rad' : eingabe.bedingungen,
    eingabe.wiederholung === undefined ? await praxistag(42) : eingabe.wiederholung,
    JSON.stringify(eingabe.ergebnisse ?? ERGEBNISSE),
  ]);
  return rows[0]!.id;
}

describe('Assessments im Training (OUT-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.training_assessments');
    await asPostgres('delete from public.training_consent_records');
    await asPostgres('delete from public.audit_log');
  });

  it('hält mit Einwilligung fest; owner, Trainingsbetreuung und Büro lesen unverändert', async () => {
    expect(await fehler(festhalten(users.trainer))).toBe('42501');
    await einwilligen(trainingRelationships.tina);
    await festhalten(users.trainer);
    const heute = await praxistag(0);
    for (const konto of [users.trainer, users.ownerTherapist, users.office]) {
      const daten = await lesen(konto, trainingRelationships.tina);
      expect(daten!.health_consent).toBe(true);
      expect(daten!.assessments).toHaveLength(1);
      expect(daten!.assessments[0]).toMatchObject({
        title: 'Sprungtests Knie',
        performed_on: heute,
        conditions: 'Halle, barfuß, 10 min Rad',
        next_due_on: await praxistag(42),
        created_by_name: 'Tom Trainingsbetreuung',
        results: [
          { label: 'Einbeinsprung weit', unit: 'cm', value: null, left: 112, right: 140 },
          { label: 'Kniebeugen in 30 s', unit: null, value: 18, left: null, right: null },
        ],
      });
    }
    expect((await lesen(users.trainer, trainingRelationships.tina))!.can_write).toBe(true);
    expect((await lesen(users.office, trainingRelationships.tina))!.can_write).toBe(false);
    // Keine Einordnung, kein Seitenverhältnis, kein Schwellenwert vom Server.
    expect(JSON.stringify(await lesen(users.trainer, trainingRelationships.tina))).not.toMatch(
      /ratio|symmetr|threshold|cleared|freigabe/i,
    );
  });

  it('prüft Titel, Tag, Bedingungen, Wiederholung und Ergebnisse', async () => {
    await einwilligen(trainingRelationships.tina);
    const heute = await praxistag(0);
    const ungueltig: [Parameters<typeof festhalten>[1], string][] = [
      [{ titel: ' ' }, '23514'],
      [{ titel: 'x'.repeat(81) }, '23514'],
      [{ tag: await praxistag(1) }, '22023'],
      [{ bedingungen: 'x'.repeat(501) }, '23514'],
      [{ wiederholung: heute }, '23514'],
      [{ ergebnisse: [] }, '22023'],
      [{ ergebnisse: {} }, '22023'],
      [{ ergebnisse: Array.from({ length: 21 }, () => ({ label: 'a', value: 1 })) }, '22023'],
      [{ ergebnisse: [{ label: 'a' }] }, '23514'],
      [{ ergebnisse: [{ label: 'a', value: 1, left: 1, right: 2 }] }, '23514'],
      [{ ergebnisse: [{ label: 'a', left: 1 }] }, '23514'],
      [{ ergebnisse: [{ label: 'a', value: '5' }] }, '22023'],
      [{ ergebnisse: [{ value: 5 }] }, '22023'],
      [{ ergebnisse: [{ label: 'a', unit: 'x'.repeat(21), value: 5 }] }, '23514'],
      [{ ergebnisse: ['a'] }, '22023'],
    ];
    for (const [eingabe, code] of ungueltig) {
      expect(await fehler(festhalten(users.trainer, eingabe)), JSON.stringify(eingabe)).toBe(code);
    }
    expect(
      await fehler(
        asUser(users.trainer, FESTHALTEN, [
          trainingRelationships.tina,
          'Test',
          null,
          null,
          null,
          JSON.stringify(ERGEBNISSE),
        ]),
      ),
    ).toBe('22023');
    // Ohne Bedingungen und ohne Wiederholung geht es; ein früherer Tag auch.
    await festhalten(users.trainer, {
      bedingungen: '  ',
      wiederholung: null,
      tag: await praxistag(-30),
    });
    const daten = await lesen(users.trainer, trainingRelationships.tina);
    expect(daten!.assessments[0]).toMatchObject({ conditions: null, next_due_on: null });
    // Nichts Halbes: Ein abgewiesenes Assessment hinterlässt keine Zeile.
    const { rows } = await asPostgres<{ n: string }>(
      'select count(*)::text as n from public.training_assessments',
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('jüngstes zuerst; Entfernen nimmt aus dem Verlauf und bleibt am Datensatz', async () => {
    await einwilligen(trainingRelationships.tina);
    const alt = await festhalten(users.trainer, { tag: await praxistag(-42) });
    await festhalten(users.trainer, { tag: await praxistag(0), titel: 'Sprungtests Knie' });
    let daten = await lesen(users.trainer, trainingRelationships.tina);
    expect(daten!.assessments.map((a) => a.performed_on)).toEqual([
      await praxistag(0),
      await praxistag(-42),
    ]);
    expect(await fehler(asUser(users.office, ENTFERNEN, [alt]))).toBe('42501');
    await asUserCommitted(users.ownerTherapist, ENTFERNEN, [alt]);
    daten = await lesen(users.trainer, trainingRelationships.tina);
    expect(daten!.assessments).toHaveLength(1);
    const { rows } = await asPostgres<{ removed_by: string; n: string }>(
      `select a.removed_by,
              (select count(*)::text from public.training_assessment_results r
               where r.assessment_id = a.id) as n
       from public.training_assessments a where a.id = $1`,
      [alt],
    );
    expect(rows[0]).toEqual({ removed_by: users.ownerTherapist, n: '2' });
    expect(await fehler(asUser(users.trainer, ENTFERNEN, [alt]))).toBe('P0002');
  });

  it('Rolle ohne Recht, Plattformkonto, ohne Anmeldung: abgewiesen und protokolliert', async () => {
    await einwilligen(trainingRelationships.tina);
    for (const konto of [users.office, users.therapist, users.teamLead, users.plattformTina]) {
      expect(await fehler(festhalten(konto))).toBe('42501');
    }
    expect(
      await fehler(
        asUser(null, FESTHALTEN, [
          trainingRelationships.tina,
          'T',
          await praxistag(0),
          null,
          null,
          JSON.stringify(ERGEBNISSE),
        ]),
      ),
    ).toBe('42501');
    expect(await fehler(asUser(null, LESEN, [trainingRelationships.tina]))).toBe('42501');
    // Die Behandlungsrolle liest das Training nicht (ADR-021 Punkt 6).
    await asUserCommitted(users.therapist, LESEN, [trainingRelationships.tina]);
    expect(await lesen(users.therapist, trainingRelationships.tina)).toBeNull();
    const { rows } = await asPostgres<{ action: string; outcome: string }>(
      `select action, outcome from public.audit_log where actor_user_id = $1`,
      [users.therapist],
    );
    expect(rows).toEqual([{ action: 'access.denied', outcome: 'denied' }]);
    expect(await fehler(lesen(users.plattformTina, trainingRelationships.tina))).toBe('42501');
  });

  it('unbekanntes, fremdes und beendetes Verhältnis', async () => {
    await einwilligen(trainingRelationships.tina);
    expect(
      await fehler(festhalten(users.trainer, { verhaeltnis: FREMDE_ORGANISATION.patient })),
    ).toBe('P0002');
    expect(await fehler(festhalten(users.trainer, { verhaeltnis: patients.erika }))).toBe('P0002');
    expect(await lesen(users.trainer, FREMDE_ORGANISATION.patient)).toBeNull();
    const id = await festhalten(users.trainer);
    await asPostgres('update public.training_assessments set organization_id = $1 where id = $2', [
      FREMDE_ORGANISATION.organizationId,
      id,
    ]);
    expect((await lesen(users.trainer, trainingRelationships.tina))!.assessments).toEqual([]);
    expect(await fehler(asUser(users.trainer, ENTFERNEN, [id]))).toBe('P0002');

    await asPostgres(
      'update public.training_relationships set contract_ended_on = current_date where id = $1',
      [trainingRelationships.tina],
    );
    try {
      expect(await fehler(festhalten(users.trainer))).toBe('22023');
      expect((await lesen(users.trainer, trainingRelationships.tina))!.relationship_open).toBe(
        false,
      );
    } finally {
      await asPostgres(
        'update public.training_relationships set contract_ended_on = null where id = $1',
        [trainingRelationships.tina],
      );
    }
  });

  it('protokolliert das Lesen als Öffnen des Trainingsverhältnisses, ohne Inhalt', async () => {
    await einwilligen(trainingRelationships.tina);
    await festhalten(users.trainer);
    await asPostgres('delete from public.audit_log');
    await asUserCommitted(users.office, LESEN, [trainingRelationships.tina]);
    const { rows } = await asPostgres<{ action: string; context: Record<string, unknown> }>(
      'select action, context from public.audit_log',
    );
    expect(rows.map((z) => [z.action, z.context['view']])).toEqual([
      ['training_relationship.viewed', 'assessments'],
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/Sprung|Halle/);
  });

  it('kein Tabellenrecht (ADR-004)', async () => {
    for (const konto of [users.trainer, users.ownerTherapist, users.plattformTina]) {
      for (const tabelle of ['training_assessments', 'training_assessment_results']) {
        expect(await fehler(asUser(konto, `select * from public.${tabelle}`, []))).toBe('42501');
      }
    }
  });

  it('fällt mit dem Trainingsverhältnis (ADR-008)', async () => {
    await einwilligen(trainingRelationships.tina);
    await festhalten(users.trainer);
    try {
      await asPostgres(
        'select app.delete_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
        [trainingRelationships.tina],
      );
      const { rows } = await asPostgres<{ n: string }>(
        `select ((select count(*) from public.training_assessments)
               + (select count(*) from public.training_assessment_results))::text as n`,
      );
      expect(rows[0]!.n).toBe('0');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });
});
