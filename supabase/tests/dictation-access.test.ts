import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  jwtClaims,
  resetDatabaseOhneTermine,
  tagInTagen,
  testDatabaseUrl,
} from './helpers/db';

/**
 * Darf diese Person zu diesem Termin diktieren? (KI-001, BEF-153, ADR-005)
 *
 * `check_dictation_access` ist der Riegel, den das AI Gateway vor jedem Diktat
 * mit dem Token der Person fragt. Positivfall ist die Therapeut:in an einem
 * Behandlungstermin ihrer Praxis; dazu die Negativfälle aus ADR-013 Punkt 9
 * Nr. 1: andere Organisation, Rolle ohne Recht (Office, Trainingsbetreuung),
 * Plattformkonto, fremde Person, anderer Leistungsbereich - und die Zustände,
 * zu denen keine Behandlung dokumentiert wird.
 */

const { users, organizationId, patients, trainingRelationships } = SEED;

const PRUEFEN = 'select public.check_dictation_access($1::uuid) as erlaubt';
const OPERATION = 'treatment_note.dictated';

const ANNA = '55555555-5555-4555-8555-000000000002';
const TOM = '55555555-5555-4555-8555-000000000006';
const STANDORT = '33333333-3333-4333-8333-000000000001';
const UNBEKANNT = '77777777-7777-4777-8777-0000000000ff';

/** Weit voraus: Die Seed-Termine liegen heute, die Tests brauchen freie Zeit. */
const TAG = tagInTagen(75);

interface TerminFelder {
  kind?: 'therapy' | 'training' | 'internal';
  status?: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  /** Stunde des Beginns - je Termin eine eigene, sonst greift der Überschneidungsschutz. */
  stunde: number;
  organisation?: 'eigene' | 'fremde';
  patient?: string;
}

/** Legt einen Termin unmittelbar an - ohne RPC, ohne Policy. */
async function termin({
  kind = 'therapy',
  status = 'confirmed',
  stunde,
  organisation = 'eigene',
  patient = patients.max,
}: TerminFelder): Promise<string> {
  const fremd = organisation === 'fremde';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, training_relationship_id, staff_member_id, location_id,
       appointment_type, kind, title, event_group_id, status, starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city,
       completed_at, completed_by, cancelled_at, cancelled_by,
       no_show_recorded_at, no_show_recorded_by
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       ($11::date + make_time($12, 0, 0)) at time zone 'Europe/Berlin',
       ($11::date + make_time($12, 45, 0)) at time zone 'Europe/Berlin',
       $13, $14, $15, $16,
       case when $10 = 'completed' then now() end,
       case when $10 = 'completed' then $17::uuid end,
       case when $10 = 'cancelled' then now() end,
       case when $10 = 'cancelled' then $17::uuid end,
       case when $10 = 'no_show' then now() end,
       case when $10 = 'no_show' then $17::uuid end
     ) returning id`,
    [
      fremd ? FREMDE_ORGANISATION.organizationId : organizationId,
      kind === 'therapy' ? (fremd ? FREMDE_ORGANISATION.patient : patient) : null,
      kind === 'training' ? trainingRelationships.tina : null,
      fremd ? FREMDE_ORGANISATION.staffMember : kind === 'training' ? TOM : ANNA,
      fremd ? null : STANDORT,
      fremd ? 'home_visit' : 'practice',
      kind,
      kind === 'internal' ? 'Teambesprechung' : null,
      kind === 'internal' ? '77777777-7777-4777-8777-0000000000e1' : null,
      status,
      TAG,
      stunde,
      fremd ? 'Beispielweg' : null,
      fremd ? '3' : null,
      fremd ? '72070' : null,
      fremd ? 'Tuebingen' : null,
      fremd ? FREMDE_ORGANISATION.owner : users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

async function pruefe(konto: string | null, terminId: string | null): Promise<boolean> {
  const { rows } = await asUser<{ erlaubt: boolean }>(konto, PRUEFEN, [terminId]);
  return rows[0]!.erlaubt;
}

/** Die Summe der Abweisungen eines Kontos unter dieser Operation (Zähler je Eintrag). */
async function abweisungen(konto: string): Promise<number> {
  const { rows } = await asPostgres<{ summe: number }>(
    `select coalesce(sum(coalesce((context ->> 'count')::integer, 1)), 0)::integer as summe
       from public.audit_log
      where action = 'access.denied' and actor_user_id = $1 and context ->> 'operation' = $2`,
    [konto, OPERATION],
  );
  return rows[0]!.summe;
}

async function auditzeilen(): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(
    'select count(*)::integer as n from public.audit_log',
  );
  return rows[0]!.n;
}

describe('check_dictation_access', () => {
  let behandlung: string;

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    behandlung = await termin({ stunde: 8 });
  });

  describe('erlaubt', () => {
    it('der Therapeut:in am Behandlungstermin ihrer Praxis', async () => {
      expect(await pruefe(users.therapist, behandlung)).toBe(true);
    });

    it('der Teamleitung und der Inhaberin mit Behandlungsrolle', async () => {
      expect(await pruefe(users.teamLead, behandlung)).toBe(true);
      expect(await pruefe(users.ownerTherapist, behandlung)).toBe(true);
    });

    it('auch nach dem Abschluss des Termins - dokumentiert wird oft danach', async () => {
      const abgeschlossen = await termin({ stunde: 10, status: 'completed' });
      expect(await pruefe(users.therapist, abgeschlossen)).toBe(true);
    });

    it('hinterlässt bei einem erlaubten Diktat keine Zeile im Auditlog (ADR-010 Punkt 15)', async () => {
      const vorher = await auditzeilen();
      const { rows } = await asUserCommitted<{ erlaubt: boolean }>(users.therapist, PRUEFEN, [
        behandlung,
      ]);
      expect(rows[0]!.erlaubt).toBe(true);
      expect(await auditzeilen()).toBe(vorher);
    });
  });

  describe('Rolle ohne Recht', () => {
    it.each([
      ['Office', users.office],
      ['Trainingsbetreuung', users.trainer],
      // Profil in der Praxis, aber keine Praxisrolle (ADR-023 Punkt 20).
      ['ein Konto ohne Praxisrolle', users.patientMax],
    ])('weist %s mit false und einem bestätigten Abweisungseintrag ab', async (_rolle, konto) => {
      const vorher = await abweisungen(konto);
      const { rows } = await asUserCommitted<{ erlaubt: boolean }>(konto, PRUEFEN, [behandlung]);
      expect(rows[0]!.erlaubt).toBe(false);
      expect(await abweisungen(konto)).toBe(vorher + 1);

      // Subjekt ist die Organisation, nie die Kennung aus dem Aufruf.
      const { rows: eintraege } = await asPostgres<{
        subject_type: string;
        subject_id: string;
        context: Record<string, unknown>;
      }>(
        `select subject_type, subject_id, context from public.audit_log
            where action = 'access.denied' and actor_user_id = $1
              and context ->> 'operation' = $2
            order by occurred_at, id`,
        [konto, OPERATION],
      );
      const eintrag = eintraege.at(-1)!;
      expect(eintrag.subject_type).toBe('organization');
      expect(eintrag.subject_id).toBe(organizationId);
      expect(eintrag.context).toMatchObject({
        surface: 'api',
        reason: 'role',
        operation: OPERATION,
      });
      expect(JSON.stringify(eintrag.context)).not.toContain(behandlung);
    });
  });

  describe('Plattform', () => {
    it('weist ein Plattformkonto am Termin der eigenen Behandlung ab', async () => {
      // Erika hat einen Zugang zu ihrer Behandlung (POR-002) - diktieren darf
      // sie trotzdem nicht: Das Diktat gehört der Praxis (ADR-023 Punkt 21).
      const eigener = await termin({ stunde: 11, patient: patients.erika });
      await expect(pruefe(users.plattformErika, eigener)).rejects.toThrow(
        /not allowed to dictate treatment documentation/,
      );
    });

    it('weist ein Plattformkonto am Termin einer fremden Person ab', async () => {
      // Fremde Person (ADR-013 Punkt 9 Nr. 1): Paula begleitet Max, Tina
      // trainiert - an Erikas Termin hat keine von beiden etwas zu suchen.
      const fremderTermin = await termin({ stunde: 12, patient: patients.erika });
      for (const konto of [users.plattformTina, users.plattformPaula]) {
        await expect(pruefe(konto, fremderTermin)).rejects.toThrow(
          /not allowed to dictate treatment documentation/,
        );
      }
    });
  });

  describe('andere Organisation', () => {
    it('kennt den Termin einer anderen Praxis nicht und schreibt keinen Eintrag', async () => {
      const fremd = await termin({ stunde: 9, organisation: 'fremde' });
      const vorher = await auditzeilen();
      const { rows } = await asUserCommitted<{ erlaubt: boolean }>(users.therapist, PRUEFEN, [
        fremd,
      ]);
      expect(rows[0]!.erlaubt).toBe(false);
      expect(await auditzeilen()).toBe(vorher);
    });

    it('lässt die Therapeut:in der anderen Praxis nicht an den eigenen Termin', async () => {
      await asPostgres(
        `insert into public.user_roles (user_id, organization_id, role_key)
         values ($1, $2, 'therapist') on conflict do nothing`,
        [FREMDE_ORGANISATION.owner, FREMDE_ORGANISATION.organizationId],
      );
      const fremd = await termin({ stunde: 9, organisation: 'fremde' });
      // Gegenprobe: In der eigenen Praxis darf sie.
      expect(await pruefe(FREMDE_ORGANISATION.owner, fremd)).toBe(true);
      expect(await pruefe(FREMDE_ORGANISATION.owner, behandlung)).toBe(false);
    });
  });

  describe('Termin ohne Behandlungsdokumentation', () => {
    it('weist einen Trainingstermin ab - anderer Leistungsbereich (ADR-021)', async () => {
      const training = await termin({ stunde: 13, kind: 'training' });
      expect(await pruefe(users.therapist, training)).toBe(false);
      // Auch wer Training betreut, bekommt kein Diktat zur Behandlung.
      expect(await pruefe(users.trainer, training)).toBe(false);
    });

    it.each([
      ['abgesagt', 'cancelled'],
      ['nicht angetroffen', 'no_show'],
    ] as const)('weist einen Termin ab, der %s ist', async (_name, status) => {
      const t = await termin({ stunde: 14, status });
      expect(await pruefe(users.therapist, t)).toBe(false);
    });

    it('weist ein Ereignis des Praxisbetriebs ab', async () => {
      const ereignis = await termin({ stunde: 15, kind: 'internal' });
      expect(await pruefe(users.therapist, ereignis)).toBe(false);
    });

    it('weist eine unbekannte oder fehlende Kennung ab', async () => {
      expect(await pruefe(users.therapist, UNBEKANNT)).toBe(false);
      expect(await pruefe(users.therapist, null)).toBe(false);
    });
  });

  describe('nicht angemeldet', () => {
    it('ist für anon nicht ausführbar', async () => {
      await expect(asAnon(PRUEFEN, [behandlung])).rejects.toThrow(/permission denied/i);
    });

    it('weist einen Aufruf ohne Konto im Token ab', async () => {
      await expect(pruefe(null, behandlung)).rejects.toThrow(/not authenticated/);
    });

    it('weist eine gesperrte Sitzung ab (ADR-025 Punkt 6)', async () => {
      // Angemeldet vor zwei Stunden: Die Frist von 60 Minuten ist vorbei.
      const gesperrt = JSON.parse(jwtClaims(users.therapist)) as Record<string, unknown>;
      gesperrt.amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 7200 }];
      const client = new Client({ connectionString: testDatabaseUrl() });
      await client.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('role', 'authenticated', true)");
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify(gesperrt),
        ]);
        await expect(client.query(PRUEFEN, [behandlung])).rejects.toThrow(
          /not allowed to dictate treatment documentation/,
        );
      } finally {
        await client.query('rollback').catch(() => undefined);
        await client.end();
      }
    });
  });

  describe('Funktion', () => {
    it('erteilt anon kein EXECUTE-Recht, authenticated schon', async () => {
      const { rows } = await asPostgres<{ anon: boolean; angemeldet: boolean }>(
        `select has_function_privilege('anon', 'public.check_dictation_access(uuid)', 'execute') as anon,
                has_function_privilege('authenticated', 'public.check_dictation_access(uuid)', 'execute') as angemeldet`,
      );
      expect(rows[0]).toEqual({ anon: false, angemeldet: true });
    });

    it('läuft als SECURITY DEFINER mit leerem search_path', async () => {
      const { rows } = await asPostgres<{ prosecdef: boolean; proconfig: string[] | null }>(
        `select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'check_dictation_access'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.prosecdef).toBe(true);
      expect(rows[0]!.proconfig).toContain('search_path=""');
    });
  });
});
