import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  gamutAbweichung,
  kontrastverhaeltnis,
  oklchNachLinearSrgb,
  relativeHelligkeit,
  tokensAusCss,
} from './kontrast';

// Unter jsdom traegt import.meta.url kein file:-Schema; der Pfad kommt
// deshalb aus dem Projektstamm.
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
const tokens = tokensAusCss(css);

/** Alle Flächen, auf denen Text und Rahmen in dieser Anwendung liegen. */
const HINTERGRUENDE = ['canvas', 'surface', 'surface-sunken'] as const;

function schlechtesterKontrast(token: string): number {
  const farbe = tokens[token];
  if (!farbe) throw new Error(`Token --color-${token} fehlt in src/index.css.`);
  return Math.min(
    ...HINTERGRUENDE.map((hintergrund) => {
      const flaeche = tokens[hintergrund];
      if (!flaeche) throw new Error(`Token --color-${hintergrund} fehlt in src/index.css.`);
      return kontrastverhaeltnis(farbe, flaeche);
    }),
  );
}

describe('Kontrastrechnung', () => {
  it('rechnet Schwarz auf Weiss als 21:1', () => {
    const schwarz = { L: 0, C: 0, H: 0 };
    const weiss = { L: 1, C: 0, H: 0 };
    expect(kontrastverhaeltnis(schwarz, weiss)).toBeCloseTo(21, 1);
  });

  it('liefert 1:1 fuer eine Farbe mit sich selbst', () => {
    const farbe = { L: 0.5, C: 0.05, H: 200 };
    expect(kontrastverhaeltnis(farbe, farbe)).toBeCloseTo(1, 5);
  });

  it('ist symmetrisch', () => {
    const a = { L: 0.24, C: 0.012, H: 250 };
    const b = { L: 0.986, C: 0.004, H: 106 };
    expect(kontrastverhaeltnis(a, b)).toBeCloseTo(kontrastverhaeltnis(b, a), 10);
  });

  it('rechnet Weiss auf volle Helligkeit', () => {
    expect(relativeHelligkeit(oklchNachLinearSrgb({ L: 1, C: 0, H: 0 }))).toBeCloseTo(1, 3);
  });

  it('liest die Tokens aus src/index.css', () => {
    // Findet die Suche nichts, waere jede folgende Zusicherung wertlos.
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(12);
    // Tinte #111e17 aus tokens/colors.css des Design Systems (DS-001).
    expect(tokens.ink).toEqual({ L: 0.22, C: 0.0229, H: 160.2 });
  });
});

/**
 * Die eigentliche Zusicherung von UI-000: die Palette erfüllt WCAG AA.
 *
 * Geprüft wird jeweils gegen die **ungünstigste** der drei Flächen, nicht
 * gegen Weiß — sonst würde eine Farbe bestehen, die auf `surface-sunken`
 * durchfällt.
 */
describe('Farbtokens erfuellen WCAG AA', () => {
  // Drei Tokens ragen minimal aus sRGB heraus: accent-hover, danger-soft und
  // warnung, jeweils um weniger als sieben Hundertstel eines Kanals. Sie sind
  // aelter als dieses Epic und werden hier nicht angefasst. Wichtig ist nur,
  // dass die Ueberschreitung klein bleibt - dann liefert das harte
  // Beschneiden in dieser Rechnung praktisch dieselbe Farbe wie das
  // Gamut-Mapping des Browsers, und die Kontrastwerte oben sind belastbar.
  it('bleibt mit jedem Token nahe an sRGB', () => {
    const zuWeit = Object.entries(tokens)
      .filter(([, farbe]) => gamutAbweichung(farbe) > 0.07)
      .map(([name]) => name);
    expect(zuWeit).toEqual([]);
  });

  it('misst die Abweichung von sRGB ueberhaupt', () => {
    // Gegenprobe: ein klar zu buntes Gruen muss auffallen, sonst waere der
    // Test oben immer gruen.
    expect(gamutAbweichung({ L: 0.6, C: 0.4, H: 150 })).toBeGreaterThan(0.07);
    expect(gamutAbweichung({ L: 0.5, C: 0, H: 0 })).toBe(0);
  });

  // 4.5:1 nach WCAG 1.4.3 fuer normalen Text. Alle drei werden auch in
  // kleinen Schriftgraden verwendet, deshalb gilt nirgends die Ausnahme fuer
  // grossen Text (3:1).
  it.each([['ink'], ['ink-muted'], ['ink-subtle']])(
    'erreicht mit %s mindestens 4.5:1 als Textfarbe',
    (token) => {
      expect(schlechtesterKontrast(token)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // accent-hover ist mitgeprueft, weil es nicht nur Knopfflaeche ist: rund ein
  // Dutzend Stellen nutzen `text-accent hover:text-accent-hover`, der Wert
  // steht dort also als Textfarbe auf canvas, surface und surface-sunken.
  // Bis zur Marke war das ungeprueft.
  it.each([['accent'], ['accent-hover'], ['danger']])(
    'erreicht mit %s mindestens 4.5:1 als Textfarbe',
    (token) => {
      expect(schlechtesterKontrast(token)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // Heller Text auf der Akzentflaeche - die primaere Schaltflaeche
  // (`bg-accent text-surface`, buttonStile.ts) und ihr Hover-Zustand. Seit
  // DS-001 ist dieser Text Papier und nicht Weiss (`--action-primary-text`);
  // geprueft wird deshalb das Paar, das tatsaechlich auf dem Schirm steht.
  it.each([['accent'], ['accent-hover']])('traegt Papier auf %s mit 4.5:1', (token) => {
    expect(kontrastverhaeltnis(tokens[token]!, tokens.surface!)).toBeGreaterThanOrEqual(4.5);
  });

  // Der Hover-Zustand muss sichtbar sein, sonst zeigt er nichts an. Gemessen
  // als Helligkeitsabstand in Oklch, wo 1 % ungefaehr einem wahrnehmbaren
  // Schritt entspricht. Die Palette vor der Marke lag bei 6 Punkten
  // (48 % -> 42 %); weniger soll es nicht werden. Die Richtung ist bewusst
  // offen - geprueft wird der Abstand, nicht ob heller oder dunkler.
  it('setzt accent-hover deutlich genug von accent ab', () => {
    const abstand = Math.abs(tokens.accent!.L - tokens['accent-hover']!.L);
    expect(abstand).toBeGreaterThanOrEqual(0.06);
  });

  // Bis DS-001 hielt hier eine Zusicherung accent-soft und positiv-soft ueber
  // ihre Buntheit auseinander. In der Palette "Flasche & Salbei" sind beide
  // dieselbe Farbe - Hauptfarbe auf Salbei hell -, und das ist Absicht: das
  // Design System unterscheidet Status ueber ein Zeichen, nicht ueber einen
  // Farbton. Die Zusicherung ist deshalb nicht entfallen, sondern umgezogen:
  // `Badge` traegt fuer positiv/warnung/kritisch ein ✓ ! × neben dem Text,
  // geprueft in src/components/ui/bausteine.test.tsx.
  //
  // Was hier bleibt, ist die Bedingung, unter der das ueberhaupt zulaessig
  // ist: die beiden Toene muessen als Flaeche denselben Text tragen koennen.
  it('haelt accent und positiv auf ihrer gemeinsamen Flaeche lesbar', () => {
    expect(kontrastverhaeltnis(tokens.accent!, tokens['accent-soft']!)).toBeGreaterThanOrEqual(4.5);
    expect(kontrastverhaeltnis(tokens.positiv!, tokens['positiv-soft']!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  // 3:1 nach WCAG 1.4.11 fuer die Begrenzung von Bedienelementen.
  // line-strong umrandet Eingabefelder; der Fokusring nutzt accent.
  it.each([['line-strong'], ['accent']])(
    'erreicht mit %s mindestens 3:1 als Begrenzung eines Bedienelements',
    (token) => {
      expect(schlechtesterKontrast(token)).toBeGreaterThanOrEqual(3);
    },
  );

  // Gegenprobe mit Begruendung: --color-line trennt nur (Kartenrahmen,
  // Listentrenner) und identifiziert kein Bedienelement. WCAG 1.4.11 nimmt
  // rein dekorative Elemente aus. Der Test haelt diese Absicht fest, damit
  // line nicht versehentlich an ein Eingabefeld wandert.
  it('laesst line bewusst hell - es ist ein Trenner, kein Bedienelement', () => {
    expect(schlechtesterKontrast('line')).toBeLessThan(3);
  });

  // Statusfarben stehen als Text in Abzeichen auf ihrer eigenen weichen
  // Flaeche, nicht auf canvas.
  it.each([
    ['positiv', 'positiv-soft'],
    ['warnung', 'warnung-soft'],
    ['danger', 'danger-soft'],
    ['accent', 'accent-soft'],
  ])('erreicht mit %s auf %s mindestens 4.5:1', (vorne, hinten) => {
    expect(kontrastverhaeltnis(tokens[vorne]!, tokens[hinten]!)).toBeGreaterThanOrEqual(4.5);
  });
});
