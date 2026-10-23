import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  fremdeOrganisation,
  jwtClaims,
  resetDatabase,
  testDatabaseUrl,
} from './helpers/db';

/**
 * Eigener Name und Rufnummer der Praxis in der Plattformprojektion (DRP-N1,
 * DRP-N2; Handoff 2026-10-22, Abschnitt 9; ADR-023 Punkte 22 und 23).
 *
 * Der Name ist immer der eigene und steht nur an einem lesbaren Zugang: die
 * Person selbst aus ihrem Verhältnis, eine Vertretung aus ihrem Nachweis
 * (ANN-690). Die Rufnummer ist die des Absenders der Rechnungen und gehört zur
 * Praxis des Zugangs (ANN-691). Negativfälle nach Punkt 23: fremde Person,
 * anderer Leistungsbereich, eingeladen, gesperrt, entzogen, Lesefrist,
 * Praxiskonto, andere Organisation; dazu die gesperrte Sitzung (ADR-025).
 */

const { users, platformAccesses, patients, trainingRelationships } = SEED;
const KONTEXT = 'select * from public.platform_context()';
const EINSICHT = `select public.platform_preview($1::uuid, 'platform_context', '{}'::jsonb) as daten`;
/** Synthetisch, aus `supabase/seed.sql` (Absender der Rechnungen). */
const RUFNUMMER = '+49 7071 0000000';

/** Ein Konto und ein Zugang der fremden Praxis (`fremdeOrganisation()`). */
const FREMD_KONTO = '99999999-9999-4999-8999-0000000000f1';
const FREMD_ZUGANG = 'cafecafe-cafe-4afe-8afe-0000000000f1';
/** Eine rechtliche Vertretung (Vorsorgevollmacht) für Max, mit eigenem Konto. */
const VOLLMACHT_KONTO = '99999999-9999-4999-8999-0000000000f2';

interface Zeile {
  access_id: string;
  organization_name: string;
  relationship_kind: string;
  status: string;
  readable: boolean;
  access_kind: string;
  represented_name: string | null;
  own_name: string | null;
  practice_phone: string | null;
}

async function kontext(konto: string | null): Promise<Zeile[]> {
  return (await asUser<Zeile>(konto, KONTEXT)).rows;
}

/** Der Kontext mit einer Anmeldung vor 61 Minuten: Die Sitzung ist gesperrt (ADR-025). */
async function kontextInGesperrterSitzung(konto: string): Promise<Zeile[]> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'authenticated', true)");
    const vor61Minuten = Math.floor(Date.now() / 1000) - 61 * 60;
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      jwtClaims(konto, { amr: [{ method: 'password', timestamp: vor61Minuten }] }),
    ]);
    const { rows } = await client.query<Zeile>(KONTEXT);
    await client.query('rollback');
    return rows;
  } finally {
    await client.end();
  }
}

/**
 * Die Prüfung im Namen eines Kontos, so wie eine Projektion sie aufruft: als
 * Eigentümer mit den Claims des Kontos. Für keine Anwendungsrolle ausführbar.
 */
async function eigenerName(konto: string, zugang: string): Promise<string | null> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claims', $1, true)", [jwtClaims(konto)]);
    const { rows } = await client.query<{ name: string | null }>(
      'select app.platform_own_name($1::uuid) as name',
      [zugang],
    );
    await client.query('rollback');
    return rows[0]?.name ?? null;
  } finally {
    await client.end();
  }
}

/** Eine SQLSTATE oder `null`, wenn die Anweisung gelang. */
async function fehler(versprechen: Promise<unknown>): Promise<string | null> {
  try {
    await versprechen;
    return null;
  } catch (grund) {
    return (grund as { code?: string }).code ?? 'unbekannt';
  }
}

async function sperren(zugang: string): Promise<void> {
  await asPostgres(
    `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
    [zugang],
  );
}

async function vertragsendeVor(tage: number): Promise<void> {
  await asPostgres(
    `update public.training_relationships set contract_ended_on = current_date - $2::int where id = $1`,
    [trainingRelationships.tina, tage],
  );
}

/** Peter aus der fremden Praxis mit eigenem, aktivem Plattformzugang. */
async function fremdesKonto(): Promise<void> {
  await fremdeOrganisation();
  await asPostgres(
    `insert into auth.users (id, aud, role, email) values
       ($1, 'authenticated', 'authenticated', 'peter.fremd.plattform@patient.invalid')
     on conflict (id) do nothing`,
    [FREMD_KONTO],
  );
  await asPostgres(
    `insert into public.platform_accesses
       (id, organization_id, relationship_kind, relationship_id, patient_id,
        account_user_id, status, created_by, activated_at)
     values ($1, $2, 'treatment', $3, $3, $4, 'active', $5, now())
     on conflict (id) do nothing`,
    [
      FREMD_ZUGANG,
      FREMDE_ORGANISATION.organizationId,
      FREMDE_ORGANISATION.patient,
      FREMD_KONTO,
      FREMDE_ORGANISATION.owner,
    ],
  );
}

describe('platform_context: eigener Name (DRP-N1, ANN-690)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('nennt der Person ihren eigenen Namen, in jedem ihrer Bereiche', async () => {
    expect((await kontext(users.plattformTina)).map((z) => z.own_name)).toEqual([
      'Tina Trainingskundin',
    ]);
    const erika = await kontext(users.plattformErika);
    expect(erika.map((z) => [z.relationship_kind, z.own_name])).toEqual([
      ['treatment', 'Erika Beispiel'],
      ['training', 'Erika Beispiel'],
    ]);
  });

  it('nennt der Begleitung ihren eigenen Namen, nie den der vertretenen Person', async () => {
    expect(await kontext(users.plattformPaula)).toEqual([
      expect.objectContaining({
        access_id: platformAccesses.paulaBegleitungMax,
        access_kind: 'companion',
        own_name: 'Paula Mustermann',
        represented_name: 'Max Mustermann',
      }),
    ]);
  });

  it('rechtliche Vertretung: ebenso ihr eigener Name aus dem Nachweis', async () => {
    await asPostgres(
      `insert into auth.users (id, aud, role, email) values
         ($1, 'authenticated', 'authenticated', 'vera.vollmacht@patient.invalid')`,
      [VOLLMACHT_KONTO],
    );
    await asPostgres(
      `insert into public.platform_accesses
         (organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
          status, created_by, activated_at, access_kind, legal_basis, representative_name,
          proof_documents, health_scope, finance_scope, proof_recorded_by, proof_recorded_at)
       values ($1, 'treatment', $2, $2, $3, 'active', $4, now(), 'legal_representative',
               'power_of_attorney', 'Vera Vollmacht',
               array['identity_document', 'power_of_attorney'], true, false, $4, now())`,
      [SEED.organizationId, patients.max, VOLLMACHT_KONTO, users.office],
    );
    expect(await kontext(VOLLMACHT_KONTO)).toEqual([
      expect.objectContaining({
        access_kind: 'legal_representative',
        own_name: 'Vera Vollmacht',
        represented_name: 'Max Mustermann',
        practice_phone: RUFNUMMER,
      }),
    ]);
  });

  it('fremde Person: kein Konto bekommt den Namen eines anderen', async () => {
    expect(JSON.stringify(await kontext(users.plattformTina))).not.toContain('Erika');
    expect(JSON.stringify(await kontext(users.plattformErika))).not.toContain('Tina');
    // Auch an der Projektion vorbei: Die Prüfung steht in der Funktion selbst.
    expect(await eigenerName(users.plattformTina, platformAccesses.erikaBehandlung)).toBeNull();
    expect(await eigenerName(users.plattformPaula, platformAccesses.erikaBehandlung)).toBeNull();
    expect(await eigenerName(users.plattformErika, platformAccesses.paulaBegleitungMax)).toBeNull();
    expect(await eigenerName(users.plattformErika, platformAccesses.erikaBehandlung)).toBe(
      'Erika Beispiel',
    );
  });

  it('anderer Leistungsbereich: das gesperrte Training ohne Namen, die Behandlung mit', async () => {
    await sperren(platformAccesses.erikaTraining);
    const erika = await kontext(users.plattformErika);
    expect(erika.map((z) => [z.relationship_kind, z.readable, z.own_name])).toEqual([
      ['treatment', true, 'Erika Beispiel'],
      ['training', false, null],
    ]);
  });

  it('gesperrt: der Zugang steht da, der Name nicht (ADR-023 Punkt 18)', async () => {
    await sperren(platformAccesses.tinaTraining);
    expect(await kontext(users.plattformTina)).toEqual([
      expect.objectContaining({ status: 'locked', readable: false, own_name: null }),
    ]);
    // Die Begleitung ebenso, auch ihr eigener Name aus dem Nachweis.
    await sperren(platformAccesses.paulaBegleitungMax);
    expect(await kontext(users.plattformPaula)).toEqual([
      expect.objectContaining({ status: 'locked', own_name: null, represented_name: null }),
    ]);
  });

  it('eingeladen und entzogen: keine Zeile und kein Name', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.platform_accesses
         (organization_id, relationship_kind, relationship_id, patient_id, created_by)
       values ($1, 'treatment', $2, $2, $3) returning id`,
      [SEED.organizationId, patients.max, users.office],
    );
    const eingeladen = rows[0]!.id;
    expect(await eigenerName(users.plattformTina, eingeladen)).toBeNull();
    expect(await eigenerName(users.plattformPaula, eingeladen)).toBeNull();

    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_reason = 'practice'
        where id = $1`,
      [platformAccesses.tinaTraining],
    );
    expect(await kontext(users.plattformTina)).toEqual([]);
    expect(await eigenerName(users.plattformTina, platformAccesses.tinaTraining)).toBeNull();
  });

  it('Lesefrist: in der Frist mit Namen, danach ohne (D2)', async () => {
    await vertragsendeVor(10);
    expect(await kontext(users.plattformTina)).toEqual([
      expect.objectContaining({ readable: true, own_name: 'Tina Trainingskundin' }),
    ]);
    await vertragsendeVor(40);
    expect(await kontext(users.plattformTina)).toEqual([
      expect.objectContaining({ status: 'active', readable: false, own_name: null }),
    ]);
  });

  it('gesperrte Sitzung: kein Name (ADR-025 Punkt 3)', async () => {
    const zeilen = await kontextInGesperrterSitzung(users.plattformErika);
    expect(zeilen.length).toBeGreaterThan(0);
    expect(zeilen.map((z) => z.own_name)).toEqual(zeilen.map(() => null));
  });

  it('Praxiskonto: keine Zeile, und die Prüfung gibt keinem Praxiskonto einen Namen', async () => {
    for (const konto of [users.ownerTherapist, users.office, users.trainer, users.patientMax]) {
      expect(await kontext(konto)).toEqual([]);
    }
    // Die Einsicht der owner:in gilt nur innerhalb von platform_preview (E-001).
    expect(await eigenerName(users.ownerTherapist, platformAccesses.erikaBehandlung)).toBeNull();
    expect(await eigenerName(users.therapist, platformAccesses.tinaTraining)).toBeNull();
  });

  it('andere Organisation: jedes Konto sieht nur den eigenen Namen', async () => {
    await fremdesKonto();
    expect(await kontext(FREMD_KONTO)).toEqual([
      expect.objectContaining({
        access_id: FREMD_ZUGANG,
        organization_name: 'Test Praxis Woanders',
        own_name: 'Peter Fremdpatient',
      }),
    ]);
    expect(JSON.stringify(await kontext(users.plattformTina))).not.toContain('Fremdpatient');
    expect(await eigenerName(users.plattformTina, FREMD_ZUGANG)).toBeNull();
    expect(await eigenerName(FREMD_KONTO, platformAccesses.tinaTraining)).toBeNull();
    expect(await eigenerName(FREMDE_ORGANISATION.owner, FREMD_ZUGANG)).toBeNull();
  });
});

describe('platform_context: Rufnummer der Praxis (DRP-N2, ANN-691)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('nennt die Nummer aus dem Absender der Rechnungen, an jedem Zugang', async () => {
    for (const konto of [users.plattformTina, users.plattformErika, users.plattformPaula]) {
      const zeilen = await kontext(konto);
      expect(zeilen.length).toBeGreaterThan(0);
      expect(zeilen.map((z) => z.practice_phone)).toEqual(zeilen.map(() => RUFNUMMER));
    }
  });

  it('folgt dem Absender: eine neue Nummer steht da, ohne Nummer keine', async () => {
    await asPostgres(
      `update public.practice_billing_profiles set phone = '+49 7071 1111111' where organization_id = $1`,
      [SEED.organizationId],
    );
    expect((await kontext(users.plattformTina))[0]?.practice_phone).toBe('+49 7071 1111111');
    await asPostgres(
      'update public.practice_billing_profiles set phone = null where organization_id = $1',
      [SEED.organizationId],
    );
    expect((await kontext(users.plattformTina))[0]?.practice_phone).toBeNull();
  });

  it('steht auch am gesperrten Zugang und nach der Lesefrist: Die Praxis bleibt erreichbar', async () => {
    await vertragsendeVor(40);
    expect(await kontext(users.plattformTina)).toEqual([
      expect.objectContaining({ readable: false, own_name: null, practice_phone: RUFNUMMER }),
    ]);
    await sperren(platformAccesses.tinaTraining);
    expect(await kontext(users.plattformTina)).toEqual([
      expect.objectContaining({ status: 'locked', practice_phone: RUFNUMMER }),
    ]);
  });

  it('andere Organisation: jeder Zugang trägt die Nummer seiner eigenen Praxis', async () => {
    await fremdesKonto();
    // Die fremde Praxis hat noch keinen Absender: keine Nummer, auch nicht unsere.
    expect((await kontext(FREMD_KONTO))[0]?.practice_phone).toBeNull();
    await asPostgres(
      `insert into public.practice_billing_profiles
         (organization_id, legal_name, street, postal_code, city, phone, tax_number,
          small_business, iban)
       values ($1, 'Test Praxis Woanders', 'Fremdweg', '10115', 'Berlin', '+49 30 0000000',
               '11/222/33333', false, 'DE02100100100006820101')`,
      [FREMDE_ORGANISATION.organizationId],
    );
    expect((await kontext(FREMD_KONTO))[0]?.practice_phone).toBe('+49 30 0000000');
    expect((await kontext(users.plattformTina))[0]?.practice_phone).toBe(RUFNUMMER);
    expect(JSON.stringify(await kontext(users.plattformErika))).not.toContain('+49 30');
  });

  it('Praxiskonto und ohne Anmeldung: keine Zeile, also keine Nummer', async () => {
    for (const konto of [users.ownerTherapist, users.office, null]) {
      expect(await kontext(konto)).toEqual([]);
    }
  });
});

describe('Einsicht der Praxis (E-001): Name und Nummer wie für die Person', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function einsicht(zugang: string): Promise<Record<string, unknown>> {
    const { rows } = await asUser<{ daten: Record<string, unknown>[] }>(
      users.ownerTherapist,
      EINSICHT,
      [zugang],
    );
    return rows[0]!.daten[0]!;
  }

  it('zeigt owner den Namen und die Nummer, die Erika sieht', async () => {
    const person = (await kontext(users.plattformErika)).find(
      (z) => z.access_id === platformAccesses.erikaBehandlung,
    );
    expect(await einsicht(platformAccesses.erikaBehandlung)).toEqual(
      expect.objectContaining({
        own_name: 'Erika Beispiel',
        practice_phone: RUFNUMMER,
      }),
    );
    expect(person).toEqual(
      expect.objectContaining({ own_name: 'Erika Beispiel', practice_phone: RUFNUMMER }),
    );
  });

  it('nach der Lesefrist ohne Namen, wie bei der Person (D2)', async () => {
    await asPostgres(
      'update public.training_relationships set contract_ended_on = current_date - 40 where id = $1',
      [trainingRelationships.erika],
    );
    expect(await einsicht(platformAccesses.erikaTraining)).toEqual(
      expect.objectContaining({ readable: false, own_name: null, practice_phone: RUFNUMMER }),
    );
  });
});

describe('Hilfsfunktionen von DRP-N1 und DRP-N2', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('sind für keine Anwendungsrolle ausführbar', async () => {
    const { rows } = await asPostgres<{ darf: boolean }>(
      `select has_function_privilege(r.rolle, f.signatur, 'execute') as darf
         from unnest(array['anon', 'authenticated']) as r(rolle)
         cross join unnest(array['app.platform_own_name(uuid)',
                                 'app.platform_practice_phone(uuid)']) as f(signatur)`,
    );
    expect(rows).toHaveLength(4);
    expect(rows.every((z) => !z.darf)).toBe(true);
    expect(
      await fehler(
        asUser(users.plattformTina, 'select app.platform_own_name($1::uuid)', [
          platformAccesses.tinaTraining,
        ]),
      ),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(users.plattformTina, 'select app.platform_practice_phone($1::uuid)', [
          SEED.organizationId,
        ]),
      ),
    ).toBe('42501');
  });

  it('nur der Name prüft selbst; die Rufnummer läuft mit den Rechten des Aufrufers', async () => {
    // ADR-013 Punkt 9 Nr. 2 (Zweitreview): Wer nichts prüft, bekommt keine
    // eigenen Rechte - direkt aufgerufen gälte die Policy des Absenders.
    const { rows } = await asPostgres<{ funktion: string; definer: boolean }>(
      `select p.oid::regprocedure::text as funktion, p.prosecdef as definer
         from pg_proc p
        where p.oid in ('app.platform_own_name(uuid)'::regprocedure,
                        'app.platform_practice_phone(uuid)'::regprocedure)
        order by 1`,
    );
    expect(rows).toEqual([
      { funktion: 'app.platform_own_name(uuid)', definer: true },
      { funktion: 'app.platform_practice_phone(uuid)', definer: false },
    ]);
  });
});
