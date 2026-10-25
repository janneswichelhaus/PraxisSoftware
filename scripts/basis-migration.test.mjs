import { describe, expect, it } from 'vitest';
import {
  bereinige,
  cronBloecke,
  entzuege,
  marker,
  ohneSchluessel,
  steuerzeichen,
  vergleichbar,
  verdichten,
  vorRechten,
  zeilenvergleich,
  zwischen,
} from './basis-migration.mjs';

const zeilen = (...z) => z.join('\n');

describe('bereinige', () => {
  it('entfernt psql-Befehle, Sitzungseinstellungen und die Anlage von public', () => {
    const text = zeilen(
      '\\restrict abc',
      "SELECT pg_catalog.set_config('search_path', '', false);",
      'SET row_security = off;',
      '--',
      '-- Name: public; Type: SCHEMA; Schema: -; Owner: -',
      '--',
      '',
      'CREATE SCHEMA public;',
      '',
      '',
      'CREATE TABLE public.a (id uuid);',
      '\\unrestrict abc',
    );
    expect(bereinige(text)).toBe('CREATE TABLE public.a (id uuid);');
  });
});

describe('zwischen', () => {
  it('macht aus dem ausgeschriebenen BETWEEN in CHECK wieder BETWEEN', () => {
    const text = '    CONSTRAINT a CHECK ((((x >= 1) AND (x <= 4)) AND (y IS NULL)))';
    expect(zwischen(text)).toBe('    CONSTRAINT a CHECK (((x BETWEEN 1 AND 4) AND (y IS NULL)))');
  });

  it('versteht Funktionen und Typumwandlungen als Werte', () => {
    const text =
      "CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)) AND (n = 1))";
    expect(zwischen(text)).toContain(
      "(lat BETWEEN ('-90'::integer)::double precision AND (90)::double precision)",
    );
    expect(zwischen('CHECK (((length(t) >= 1) AND (length(t) <= 9)) AND ok)')).toContain(
      '(length(t) BETWEEN 1 AND 9)',
    );
  });

  it('laesst Zeilen ohne CHECK und ungleiche Seiten stehen', () => {
    expect(zwischen('  if ((x >= 1) AND (x <= 4)) then')).toBe('  if ((x >= 1) AND (x <= 4)) then');
    expect(zwischen('CHECK (((x >= 1) AND (y <= 4)))')).toBe('CHECK (((x >= 1) AND (y <= 4)))');
  });
});

describe('zeilenvergleich', () => {
  const kopf = 'CREATE TRIGGER t BEFORE UPDATE ON public.a FOR EACH ROW WHEN (';
  const fuss = ') EXECUTE FUNCTION app.f();';

  it('macht aus geschachteltem OR wieder einen Zeilenvergleich', () => {
    const text = `${kopf}(((old.a IS DISTINCT FROM new.a) OR (old.b IS DISTINCT FROM new.b)) OR (old.c IS DISTINCT FROM new.c))${fuss}`;
    expect(zeilenvergleich(text)).toBe(
      `${kopf}((old.a, old.b, old.c) IS DISTINCT FROM (new.a, new.b, new.c))${fuss}`,
    );
  });

  it('laesst ein flaches OR und andere Bedingungen stehen', () => {
    const flach = `${kopf}((old.a IS DISTINCT FROM new.a) OR (old.b IS DISTINCT FROM new.b))${fuss}`;
    expect(zeilenvergleich(flach)).toBe(flach);
    const anders = `${kopf}(((old.a IS DISTINCT FROM new.a) OR (old.b IS DISTINCT FROM new.b)) OR (new.c > 1))${fuss}`;
    expect(zeilenvergleich(anders)).toBe(anders);
  });
});

describe('steuerzeichen', () => {
  it('schreibt Zeichenketten mit Wagenruecklauf als Escape-String', () => {
    expect(steuerzeichen("CHECK ((btrim(x, ' \t\r\n'::text) <> ''::text))")).toBe(
      "CHECK ((btrim(x, E' \\t\\r\\n'::text) <> ''::text))",
    );
    expect(steuerzeichen("'a\\b\r'")).toBe("E'a\\\\b\\r'");
  });

  it('laesst andere Zeichenketten stehen', () => {
    expect(steuerzeichen("CHECK ((x <> ''::text)) AND y = 'a\tb'")).toBe(
      "CHECK ((x <> ''::text)) AND y = 'a\tb'",
    );
  });
});

describe('entzuege', () => {
  const zeile = (art, name, rolle, hat, alle) => ({
    art,
    name,
    rolle,
    hat: new Set(hat),
    alle: new Set(alle),
  });
  const TABELLE = ['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'];

  it('entzieht, was mit Vorgaben fehlt, und fasst die Rollen zusammen', () => {
    const ohne = [
      zeile('FUNCTION', 'public.f()', 'anon', [], ['EXECUTE']),
      zeile('FUNCTION', 'public.f()', 'authenticated', [], ['EXECUTE']),
      zeile('FUNCTION', 'public.g()', 'authenticated', ['EXECUTE'], ['EXECUTE']),
      zeile('FUNCTION', 'public.g()', 'service_role', [], ['EXECUTE']),
    ];
    const mit = [
      zeile('FUNCTION', 'public.f()', 'anon', [], ['EXECUTE']),
      zeile('FUNCTION', 'public.f()', 'authenticated', [], ['EXECUTE']),
      zeile('FUNCTION', 'public.g()', 'authenticated', ['EXECUTE'], ['EXECUTE']),
      zeile('FUNCTION', 'public.g()', 'service_role', ['EXECUTE'], ['EXECUTE']),
    ];
    expect(entzuege(ohne, mit)).toEqual([
      'REVOKE ALL ON FUNCTION public.f() FROM anon, authenticated;',
    ]);
  });

  it('nimmt REVOKE ALL nur, wo alles Verbliebene ausdruecklich vergeben ist', () => {
    const ohne = [
      zeile('TABLE', 'public.a', 'anon', ['SELECT'], TABELLE),
      zeile('TABLE', 'public.b', 'anon', [], TABELLE),
    ];
    const mit = [
      zeile('TABLE', 'public.a', 'anon', ['SELECT'], TABELLE),
      zeile('TABLE', 'public.b', 'anon', ['REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE'], TABELLE),
    ];
    expect(entzuege(ohne, mit)).toEqual([
      'REVOKE ALL ON TABLE public.a FROM anon;',
      'REVOKE DELETE, INSERT, UPDATE ON TABLE public.b FROM anon;',
    ]);
  });

  it('bricht ab, wenn ohne Vorgaben mehr vergeben ist als mit', () => {
    const schema = (hat) => zeile('SCHEMA', 'app', 'anon', hat, ['CREATE', 'USAGE']);
    expect(() => entzuege([schema(['USAGE'])], [schema([])])).toThrow(/mehr Rechte/);
  });
});

describe('vorRechten', () => {
  it('setzt die Zeilen vor die Rechte am Ende des Abzugs', () => {
    const text = zeilen(
      'CREATE TABLE public.a (id integer);',
      '',
      'GRANT SELECT ON TABLE public.a TO authenticated;',
      'REVOKE ALL ON FUNCTION public.f() FROM PUBLIC;',
      '',
    );
    expect(vorRechten(text, ['-- Entzuege', 'REVOKE ALL ON TABLE public.a FROM anon;'])).toBe(
      zeilen(
        'CREATE TABLE public.a (id integer);',
        '',
        '-- Entzuege',
        'REVOKE ALL ON TABLE public.a FROM anon;',
        '',
        'GRANT SELECT ON TABLE public.a TO authenticated;',
        'REVOKE ALL ON FUNCTION public.f() FROM PUBLIC;',
        '',
      ),
    );
  });

  it('bricht ab, wenn der Abzug nicht mit Rechten endet', () => {
    expect(() => vorRechten('CREATE TABLE public.a (id integer);', [])).toThrow(/Rechten/);
  });
});

describe('cronBloecke und marker', () => {
  it('nimmt bedingte Zeitplaene woertlich mit', () => {
    const block = zeilen(
      'do $$',
      'begin',
      "  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then",
      "    execute format('select cron.schedule(%L, %L, %L)', 'j', '* * * * *', 'select 1');",
      '  end if;',
      'end',
      '$$;',
    );
    expect(cronBloecke([`select 1;\n${block}\nselect 2;`])).toEqual([block]);
  });

  it('sammelt jede Fassung einmal und die Koerperbereiche zuletzt', () => {
    const a = `-- definition x@1.0.0 sha256:${'a'.repeat(64)}\n-- koerperbereiche sha256:${'1'.repeat(64)}`;
    const b = `-- definition x@1.0.0 sha256:${'a'.repeat(64)}\n-- koerperbereiche sha256:${'2'.repeat(64)}`;
    expect(marker([a, b])).toEqual([
      `-- definition x@1.0.0 sha256:${'a'.repeat(64)}`,
      `-- koerperbereiche sha256:${'2'.repeat(64)}`,
    ]);
  });
});

describe('verdichten und vergleichbar', () => {
  it('entfernt die Kopfzeilen von pg_dump und setzt Anker vor ihr Objekt', () => {
    const text = zeilen(
      '',
      '--',
      '-- Name: f(); Type: FUNCTION; Schema: app; Owner: -',
      '--',
      '',
      'CREATE FUNCTION app.f() RETURNS int',
    );
    expect(verdichten(text, { 'ANN-001': 'CREATE FUNCTION app.f(' })).toBe(
      '\n-- ANN-001\nCREATE FUNCTION app.f() RETURNS int',
    );
    expect(() => verdichten(text, { 'ANN-002': 'CREATE TABLE public.fehlt (' })).toThrow(/ANN-002/);
  });

  it('laesst Leerzeilen in Funktionsrumpfen stehen, nur die vor den Kopfzeilen gehen', () => {
    const rumpf = ['CREATE FUNCTION app.f() RETURNS int AS $$', '', '', '', 'select 1', '$$;'];
    const text = zeilen(
      ...rumpf,
      '',
      '',
      '--',
      '-- Name: g(); Type: FUNCTION; Schema: app; Owner: -',
      '--',
      '',
      'CREATE FUNCTION app.g()',
    );
    expect(verdichten(text, {})).toBe(zeilen(...rumpf, '', 'CREATE FUNCTION app.g()'));
  });

  it('nimmt nur den Schluessel von \\restrict heraus', () => {
    expect(ohneSchluessel(zeilen('\\restrict abc', 'SET x = 1;', '\\unrestrict abc'))).toBe(
      zeilen('', 'SET x = 1;', ''),
    );
  });

  it('ersetzt zufaellige Schluessel nur in den Tabellen, die sie je Aufbau neu ziehen', () => {
    const werte =
      "VALUES ('7c9e6679-7425-40de-944b-e07fc1f90ae7', '00000000-0000-0000-0000-000000000001');";
    expect(vergleichbar(`INSERT INTO public.food_sources (id, x) ${werte}`)).toBe(
      "INSERT INTO public.food_sources (id, x) VALUES ('<zufall>', '00000000-0000-0000-0000-000000000001');",
    );
    expect(vergleichbar(`INSERT INTO public.roles (id, x) ${werte}`)).toBe(
      `INSERT INTO public.roles (id, x) ${werte}`,
    );
  });

  it('ersetzt Zeitstempel in Daten', () => {
    expect(
      vergleichbar(
        "INSERT INTO storage.buckets (id, created_at) VALUES ('a', '2026-10-25 18:10:46.024501+00');",
      ),
    ).toBe("INSERT INTO storage.buckets (id, created_at) VALUES ('a', '<zeit>');");
  });
});
