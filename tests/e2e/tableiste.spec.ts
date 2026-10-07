import { expect, test } from '@playwright/test';

/**
 * Die Tableiste in 12 px ohne seitlichen Innenabstand (Runde 2, Variante L-B;
 * Handoff Schrift und Knöpfe 2026-10-06, Abschnitt 3).
 *
 * jsdom kennt keine Breiten. Hier zählt, was am Handy zu sehen ist: Bei 360
 * und 375 px steht jede Beschriftung ganz in ihrer Zelle - auch
 * „Organisation", die längste Kurzform -, und die Seite rollt nicht quer. Die
 * Prüfseite des Kalenders trägt den Rahmen einer Therapeutin.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/kalender.html';

for (const breite of [360, 375]) {
  test(`hält jede Beschriftung der Tableiste in ihrer Zelle (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 760 });
    await page.goto(PRUEFSEITE);
    const leiste = page.getByRole('navigation', { name: 'Arbeitsbereiche' });
    await expect(leiste).toBeVisible();
    await expect(leiste.getByText('Organisation', { exact: true })).toBeVisible();

    const zellen = await leiste.locator('li > *').evaluateAll((elemente) =>
      elemente.map((element) => {
        // Die Beschriftung ist Text im Link; gemessen wird der Textbereich
        // selbst, nicht der Kasten des Links.
        const gang = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const bereich = document.createRange();
        let erster: Node | null = null;
        let letzter: Node | null = null;
        for (let k = gang.nextNode(); k; k = gang.nextNode()) {
          if (!k.textContent?.trim()) continue;
          erster ??= k;
          letzter = k;
        }
        const zelle = element.getBoundingClientRect();
        if (!erster || !letzter) return { name: '', groesse: '', links: -1, rechts: -1 };
        bereich.setStartBefore(erster);
        bereich.setEndAfter(letzter);
        const schrift = bereich.getBoundingClientRect();
        return {
          name: element.textContent?.trim() ?? '',
          groesse: getComputedStyle(erster.parentElement!).fontSize,
          links: schrift.left - zelle.left,
          rechts: zelle.right - schrift.right,
        };
      }),
    );
    expect(zellen.length).toBeGreaterThanOrEqual(4);
    for (const zelle of zellen) {
      expect(zelle.groesse, zelle.name).toBe('12px');
      // Ganz in der Zelle, nicht über den Rand zur Nachbarin.
      expect(zelle.links, zelle.name).toBeGreaterThanOrEqual(0);
      expect(zelle.rechts, zelle.name).toBeGreaterThanOrEqual(0);
    }

    const quer = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(quer).toBe(false);
  });
}
