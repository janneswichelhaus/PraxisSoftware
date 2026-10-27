import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERSONENFARBEN } from './components/ui/personenfarben';
import { GRENZEN } from './designsystem.grenzen';

/**
 * Zusicherungen des Design Systems, die kein einzelner Baustein halten kann
 * (DS-001).
 *
 * Der Handoff aus Claude Design nennt drei Festlegungen „nicht verhandelbar",
 * die sich nur über die ganze Codebasis prüfen lassen: Hanken Grotesk und
 * sonst nichts, keine Schatten, und die Schrift selbst ausgeliefert statt über
 * einen fremden Dienst. Ohne einen Test hier bliebe jede davon eine Notiz in
 * einem Kommentar, die beim nächsten Baustein still verloren geht.
 */

const stamm = process.cwd();
const css = readFileSync(join(stamm, 'src/index.css'), 'utf8');

/** Alle Quelldateien unter src/, in denen Klassen stehen können. */
function quelldateien(verzeichnis: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...quelldateien(pfad));
    // Tests sind ausgenommen: sie beschreiben die Regel und müssten das Wort
    // sonst umschreiben, um sich nicht selbst zu melden.
    else if (/\.(tsx|ts|css)$/.test(eintrag) && !/\.test\.(tsx|ts)$/.test(eintrag)) {
      treffer.push(pfad);
    }
  }
  return treffer;
}

/**
 * Jede Zeile einer Quelldatei, auf der `pruefen` etwas findet, als
 * „datei:zeile: fund". Die Zeilennummer macht eine Meldung ohne Suche
 * behebbar.
 */
function funde(pruefen: (zeile: string, datei: string) => string[]): string[] {
  const treffer: string[] = [];
  for (const datei of quelldateien(join(stamm, 'src'))) {
    // Der Pfad mit `/`, wie er in Ausnahmelisten steht - auch unter Windows.
    const pfad = relative(stamm, datei).split(sep).join('/');
    const zeilen = readFileSync(datei, 'utf8').split('\n');
    zeilen.forEach((zeile, index) => {
      for (const fund of pruefen(zeile, pfad)) {
        treffer.push(`${relative(stamm, datei)}:${index + 1}: ${fund}`);
      }
    });
  }
  return treffer;
}

/**
 * Schatten-Utilities (DS-001: keine Schatten).
 *
 * `ring-*` und `inset-ring-*` setzt Tailwind als `box-shadow`, `drop-shadow`
 * als Filter-Schatten; `inset-shadow-*` und `text-shadow-*` sind Schatten dem
 * Namen nach. Bis UXR-001 suchte der Waechter nur `shadow` und liess alle
 * diese durch (TOK-01, KAL-18).
 *
 * Die Utility steht hinter einem Leerzeichen, einem Anfuehrungszeichen oder
 * einem Varianten-Doppelpunkt (`hover:shadow-md`). Der Rueckblick schliesst
 * `box-shadow` und `boxShadow` aus - die Druckregel in index.css darf die
 * Eigenschaft ja gerade auf `none` setzen. `ring` muss ausserdem wie eine
 * Klasse enden (Ende, Leerraum, Anfuehrungszeichen oder `-` mit Wert):
 * Das Wort steckt sonst in Prosa wie „kein `ring-*`" in Karte.tsx, die die
 * Regel gerade erklaert.
 */
const SCHATTEN =
  /(?<=[\s"'`:])(?:(?:inset-|drop-|text-)?shadow(?!\w)|(?:inset-)?ring(?=$|[\s"'`]|-[a-z0-9[]))/g;

function schattenFunde(zeile: string): string[] {
  return Array.from(zeile.matchAll(SCHATTEN), (fund) => fund[0]);
}

/**
 * Die eine Ausnahme (ANN-678, Jannes 2026-10-22): Die Plattform hebt Karten,
 * die man antippt, mit `shadow-plattform` ab - nur in diesen drei Bausteinen.
 * Überall sonst meldet der Wächter auch diese Klasse, und in den dreien jeden
 * anderen Schatten.
 */
const PLATTFORM_SCHATTEN = /(?<=[\s"'`:])shadow-plattform(?![\w-])/g;
const MIT_PLATTFORM_SCHATTEN: ReadonlySet<string> = new Set([
  'src/components/ui/Aufgabenkarte.tsx',
  'src/components/ui/HeroKarte.tsx',
  'src/features/portal/platform/Besuchskarte.tsx',
]);

function schattenFundeIn(zeile: string, datei: string): string[] {
  return schattenFunde(
    MIT_PLATTFORM_SCHATTEN.has(datei) ? zeile.replace(PLATTFORM_SCHATTEN, '') : zeile,
  );
}

/**
 * Radien ausserhalb des Systems (DS-001, TOK-01).
 *
 * Geprueft wird die ganze Klasse: `rounded`, beliebig viele Segmente, dazu
 * hoechstens ein beliebiger Wert in eckigen Klammern. Bis UXR-001 endete das
 * Muster mit `\b` - nach „]" greift das nur vor einem Wortzeichen, und
 * `rounded-[3px] border` rutschte durch; ein nacktes `rounded` (4 px) fand es
 * gar nicht, weil es einen Bindestrich verlangte.
 *
 * Erlaubt sind die fuenf Radien des Systems, auch mit Seitenangabe
 * (`rounded-t-card`), und `rounded-[6px]` fuer die Checkbox, die das System
 * eigens neben den Hauptradien nennt. Alles andere ist ein Verstoss -
 * ausdruecklich auch das nackte `rounded` und eine Seite ohne Radius
 * (`rounded-t`), denn beide setzen Tailwinds eigene 4 px.
 *
 * Das Muster nimmt nur den Rest der Klasse auf und zerlegt ihn im Code: ein
 * verschachtelter Quantor im Muster selbst waere fuer
 * `security/detect-unsafe-regex` ein Befund.
 */
const RADIUS = /(?<![\w-])rounded([\w[\]-]*)/g;
const RADIEN = new Set(['button', 'field', 'card', 'image', 'pill']);
const SEITEN = new Set([
  't',
  'r',
  'b',
  'l',
  's',
  'e',
  'tl',
  'tr',
  'br',
  'bl',
  'ss',
  'se',
  'es',
  'ee',
]);

function radiusFunde(zeile: string): string[] {
  const treffer: string[] = [];
  for (const fund of zeile.matchAll(RADIUS)) {
    const rest = fund[1] ?? '';
    // `roundedCorners` und Aehnliches ist keine Klasse.
    if (rest !== '' && !rest.startsWith('-')) continue;
    const klammer = rest.indexOf('[');
    const beliebig = klammer < 0 ? undefined : rest.slice(klammer);
    const segmente = (klammer < 0 ? rest : rest.slice(0, klammer)).split('-').filter(Boolean);
    const seite = beliebig ? segmente : segmente.slice(0, -1);
    const stufe = beliebig ?? segmente.at(-1);
    const erlaubt =
      stufe !== undefined &&
      seite.every((teil) => SEITEN.has(teil)) &&
      (beliebig ? stufe === '[6px]' : RADIEN.has(stufe));
    if (!erlaubt) treffer.push(fund[0]);
  }
  return treffer;
}

describe('Schrift', () => {
  it('liefert Hanken Grotesk aus dem eigenen Verzeichnis aus', () => {
    // Kein Google-CDN: ein Schriftdienst waere ein weiterer Empfaenger von
    // IP-Adressen und damit ein neuer Dienstleister nach PROJECT_PRINCIPLES 3.5.
    expect(css).toMatch(/@font-face/);
    expect(css).toMatch(/url\('\/schrift\/HankenGrotesk-Variable\.ttf'\)/);
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|@import url\(/);

    expect(statSync(join(stamm, 'public/schrift/HankenGrotesk-Variable.ttf')).size).toBeGreaterThan(
      10_000,
    );
  });

  it('liefert sie zuerst als WOFF2 und laedt sie vor (R3-034)', () => {
    // 144 kB TTF auf dem kritischen Pfad jedes ersten Aufrufs. WOFF2 bringt
    // die Kompression in der Datei mit und wirkt damit auch dort, wo der
    // Hoster font/ttf nicht komprimiert. Die TTF bleibt als Rueckfall.
    expect(css).toMatch(/url\('\/schrift\/HankenGrotesk-Variable\.woff2'\) format\('woff2'\)/);

    const reihenfolge = /src:\s*([^;]+);/.exec(css)?.[1] ?? '';
    expect(reihenfolge.indexOf('woff2')).toBeGreaterThanOrEqual(0);
    expect(reihenfolge.indexOf('woff2')).toBeLessThan(reihenfolge.indexOf('truetype'));

    const woff2 = statSync(join(stamm, 'public/schrift/HankenGrotesk-Variable.woff2')).size;
    const ttf = statSync(join(stamm, 'public/schrift/HankenGrotesk-Variable.ttf')).size;
    expect(woff2).toBeGreaterThan(10_000);
    expect(woff2).toBeLessThan(ttf);

    // Ohne Preload fragt der Browser die Schrift erst an, wenn er das CSS
    // gelesen hat - eine Stufe spaeter als noetig.
    const html = readFileSync(join(stamm, 'index.html'), 'utf8');
    expect(html).toMatch(
      /<link[^>]+rel="preload"[^>]+href="\/schrift\/HankenGrotesk-Variable\.woff2"/,
    );
    expect(html).toMatch(/<link[^>]+as="font"[^>]+crossorigin/);
  });

  it('fuehrt Hanken Grotesk als erste Schrift der Anwendung', () => {
    const zeile = /--font-sans:\s*([^;]+);/.exec(css)?.[1] ?? '';
    expect(zeile.trim().startsWith("'Hanken Grotesk'")).toBe(true);
  });

  it('legt die Lizenz neben die Schrift', () => {
    // Die OFL verlangt, dass die Lizenz mitgeliefert wird.
    const lizenz = readFileSync(join(stamm, 'public/schrift/OFL.txt'), 'utf8');
    expect(lizenz).toMatch(/SIL Open Font License/);
  });
});

describe('Keine Schatten', () => {
  /**
   * „Ueberall box-shadow: none, auch im Druck. Ebenen entstehen aus Flaeche
   * (Papier auf Flaeche) oder Linie (Karte mit --line auf Papier)."
   *
   * Geprueft werden die Tailwind-Utilities und rohes CSS gleichermassen. Der
   * Fokusring ist ausgenommen: er ist `outline`, kein Schatten. Aus demselben
   * Grund markiert eine Auswahl oder ein Hinweis mit `outline` bzw. `border`,
   * nicht mit `ring` (UXR-001).
   */
  it('verwendet nirgends eine Schatten-Utility, auch nicht ring oder drop-shadow', () => {
    expect(funde(schattenFundeIn)).toEqual([]);
  });

  it('lässt `shadow-plattform` nur in den drei Karten der Plattform zu (ANN-678, Gegenprobe)', () => {
    const zeile = 'className="rounded-card border shadow-plattform"';
    expect(schattenFundeIn(zeile, 'src/components/ui/HeroKarte.tsx')).toEqual([]);
    expect(schattenFundeIn(zeile, 'src/features/portal/platform/Besuchskarte.tsx')).toEqual([]);
    expect(schattenFundeIn(zeile, 'src/components/ui/Card.tsx')).toEqual(['shadow']);
    expect(schattenFundeIn(zeile, 'src/features/portal/platform/Uebersicht.tsx')).toEqual([
      'shadow',
    ]);
    expect(schattenFundeIn('className="shadow-md"', 'src/components/ui/HeroKarte.tsx')).toEqual([
      'shadow',
    ]);
    expect(css).toMatch(/--shadow-plattform:/);
    // Keine Ausnahme ohne Grund: Jede der drei Karten trägt die Stufe auch.
    // `match` beginnt auch mit dem globalen Muster vorn.
    for (const datei of MIT_PLATTFORM_SCHATTEN) {
      const inhalt = readFileSync(join(stamm, datei), 'utf8');
      expect(inhalt.match(PLATTFORM_SCHATTEN), datei).not.toBeNull();
    }
  });

  /**
   * Gegenprobe: Ohne sie waere ein Muster, das nie etwas findet, von einem
   * sauberen Stand nicht zu unterscheiden.
   */
  it('erkennt jede Schatten-Utility und laesst Prosa und outline durch (Gegenprobe)', () => {
    for (const klasse of [
      'shadow',
      'shadow-md',
      'hover:shadow-lg',
      'shadow-[0_1px_2px_black]',
      'ring',
      'ring-2',
      'focus:ring-2',
      'target:ring-2',
      'ring-accent',
      'ring-inset',
      'ring-offset-2',
      'inset-ring',
      'inset-ring-2',
      'drop-shadow',
      'drop-shadow-md',
      'inset-shadow-sm',
      'text-shadow-xs',
    ]) {
      expect(schattenFunde(`className="border p-4 ${klasse}"`), klasse).toHaveLength(1);
      expect(schattenFunde(`klassen = '${klasse}'`), klasse).toHaveLength(1);
    }

    for (const text of [
      '    box-shadow: none !important;',
      "style={{ boxShadow: 'none' }}",
      'className="outline-accent outline-2 border-2"',
      '// kein Schatten und kein `ring-*` (das Tailwind als `box-shadow`',
      'Der Fokusring ist ein outline.',
      'const string = during + bringen;',
      'Ein Ring aus Salbei',
      'className="shadowRoot"',
    ]) {
      expect(schattenFunde(text), text).toEqual([]);
    }
  });

  it('setzt auch im Druck keinen Schatten', () => {
    expect(css).toMatch(/box-shadow:\s*none/);
  });
});

describe('Radien des Systems', () => {
  it('fuehrt die vier Radien als Token', () => {
    for (const [token, wert] of [
      ['--radius-button', '10px'],
      ['--radius-field', '10px'],
      ['--radius-card', '14px'],
      ['--radius-image', '16px'],
    ] as const) {
      expect(css).toContain(`${token}: ${wert}`);
    }
  });

  /**
   * Das System kennt genau fuenf Radien; Tailwinds eigene Stufen (`rounded-lg`
   * = 8, `rounded-md` = 6, `rounded-full`) gehoeren nicht dazu. Ohne diesen
   * Waechter waere jede neue Seite wieder eine Gelegenheit, aus Gewohnheit
   * `rounded-lg` zu schreiben - und die Radien liefen still auseinander.
   *
   * Die Ausnahme ist `rounded-[6px]` fuer die Checkbox: das System nennt
   * sie eigens neben den vier Hauptradien. Ein nacktes `rounded` ist ein
   * Verstoss - es setzt Tailwinds 4 px (TOK-01).
   */
  it('verwendet nur die Radien des Systems', () => {
    expect(funde(radiusFunde)).toEqual([]);
  });

  it('erkennt jeden fremden Radius und laesst die des Systems durch (Gegenprobe)', () => {
    for (const klasse of [
      'rounded',
      'rounded-lg',
      'rounded-md',
      'rounded-full',
      'rounded-none',
      'rounded-2xl',
      'rounded-t',
      'rounded-t-lg',
      'rounded-[3px]',
      'rounded-[14px]',
      'hover:rounded-lg',
      'rounded-card-lg',
    ]) {
      expect(radiusFunde(`className="${klasse} border px-2"`), klasse).toHaveLength(1);
    }
    // Genau der Fall, an dem das alte Muster mit `\b` vorbeisah.
    expect(radiusFunde('className="rounded-[3px] border"')).toEqual(['rounded-[3px]']);
    expect(radiusFunde('`rounded px-1 py-1 ${ton}`')).toEqual(['rounded']);

    for (const text of [
      'className="rounded-card border p-6"',
      'className="rounded-button rounded-field rounded-image rounded-pill"',
      'className="rounded-t-card rounded-b-card"',
      'className="focus:rounded-button focus:border"',
      'className="size-5 shrink-0 rounded-[6px] border"',
      '  --radius-card: 14px;',
      '    border-radius: 4px;',
      'const roundedCorners = true;',
    ]) {
      expect(radiusFunde(text), text).toEqual([]);
    }
  });
});

describe('Schriftrollen', () => {
  /**
   * 15 px ist die Groesse fuer den Inhalt von Listen, Karten, Detail- und
   * Trefferzeilen. Bis UXR-001 stand sie 158-mal als arbitraerer Wert ohne
   * Namen (TOK-06); jetzt traegt sie das Token `text-liste`. Der Waechter
   * haelt den namenlosen Wert fern - in beiden Schreibweisen, denn gemeint
   * ist die Groesse, nicht die Zeichenkette.
   */
  const LISTENGROESSE = /text-\[(?:0\.9375rem|15px)\]/g;

  it('fuehrt die Listengroesse als Token, ohne eigene Zeilenhoehe', () => {
    expect(css).toMatch(/--text-liste:\s*0\.9375rem;/);
    // Ohne Unter-Token erzeugt Tailwind fuer `text-liste` nur `font-size`,
    // genau wie vorher der arbitraere Wert - die Zeilenhoehe erbt weiter.
    expect(css).not.toMatch(/--text-liste--line-height\s*:/);
  });

  it('setzt 15 px nur ueber text-liste', () => {
    expect(funde((zeile) => Array.from(zeile.matchAll(LISTENGROESSE), (f) => f[0]))).toEqual([]);
  });

  it('erkennt den namenlosen Wert (Gegenprobe)', () => {
    const finden = (text: string) => Array.from(text.matchAll(LISTENGROESSE), (f) => f[0]);
    expect(finden('className="text-ink text-[0.9375rem] font-medium"')).toHaveLength(1);
    expect(finden('className="sm:text-[15px]"')).toHaveLength(1);
    expect(finden('className="text-ink text-liste font-medium"')).toEqual([]);
    expect(finden('className="text-[0.6875rem]"')).toEqual([]);
  });
});

describe('Tokens aus dem Design-Handoff vom 2026-10-01', () => {
  /**
   * Der Handoff erlaubt genau diese neuen Maße (Spezifikation Abschnitt 2,
   * `docs/design/handoff-2026-10-01-praxissoftware.md`). Sie stehen
   * als Token, damit Seitenkopf, Kachel und Zweispalter denselben Wert lesen
   * statt ihn jeweils in eckigen Klammern zu wiederholen.
   */
  it('fuehrt den Seitentitel am Telefon mit 26 px und der Zeilenhoehe von H2', () => {
    expect(css).toMatch(/--text-h2-mobil:\s*26px;/);
    expect(css).toMatch(/--text-h2-mobil--line-height:\s*1\.05;/);
    expect(css).toMatch(/--text-h2:\s*32px;/);
  });

  it('fuehrt die Zweispalten-Schwelle als Container-Breite, nicht als Fenster-Breakpoint', () => {
    // 900 px Inhaltsbreite: Die Seitenleiste ist 72 oder 248 px breit, das
    // Fenster sagt deshalb nichts ueber den Platz des Inhalts.
    expect(css).toMatch(/--container-zweispaltig:\s*900px;/);
    expect(css).not.toMatch(/--breakpoint-zweispaltig\s*:/);
  });

  it('fuehrt den Innenabstand der Kachel: 12 oben und unten, 14 an den Seiten', () => {
    expect(css).toMatch(/--spacing-kachel-y:\s*12px;/);
    expect(css).toMatch(/--spacing-kachel-x:\s*14px;/);
  });

  /**
   * Das hellere Orange des Wegbalkens ist nur Fläche (Abschnitt 3: „kein Text
   * in dieser Farbe"). Als Text läge es unter 4,5:1
   * (`src/lib/kontrast.test.ts`); der Wächter hält es deshalb aus jeder
   * anderen Utility als `bg-` heraus.
   */
  it('fuehrt warnung-mittel als Token und verwendet es nur als Flaeche', () => {
    expect(css).toMatch(/--color-warnung-mittel:\s*oklch\(60% 0\.12 68\);/);
    const FREMD = /(?<![\w-])(?!bg-)[a-z][a-z-]*-warnung-mittel\b/g;
    const finden = (zeile: string) => Array.from(zeile.matchAll(FREMD), (f) => f[0]);
    expect(funde(finden)).toEqual([]);
    // Gegenprobe: Das Muster findet Text und Rahmen und lässt die Fläche,
    // das Token selbst und Prosa durch.
    expect(finden('className="text-warnung-mittel"')).toEqual(['text-warnung-mittel']);
    expect(finden("fahrt: 'border-warnung-mittel'")).toEqual(['border-warnung-mittel']);
    expect(finden('className="hover:text-warnung-mittel"')).toEqual(['text-warnung-mittel']);
    expect(finden("fahrt: 'bg-warnung-mittel'")).toEqual([]);
    expect(finden('  --color-warnung-mittel: oklch(60% 0.12 68);')).toEqual([]);
    expect(finden('`warnung-mittel` ist nur Fläche')).toEqual([]);
  });
});

describe('Farben des Übungsbilds (ANN-381)', () => {
  /**
   * Ferne Körperseite, Bewegungspfeil und Band sind Linien im Übungsbild,
   * keine Textfarben: Als Text lägen sie unter 4,5:1. Der Wächter hält sie
   * aus jeder Utility außer `stroke-` und `fill-` heraus.
   */
  it('verwendet figur-* nur als Linie und Fläche im Bild', () => {
    expect(css).toMatch(/--color-figur-fern:\s*oklch\(/);
    expect(css).toMatch(/--color-figur-bewegung:\s*oklch\(/);
    expect(css).toMatch(/--color-figur-band:\s*oklch\(/);
    const FREMD = /(?<![\w-])(?!stroke-|fill-)[a-z][a-z-]*-figur-(?:fern|bewegung|band)\b/g;
    const finden = (zeile: string) => Array.from(zeile.matchAll(FREMD), (f) => f[0]);
    expect(funde(finden)).toEqual([]);
    // Gegenprobe
    expect(finden('className="text-figur-fern"')).toEqual(['text-figur-fern']);
    expect(finden("linie: 'bg-figur-band'")).toEqual(['bg-figur-band']);
    expect(finden("linie: 'stroke-figur-bewegung'")).toEqual([]);
    expect(finden('  --color-figur-fern: oklch(62% 0.06 158);')).toEqual([]);
  });
});

describe('Farben der Personen im Teamchat (TEAM-006, ANN-666)', () => {
  /**
   * Die Farbe einer Person ist Fläche hinter den Initialen oder Umriss um das
   * Profilbild - nie Text, nie Rahmen einer Karte. Der Wächter hält sie aus
   * jeder Utility außer `bg-` und `outline-` heraus; gesetzt werden sie nur im
   * Baustein `Personenbild`.
   */
  it('verwendet person-* nur als Fläche und Umriss, nur im Baustein', () => {
    for (const farbe of PERSONENFARBEN) {
      expect(css).toContain(`--color-person-${farbe}: oklch(`);
    }
    const FREMD = /(?<![\w-])(?!bg-|outline-)[a-z][a-z-]*-person-[a-z]+\b/g;
    const finden = (zeile: string) => Array.from(zeile.matchAll(FREMD), (f) => f[0]);
    expect(funde(finden)).toEqual([]);
    const ORT = /(?<![\w-])(?:bg|outline)-person-[a-z]+\b/;
    const orte = quelldateien(join(stamm, 'src'))
      .filter((datei) => ORT.test(readFileSync(datei, 'utf8')))
      .map((datei) => relative(join(stamm, 'src'), datei));
    expect(orte).toEqual([join('components', 'ui', 'Personenbild.tsx')]);
    // Gegenprobe
    expect(finden('className="text-person-ozean"')).toEqual(['text-person-ozean']);
    expect(finden("rand: 'border-person-moos'")).toEqual(['border-person-moos']);
    expect(finden("tanne: 'bg-person-tanne'")).toEqual([]);
    expect(finden("tanne: 'outline-person-tanne'")).toEqual([]);
    expect(finden("tanne: 'ring-person-tanne'")).toEqual(['ring-person-tanne']);
    expect(finden('  --color-person-tanne: oklch(50% 0.11 155);')).toEqual([]);
  });
});

describe('Tokens aus dem Handoff Schrift und Knöpfe vom 2026-10-06 (SKN-001)', () => {
  it('fuehrt Kleingedrucktes (14 px) und Absenderzeile (11 px) als Token ohne eigene Zeilenhoehe', () => {
    expect(css).toMatch(/--text-kleingedruckt:\s*0\.875rem;/);
    expect(css).toMatch(/--text-absenderzeile:\s*0\.6875rem;/);
    expect(css).not.toMatch(/--text-kleingedruckt--line-height\s*:/);
    expect(css).not.toMatch(/--text-absenderzeile--line-height\s*:/);
  });
});

describe('Kein Lesetext unter 12 px (BEF-068 Option 2, SKN-007)', () => {
  /**
   * Seit Runde 2 gilt im Design-System: keine Schrift unter 12 px. Die einzige
   * Ausnahme, die Absenderzeile im Briefkopf auf Papier, hat ihr Token
   * `text-absenderzeile`. Der Waechter haelt freie Werte in eckigen Klammern
   * fern - in rem und in px.
   */
  const FREIE_GROESSE = /text-\[(\d*\.?\d+)(rem|px)\]/g;
  const zuKlein = (zeile: string) =>
    Array.from(zeile.matchAll(FREIE_GROESSE), (f) => f)
      .filter((f) => (f[2] === 'rem' ? Number(f[1]) * 16 : Number(f[1])) < 12)
      .map((f) => f[0]);

  it('setzt keine freie Schriftgroesse unter 12 px', () => {
    expect(funde(zuKlein)).toEqual([]);
  });

  it('erkennt zu kleine freie Werte (Gegenprobe)', () => {
    expect(zuKlein('className="text-[0.6875rem] font-medium"')).toEqual(['text-[0.6875rem]']);
    expect(zuKlein('className="text-[10px] leading-none"')).toEqual(['text-[10px]']);
    expect(zuKlein('className="text-[0.75rem] text-[15px]"')).toEqual([]);
    expect(zuKlein('className="text-absenderzeile text-xs"')).toEqual([]);
  });
});

describe('Tokens aus dem Handoff Rahmen vom 2026-10-05 (RAH-001)', () => {
  /**
   * Spezifikation Abschnitt 2, `docs/design/handoff-2026-10-05-rahmen.md`:
   * drei Masse, dazu die Farben der installierten App. Die 11 px der
   * Tableiste sind seit BEF-068 ein benannter Wert, kein freier mehr.
   */
  it('fuehrt die Beschriftung der Leisten mit 12 px als Token, ohne eigene Zeilenhoehe (Runde 2, L-B)', () => {
    expect(css).toMatch(/--text-leiste:\s*0\.75rem;/);
    expect(css).not.toMatch(/--text-leiste--line-height\s*:/);
    // Die Tableiste liest das Token statt des freien Werts.
    const geruest = readFileSync(join(stamm, 'src/app/AppShell.tsx'), 'utf8');
    expect(geruest).toContain('text-leiste');
    expect(geruest).not.toContain('text-[0.6875rem]');
  });

  it('fuehrt Auswahlstrich und Symbolspalte als Masse', () => {
    expect(css).toMatch(/--spacing-auswahlstrich:\s*3px;/);
    expect(css).toMatch(/--spacing-symbolspalte:\s*84px;/);
  });

  it('gibt der installierten App die Farben der Anwendung (BEF-048, Option 1)', () => {
    // Leiste weiss wie die Kopfzeile, Startbild auf der Flaeche: so gibt es
    // keinen Sprung vom Systemstart in die Anwendung.
    const manifest = JSON.parse(
      readFileSync(join(stamm, 'public/manifest.webmanifest'), 'utf8'),
    ) as { theme_color: string; background_color: string };
    expect(manifest.theme_color).toBe('#ffffff');
    expect(manifest.background_color).toBe('#ffffff');
    // #ffffff ist seit Grundton B die Flaeche - derselbe Wert, den
    // `--color-canvas` als Oklch traegt (Kommentar in index.css).
    expect(css).toMatch(/Fläche #ffffff — Grund der Seite/);
    const html = readFileSync(join(stamm, 'index.html'), 'utf8');
    expect(html).toContain('<meta name="theme-color" content="#ffffff" />');
  });
});

describe('Sprache der Plattform (Handoff 2026-10-22, PLATTFORM.md)', () => {
  /**
   * Die Schriftskala der Plattform steht in rem: Unter „Groß“ und „Sehr groß“
   * wachsen Titel mit dem Text. Die Rollen der Praxis bleiben in px.
   */
  it('führt Gruß, Seitentitel, Hero und Abschnitt in rem, mit Gewicht und Laufweite', () => {
    const stufen = new Map(
      Array.from(css.matchAll(/(--text-[\w-]+):\s*([^;]+);/g), (f) => [f[1], f[2]] as const),
    );
    for (const [rolle, groesse, gewicht] of [
      ['gruss', '2.125rem', '800'],
      ['gruss-rechner', '2.5rem', '800'],
      ['plattform-titel', '1.75rem', '800'],
      ['plattform-titel-rechner', '2rem', '800'],
      ['hero', '1.625rem', '800'],
      ['hero-rechner', '2rem', '800'],
      ['hero-schmal', '1.375rem', '800'],
      ['abschnitt', '1.375rem', '700'],
      // Die Hauptzahl der Bühne (Handoff 2026-10-24, Abschnitt 2).
      ['hauptzahl', '3rem', '800'],
      ['hauptzahl-rechner', '3.5rem', '800'],
      ['hauptzahl-schmal', '2.25rem', '800'],
    ] as const) {
      expect(stufen.get(`--text-${rolle}`), rolle).toBe(groesse);
      expect(stufen.get(`--text-${rolle}--font-weight`), rolle).toBe(gewicht);
      expect(stufen.get(`--text-${rolle}--letter-spacing`), rolle).toMatch(/^-0\.0[123]em$/);
    }
    // Initialen im Personenbild der Karten und die Breite des Hero-Titels.
    expect(stufen.get('--text-initialen')).toBe('1.25rem');
    expect(css).toMatch(/--container-hero-titel:\s*11em;/);
  });

  /**
   * Keine Versalien auf der Plattform (DR-154): Etiketten in Großbuchstaben
   * sind eine Form der Praxis-App - Abschnitte, Kicker, Spaltenköpfe. Wer
   * bis 78 am eigenen Telefon liest, liest Satzschreibung leichter. Jeder
   * geteilte Baustein, der `uppercase` setzt, hebt es unter
   * `.plattform-schrift` wieder auf; Plattformcode setzt es gar nicht.
   */
  const VERSALIEN = /(?<![\w-])uppercase(?![\w-])/;
  it('hebt jede Versalie eines Bausteins unter .plattform-schrift auf', () => {
    expect(
      funde((zeile, datei) =>
        datei.startsWith('src/components/ui/') &&
        VERSALIEN.test(zeile) &&
        !zeile.includes('[.plattform-schrift_&]:normal-case')
          ? ['uppercase ohne [.plattform-schrift_&]:normal-case']
          : [],
      ),
    ).toEqual([]);
  });

  it('setzt in Plattformcode keine Versalien', () => {
    expect(
      funde((zeile, datei) =>
        datei.startsWith('src/features/portal/platform/') && VERSALIEN.test(zeile)
          ? ['uppercase']
          : [],
      ),
    ).toEqual([]);
  });

  /**
   * Die Plattform zeigt auch, was sie aus anderen Bereichen einbindet:
   * Fragebogen, Anmeldung, Planblatt, Ernährung (`platform/trennung.test.ts`).
   * Gefunden über die Importe des Plattformcodes, damit ein neuer Import
   * nicht unbemerkt an der Regel vorbeigeht (Design-Review 1a).
   */
  function vonDerPlattformEingebunden(): string[] {
    const eingebunden = new Set<string>();
    for (const datei of quelldateien(join(stamm, 'src/features/portal/platform'))) {
      const text = readFileSync(datei, 'utf8');
      for (const [, ziel] of text.matchAll(/from\s+'@\/((?:app|components|features)\/[^']+)'/g)) {
        if (!ziel || /^(features\/portal\/platform|components\/ui)\//.test(ziel)) continue;
        const pfad = ['.tsx', '.ts']
          .map((endung) => `src/${ziel}${endung}`)
          .find((kandidat) => existsSync(join(stamm, kandidat)));
        if (pfad) eingebunden.add(pfad);
      }
    }
    return [...eingebunden];
  }

  it('hebt Versalien auch in dem auf, was die Plattform aus anderen Bereichen zeigt', () => {
    const eingebunden = vonDerPlattformEingebunden();
    expect(eingebunden).toContain('src/features/clinical/assessments/FragebogenFelder.tsx');
    expect(eingebunden).toContain('src/features/exercise/exercise-plans/Planblatt.tsx');
    expect(
      funde((zeile, datei) =>
        eingebunden.includes(datei) &&
        VERSALIEN.test(zeile) &&
        !zeile.includes('[.plattform-schrift_&]:normal-case')
          ? ['uppercase ohne [.plattform-schrift_&]:normal-case']
          : [],
      ),
    ).toEqual([]);
  });

  it('erkennt die Versalie, aber nicht das Wort in einer Kennung (Gegenprobe)', () => {
    expect(VERSALIEN.test('className="text-xs font-semibold uppercase"')).toBe(true);
    expect(VERSALIEN.test('className="normal-case"')).toBe(false);
    expect(VERSALIEN.test('const istUppercase = true;')).toBe(false);
  });

  /**
   * Keine Schrift unter 18 px (Handoff 2026-10-22, Abschnitt 8):
   * `.plattform-schrift` hebt jede kleinere Stufe auf 18 px - die von
   * Tailwind und die eigenen. Nur die Absenderzeile bleibt klein; sie steht
   * im Briefkopf auf Papier. Freie Größen darunter setzt Plattformcode nicht.
   */
  const px = (wert: string) => parseFloat(wert) * (wert.endsWith('rem') ? 16 : 1);
  const groessen = (text: string) =>
    new Map(
      Array.from(
        text.matchAll(/(--text-[a-z0-9-]+):\s*([\d.]+(?:rem|px));/g),
        (f) => [f[1] ?? '', f[2] ?? ''] as const,
      ),
    );
  it('hebt unter .plattform-schrift jede Textstufe unter 18 px auf 18 px', () => {
    const theme = groessen(/@theme \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '');
    const plattform = groessen(/\n\.plattform-schrift \{([^}]*)\}/.exec(css)?.[1] ?? '');
    const klein = [
      // Die Stufen von Tailwind, die `@theme` nicht selbst führt.
      '--text-xs',
      '--text-sm',
      '--text-base',
      ...Array.from(theme)
        .filter(([stufe, wert]) => px(wert) < 18 && stufe !== '--text-absenderzeile')
        .map(([stufe]) => stufe),
    ];
    expect(klein).toContain('--text-liste');
    for (const stufe of klein) {
      expect(px(plattform.get(stufe) ?? '0px'), stufe).toBeGreaterThanOrEqual(18);
    }
  });

  const KLEINE_SCHRIFT = /text-\[(\d*\.?\d+)(rem|px)\]|(?<![\w-])text-absenderzeile(?![\w-])/g;
  const unter18 = (zeile: string) =>
    Array.from(zeile.matchAll(KLEINE_SCHRIFT), (f) => f)
      .filter((f) => f[1] === undefined || px(`${f[1]}${f[2] ?? ''}`) < 18)
      .map((f) => f[0]);

  it('setzt in Plattformcode keine Schrift unter 18 px', () => {
    expect(
      funde((zeile, datei) =>
        datei.startsWith('src/features/portal/platform/') ? unter18(zeile) : [],
      ),
    ).toEqual([]);
  });

  /**
   * Silbentrennung in Titeln nur unter 23rem (ANN-707, Handoff 2026-10-24,
   * Frage 4): `trennen-schmal` gilt allein in der Regel für sehr schmale
   * Fenster. Stünde sie auch außerhalb, trennte ein Planname bei 375 px - die
   * Ausnahme zu DR-114 wäre keine mehr.
   */
  it('trennt mit `trennen-schmal` nur unter 23rem', () => {
    const regeln = Array.from(css.matchAll(/([^{};]*\.trennen-schmal[^{]*)\{([^}]*)\}/g));
    expect(regeln).toHaveLength(1);
    expect(regeln[0]?.[2]).toMatch(/hyphens:\s*auto;\s*hyphenate-limit-chars:\s*12 5 5;/);
    const vorher = css.slice(0, regeln[0]?.index ?? 0);
    const block = vorher.lastIndexOf('@media (max-width: 23rem) {');
    expect(block).toBeGreaterThan(-1);
    // Zwischen dem Anfang des Blocks und der Regel schließt er sich nicht.
    const zwischen = vorher.slice(block);
    expect(zwischen.split('{').length - zwischen.split('}').length).toBe(1);
  });

  it('erkennt freie Größen unter 18 px und die Absenderzeile (Gegenprobe)', () => {
    expect(unter18('className="text-[0.875rem] font-medium"')).toEqual(['text-[0.875rem]']);
    expect(unter18('className="text-[17px]"')).toEqual(['text-[17px]']);
    expect(unter18('className="text-absenderzeile"')).toEqual(['text-absenderzeile']);
    expect(unter18('className="text-[1.25rem] text-[18px] text-sm"')).toEqual([]);
  });
});

describe('Textstufen', () => {
  /**
   * Das System kennt zwei Textstufen, `ink` und `ink-muted` (DS-001). Die
   * dritte, `ink-subtle`, trug denselben Wert wie ink-muted und ist mit
   * UXR-001 gestrichen (TOK-07). Dieser Waechter ersetzt ihren Fall in
   * src/lib/kontrast.test.ts und ist strenger: Der Name kommt in src/ gar
   * nicht mehr vor - weder als Klasse noch als Variable noch im Kommentar.
   */
  it('kommt ohne die abgeloeste dritte Stufe aus', () => {
    expect(funde((zeile) => (zeile.includes('ink-subtle') ? ['ink-subtle'] : []))).toEqual([]);
    expect(css).not.toMatch(/--color-ink-subtle/);
  });
});

/** index.css ohne Kommentare - die Regeln, nicht ihre Begruendung. */
const regeln = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Globale Regeln (UXR-001)', () => {
  it('setzt Kaestchen und Auswahlknoepfe in die Hauptfarbe (UIK-03)', () => {
    // Ohne accent-color zeigte der Browser sein Standardblau #0075ff.
    expect(regeln).toMatch(
      /input\[type='checkbox'\],\s*input\[type='radio'\]\s*\{\s*accent-color:\s*var\(--color-accent\);\s*\}/,
    );
  });

  it('kennt nur das helle Schema - im CSS und im Kopf des Dokuments (NAV-10)', () => {
    // Bei dunkel eingestelltem System zeichnete der Browser Kaestchen,
    // Datumsfelder und Rollbalken sonst dunkel in die helle Anwendung.
    expect(regeln).toMatch(/:root\s*\{\s*color-scheme:\s*light;\s*\}/);
    const html = readFileSync(join(stamm, 'index.html'), 'utf8');
    expect(html).toContain('<meta name="color-scheme" content="light" />');
    expect(html).not.toMatch(/color-scheme"[^>]*dark/);
  });

  /**
   * UIK-11, TER-12: Die Druckregel blendete jedes `header` aus - auch den
   * Seitenkopf (PageHeader) und den Kopf der Akte. Auf Papier fehlten damit
   * Seitentitel, Datum des Tagesplans und Name. Ausgenommen wird jetzt nur
   * die Kopfzeile der Anwendung, und zwar ueber `nicht-drucken`.
   */
  it('druckt Seitentitel und Aktenkopf, die Kopfzeile der Anwendung nicht', () => {
    const druck = regeln.slice(regeln.indexOf('@media print'));
    const ausgeblendet =
      /([^{}]+)\{\s*display:\s*none\s*!important;\s*\}/
        .exec(druck)?.[1]
        ?.split(',')
        .map((selektor) => selektor.trim()) ?? [];
    expect(ausgeblendet).toEqual(['nav', 'button', '.nicht-drucken']);

    const geruest = readFileSync(join(stamm, 'src/app/AppShell.tsx'), 'utf8');
    expect(geruest).toMatch(/<header className="[^"]*\bnicht-drucken\b[^"]*"/);
  });
});

/*
 * Ratsche: alte Seitenmuster nehmen nur ab (Design-Fundament, ANN-400).
 *
 * Die Wächter darüber verbieten Werte (Schatten, Radien, Größen). Die
 * Ratsche zählt Muster, die `docs/design/DESIGN.md` durch Bausteine ersetzt
 * - handgebaute Listen, eigene Überschriften, eigene Aufklapper, rohe Knöpfe,
 * freie Inhaltsbreiten, Tabellen - je Verzeichnis gegen eine Obergrenze in
 * `src/designsystem.grenzen.ts`. Sie schlägt in **beide** Richtungen an:
 * darüber, weil eine Seite nach altem Muster entstand; darunter, weil ein
 * Umbau die Grenze nicht mitgesenkt hat. So hält jeder Fortschritt, ohne
 * dass alles auf einmal umgebaut sein muss.
 */

/** Ohne Kommentare: Ein Satz über `<details>` ist kein Aufklapper. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/**
 * Öffnende Tags, deren Name `muster` trifft, samt Attributen - über Zeilen
 * hinweg. Ein `>` in geschweiften Klammern (`onClick={() => …}`) beendet den
 * Tag nicht.
 */
function oeffnendeTags(text: string, muster: RegExp): string[] {
  const tags: string[] = [];
  for (const fund of text.matchAll(muster)) {
    let tiefe = 0;
    let ende = fund.index + fund[0].length;
    for (; ende < text.length; ende += 1) {
      const zeichen = text[ende];
      if (zeichen === '{') tiefe += 1;
      else if (zeichen === '}') tiefe -= 1;
      else if (zeichen === '>' && tiefe === 0) break;
    }
    tags.push(text.slice(fund.index, ende + 1));
  }
  return tags;
}

type Muster = keyof typeof GRENZEN;

/** Wie oft ein Muster in einem Quelltext vorkommt (ohne Kommentare). */
const ZAEHLER: Record<Muster, (text: string) => number> = {
  breiten: (text) => Array.from(text.matchAll(/(?<![\w-])max-w-(?:xl|2xl|3xl)(?![\w-])/g)).length,
  details: (text) => oeffnendeTags(text, /<details(?![\w-])/g).length,
  divideY: (text) => Array.from(text.matchAll(/(?<![\w-])divide-y\b/g)).length,
  knoepfe: (text) =>
    oeffnendeTags(text, /<button(?![\w-])/g).filter((tag) => tag.includes('className=')).length,
  tabellen: (text) => oeffnendeTags(text, /<table(?![\w-])/g).length,
  ueberschriften: (text) =>
    oeffnendeTags(text, /<h[1-4](?![\w-])/g).filter((tag) => tag.includes('className=')).length,
};

/** Was die Meldung sagt, wenn ein Verzeichnis über der Grenze liegt. */
const ERSATZ: Record<Muster, string> = {
  breiten: 'max-w-xl/2xl/3xl statt max-w-formular oder max-w-spalte',
  details: 'eigenes <details> statt Disclosure',
  divideY: 'divide-y-Liste statt ListRows, Listenabschnitt oder Datenliste',
  knoepfe: 'rohes <button className> statt Button, Symbolknopf, Chip oder Segment',
  tabellen: '<table> statt Datenliste',
  ueberschriften: 'eigene Überschrift statt PageHeader, Objektkopf, Section oder Zwischentitel',
};

/** Druckblätter folgen ihrem eigenen Profil (DESIGN.md, „Druckblatt“). */
const DRUCKBLATT = /Druck|Print|blatt|Briefkopf/;

/** `features/patients`, `app`, `lib` … - das Verzeichnis, nach dem gezählt wird. */
function verzeichnisVon(pfad: string): string {
  const teile = relative(join(stamm, 'src'), pfad).split('/');
  if (teile[0] !== 'features') return teile[0] ?? '';
  // Ein Modul liegt an der Wurzel seiner Domäne oder in einem Ordner darunter (ANN-754).
  return teile.length > 3 ? `features/${teile[1]}/${teile[2]}` : `features/${teile[1]}`;
}

/** Der Ist-Stand: je Muster und Verzeichnis die Zahl der Vorkommen. */
function zaehleMuster(): Record<Muster, Record<string, number>> {
  const stand: Record<Muster, Record<string, number>> = {
    breiten: {},
    details: {},
    divideY: {},
    knoepfe: {},
    tabellen: {},
    ueberschriften: {},
  };
  for (const datei of quelldateien(join(stamm, 'src'))) {
    if (!/\.tsx?$/.test(datei)) continue;
    const imBaustein = relative(stamm, datei).startsWith('src/components/ui/');
    const druck = DRUCKBLATT.test(basename(datei));
    const text = ohneKommentare(readFileSync(datei, 'utf8'));
    const verzeichnis = verzeichnisVon(datei);
    for (const muster of Object.keys(ZAEHLER) as Muster[]) {
      if (muster !== 'breiten' && imBaustein) continue;
      if ((muster === 'ueberschriften' || muster === 'tabellen') && druck) continue;
      const anzahl = ZAEHLER[muster](text);
      if (anzahl > 0) stand[muster][verzeichnis] = (stand[muster][verzeichnis] ?? 0) + anzahl;
    }
  }
  return stand;
}

describe('Ratsche: alte Seitenmuster nehmen nur ab (Design-Fundament, ANN-400)', () => {
  const stand = zaehleMuster();

  for (const muster of Object.keys(GRENZEN) as Muster[]) {
    it(`${muster}: kein Verzeichnis liegt über seiner Grenze`, () => {
      const darueber = Object.entries(stand[muster])
        .filter(([verzeichnis, anzahl]) => anzahl > (GRENZEN[muster][verzeichnis] ?? 0))
        .map(
          ([verzeichnis, anzahl]) =>
            `${verzeichnis}: ${anzahl} × ${ERSATZ[muster]}, erlaubt ${
              GRENZEN[muster][verzeichnis] ?? 0
            } - Seite nach docs/design/DESIGN.md bauen`,
        );
      expect(darueber).toEqual([]);
    });

    it(`${muster}: keine Grenze liegt über dem Stand (sonst senken)`, () => {
      const zuHoch = Object.entries(GRENZEN[muster])
        .filter(([verzeichnis, grenze]) => (stand[muster][verzeichnis] ?? 0) < grenze)
        .map(([verzeichnis]) => {
          const anzahl = stand[muster][verzeichnis] ?? 0;
          return anzahl === 0
            ? `${verzeichnis}: kein ${muster} mehr - Zeile in src/designsystem.grenzen.ts löschen`
            : `${verzeichnis}: ${muster} nur noch ${anzahl} - Grenze in src/designsystem.grenzen.ts auf ${anzahl} senken`;
        });
      expect(zuHoch).toEqual([]);
    });
  }

  it('führt die Grenzen alphabetisch, ohne Nullen', () => {
    for (const muster of Object.keys(GRENZEN) as Muster[]) {
      const schluessel = Object.keys(GRENZEN[muster]);
      expect(schluessel, muster).toEqual([...schluessel].sort());
      expect(
        Object.values(GRENZEN[muster]).every((grenze) => grenze > 0),
        muster,
      ).toBe(true);
    }
  });

  /** Gegenprobe: ein Zähler, der nie etwas findet, sähe aus wie ein sauberer Stand. */
  it('erkennt jedes Muster und lässt Bausteine, Prosa und Kommentare durch (Gegenprobe)', () => {
    const zaehle = (muster: Muster, text: string) => ZAEHLER[muster](ohneKommentare(text));

    expect(zaehle('divideY', '<ul className="divide-line divide-y border">')).toBe(1);
    expect(zaehle('divideY', '<ul className="sm:divide-y-2">')).toBe(1);
    expect(zaehle('divideY', '<ul className="divide-x">')).toBe(0);
    expect(zaehle('divideY', '// eine Liste ohne divide-y')).toBe(0);

    expect(zaehle('ueberschriften', '<h2 className="text-base font-semibold">Titel</h2>')).toBe(1);
    expect(zaehle('ueberschriften', '<h3\n  id={id}\n  className="text-lg"\n>')).toBe(1);
    expect(zaehle('ueberschriften', '<h2>Tagesplan des Teams</h2>')).toBe(0);
    expect(zaehle('ueberschriften', '<header className="flex">')).toBe(0);

    expect(zaehle('details', '<details className="group">')).toBe(1);
    expect(zaehle('details', '/* statt eigenem <details> */ <Disclosure>')).toBe(0);

    expect(
      zaehle('knoepfe', '<button\n  type="button"\n  onClick={() => x > 1}\n  className="px-2"\n>'),
    ).toBe(1);
    expect(zaehle('knoepfe', '<button type="button" onClick={() => setOffen(true)}>')).toBe(0);
    expect(zaehle('knoepfe', '<Button className="mt-3">')).toBe(0);

    expect(zaehle('breiten', 'className="max-w-xl"')).toBe(1);
    expect(zaehle('breiten', 'className="lg:max-w-3xl max-w-2xl"')).toBe(2);
    expect(zaehle('breiten', 'className="max-w-formular max-w-spalte max-w-xs max-w-xl2"')).toBe(0);

    expect(zaehle('tabellen', '<table className="w-full">')).toBe(1);
    expect(zaehle('tabellen', '<tableau>')).toBe(0);

    expect(DRUCKBLATT.test('InvoicePrintPage.tsx')).toBe(true);
    expect(DRUCKBLATT.test('Planblatt.tsx')).toBe(true);
    expect(DRUCKBLATT.test('PlanPage.tsx')).toBe(false);
    expect(verzeichnisVon(join(stamm, 'src/features/patients/PatientsListPage.tsx'))).toBe(
      'features/patients',
    );
    expect(verzeichnisVon(join(stamm, 'src/app/AppShell.tsx'))).toBe('app');
  });
});
