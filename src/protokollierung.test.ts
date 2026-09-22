import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Wo Betriebslogs das Programm verlassen dürfen (ADR-011 Punkt 6, OPS-004).
 *
 * `src/lib/protokoll.test.ts` prüft, dass durch den Ausgang nichts
 * Verbotenes hindurchkommt. Diese Datei prüft die andere Hälfte, ohne die die
 * erste wertlos wäre: **dass es der Ausgang bleibt.** Eine Redaction, an der
 * jede Datei vorbeischreiben kann, ist eine Empfehlung.
 *
 * Geprüft wird über den Quelltext, nicht über das Verhalten — dasselbe
 * Verfahren wie in `src/features/preview/trennung.test.ts` und in
 * `supabase/functions/location-provider/abschottung.test.ts`: Ein
 * `console.error` in einer Ecke, die kein Test durchläuft, bliebe sonst
 * unbemerkt, bis es jemand im Betriebslog liest.
 *
 * Die Lint-Regel `no-console` prüft dasselbe und ist schneller. Sie ist
 * trotzdem nicht genug: Sie lässt sich je Zeile mit einem Kommentar aufheben,
 * und wer das tut, hat selten die Absicht, etwas Gefährliches zu bauen — er
 * will eine Fehlermeldung sehen. Dieser Test kennt keinen solchen Kommentar.
 * Umgekehrt prüft er auch die Regel selbst: Eine stillschweigend wieder
 * geöffnete `allow`-Liste wäre derselbe Rückschritt.
 */

const stamm = process.cwd();

/**
 * Die erklärten Ausgänge. **Zwei**, und die Zwei ist begründet:
 *
 * Die Edge Function läuft in Deno und kann `src/lib/protokoll.ts` nicht
 * importieren (`supabase/functions/deno.d.ts`, ADR-015 Punkt 20). Sie hat
 * deshalb ihr eigenes `protokolliere` — mit derselben Regel, geprüft weiter
 * unten. Eine dritte Zeile hier wäre eine Entscheidung und keine Formalie:
 * Jeder weitere Ausgang ist eine Stelle mehr, an der ADR-011 Punkt 2 gelten
 * muss, ohne dass jemand hinsieht.
 */
const AUSGAENGE = ['src/lib/protokoll.ts', 'supabase/functions/location-provider/index.ts'];

/** Das Deno-Gegenstück zu `lib/protokoll.ts`. */
const EDGE_AUSGANG = 'supabase/functions/location-provider/index.ts';

/**
 * Was zum Anwendungscode zählt.
 *
 * `scripts/` bleibt draußen: Das sind Werkzeuge, die auf dem Rechner der
 * Entwicklung laufen (`docs-check.mjs`, `fortschritt.mjs`) und nie
 * Patientendaten sehen. Ihre Ausgabe ist die Konsole — das ist ihr Zweck,
 * nicht ihr Risiko.
 */
const ANWENDUNGSCODE = /^(src|supabase|tests)\/.*\.tsx?$/;

function getrackteDateien(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: stamm, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

/** Kommentare zählen nicht — auch dieser Test spricht in Kommentaren über `console`. */
function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function quelltext(pfad: string): string {
  return ohneKommentare(readFileSync(join(stamm, pfad), 'utf8'));
}

/** `vi.spyOn(console, 'error')` ist kein Aufruf — ein Test darf lauschen. */
const KONSOLENAUFRUF = /\bconsole\s*\.\s*[a-zA-Z]+\s*\(/;

/**
 * Eine örtlich aufgehobene Lint-Regel — die Anweisungsform, nicht das Wort.
 *
 * ESLint liest eine Anweisung nur am **Anfang** eines Kommentars. Genau das
 * verlangt dieses Muster, und deshalb ist ein Satz über die Regel keiner:
 * `// Eine örtliche Ausnahme wäre …` bleibt Prosa.
 */
const OERTLICHE_AUSNAHME = /\/[/*]\s*eslint-disable(?:-next-line|-line)?\s[^\n]*no-console/;

describe('Ausgaenge fuer Betriebslogs', () => {
  it('gibt es nur da, wo sie erklaert sind', () => {
    const schreibende = getrackteDateien()
      .filter((pfad) => ANWENDUNGSCODE.test(pfad))
      .filter((pfad) => KONSOLENAUFRUF.test(quelltext(pfad)));

    expect(
      schreibende.sort(),
      'Betriebslogs gehen ueber lib/protokoll.ts (ADR-011 Punkt 6). Ein neuer Ausgang ist eine Entscheidung, keine Zeile.',
    ).toEqual([...AUSGAENGE].sort());
  });

  it('haelt die Lint-Regel ausnahmslos scharf', () => {
    const konfiguration = readFileSync(join(stamm, 'eslint.config.js'), 'utf8');
    expect(konfiguration).toContain("'no-console': 'error'");
    // Bis OPS-004 stand hier `allow: ['warn', 'error']`. Damit war
    // console.log gesperrt und console.error mit eingesetztem Namen erlaubt -
    // also genau der haeufige Fall offen und der seltene zu.
    expect(konfiguration, 'no-console darf keine allow-Liste tragen.').not.toMatch(
      /'no-console':\s*\[/,
    );
  });

  it('nennt in der Lint-Ausnahme dieselben Dateien wie dieser Test', () => {
    const konfiguration = readFileSync(join(stamm, 'eslint.config.js'), 'utf8');
    const block = /files:\s*\[([^\]]*)\],\s*rules:\s*\{\s*'no-console':\s*'off'\s*\}/.exec(
      konfiguration,
    );
    expect(block?.[1], 'In eslint.config.js fehlt die Ausnahme fuer die Ausgaenge.').toBeDefined();
    const genannt = [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map((treffer) => treffer[1]!);
    expect(genannt.sort()).toEqual([...AUSGAENGE].sort());
  });

  it('laesst keine Zeile die Regel oertlich aufheben', () => {
    // Eine oertliche Ausnahme in einer Fachdatei waere der stille Weg am
    // Ausgang vorbei: Lint bliebe gruen, und die Zusicherung oben findet den
    // Aufruf zwar - aber nur, solange niemand beide zugleich anfasst.
    //
    // Zwei Einschraenkungen, und beide haben einen Grund. Geprueft wird die
    // **Anweisungsform**, nicht die Zeichenfolge: `eslint-disable` gilt nur am
    // Anfang eines Kommentars, und ein Satz *ueber* die Regel ist keine
    // Ausnahme. Und geprueft wird nur Produktivcode - ein Test schreibt kein
    // Betriebslog. Beides steht hier, weil diese Datei sich beim ersten Lauf
    // nach dem Commit selbst gemeldet hat: Der Kommentar oben nannte die
    // Zeichenfolge, und `git ls-files` kannte die Datei inzwischen.
    const mitAusnahme = getrackteDateien()
      .filter(
        (pfad) =>
          ANWENDUNGSCODE.test(pfad) && !AUSGAENGE.includes(pfad) && !/\.test\.tsx?$/.test(pfad),
      )
      .filter((pfad) => OERTLICHE_AUSNAHME.test(readFileSync(join(stamm, pfad), 'utf8')));

    expect(mitAusnahme).toEqual([]);
  });
});

describe('Der Ausgang in der Edge Function', () => {
  const quelle = quelltext(EDGE_AUSGANG);

  it('schreibt nur aus protokolliere heraus', () => {
    const ab = quelle.indexOf('function protokolliere');
    expect(ab, `${EDGE_AUSGANG}: die Funktion protokolliere fehlt.`).toBeGreaterThan(-1);
    const davor = quelle.slice(0, ab);
    expect(KONSOLENAUFRUF.test(davor), 'console-Aufruf vor protokolliere.').toBe(false);
  });

  it('setzt nur Felder des Protokolleintrags ein', () => {
    // Die Deno-Laufzeit hat keine Redaction - sie hat eine Form. Was in die
    // Zeile eingesetzt wird, muss aus `Protokolleintrag` stammen, und dessen
    // Felder sind unten einzeln benannt. Ein neues Feld dort ist damit eine
    // bewusste Entscheidung und kein Nebeneffekt.
    const eingesetzt = [...quelle.matchAll(/\$\{([^}]+)\}/g)].map((treffer) => treffer[1]!.trim());
    for (const ausdruck of eingesetzt) {
      expect(
        ausdruck,
        `${EDGE_AUSGANG}: "${ausdruck}" gehoert nicht zum Protokolleintrag.`,
      ).toMatch(/^eintrag\.(anbieter|code|dauerMs)$/);
    }
  });

  it('kennt im Protokolleintrag kein Feld fuer Inhalte', () => {
    const typen = quelltext('supabase/functions/location-provider/typen.ts');
    const block = /export interface Protokolleintrag \{([\s\S]*?)\n\}/.exec(typen);
    expect(block?.[1], 'Protokolleintrag nicht gefunden.').toBeDefined();
    const felder = [...(block?.[1] ?? '').matchAll(/readonly\s+([a-zA-Z]+)\s*:/g)].map(
      (treffer) => treffer[1]!,
    );
    expect(felder.sort()).toEqual(['anbieter', 'code', 'dauerMs']);
  });
});

/**
 * Kein externer Fehler- oder Observability-Dienst (OPS-004, ADR-011 Punkt 5).
 *
 * **Die Entscheidung:** In V1 verlässt kein Fehlerbericht die eigene
 * Infrastruktur. Sie folgt aus dem Rang, nicht aus einer Annahme: Ein solcher
 * Dienst ist nach ADR-011 Punkt 5 ein Auftragsverarbeiter mit dem vollen
 * Katalog aus ADR-002 einschließlich §203 StGB, und nach CLAUDE.md kommt kein
 * neuer Anbieter ohne fachliche Notwendigkeit. Die gibt es nicht: Eine Praxis
 * mit einer Handvoll Konten meldet einen Fehler schneller selbst, als ein
 * Dashboard ihn zeigt, und die Plattformlogs samt `protokolliere` tragen die
 * Suche danach. Der Preis ist, dass ein Fehler, den niemand meldet, unbemerkt
 * bleibt — bis zum ersten echten Betrieb vertretbar.
 *
 * Dieser Test macht die Entscheidung zu einem Gate statt zu einem Vorsatz:
 * Ein SDK dieser Art, in `package.json` oder als Import im Quelltext (auch als
 * `npm:`- oder URL-Import der Edge Function), macht ihn rot. **Rücknahme:**
 * erst Anbieterprüfung nach ADR-002 und Freigabe durch Jannes, dann die
 * Übermittlung nur aus `src/lib/protokoll.ts` heraus (Punkt 6), dann hier den
 * einen Namen aus der Liste nehmen.
 */
const FEHLERDIENSTE =
  /(^|[/:@.])(sentry|bugsnag|rollbar|datadog|dd-trace|newrelic|honeybadger|logrocket|highlight-run|appsignal|raygun|trackjs|elastic-apm|airbrake|posthog|opentelemetry)([/@-]|$)/i;

describe('Externe Fehlerdienste', () => {
  it('stehen nicht unter den Abhaengigkeiten', () => {
    const paket = JSON.parse(readFileSync(join(stamm, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const namen = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((feld) =>
      Object.keys((paket[feld] as Record<string, string> | undefined) ?? {}),
    );
    expect(namen.filter((name) => FEHLERDIENSTE.test(name))).toEqual([]);
  });

  it('werden nirgends im Anwendungscode importiert', () => {
    // Quelltext auch als .js/.mjs, dazu Skriptverweise in index.html und
    // Importkarten der Edge Function - ueberall dort, wo ein SDK an
    // package.json vorbei hineinkaeme.
    const QUELLTEXT = /^(src|supabase|tests)\/.*\.(tsx?|jsx?|mjs)$/;
    const VERWEISE = /^(index\.html|supabase\/functions\/.*\.json)$/;
    const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
    const ZEICHENKETTE = /["']([^"'\s]+)["']/g;
    const treffer = getrackteDateien()
      .filter((pfad) => QUELLTEXT.test(pfad) || VERWEISE.test(pfad))
      .flatMap((pfad) => {
        const inhalt = readFileSync(join(stamm, pfad), 'utf8');
        const muster = VERWEISE.test(pfad) ? ZEICHENKETTE : IMPORT;
        return [...(VERWEISE.test(pfad) ? inhalt : ohneKommentare(inhalt)).matchAll(muster)]
          .map((import_) => import_[1]!)
          .filter((ziel) => FEHLERDIENSTE.test(ziel))
          .map((ziel) => `${pfad}: ${ziel}`);
      });
    expect(treffer).toEqual([]);
  });

  it('erkennt die Liste auch wirklich', () => {
    // Gegenprobe gegen eine Liste, die still nichts mehr findet.
    for (const name of ['@sentry/react', 'npm:@sentry/deno', 'dd-trace', 'posthog-js']) {
      expect(FEHLERDIENSTE.test(name), name).toBe(true);
    }
    for (const name of ['@supabase/supabase-js', 'react-router', 'zod', '@/lib/protokoll']) {
      expect(FEHLERDIENSTE.test(name), name).toBe(false);
    }
  });
});
