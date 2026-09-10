import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, resetDatabase } from './helpers/db';

const { users, organizationId } = SEED;

const SUCHEN = 'select * from public.search_patients($1, $2::integer)';

interface Treffer {
  id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string | null;
  status: string;
}

function suchen(userId: string | null, begriff: string, limit: number | null = null) {
  return asUser<Treffer>(userId, SUCHEN, [begriff, limit]);
}

function namen(rows: Treffer[]): string[] {
  return rows.map((zeile) => `${zeile.given_name} ${zeile.family_name}`);
}

/**
 * Die Suche ist der Weg, auf dem eine Akte von jeder Seite aus erreichbar
 * wird. Sie ist damit zugleich der naheliegendste Umgehungsweg des
 * Berechtigungsmodells (ADR-004 Punkt 6) und der naheliegendste Weg, sich
 * ohne Anlass den gesamten Bestand anzusehen. Beides wird hier geprueft.
 */
describe('search_patients', () => {
  beforeAll(async () => {
    await resetDatabase();

    // Zwei Namen mit Umlauten und Sonderzeichen, rein synthetisch.
    await asPostgres(
      `with neu as (
         insert into public.persons (organization_id, given_name, family_name)
         values ($1, 'Jörg', 'Müller'), ($1, 'Renée', 'Straß')
         returning id, family_name
       )
       insert into public.patients (organization_id, person_id, status)
       select $1, neu.id, case when neu.family_name = 'Müller' then 'active' else 'inactive' end
       from neu`,
      [organizationId],
    );
  }, 120_000);

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(SUCHEN, ['Mustermann', null])).rejects.toThrow(/permission denied/);
  });

  it('weist ein Patientenkonto ab', async () => {
    await expect(suchen(users.patientMax, 'Mustermann')).rejects.toThrow(
      /not allowed to read patient directory/,
    );
  });

  it('findet ueber den Nachnamen', async () => {
    const { rows } = await suchen(users.therapist, 'muster');
    expect(namen(rows)).toContain('Max Mustermann');
  });

  it('findet ueber den Vornamen', async () => {
    const { rows } = await suchen(users.therapist, 'erika');
    expect(namen(rows)).toContain('Erika Beispiel');
  });

  it('findet ueber Vor- und Nachname in beiden Reihenfolgen', async () => {
    expect(namen((await suchen(users.therapist, 'max mustermann')).rows)).toContain(
      'Max Mustermann',
    );
    expect(namen((await suchen(users.therapist, 'mustermann max')).rows)).toContain(
      'Max Mustermann',
    );
  });

  it('ist umlautunempfindlich in beide Richtungen', async () => {
    for (const begriff of ['Müller', 'Mueller', 'Muller', 'müll']) {
      expect(namen((await suchen(users.therapist, begriff)).rows)).toContain('Jörg Müller');
    }
  });

  it('behandelt ss und ß gleich', async () => {
    expect(namen((await suchen(users.therapist, 'strass')).rows)).toContain('Renée Straß');
    expect(namen((await suchen(users.therapist, 'straß')).rows)).toContain('Renée Straß');
  });

  it('ignoriert Gross- und Kleinschreibung und Akzente', async () => {
    expect(namen((await suchen(users.therapist, 'RENEE')).rows)).toContain('Renée Straß');
  });

  it('liefert unter drei Zeichen nichts - und keinen Fehler', async () => {
    expect((await suchen(users.therapist, 'mu')).rows).toEqual([]);
    expect((await suchen(users.therapist, '')).rows).toEqual([]);
    expect((await suchen(users.therapist, '   ')).rows).toEqual([]);
  });

  it('taugt nicht dazu, sich den Bestand anzeigen zu lassen', async () => {
    // Ein Platzhalter ist kein Suchbegriff: gesucht wird nach Zeichen, nicht
    // nach einem Muster.
    expect((await suchen(users.therapist, '%')).rows).toEqual([]);
    expect((await suchen(users.therapist, '%%%')).rows).toEqual([]);
    expect((await suchen(users.therapist, '___')).rows).toEqual([]);
  });

  it('begrenzt die Treffermenge hart, auch bei einer hohen Anforderung', async () => {
    const { rows } = await suchen(users.therapist, 'a', 1000);
    expect(rows.length).toBeLessThanOrEqual(25);
  });

  it('achtet ein kleineres Limit', async () => {
    const { rows } = await suchen(users.therapist, 'e', 1);
    expect(rows.length).toBeLessThanOrEqual(1);
  });

  it('stellt Personen in laufender Versorgung nach vorn', async () => {
    const { rows } = await suchen(users.therapist, 'bei');
    const status = rows.map((zeile) => zeile.status);
    expect(status).toEqual([...status].sort((a, b) => (a === b ? 0 : a === 'active' ? -1 : 1)));
  });

  it('liefert ausser Name, Geburtsdatum und Status nichts', async () => {
    const { rows } = await suchen(users.therapist, 'mustermann');
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'date_of_birth',
      'family_name',
      'given_name',
      'id',
      'status',
    ]);
  });

  it('findet keine Person einer fremden Organisation', async () => {
    const fremd = '22222222-2222-4222-8222-0000000000ff';
    await asPostgres(
      `insert into public.organizations (id, name, time_zone)
       values ($1, 'Fremde Praxis', 'Europe/Berlin')
       on conflict (id) do nothing`,
      [fremd],
    );
    await asPostgres(
      `with neu as (
         insert into public.persons (organization_id, given_name, family_name)
         values ($1, 'Fremde', 'Fremdling') returning id
       )
       insert into public.patients (organization_id, person_id, status)
       select $1, neu.id, 'active' from neu`,
      [fremd],
    );

    const { rows } = await suchen(users.therapist, 'fremdling');
    expect(rows).toEqual([]);
  });

  it('laesst office suchen - Terminorganisation braucht die Akte', async () => {
    const { rows } = await suchen(users.office, 'mustermann');
    expect(namen(rows)).toContain('Max Mustermann');
  });
});
