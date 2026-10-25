/**
 * Fasst die Migrationen zu einer Basis zusammen und beweist, dass das Schema gleich bleibt.
 * `schreiben <datei>` vor dem Löschen der alten Migrationen; `pruefen <ref>`: Stand <ref> gegen den Arbeitsbaum.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MIGRATIONEN = 'supabase/migrations';
const SHIM = 'supabase/tests/helpers/supabase-shim.sql';
const PUFFER = 512 * 1024 * 1024;

// Was pg_dump fuer seine Wiederherstellung setzt; die Basis darf die Sitzung nicht veraendern.
const SITZUNG = new Set([
  'SET statement_timeout = 0;',
  'SET lock_timeout = 0;',
  'SET idle_in_transaction_session_timeout = 0;',
  "SET client_encoding = 'UTF8';",
  'SET standard_conforming_strings = on;',
  "SELECT pg_catalog.set_config('search_path', '', false);",
  'SET check_function_bodies = false;',
  'SET xmloption = content;',
  'SET client_min_messages = warning;',
  'SET row_security = off;',
  "SET default_tablespace = '';",
  'SET default_table_access_method = heap;',
]);

function werkzeug(name) {
  const versionen = readdirSync('/usr/lib/postgresql').sort((a, b) => Number(a) - Number(b));
  return `/usr/lib/postgresql/${versionen.at(-1)}/bin/${name}`;
}

function url(datenbank) {
  const u = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/postgres',
  );
  u.pathname = `/${datenbank}`;
  return u.toString();
}

function psql(datenbank, argumente, eingabe) {
  return execFileSync(
    werkzeug('psql'),
    [url(datenbank), '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...argumente],
    {
      encoding: 'utf8',
      input: eingabe,
      maxBuffer: PUFFER,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
}

function dump(datenbank, argumente) {
  return execFileSync(werkzeug('pg_dump'), [...argumente, url(datenbank)], {
    encoding: 'utf8',
    maxBuffer: PUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Supabase gibt den API-Rollen in public von selbst Rechte; der Shim nicht. Zur Probe ueberall.
const VORGABEN = ['tables', 'sequences', 'functions', 'schemas'].map(
  (art) => `alter default privileges grant all on ${art} to anon, authenticated, service_role`,
);

/** Neue Datenbank aus Shim und Migrationen `[{ name, text }]`, auf Wunsch mit den Vorgaben. */
export function aufbauen(datenbank, migrationen, vorgaben = false) {
  psql('postgres', [
    '-c',
    `drop database if exists ${datenbank} with (force)`,
    '-c',
    `create database ${datenbank}`,
  ]);
  psql(datenbank, ['-f', SHIM]);
  if (vorgaben)
    psql(
      datenbank,
      VORGABEN.flatMap((befehl) => ['-c', befehl]),
    );
  for (const { name, text } of migrationen) {
    try {
      psql(datenbank, ['-f', '-'], text);
    } catch (fehler) {
      throw new Error(`${name}: ${String(fehler.stderr).trim().split('\n').slice(-3).join(' ')}`);
    }
  }
}

/** Der Dump ohne psql-Befehle, Sitzungseinstellungen und die Anlage von `public`, die jede Umgebung mitbringt. */
export function bereinige(text) {
  return text
    .split('\n')
    .filter(
      (z) => !/^\\(un)?restrict /.test(z) && !SITZUNG.has(z) && !/^-- Dumped (from|by) /.test(z),
    )
    .join('\n')
    .replace(
      /--\n-- Name: public; Type: SCHEMA; Schema: -; Owner: -\n--\n\nCREATE SCHEMA public;\n\n\n/,
      '',
    )
    .replace(
      /--\n-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -\n--\n\nCOMMENT ON SCHEMA public IS 'standard public schema';\n\n\n/,
      '',
    );
}

/**
 * pg_dump schreibt BETWEEN in CHECK als `((x >= a) AND (x <= b))`; eingelesen glaettet PostgreSQL das
 * in ein umgebendes AND. Zurueck zu BETWEEN entsteht derselbe Ausdrucksbaum wie aus der Migration.
 */
export function zwischen(text) {
  const wert = String.raw`(?:\([^()]*\)|[^()\s])+(?: precision)?`;
  // eslint-disable-next-line security/detect-non-literal-regexp -- Muster aus einer Konstante, Eingabe ist pg_dump.
  const muster = new RegExp(
    String.raw`\(\((${wert}) >= (${wert})\) AND \(\1 <= (${wert})\)\)`,
    'g',
  );
  return text
    .split('\n')
    .map((z) => (/CHECK \(/.test(z) ? z.replace(muster, '($1 BETWEEN $2 AND $3)') : z))
    .join('\n');
}

/**
 * Ein Zeilenvergleich `(old.a, old.b) IS DISTINCT FROM (new.a, new.b)` erscheint im Dump als links
 * geschachteltes OR; eingelesen wuerde es flach. Die Zeilenform ergibt wieder denselben Baum.
 */
export function zeilenvergleich(text) {
  return text
    .split('\n')
    .map((z) => {
      const wann = /^(CREATE TRIGGER .* WHEN \()(.*)(\) EXECUTE FUNCTION .*)$/.exec(z);
      if (!wann || !wann[2].includes(')) OR (old.')) return z;
      const spalten = [...wann[2].matchAll(/\(old\.(\w+) IS DISTINCT FROM new\.\1\)/g)].map(
        (m) => m[1],
      );
      const rest = wann[2].replace(/\(old\.(\w+) IS DISTINCT FROM new\.\1\)/g, '');
      if (spalten.length < 2 || !/^[()\sOR]*$/.test(rest)) return z;
      const zeile = (seite) => `(${spalten.map((s) => `${seite}.${s}`).join(', ')})`;
      return `${wann[1]}(${zeile('old')} IS DISTINCT FROM ${zeile('new')})${wann[3]}`;
    })
    .join('\n');
}

/** Zeichenketten mit Wagenruecklauf als Escape-String: Git schriebe das CR sonst beim Einchecken um. */
export function steuerzeichen(text) {
  const ersatz = new Map([
    ['\\', '\\\\'],
    ['\t', '\\t'],
    ['\r', '\\r'],
    ['\n', '\\n'],
  ]);
  return text.replace(
    /'([^'$]*\r[^']*)'/g,
    (_, inhalt) => `E'${inhalt.replace(/[\\\t\r\n]/g, (z) => ersatz.get(z))}'`,
  );
}

// Rechte der API-Rollen an allem, was die Migrationen in public und app anlegen.
const RECHTE = `
set search_path = '';
with objekte as (
  select case when c.relkind = 'S' then 'SEQUENCE' else 'TABLE' end as art,
         format('%I.%I', n.nspname, c.relname) as name, c.relacl as acl,
         acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner) as grund
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'app') and c.relkind in ('r', 'v', 'm', 'f', 'p', 'S')
  union all
  select case when p.prokind = 'p' then 'PROCEDURE' else 'FUNCTION' end,
         p.oid::regprocedure::text, p.proacl, acldefault('f', p.proowner)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app')
  union all
  select 'SCHEMA', quote_ident(n.nspname), n.nspacl, acldefault('n', n.nspowner)
    from pg_namespace n where n.nspname = 'app'
)
select o.art, o.name, r.rolname,
       coalesce((select string_agg(a.privilege_type, ',') from aclexplode(coalesce(o.acl, o.grund)) a
                  where a.grantee = r.oid), ''),
       (select string_agg(distinct a.privilege_type, ',') from aclexplode(o.grund) a)
  from objekte o cross join pg_roles r
 where r.rolname in ('anon', 'authenticated', 'service_role')
 order by 1, 2, 3`;

function rechte(datenbank) {
  return psql(datenbank, ['-At', '-F', '\t', '-c', RECHTE])
    .split('\n')
    .filter(Boolean)
    .map((zeile) => {
      const [art, name, rolle, hat, alle] = zeile.split('\t');
      const menge = (liste) => new Set(liste.split(',').filter(Boolean));
      return { art, name, rolle, hat: menge(hat), alle: menge(alle) };
    });
}

/**
 * Was einer API-Rolle mit Vorgaben fehlt, hat eine Migration entzogen; ohne Vorgaben wirkt der Entzug nicht.
 * `REVOKE ALL`, wo alles Verbliebene ausdruecklich vergeben ist: Es steht vor den GRANTs des Abzugs.
 */
export function entzuege(ohne, mit) {
  const schluessel = (z) => `${z.art} ${z.name} ${z.rolle}`;
  const ausdruecklich = new Map(ohne.map((z) => [schluessel(z), z.hat]));
  const ziele = new Map();
  for (const z of mit) {
    const fehlt = [...z.alle].filter((recht) => !z.hat.has(recht)).sort();
    const vergeben = ausdruecklich.get(schluessel(z));
    if (!vergeben || [...vergeben].some((recht) => !z.hat.has(recht))) {
      throw new Error(`${schluessel(z)}: ohne Vorgaben mehr Rechte als mit.`);
    }
    if (fehlt.length === 0) continue;
    const alles = fehlt.length === z.alle.size || [...z.hat].every((recht) => vergeben.has(recht));
    const ziel = `${alles ? 'ALL' : fehlt.join(', ')} ON ${z.art} ${z.name}`;
    ziele.set(ziel, [...(ziele.get(ziel) ?? []), z.rolle]);
  }
  return [...ziele].map(([ziel, rollen]) => `REVOKE ${ziel} FROM ${rollen.join(', ')};`);
}

/** Setzt Zeilen vor die Rechte, mit denen pg_dump schliesst. */
export function vorRechten(text, zeilen) {
  const teile = text.split('\n');
  let anfang = teile.length;
  for (let i = teile.length - 1; i >= 0; i -= 1) {
    if (teile.at(i) === '') continue;
    if (!/^(GRANT|REVOKE) /.test(teile.at(i))) break;
    anfang = i;
  }
  if (anfang === teile.length) throw new Error('Der Abzug endet nicht mit Rechten.');
  return [...teile.slice(0, anfang), ...zeilen, '', ...teile.slice(anfang)].join('\n');
}

/** Bedingte Bloecke, die nur mit pg_cron etwas tun; der Shim hat kein pg_cron, deshalb woertlich. */
export function cronBloecke(texte) {
  const muster =
    /do \$\$\s*begin\s*if exists \(select 1 from pg_available_extensions where name = 'pg_cron'\) then[\s\S]*?\nend;?\s*\n?\$\$;/g;
  return texte.flatMap((t) => t.match(muster) ?? []);
}

/** Marker der Fragebogen-Fassungen fuer scripts/definitionen-sql.mjs; die Koerperbereiche zaehlen nur zuletzt. */
export function marker(texte) {
  const definitionen = texte.flatMap(
    (t) => t.match(/^-- definition [a-z0-9_]+@\S+ sha256:[0-9a-f]{64}$/gm) ?? [],
  );
  const regionen = texte
    .flatMap((t) => t.match(/^-- koerperbereiche sha256:[0-9a-f]{64}$/gm) ?? [])
    .at(-1);
  return [...new Set(definitionen), ...(regionen ? [regionen] : [])];
}

function basisSchreiben(ziel, letzteVersion) {
  const dateien = readdirSync(MIGRATIONEN)
    .filter((d) => d.endsWith('.sql'))
    .sort();
  const migrationen = dateien.map((name) => ({
    name,
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Dateien aus supabase/migrations.
    text: readFileSync(`${MIGRATIONEN}/${name}`, 'utf8'),
  }));
  aufbauen('basis_shim', []);
  aufbauen('basis_alt', migrationen);
  aufbauen('basis_rechte', migrationen, true);
  const entzogen = entzuege(rechte('basis_alt'), rechte('basis_rechte'));
  const erweiterungen = psql('basis_alt', [
    '-At',
    '-c',
    "select format('create extension if not exists %I with schema %I;', e.extname, n.nspname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql' order by e.extname",
  ]).trim();
  // Policies und Trigger, die Migrationen an Tabellen von Storage und Anmeldedienst haengen.
  const fremd = (db) =>
    dump(db, [
      '--no-owner',
      '--schema-only',
      '-t',
      'storage.objects',
      '-t',
      'storage.buckets',
      '-t',
      'auth.users',
    ])
      .split('\n')
      .filter((z) => /^CREATE (POLICY|TRIGGER) /.test(z));
  const vorher = new Set(fremd('basis_shim'));
  const anbauten = fremd('basis_alt').filter((z) => !vorher.has(z));
  const buckets = psql('basis_alt', [
    '-At',
    '-c',
    'select format($f$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %L) on conflict (id) do nothing;$f$, id, name, public, coalesce(file_size_limit::text, $n$null$n$), allowed_mime_types) from storage.buckets order by ctid',
  ]).trim();
  const texte = migrationen.map((m) => m.text);
  const teile = [
    `-- Basis aus ${dateien.length} Migrationen bis ${letzteVersion} (ROADMAP 7.16, Aufräumen Schritt 2).`,
    '-- Erzeugt von scripts/basis-migration.mjs, nicht von Hand ändern; neue Migrationen kommen dahinter.',
    '',
    'set check_function_bodies = false;',
    '',
    erweiterungen,
    '',
    steuerzeichen(
      vorRechten(
        verdichten(
          zeilenvergleich(
            zwischen(
              bereinige(
                dump('basis_alt', ['--no-owner', '--column-inserts', '-n', 'public', '-n', 'app']),
              ),
            ),
          ),
        ),
        [
          '-- Was Migrationen den API-Rollen entzogen hatten, die Supabase in public von selbst vergibt.',
          ...entzogen,
        ],
      ),
    ).trim(),
    '',
    '-- Policies und Trigger an Storage und Anmeldedienst, Buckets',
    '',
    ...anbauten,
    '',
    buckets,
    '',
    '-- Zeitplaene, nur wo pg_cron verfuegbar ist',
    '',
    cronBloecke(texte).join('\n\n'),
    '',
    'reset check_function_bodies;',
    '',
    '-- Fassungen der Fragebogen fuer scripts/definitionen-sql.mjs',
    ...marker(texte),
    '',
  ];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Ziel aus dem Aufruf von Hand.
  writeFileSync(ziel, teile.join('\n'));
  return {
    dateien: dateien.length,
    anbauten: anbauten.length,
    cron: cronBloecke(texte).length,
    entzuege: entzogen.length,
  };
}

// Annahmen, deren einziger Anker ein Kommentar der alten Migrationen war; die Zeile kommt vor ihr Objekt.
const ANKER = {
  'ANN-004': 'CREATE TABLE public.practice_targets (',
  'ANN-037': 'CREATE FUNCTION app.is_valid_treatment_length(',
  'ANN-049': 'CREATE FUNCTION app.appointment_window_options(',
  'ANN-063': 'CREATE VIEW public.appointment_directory ',
  'ANN-154': 'CREATE FUNCTION app.ending_treatment_bases(',
  'ANN-187': 'CREATE FUNCTION app.user_profiles_not_platform_account(',
  'ANN-217': 'CREATE FUNCTION public.platform_accesses_take_back_deletion(',
  'ANN-218': 'CREATE TABLE public.platform_mailbox_confirmations (',
  'ANN-291': 'CREATE FUNCTION app.training_contract_wording_version(',
  'ANN-337': 'CREATE FUNCTION public.confirm_message_attachment_upload(',
  'ANN-339': 'CREATE FUNCTION app.invoice_recipient_name(',
  'ANN-346': 'CREATE FUNCTION app.notify_appointment_update(',
  'ANN-347': 'CREATE FUNCTION app.push_endpoint_allowed(',
  'ANN-480': 'CREATE TABLE public.exercise_plan_items (',
  'ANN-483': 'CREATE TABLE public.appointments (',
  'ANN-615': 'CREATE FUNCTION public.record_electricity_tour_distance(',
  'ANN-617': 'CREATE FUNCTION app.electricity_tour_days(',
  'ANN-703': 'CREATE FUNCTION app.journal_patient_file_deletion(',
};

/** Ohne die Kopfzeilen, die pg_dump vor jedes Objekt setzt; Anker der Annahmen davor. */
export function verdichten(text, anker = ANKER) {
  let ergebnis = text
    .replace(/\n\n--\n-- (Name|Data for Name): [^\n]*\n--\n\n/g, '\n')
    .replace(/--\n-- (Name|Data for Name): [^\n]*\n--\n\n/g, '')
    .replace(/--\n-- PostgreSQL database dump( complete)?\n--\n\n?/g, '');
  for (const [kennung, anfang] of Object.entries(anker)) {
    const stelle = ergebnis.indexOf(`\n${anfang}`);
    if (stelle < 0) throw new Error(`${kennung}: ${anfang} fehlt in der Basis.`);
    ergebnis = `${ergebnis.slice(0, stelle)}\n-- ${kennung}${ergebnis.slice(stelle)}`;
  }
  return ergebnis;
}

/** pg_dump setzt in jedem Lauf einen zufaelligen Schluessel hinter `\restrict`; sonst bleibt alles stehen. */
export function ohneSchluessel(text) {
  return text.replace(/^\\(un)?restrict \S+$/gm, '');
}

// Nur diese Tabellen ziehen bei jedem Aufbau neue Werte aus now() und gen_random_uuid().
const BAUZEIT =
  /^INSERT INTO (public\.food_sources|public\.questionnaire_definitions|storage\.buckets) /;

/** Daten ohne Bauzeit: Zeitstempel und Zufallsschluessel, nur in den Zeilen dieser Tabellen. */
export function vergleichbar(text) {
  return ohneSchluessel(text)
    .split('\n')
    .map((zeile) =>
      BAUZEIT.test(zeile)
        ? zeile
            .replace(/'\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.?\d*\+00'/g, "'<zeit>'")
            .replace(
              /'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'/g,
              "'<zufall>'",
            )
        : zeile,
    )
    .join('\n');
}

function migrationenAus(ref) {
  if (!ref) {
    return (
      readdirSync(MIGRATIONEN)
        .filter((d) => d.endsWith('.sql'))
        .sort()
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Dateien aus supabase/migrations.
        .map((name) => ({ name, text: readFileSync(`${MIGRATIONEN}/${name}`, 'utf8') }))
    );
  }
  return execFileSync('git', ['ls-tree', '--name-only', ref, `${MIGRATIONEN}/`], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((p) => p.endsWith('.sql'))
    .sort()
    .map((p) => ({
      name: p,
      text: execFileSync('git', ['show', `${ref}:${p}`], { encoding: 'utf8', maxBuffer: PUFFER }),
    }));
}

const ZAEHLEN = `select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public', 'app')) || ' Tabellen, '
  || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app')) || ' Funktionen, '
  || (select count(*) from pg_policies) || ' Policies, '
  || (select count(*) from pg_trigger where not tgisinternal) || ' Trigger'`;

/**
 * Schema samt Rechten und Eigentum zeichengleich, ohne und mit den Vorgaben von Supabase;
 * die Daten bis auf Bauzeit und Zufallsschluessel.
 */
function pruefen(ref) {
  const alt = migrationenAus(ref);
  const neu = migrationenAus(null);
  for (const [db, migrationen, vorgaben] of [
    ['basis_alt', alt, false],
    ['basis_neu', neu, false],
    ['basis_alt_vorgaben', alt, true],
    ['basis_neu_vorgaben', neu, true],
  ]) {
    aufbauen(db, migrationen, vorgaben);
  }
  console.log(
    `alt: ${alt.length} Migrationen aus ${ref}, ${psql('basis_alt', ['-At', '-c', ZAEHLEN]).trim()}`,
  );
  console.log(
    `neu: ${neu.length} Migrationen, ${psql('basis_neu', ['-At', '-c', ZAEHLEN]).trim()}`,
  );
  mkdirSync('.tmp', { recursive: true });
  let gleich = true;
  for (const [art, dbs, argumente, form] of [
    ['schema', ['basis_alt', 'basis_neu'], ['--schema-only'], ohneSchluessel],
    ['vorgaben', ['basis_alt_vorgaben', 'basis_neu_vorgaben'], ['--schema-only'], ohneSchluessel],
    ['daten', ['basis_alt', 'basis_neu'], ['--data-only', '--column-inserts'], vergleichbar],
  ]) {
    const [a, b] = dbs.map((db) => form(dump(db, argumente)));
    for (const [seite, text] of [
      ['alt', a],
      ['neu', b],
    ]) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- fester Ordner .tmp.
      writeFileSync(`.tmp/basis-${art}-${seite}.sql`, text);
    }
    const ersetzt = (a.match(/'<(zeit|zufall)>'/g) ?? []).length;
    console.log(
      `${art}: ${a === b ? 'identisch' : 'VERSCHIEDEN'}, ${a.split('\n').length} Zeilen` +
        (ersetzt ? `, ${ersetzt} Werte aus der Bauzeit ersetzt` : ''),
    );
    gleich &&= a === b;
  }
  if (!gleich) process.exit(1);
}

function main() {
  const [befehl, wert] = process.argv.slice(2);
  if (befehl === 'schreiben') {
    const letzte = readdirSync(MIGRATIONEN)
      .filter((d) => d.endsWith('.sql'))
      .sort()
      .at(-1)
      .slice(0, 14);
    console.log(basisSchreiben(wert, letzte));
  } else if (befehl === 'pruefen') pruefen(wert ?? 'origin/main');
  else console.error('Aufruf: node scripts/basis-migration.mjs schreiben <datei> | pruefen [ref]');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
