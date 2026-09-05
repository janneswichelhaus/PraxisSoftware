import { expect, test } from '@playwright/test';
import {
  FENSTER_BASIS,
  FENSTER_BREITE,
  FENSTER_STREUUNG,
  TAGESFENSTER,
  laufTagImFenster,
} from './authenticated/helpers';

/**
 * Die Tagesfenster der Spezifikationen dürfen sich nicht überschneiden.
 *
 * Warum das eine eigene Prüfung wert ist: Die Abläufe hinter der Anmeldung
 * legen Termine weit in der Zukunft an, und ein Termin lässt sich fachlich
 * nicht löschen. Treffen zwei Spezifikationen denselben Tag, dieselbe
 * behandelnde Person und eine überlappende Uhrzeit, weist `create_appointment`
 * den zweiten Termin **zu Recht** als Überschneidung ab — und ein Test
 * scheitert an etwas, das er gar nicht prüft.
 *
 * Genau das ist am 2026-09-05 in CI passiert: `staff-workflows` rechnete bis
 * Tag 824, `calendar-interaction-workflows` begann bei Tag 800.
 *
 * Diese Datei prüft reine Arithmetik und braucht deshalb keinen Browser und
 * keine Anmeldung — sie läuft in jedem CI-Lauf mit, auch ohne Supabase.
 */

/**
 * Größter Ausschlag über `FENSTER_STREUUNG` hinaus, den eine Spezifikation
 * heute erzeugt: vier Wochen Versatz (`mittwoch(4)`) plus bis zu sechs Tage
 * Ausrichtung auf einen Wochentag. Wer mehr braucht, erhöht die Reserve —
 * dieser Test sagt dann, dass es nicht mehr passt.
 */
const MAX_AUSSCHLAG = 4 * 7 + 6;

/** Ein Tag als Zahl, damit sich Fenster vergleichen lassen. */
function tagesZahl(datum: Date): number {
  return Math.round(datum.getTime() / 86_400_000);
}

test.describe('Tagesfenster der E2E-Spezifikationen', () => {
  test('lässt genug Reserve für Versatz und Wochentagsausrichtung', () => {
    const reserve = FENSTER_BREITE - FENSTER_STREUUNG;
    expect(reserve, 'Reserve je Fenster in Tagen').toBeGreaterThan(MAX_AUSSCHLAG);
  });

  test('vergibt jede Fensternummer genau einmal', () => {
    const nummern = Object.values(TAGESFENSTER);
    expect(new Set(nummern).size, 'doppelt vergebene Fensternummer').toBe(nummern.length);
  });

  test('hält jeden erreichbaren Tag im eigenen Fenster', () => {
    const heute = tagesZahl(new Date(new Date().setUTCHours(12, 0, 0, 0)));

    for (const [name, fenster] of Object.entries(TAGESFENSTER)) {
      const untergrenze = heute + FENSTER_BASIS + fenster * FENSTER_BREITE;
      const obergrenze = untergrenze + FENSTER_BREITE - 1;

      // Die Ränder der Streuung und ein paar Werte dazwischen genügen: der
      // Tag wächst streng monoton mit `lauf % FENSTER_STREUUNG`.
      for (const rest of [0, 1, 99, FENSTER_STREUUNG - 2, FENSTER_STREUUNG - 1]) {
        for (const ausschlag of [0, 1, MAX_AUSSCHLAG]) {
          const tag = tagesZahl(laufTagImFenster(fenster, rest, ausschlag));
          expect(tag, `${name}: Tag unterschreitet sein Fenster`).toBeGreaterThanOrEqual(
            untergrenze,
          );
          expect(tag, `${name}: Tag überschreitet sein Fenster`).toBeLessThanOrEqual(obergrenze);
        }
      }
    }
  });

  test('lässt keine zwei Fenster überlappen', () => {
    const fenster = Object.entries(TAGESFENSTER).sort((a, b) => a[1] - b[1]);

    for (let i = 1; i < fenster.length; i += 1) {
      const [vorherName, vorher] = fenster[i - 1]!;
      const [name, nummer] = fenster[i]!;

      // Spätester Tag des vorherigen Fensters gegen den frühesten des nächsten.
      const spaetester = tagesZahl(laufTagImFenster(vorher, FENSTER_STREUUNG - 1, MAX_AUSSCHLAG));
      const fruehester = tagesZahl(laufTagImFenster(nummer, 0, 0));

      expect(spaetester, `${vorherName} reicht in ${name} hinein`).toBeLessThan(fruehester);
    }
  });
});
