import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asAnon, asPostgres, asUser, asUserCommitted, resetDatabaseOhneSeed } from './helpers/db';

/**
 * OPS-007: die Probe des Bootstrap-Runbooks.
 *
 * Der Test liest die SQL-Blöcke aus `docs/betrieb/bootstrap.md` selbst und
 * führt sie wörtlich aus — nur die Platzhalter in spitzen Klammern werden durch
 * synthetische Werte ersetzt. Eine Änderung am Runbook, die den Durchlauf
 * bricht, macht diesen Test rot; eine Kopie des SQL hier wäre beim ersten
 * Umschreiben still veraltet.
 *
 * Ausgangslage ist eine Datenbank nur aus Migrationen, ohne Seed — der Stand
 * eines neuen Projekts nach der Pipeline.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNBOOK = path.resolve(HERE, '..', '..', 'docs', 'betrieb', 'bootstrap.md');

/** Der SQL-Block mit der Markierung `-- runbook:<name>`. */
function runbookBlock(name: string): string {
  const text = readFileSync(RUNBOOK, 'utf8');
  const bloecke = [...text.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
  const treffer = bloecke.filter((b) => b.startsWith(`-- runbook:${name}\n`));
  if (treffer.length !== 1) {
    throw new Error(`Runbook: erwartet genau einen Block "${name}", gefunden ${treffer.length}.`);
  }
  return treffer[0] as string;
}

/** Synthetisch; `.example` ist nach RFC 2606 reserviert und nie zustellbar. */
const OWNER_ID = '9b0f0000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'inhaberin@probe.example';

const PLATZHALTER: Record<string, string> = {
  '<E-Mail des Inhaberkontos>': OWNER_EMAIL,
  '<Name der Praxis>': 'Probepraxis Bootstrap',
  '<Name des Standorts>': 'Probestandort',
  '<Vorname>': 'Paula',
  '<Nachname>': 'Probe',
};

function einsetzen(sql: string, werte: Record<string, string> = PLATZHALTER): string {
  let ergebnis = sql;
  for (const [platzhalter, wert] of Object.entries(werte)) {
    ergebnis = ergebnis.split(platzhalter).join(wert);
  }
  if (/<[^>]+>/.test(ergebnis)) {
    throw new Error(`Runbook: nicht ersetzter Platzhalter in\n${ergebnis}`);
  }
  return ergebnis;
}

/** Schritt 1 des Runbooks: das Konto, wie der Anmeldedienst es anlegt. */
async function kontoAnlegen(id: string, email: string, bestaetigt = true): Promise<void> {
  await asPostgres(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       'kein-kennwort', ${bestaetigt ? 'now()' : 'null'},
       '{"provider":"email","providers":["email"]}', '{}')`,
    [id, email],
  );
}

async function zaehle(tabelle: string): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(`select count(*)::int as n from ${tabelle}`);
  return rows[0]?.n ?? -1;
}

/** Was der Bootstrap anlegt; nach einem abgewiesenen Aufruf ist alles leer. */
async function nichtsAngelegt(): Promise<void> {
  for (const tabelle of [
    'public.organizations',
    'public.locations',
    'public.persons',
    'public.staff_members',
    'public.user_profiles',
    'public.user_roles',
    'public.audit_log',
  ]) {
    expect(await zaehle(tabelle), tabelle).toBe(0);
  }
}

const BOOTSTRAP = `select app.bootstrap_practice($1, $2, $3, $4, $5, $6) as ergebnis`;
const GUELTIG = [OWNER_EMAIL, 'Probepraxis', 'Europe/Berlin', 'Probestandort', 'Paula', 'Probe'];

describe('OPS-007 — Bootstrap-Runbook, geprobt auf einer Datenbank ohne Seed', () => {
  beforeAll(async () => {
    await resetDatabaseOhneSeed();
    await kontoAnlegen(OWNER_ID, OWNER_EMAIL);
  }, 120_000);

  it('beginnt leer: keine Organisation, kein Profil', async () => {
    expect(await zaehle('public.organizations')).toBe(0);
    expect(await zaehle('public.user_profiles')).toBe(0);
  });

  it('Schritt 2 legt Organisation, Standort und Praxisinhaberin in einem Aufruf an', async () => {
    const { rows } = await asPostgres<{ bootstrap_practice: Record<string, string> }>(
      einsetzen(runbookBlock('bootstrap')),
    );
    const ergebnis = rows[0]?.bootstrap_practice;
    expect(ergebnis?.user_id).toBe(OWNER_ID);

    const { rows: org } = await asPostgres<{ name: string; time_zone: string }>(
      'select name, time_zone from public.organizations',
    );
    expect(org).toEqual([{ name: 'Probepraxis Bootstrap', time_zone: 'Europe/Berlin' }]);

    const { rows: rollen } = await asPostgres<{ role_key: string }>(
      'select role_key from public.user_roles where user_id = $1',
      [OWNER_ID],
    );
    expect(rollen.map((r) => r.role_key)).toEqual(['owner']);

    const { rows: mitarbeiter } = await asPostgres<{
      primary_location_id: string;
      work_email: string;
    }>('select primary_location_id, work_email from public.staff_members');
    expect(mitarbeiter).toEqual([
      { primary_location_id: ergebnis?.location_id, work_email: OWNER_EMAIL },
    ]);
  });

  it('Schritt 3: jede Prüfzeile des Runbooks ist grün', async () => {
    const { rows } = await asPostgres<{ pruefung: string; ok: boolean }>(runbookBlock('pruefung'));
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });

  it('protokolliert die Einrichtung ohne Namen und ohne E-Mail (ADR-010, ADR-011)', async () => {
    const { rows } = await asPostgres<{
      actor_user_id: string;
      subject_type: string;
      context: Record<string, unknown>;
    }>(`select actor_user_id, subject_type, context from public.audit_log
        where action = 'organization.bootstrapped'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_user_id).toBe(OWNER_ID);
    expect(rows[0]?.subject_type).toBe('organization');
    expect(rows[0]?.context).toEqual({ surface: 'sql', purpose: 'bootstrap', roles: ['owner'] });
    const text = JSON.stringify(rows[0]?.context);
    for (const verboten of ['Paula', 'Probe', OWNER_EMAIL]) {
      expect(text).not.toContain(verboten);
    }
  });

  describe('Schritt 4: alles Weitere geht über die Anwendung', () => {
    it('die Inhaberin ergänzt die eigene Rolle therapist und behält owner', async () => {
      const { rows } = await asPostgres<{ id: string }>('select id from public.staff_members');
      await asUserCommitted(OWNER_ID, `select public.set_staff_account_roles($1, $2::text[])`, [
        rows[0]?.id,
        ['owner', 'therapist'],
      ]);
      const { rows: rollen } = await asPostgres<{ role_key: string }>(
        'select role_key from public.user_roles where user_id = $1 order by role_key',
        [OWNER_ID],
      );
      expect(rollen.map((r) => r.role_key)).toEqual(['owner', 'therapist']);
    });

    it('Praxis-Stammdaten, Preisliste und Terminraster', async () => {
      await asUserCommitted(
        OWNER_ID,
        `select public.save_practice_billing_profile(
           'Probepraxis Bootstrap', 'Probeweg', '1', '72070', 'Probestadt', '+49 7071 0000000',
           'rechnung@probe.example', '86123/45678', null, false, 'Probebank', 'Probepraxis Bootstrap',
           'DE02120300000000202051', 'TESTDEFFXXX', 'RG', 14::smallint)`,
      );
      await asUserCommitted(
        OWNER_ID,
        `select public.create_service_catalog_version('Preisliste 2027', date '2027-01-01')`,
      );
      await asUserCommitted(OWNER_ID, 'select public.set_appointment_grid(15::smallint)');

      expect(await zaehle('public.practice_billing_profiles')).toBe(1);
      expect(await zaehle('public.service_catalog_versions')).toBe(1);
      const { rows } = await asPostgres<{ appointment_grid_minutes: number }>(
        'select appointment_grid_minutes from public.organizations',
      );
      expect(rows[0]?.appointment_grid_minutes).toBe(15);
    });

    it('Mitarbeitende anlegen und einladen', async () => {
      const { rows: standort } = await asPostgres<{ id: string }>(
        'select id from public.locations',
      );
      const { rows } = await asUserCommitted<{ id: string }>(
        OWNER_ID,
        `select public.create_staff_member('Mia', 'Probe', 'mia@probe.example', null, $1) as id`,
        [standort[0]?.id],
      );
      await asUserCommitted(OWNER_ID, `select public.invite_staff_account($1, $2, $3::text[])`, [
        rows[0]?.id,
        'mia@probe.example',
        ['therapist'],
      ]);
      expect(await zaehle('public.staff_members')).toBe(2);
      expect(await zaehle('public.staff_account_invitations')).toBe(1);
    });

    it('jeder dieser Schritte steht im Auditlog, der Bootstrap bleibt der erste', async () => {
      const { rows } = await asPostgres<{ action: string }>(
        'select action from public.audit_log order by occurred_at, id',
      );
      expect(rows[0]?.action).toBe('organization.bootstrapped');
      expect(rows.map((r) => r.action)).toEqual(
        expect.arrayContaining([
          'staff_account.roles_changed',
          'organization.billing_profile_changed',
          'service_catalog.version_created',
          'organization.appointment_grid_changed',
          'staff_member.created',
          'staff_account.invited',
        ]),
      );
    });
  });

  it('ein zweiter Aufruf wird abgewiesen: V1 hat genau eine Organisation (ADR-003)', async () => {
    await kontoAnlegen('9b0f0000-0000-4000-8000-000000000002', 'zweite@probe.example');
    const zweiter = ['zweite@probe.example', ...GUELTIG.slice(1)];
    await expect(asPostgres(BOOTSTRAP, zweiter)).rejects.toThrow(/already_bootstrapped/);
    expect(await zaehle('public.organizations')).toBe(1);
  });
});

describe('OPS-007 — Bootstrap weist ab und legt dabei nichts an', () => {
  beforeEach(async () => {
    await resetDatabaseOhneSeed();
    await kontoAnlegen(OWNER_ID, OWNER_EMAIL);
  }, 120_000);

  it('niemand außer der Eigentümerrolle darf die Funktion ausführen', async () => {
    const { rows } = await asPostgres<{ rolle: string; darf: boolean }>(
      `select r as rolle,
              has_function_privilege(r, 'app.bootstrap_practice(text, text, text, text, text, text)', 'execute') as darf
       from unnest(array['anon', 'authenticated', 'service_role']) as r`,
    );
    expect(rows).toEqual([
      { rolle: 'anon', darf: false },
      { rolle: 'authenticated', darf: false },
      { rolle: 'service_role', darf: false },
    ]);
  });

  it('als angemeldeter Anwendungsnutzer: kein Recht', async () => {
    await expect(asUser(OWNER_ID, BOOTSTRAP, GUELTIG)).rejects.toThrow(/permission denied/);
    await nichtsAngelegt();
  });

  it('als anonymer Aufrufer: kein Recht', async () => {
    await expect(asAnon(BOOTSTRAP, GUELTIG)).rejects.toThrow(/permission denied/);
    await nichtsAngelegt();
  });

  it('auch mit Recht auf die Funktion nicht mit einer Anwendungssitzung', async () => {
    // Die zweite Sperre neben dem Grant: Gäbe ein späterer Loop die Funktion
    // versehentlich frei, bliebe der Aufruf aus einer Sitzung trotzdem zu.
    await expect(
      asPostgres(
        `begin;
         select set_config('request.jwt.claims', '{"sub":"${OWNER_ID}","role":"authenticated"}', true);
         ${BOOTSTRAP.replace('$1, $2, $3, $4, $5, $6', GUELTIG.map((w) => `'${w}'`).join(', '))};
         commit;`,
      ),
    ).rejects.toThrow(/bootstrap not allowed for application users/);
    await nichtsAngelegt();
  });

  it('unbekanntes Konto', async () => {
    const werte = ['fehlt@probe.example', ...GUELTIG.slice(1)];
    await expect(asPostgres(BOOTSTRAP, werte)).rejects.toThrow(/account not found/);
    await nichtsAngelegt();
  });

  it('findet das Konto unabhängig von Groß- und Kleinschreibung', async () => {
    const werte = ['  Inhaberin@Probe.Example ', ...GUELTIG.slice(1)];
    await asPostgres(BOOTSTRAP, werte);
    expect(await zaehle('public.user_profiles')).toBe(1);
  });

  it('unbestätigtes Konto', async () => {
    await kontoAnlegen('9b0f0000-0000-4000-8000-000000000003', 'offen@probe.example', false);
    const werte = ['offen@probe.example', ...GUELTIG.slice(1)];
    await expect(asPostgres(BOOTSTRAP, werte)).rejects.toThrow(/account not confirmed/);
    await nichtsAngelegt();
  });

  it('unbekannte Zeitzone', async () => {
    const werte = [...GUELTIG];
    werte[2] = 'Europe/Tuebingen';
    await expect(asPostgres(BOOTSTRAP, werte)).rejects.toThrow(/unknown time zone/);
    await nichtsAngelegt();
  });

  it('leere Namen', async () => {
    for (const index of [1, 3, 4, 5]) {
      const werte = [...GUELTIG];
      werte[index] = '   ';
      await expect(asPostgres(BOOTSTRAP, werte)).rejects.toThrow(/required/);
    }
    await nichtsAngelegt();
  });
});
