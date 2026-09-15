import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Die Marke wird ausgeliefert, ohne eine zweite Fassung zu entstehen.
 *
 * `marke/README.md` legt fest: das Verzeichnis ist die **einzige Quelle** für
 * Wortmarke und App-Symbole, „es wird keine zweite Fassung an anderer Stelle
 * gepflegt". Vite liefert aber nur aus, was unter `public/` liegt — die
 * Dateien mussten also dorthin.
 *
 * Damit die Kopie keine zweite Fassung wird, prüft dieser Test sie Byte für
 * Byte gegen die Quelle. Wer eine Markendatei ändert, ohne die andere Seite
 * nachzuziehen, bricht den Test statt still auseinanderzulaufen.
 *
 * Absichtlich nicht geprüft wird die Gegenrichtung: `marke/` darf Dateien
 * enthalten, die die Anwendung nicht braucht (Druckfassungen, Android-Kreis).
 * Kopiert wird nur, was auch verwendet wird.
 */

const stamm = process.cwd();
const KOPIEN = join(stamm, 'public/marke');
const QUELLEN = [join(stamm, 'marke/app'), join(stamm, 'marke/logo')];

function quelleVon(datei: string): string {
  for (const verzeichnis of QUELLEN) {
    if (readdirSync(verzeichnis).includes(datei)) return join(verzeichnis, datei);
  }
  throw new Error(
    `public/marke/${datei} hat keine Quelle in marke/. Entweder stammt die Datei nicht ` +
      `aus der Marke — dann gehoert sie nicht hierher — oder sie wurde in marke/ geloescht.`,
  );
}

describe('Ausgelieferte Marke', () => {
  const kopien = readdirSync(KOPIEN);

  it('liegt ueberhaupt im Auslieferungspfad', () => {
    // Ohne diese Zusicherung waere ein leeres Verzeichnis stillschweigend
    // gruen und die Anwendung haette kein Symbol mehr.
    expect(kopien).toContain('own-motion-monogramm-48.png');
    expect(kopien).toContain('own-motion-app-1024.png');
    expect(kopien).toContain('own-motion-block-farbig.svg');
  });

  it.each(readdirSync(KOPIEN))('%s ist byte-gleich mit der Quelle in marke/', (datei) => {
    const kopie = readFileSync(join(KOPIEN, datei));
    const quelle = readFileSync(quelleVon(datei));
    expect(kopie.equals(quelle)).toBe(true);
  });
});

describe('index.html bindet die Marke ein', () => {
  const html = readFileSync(join(stamm, 'index.html'), 'utf8');

  it.each([
    ['own-motion-monogramm.svg'],
    ['own-motion-monogramm-48.png'],
    ['own-motion-monogramm-24.png'],
    ['own-motion-monogramm-16.png'],
    ['own-motion-app-1024.png'],
  ])('verweist auf /marke/%s', (datei) => {
    expect(html).toContain(`href="/marke/${datei}"`);
  });

  /**
   * Befund 2 aus `marke/README.md`, entschieden am 2026-09-11: Im Kleinformat
   * steht das Monogramm, nicht die Wortmarke. Die gelieferten Favicons liegen
   * weiter in `marke/app/` — als Beleg, nicht zur Verwendung. Dieser Test
   * hält fest, dass sie nicht versehentlich zurückkehren.
   */
  it('bindet die zweizeilige Wortmarke nicht als Favicon ein', () => {
    expect(html).not.toContain('own-motion-favicon-');
  });

  it('traegt den Markennamen als Seitentitel', () => {
    expect(html).toContain('<title>Own Motion</title>');
  });

  it('verweist auf keine Markendatei, die nicht ausgeliefert wird', () => {
    const verwiesen = [...html.matchAll(/href="\/marke\/([^"]+)"/g)].map((treffer) => treffer[1]!);
    expect(verwiesen.length).toBeGreaterThan(0);
    for (const datei of verwiesen) expect(readdirSync(KOPIEN)).toContain(datei);
  });
});
