import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

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
function funde(pruefen: (zeile: string) => string[]): string[] {
  const treffer: string[] = [];
  for (const datei of quelldateien(join(stamm, 'src'))) {
    const zeilen = readFileSync(datei, 'utf8').split('\n');
    zeilen.forEach((zeile, index) => {
      for (const fund of pruefen(zeile)) {
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
    expect(funde(schattenFunde)).toEqual([]);
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
   * `docs/design/handoff-2026-10-01-uebersicht-termin-akte.md`). Sie stehen
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
