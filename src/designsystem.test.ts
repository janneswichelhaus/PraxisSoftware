import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
    // Der Name kommt aus dem Verzeichnis, nicht aus einer Eingabe.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (statSync(pfad).isDirectory()) treffer.push(...quelldateien(pfad));
    // Tests sind ausgenommen: sie beschreiben die Regel und müssten das Wort
    // sonst umschreiben, um sich nicht selbst zu melden.
    else if (/\.(tsx|ts|css)$/.test(eintrag) && !/\.test\.(tsx|ts)$/.test(eintrag)) {
      treffer.push(pfad);
    }
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
   * Fokusring ist ausgenommen: er ist `outline`, kein Schatten.
   */
  it('verwendet nirgends eine Schatten-Utility', () => {
    const treffer: string[] = [];
    for (const datei of quelldateien(join(stamm, 'src'))) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const inhalt = readFileSync(datei, 'utf8');
      // Die Utility steht hinter einem Leerzeichen, einem Anfuehrungszeichen
      // oder einem Varianten-Doppelpunkt (`hover:shadow-md`). Der Rueckblick
      // schliesst `box-shadow` und `boxShadow` aus - die Druckregel in
      // index.css darf die Eigenschaft ja gerade auf `none` setzen.
      if (/(?<=[\s"'`:])shadow\b/.test(inhalt)) {
        treffer.push(datei.replace(`${stamm}/`, ''));
      }
    }
    expect(treffer).toEqual([]);
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
   * sie eigens neben den vier Hauptradien.
   */
  it('verwendet nur die Radien des Systems', () => {
    const erlaubt = new Set(['button', 'field', 'card', 'image', 'pill', '[6px]']);
    const treffer: string[] = [];
    for (const datei of quelldateien(join(stamm, 'src'))) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const inhalt = readFileSync(datei, 'utf8');
      for (const fund of inhalt.matchAll(/\brounded-(\[[^\]]+\]|[a-z0-9]+)\b/g)) {
        if (!erlaubt.has(fund[1]!)) treffer.push(`${datei.replace(`${stamm}/`, '')}: ${fund[0]}`);
      }
    }
    expect(treffer).toEqual([]);
  });
});
