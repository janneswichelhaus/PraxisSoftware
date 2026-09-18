import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * VER-003: Verordnung anlegen, ändern und löschen.
 *
 * Zwei Dinge stehen hier im Mittelpunkt: dass Kopf und Positionen atomar
 * entstehen und dass die Positionen serverseitig geprüft werden — ein
 * Kontingent, das über seine Verordnung hinausläuft, wäre ein
 * Abrechnungsfehler (PROJECT_PRINCIPLES.md §13).
 */
const { users, patients } = SEED;

const ANLEGEN = `
  select public.create_treatment_basis(
    $1::uuid, $2::uuid, $3, $4::date, $5::jsonb, $6, $7, $8, $9, $10, $11
  ) as id`;

const AENDERN = `
  select public.update_treatment_basis(
    $1::uuid, $2::uuid, $3, $4::date, $5::jsonb, $6, $7, $8, $9, $10, $11
  ) as id`;

const LOESCHEN = 'select public.delete_treatment_basis($1::uuid)';
const HOLEN = 'select * from public.get_treatment_basis($1::uuid)';
const KLINISCH = 'select * from public.list_patient_treatment_bases_clinical($1::uuid)';
const ORGANISATORISCH = 'select * from public.list_patient_treatment_bases($1::uuid)';

const PROBST = '77777777-7777-4777-8777-000000000001';
const HAUSARZT = '77777777-7777-4777-8777-000000000002';
const FREMDE_ID = '99999999-9999-4999-8999-00000000000f';

const POSITIONEN = JSON.stringify([
  { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 0 },
]);

interface Position {
  id: string;
  sort_order: number;
  remedy: string;
  prescribed_quantity: number;
  used_quantity: number;
  remaining_quantity: number;
}

function argumente(items: string = POSITIONEN, rest: (string | null)[] = []) {
  return [
    patients.max,
    PROBST,
    'first',
    '2026-03-01',
    items,
    ...(rest.length > 0 ? rest : [null, null, null, null, null, null]),
  ];
}

async function anlegen(userId: string, items: string = POSITIONEN, rest: (string | null)[] = []) {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, argumente(items, rest));
  return rows[0]!.id;
}

async function positionen(grundlageId: string): Promise<Position[]> {
  const { rows } = await asPostgres<{ items: Position[] }>(
    'select app.treatment_base_items_json($1::uuid) as items',
    [grundlageId],
  );
  return rows[0]!.items;
}

describe('VER-003: Verordnung anlegen, aendern und loeschen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    // Nur die im Test erzeugten Verordnungen entfernen; der Seed-Bestand
    // bleibt, damit die Reihenfolge-Tests etwas zum Einordnen haben.
    await asPostgres("delete from public.audit_log where subject_type = 'treatment_basis'");
  });

  it('legt Kopf und Positionen in einer Transaktion an', async () => {
    const id = await anlegen(
      users.therapist,
      JSON.stringify([
        { remedy: 'Manuelle Therapie', prescribed_quantity: 6, used_quantity: 2 },
        { remedy: 'Waermetherapie', prescribed_quantity: 6, used_quantity: 0 },
      ]),
      ['1x pro Woche', 'Synthetisch: Bemerkung.', 'Synthetisch: Diagnose.', null, null, null],
    );

    const items = await positionen(id);
    expect(items.map((i) => [i.sort_order, i.remedy, i.remaining_quantity])).toEqual([
      [1, 'Manuelle Therapie', 4],
      [2, 'Waermetherapie', 6],
    ]);
  });

  it('protokolliert das Anlegen ohne klinische Inhalte (ADR-010)', async () => {
    const id = await anlegen(users.therapist, POSITIONEN, [
      null,
      null,
      'Synthetisch: Diagnose Schulter.',
      null,
      null,
      null,
    ]);

    const { rows } = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
      `select subject_id, context from public.audit_log
        where action = 'treatment_basis.created'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(id);
    expect(rows[0]?.context).toMatchObject({ surface: 'web', patient_id: patients.max });
    expect(JSON.stringify(rows[0]?.context)).not.toMatch(/Schulter/i);
  });

  it('laesst office weder anlegen noch aendern noch loeschen (ANN-011)', async () => {
    await expect(asUser(users.office, ANLEGEN, argumente())).rejects.toThrow(
      /not allowed to write treatment_bases/i,
    );
    await expect(asUser(users.patientMax, ANLEGEN, argumente())).rejects.toThrow(
      /not allowed to write treatment_bases/i,
    );

    const id = await anlegen(users.therapist);
    // E15 oeffnet office das Lesen der Verordnung samt Diagnose - Aendern und
    // Loeschen bleiben zu (ADR-004 Fassung 2 Punkt 3, ANN-011).
    await expect(
      asUser(users.office, AENDERN, [
        id,
        PROBST,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/not allowed to write treatment_bases/i);
    await expect(asUser(users.office, LOESCHEN, [id])).rejects.toThrow(
      /not allowed to write treatment_bases/i,
    );
  });

  it('verlangt mindestens eine Position', async () => {
    await expect(asUser(users.therapist, ANLEGEN, argumente('[]'))).rejects.toThrow(
      /at least one treatment basis item/i,
    );
  });

  it('weist eine genutzte Menge ueber der verordneten ab', async () => {
    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(
          JSON.stringify([
            { remedy: 'Krankengymnastik', prescribed_quantity: 6, used_quantity: 7 },
          ]),
        ),
      ),
    ).rejects.toThrow(/used quantity out of range/i);
  });

  it('weist eine leere Bezeichnung und unsinnige Mengen ab', async () => {
    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(JSON.stringify([{ remedy: '   ', prescribed_quantity: 6 }])),
      ),
    ).rejects.toThrow(/remedy is required/i);

    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(JSON.stringify([{ remedy: 'Krankengymnastik', prescribed_quantity: 0 }])),
      ),
    ).rejects.toThrow(/prescribed quantity out of range/i);

    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(JSON.stringify([{ remedy: 'Krankengymnastik', prescribed_quantity: 'viele' }])),
      ),
    ).rejects.toThrow(/quantities must be numbers/i);

    // Eine Kommazahl ist derselbe Eingabefehler wie ein Text und bekommt
    // dieselbe sprechende Meldung - nicht den rohen Postgres-Cast-Fehler
    // ("invalid input syntax for type integer"), den ein direkter
    // Integer-Cast einer Dezimalzahl wirft.
    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(JSON.stringify([{ remedy: 'Krankengymnastik', prescribed_quantity: 6.5 }])),
      ),
    ).rejects.toThrow(/quantities must be whole numbers/i);

    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(
          JSON.stringify([
            { remedy: 'Krankengymnastik', prescribed_quantity: 6, used_quantity: 2.5 },
          ]),
        ),
      ),
    ).rejects.toThrow(/quantities must be whole numbers/i);
  });

  it('weist ein Ausstellungsdatum in der Zukunft ab', async () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await expect(
      asUser(users.therapist, ANLEGEN, [
        patients.max,
        PROBST,
        'first',
        morgen,
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/issued_on must not be in the future/i);
  });

  it('unterscheidet fremde nicht von unbekannten IDs', async () => {
    await expect(
      asUser(users.therapist, ANLEGEN, [
        patients.max,
        FREMDE_ID,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/prescriber not found/i);

    await expect(
      asUser(users.therapist, ANLEGEN, [
        FREMDE_ID,
        PROBST,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/patient not found/i);
  });

  it('behaelt bestehende Positionen beim Aendern und entfernt weggefallene', async () => {
    const id = await anlegen(
      users.therapist,
      JSON.stringify([
        { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 3 },
        { remedy: 'Waermetherapie', prescribed_quantity: 10, used_quantity: 1 },
      ]),
    );
    const vorher = await positionen(id);

    // Erste Position behalten (mit id), zweite weglassen, dritte neu.
    await asUserCommitted(users.therapist, AENDERN, [
      id,
      HAUSARZT,
      'follow_up',
      '2026-04-02',
      JSON.stringify([
        {
          id: vorher[0]!.id,
          remedy: 'Krankengymnastik',
          prescribed_quantity: 12,
          used_quantity: 3,
        },
        { remedy: 'Manuelle Therapie', prescribed_quantity: 4, used_quantity: 0 },
      ]),
      null,
      null,
      null,
      null,
      null,
      null,
    ]);

    const nachher = await positionen(id);
    expect(nachher).toHaveLength(2);
    // Dieselbe Zeile, nicht neu angelegt.
    expect(nachher[0]?.id).toBe(vorher[0]?.id);
    expect(nachher[0]?.prescribed_quantity).toBe(12);
    expect(nachher[1]?.remedy).toBe('Manuelle Therapie');
    expect(nachher.map((i) => i.sort_order)).toEqual([1, 2]);

    const { rows } = await asPostgres<{ prescriber_id: string; treatment_basis_kind: string }>(
      'select prescriber_id, treatment_basis_kind from public.treatment_bases where id = $1',
      [id],
    );
    expect(rows[0]?.prescriber_id).toBe(HAUSARZT);
    expect(rows[0]?.treatment_basis_kind).toBe('follow_up');
  });

  it('nimmt eine fremde Positions-ID nicht als Hebel auf andere Verordnungen', async () => {
    const eine = await anlegen(users.therapist);
    const andere = await anlegen(users.therapist);
    const fremdePosition = (await positionen(andere))[0]!;

    await asUserCommitted(users.therapist, AENDERN, [
      eine,
      PROBST,
      'first',
      '2026-03-01',
      JSON.stringify([
        { id: fremdePosition.id, remedy: 'Uebernommen', prescribed_quantity: 3, used_quantity: 0 },
      ]),
      null,
      null,
      null,
      null,
      null,
      null,
    ]);

    // Die fremde Position ist unveraendert; bei "eine" ist eine neue entstanden.
    const unveraendert = (await positionen(andere))[0]!;
    expect(unveraendert.remedy).toBe('Krankengymnastik');
    expect(unveraendert.prescribed_quantity).toBe(10);

    const neue = (await positionen(eine))[0]!;
    expect(neue.id).not.toBe(fremdePosition.id);
    expect(neue.remedy).toBe('Uebernommen');
  });

  it('nimmt die Patientin nicht als Parameter entgegen - eine Verordnung wechselt nicht die Akte', async () => {
    const { rows } = await asPostgres<{ args: string }>(`
      select pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'update_treatment_basis'
    `);
    expect(rows[0]?.args ?? '').not.toMatch(/patient/i);
    expect(rows[0]?.args ?? '').not.toMatch(/organization/i);
  });

  it('liefert get_treatment_basis allen Praxisrollen und protokolliert je Zugriff (E15)', async () => {
    const id = await anlegen(users.therapist);
    await asPostgres("delete from public.audit_log where subject_type = 'treatment_basis'");

    // ADR-004 Fassung 2 Punkt 3: office liest die Verordnung samt Diagnose -
    // anlegen, aendern und loeschen darf es weiterhin nicht (ANN-011, oben).
    for (const konto of [users.teamLead, users.office]) {
      const { rows } = await asUserCommitted<{ id: string; patient_id: string }>(konto, HOLEN, [
        id,
      ]);
      expect(rows[0]?.id).toBe(id);
      expect(rows[0]?.patient_id).toBe(patients.max);
    }

    const { rows: audit } = await asPostgres<{ actor_user_id: string }>(
      `select actor_user_id from public.audit_log where action = 'treatment_basis.viewed'`,
    );
    expect(audit.map((a) => a.actor_user_id).sort()).toEqual([users.teamLead, users.office].sort());

    await expect(asUser(users.patientMax, HOLEN, [id])).rejects.toThrow(
      /not allowed to read clinical treatment basis data/i,
    );
  });

  it('gibt fuer eine unbekannte Verordnung nichts zurueck und protokolliert nichts', async () => {
    const { rows } = await asUserCommitted(users.therapist, HOLEN, [FREMDE_ID]);
    expect(rows).toEqual([]);

    const { rows: audit } = await asPostgres(
      `select id from public.audit_log where action = 'treatment_basis.viewed'`,
    );
    expect(audit).toEqual([]);
  });

  it('loescht endgueltig samt Positionen und haelt den Vorgang im Auditlog fest', async () => {
    const id = await anlegen(users.therapist);
    await asPostgres("delete from public.audit_log where subject_type = 'treatment_basis'");

    await asUserCommitted(users.ownerTherapist, LOESCHEN, [id]);

    const { rows } = await asPostgres('select id from public.treatment_bases where id = $1', [id]);
    expect(rows).toEqual([]);
    // on delete cascade: kein verwaister Rest (ADR-008 Punkt 10).
    const { rows: reste } = await asPostgres(
      'select id from public.treatment_base_items where treatment_basis_id = $1',
      [id],
    );
    expect(reste).toEqual([]);

    const { rows: audit } = await asPostgres<{ subject_id: string }>(
      `select subject_id from public.audit_log where action = 'treatment_basis.deleted'`,
    );
    expect(audit[0]?.subject_id).toBe(id);
  });

  it('meldet eine unbekannte Verordnung beim Loeschen und beim Aendern gleich', async () => {
    await expect(asUser(users.therapist, LOESCHEN, [FREMDE_ID])).rejects.toThrow(
      /treatment basis not found/i,
    );
    await expect(
      asUser(users.therapist, AENDERN, [
        FREMDE_ID,
        PROBST,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/treatment basis not found/i);
  });

  it('erscheint eine neue Verordnung sofort in der Akte', async () => {
    const id = await anlegen(users.therapist, POSITIONEN, [
      null,
      null,
      null,
      null,
      null,
      'Synthetisch: Empfehlung der Therapeutin.',
    ]);

    const { rows } = await asUserCommitted<{ id: string; follow_up_recommendation: string }>(
      users.therapist,
      KLINISCH,
      [patients.max],
    );
    const gefunden = rows.find((r) => r.id === id);
    expect(gefunden?.follow_up_recommendation).toBe('Synthetisch: Empfehlung der Therapeutin.');
  });

  // ---------------------------------------------------------------------------
  // GRD-001 / ADR-020: Die zweite Bauart.
  //
  // Was eine Verordnung braucht, verlangt die Datenbank weiter - aber nur von
  // ihr (Punkt 3). Beide Richtungen werden geprueft, und zwar zweimal: einmal
  // im Schreibpfad, einmal an der Constraint darunter. Eine Regel, die nur in
  // der Funktion steht, faellt beim ersten anderen Schreibweg um (ADR-004,
  // Defense-in-Depth).
  // ---------------------------------------------------------------------------
  describe('Die zweite Bauart: Selbstzahler (ADR-020)', () => {
    function selbstzahlerArgumente(
      prescriberId: string | null = null,
      items: string = POSITIONEN,
      rest: (string | null)[] = [null, null, null, null, null, null],
    ) {
      return [patients.max, prescriberId, 'self_pay', '2026-03-01', items, ...rest];
    }

    it('legt einen Selbstzahler ohne Verordner:in an', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(
        users.therapist,
        ANLEGEN,
        selbstzahlerArgumente(),
      );
      const id = rows[0]!.id;

      const { rows: zeilen } = await asPostgres<{
        treatment_basis_kind: string;
        prescriber_id: string | null;
      }>('select treatment_basis_kind, prescriber_id from public.treatment_bases where id = $1', [
        id,
      ]);
      expect(zeilen[0]).toEqual({ treatment_basis_kind: 'self_pay', prescriber_id: null });

      // Die Klammer traegt ihr Kontingent wie jede Verordnung (ADR-020 Punkt 5).
      expect(await positionen(id)).toHaveLength(1);
    });

    it('weist einen Selbstzahler MIT Verordner:in ab', async () => {
      await expect(
        asUserCommitted(users.therapist, ANLEGEN, selbstzahlerArgumente(PROBST)),
      ).rejects.toThrow(/self_pay must not carry a prescriber/i);
    });

    it('weist eine Verordnung OHNE Verordner:in ab', async () => {
      await expect(
        asUserCommitted(users.therapist, ANLEGEN, [
          patients.max,
          null,
          'first',
          '2026-03-01',
          POSITIONEN,
          null,
          null,
          null,
          null,
          null,
          null,
        ]),
      ).rejects.toThrow(/prescriber is required/i);
    });

    it('kennt keine dritte Bauart', async () => {
      await expect(
        asUserCommitted(users.therapist, ANLEGEN, [
          patients.max,
          null,
          'privatrezept',
          '2026-03-01',
          POSITIONEN,
          null,
          null,
          null,
          null,
          null,
          null,
        ]),
      ).rejects.toThrow(/unknown treatment basis kind/i);
    });

    it('haelt die Constraint auch am Schreibpfad vorbei (Defense-in-Depth)', async () => {
      // Direkt als postgres, also ohne jede Funktion: Die Regel steht in der
      // Tabelle und nicht nur in create_treatment_basis.
      await expect(
        asPostgres(
          `insert into public.treatment_bases
             (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on)
           values ($1, $2, $3, 'self_pay', '2026-03-01')`,
          [SEED.organizationId, patients.max, PROBST],
        ),
      ).rejects.toThrow(/treatment_bases_prescriber_matches_kind/);

      await expect(
        asPostgres(
          `insert into public.treatment_bases
             (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on)
           values ($1, $2, null, 'follow_up', '2026-03-01')`,
          [SEED.organizationId, patients.max],
        ),
      ).rejects.toThrow(/treatment_bases_prescriber_matches_kind/);
    });

    it('schuetzt die Abrechnung beim Selbstzahler wie bei der Verordnung', async () => {
      // ADR-020 Punkt 5: used_quantity <= prescribed_quantity bleibt fuer BEIDE
      // Bauarten bestehen. Sie schuetzt die Abrechnung, nicht die Planung.
      await expect(
        asUserCommitted(
          users.therapist,
          ANLEGEN,
          selbstzahlerArgumente(
            null,
            JSON.stringify([
              { remedy: 'Krankengymnastik', prescribed_quantity: 4, used_quantity: 5 },
            ]),
          ),
        ),
      ).rejects.toThrow();
    });

    it('protokolliert ihn unter dem neuen Wert und mit dem neuen Bezugstyp', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(
        users.therapist,
        ANLEGEN,
        selbstzahlerArgumente(),
      );

      const { rows: audit } = await asPostgres<{ action: string; subject_type: string }>(
        `select action, subject_type from public.audit_log
          where subject_id = $1 and action like 'treatment_basis%'`,
        [rows[0]!.id],
      );
      expect(audit).toEqual([
        { action: 'treatment_basis.created', subject_type: 'treatment_basis' },
      ]);
    });

    it('laesst eine Verordnung zum Selbstzahler werden - und zurueck', async () => {
      const id = await anlegen(users.therapist, POSITIONEN, [
        null,
        null,
        'Synthetisch: Diagnose.',
        null,
        null,
        null,
      ]);

      // Verordner:in mitzuschicken waere jetzt ein Widerspruch.
      await expect(
        asUserCommitted(users.therapist, AENDERN, [
          id,
          PROBST,
          'self_pay',
          '2026-03-01',
          POSITIONEN,
          null,
          null,
          null,
          null,
          null,
          null,
        ]),
      ).rejects.toThrow(/self_pay must not carry a prescriber/i);

      await asUserCommitted(users.therapist, AENDERN, [
        id,
        null,
        'self_pay',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
      const { rows: nachher } = await asPostgres<{
        treatment_basis_kind: string;
        prescriber_id: string | null;
      }>('select treatment_basis_kind, prescriber_id from public.treatment_bases where id = $1', [
        id,
      ]);
      expect(nachher[0]).toEqual({ treatment_basis_kind: 'self_pay', prescriber_id: null });

      // Und wieder zurueck: dann ist die Verordner:in wieder Pflicht.
      await asUserCommitted(users.therapist, AENDERN, [
        id,
        HAUSARZT,
        'follow_up',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
      const { rows: zurueck } = await asPostgres<{ prescriber_id: string }>(
        'select prescriber_id from public.treatment_bases where id = $1',
        [id],
      );
      expect(zurueck[0]?.prescriber_id).toBe(HAUSARZT);
    });

    it('haelt die alten Auditwerte weiter im Wertebereich (ADR-010, ADR-020 Punkt 8)', async () => {
      // Auditzeilen werden niemals umgeschrieben. Was vor GRD-001 entstanden
      // ist, muss auch danach noch einfuegbar und damit lesbar sein.
      await expect(
        asPostgres(
          `insert into public.audit_log
             (organization_id, actor_user_id, action, subject_type, subject_id, outcome)
           values ($1, $2, 'prescription.viewed', 'prescription', $3, 'success')`,
          [SEED.organizationId, users.therapist, patients.max],
        ),
      ).resolves.toBeDefined();
    });
  });
});

/**
 * Mandantentrennung (ADR-003): die bisherigen "unbekannt vs. fremd"-Tests
 * oben verwenden ausschliesslich eine schlicht nicht existierende ID. Das
 * beweist nicht, dass eine echte fremde Organisation herausgefiltert wird -
 * nur dass eine ID, die es gar nicht gibt, abgewiesen wird. Dieser Block legt
 * eine zweite, real existierende Organisation samt eigener Verordner:in,
 * Patientin und Verordnung an (Muster aus rls.test.ts) und prueft, dass keine
 * der Schreibfunktionen ueber eine echte fremde ID hinweg schreibt oder liest.
 */
describe('VER-003: Mandantentrennung (ADR-003)', () => {
  const fremdeOrg = '33333333-3333-4333-8333-000000000001';
  const fremderAccount = '33333333-3333-4333-8333-000000000002';
  const fremdeTherapeutPerson = '33333333-3333-4333-8333-000000000003';
  const fremderPrescriber = '33333333-3333-4333-8333-000000000004';
  const fremdePatientPerson = '33333333-3333-4333-8333-000000000005';
  const fremderPatient = '33333333-3333-4333-8333-000000000006';
  const fremdeVerordnung = '33333333-3333-4333-8333-000000000007';

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderAccount}', 'tessa.therapeutin@praxis-woanders.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name) values
        ('${fremdeTherapeutPerson}', '${fremdeOrg}', 'Tessa', 'Therapeutin'),
        ('${fremdePatientPerson}', '${fremdeOrg}', 'Paul', 'Woandershin');
      insert into public.patients (id, organization_id, person_id)
        values ('${fremderPatient}', '${fremdeOrg}', '${fremdePatientPerson}');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderAccount}', '${fremdeOrg}', '${fremdeTherapeutPerson}', 'Tessa Therapeutin');
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('${fremderAccount}', '${fremdeOrg}', 'therapist');
      insert into public.prescribers (id, organization_id, family_name)
        values ('${fremderPrescriber}', '${fremdeOrg}', 'Fremdarzt');
      insert into public.treatment_bases (
        id, organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, diagnosis
      ) values (
        '${fremdeVerordnung}', '${fremdeOrg}', '${fremderPatient}', '${fremderPrescriber}',
        'first', '2026-01-10', 'Synthetisch: Diagnose der fremden Praxis.'
      );
      insert into public.treatment_base_items (
        organization_id, treatment_basis_id, sort_order, remedy, prescribed_quantity
      ) values (
        '${fremdeOrg}', '${fremdeVerordnung}', 1, 'Krankengymnastik', 6
      );
    `);
  }, 120_000);

  it('weist eine echte Verordner:in einer fremden Organisation ab wie eine unbekannte', async () => {
    await expect(
      asUser(users.therapist, ANLEGEN, [
        patients.max,
        fremderPrescriber,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/prescriber not found/i);
  });

  it('weist eine echte Patientin einer fremden Organisation ab wie eine unbekannte', async () => {
    await expect(
      asUser(users.therapist, ANLEGEN, [
        fremderPatient,
        PROBST,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/patient not found/i);
  });

  it('aendert und loescht eine echte Verordnung einer fremden Organisation nicht', async () => {
    await expect(
      asUser(users.therapist, AENDERN, [
        fremdeVerordnung,
        PROBST,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/treatment basis not found/i);

    await expect(asUser(users.therapist, LOESCHEN, [fremdeVerordnung])).rejects.toThrow(
      /treatment basis not found/i,
    );

    const { rows } = await asPostgres('select id from public.treatment_bases where id = $1', [
      fremdeVerordnung,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('liefert fuer eine echte Verordnung einer fremden Organisation kein Ergebnis statt eines Fehlers', async () => {
    const { rows } = await asUser(users.therapist, HOLEN, [fremdeVerordnung]);
    expect(rows).toEqual([]);
  });

  it('listet eine fremde Patientin ohne Verordnungen der eigenen Praxis', async () => {
    const { rows } = await asUser(users.office, ORGANISATORISCH, [fremderPatient]);
    expect(rows).toEqual([]);
  });

  it('endet auch fuer die klinische Sicht von office an der eigenen Praxis (E15)', async () => {
    await asPostgres("delete from public.audit_log where action = 'treatment_basis.viewed'");

    const { rows: liste } = await asUserCommitted(users.office, KLINISCH, [fremderPatient]);
    expect(liste).toEqual([]);
    const { rows: detail } = await asUserCommitted(users.office, HOLEN, [fremdeVerordnung]);
    expect(detail).toEqual([]);

    // Nichts gelesen, nichts protokolliert.
    const { rows: audit } = await asPostgres(
      "select id from public.audit_log where action = 'treatment_basis.viewed'",
    );
    expect(audit).toEqual([]);
  });

  it('sieht die eigene Verordnung nur innerhalb der fremden Organisation', async () => {
    const { rows } = await asUserCommitted<{ id: string; diagnosis: string }>(
      fremderAccount,
      KLINISCH,
      [fremderPatient],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fremdeVerordnung);
    expect(rows[0]?.diagnosis).toContain('fremden Praxis');
  });
});
