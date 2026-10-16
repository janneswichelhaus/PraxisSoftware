import { expect, test, type Page } from '@playwright/test';

/**
 * Bewegung nur als Gestaltung (ANN-567) im echten Browser, auf der Prüfseite
 * der Bausteine.
 *
 * Was gleitet, liegt in Ruhe genau dort, wo bisher die Markierung lag, und
 * nur einmal; was aufgeht, geht auf, statt zu springen; eine Zeile mit Ziel
 * öffnet sich über einen View Transition. Bei reduzierter Bewegung springt
 * alles wie bisher. Das Dehnen rechnet `gleitanzeiger.test.tsx` nach; hier
 * zählt, was nur ein Renderer zeigt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/ui-bausteine.html';

async function oeffnen(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  await expect(page.getByRole('heading', { name: 'Oberflächen-Bausteine' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const reiterleiste = (page: Page) => page.getByRole('navigation', { name: 'Teile der Kundin' });

/** Pille und offener Reiter: Lage, Größe, die eigene Fläche des Reiters. */
async function pilleUndReiter(page: Page) {
  return reiterleiste(page).evaluate((nav) => {
    const pille = nav.querySelector('[data-gleitanzeiger]');
    const reiter = nav.querySelector('[aria-current="page"]');
    if (!pille || !reiter) return null;
    const p = pille.getBoundingClientRect();
    const r = reiter.getBoundingClientRect();
    return {
      name: reiter.textContent,
      abstand: Math.max(
        Math.abs(p.left - r.left),
        Math.abs(p.top - r.top),
        Math.abs(p.width - r.width),
        Math.abs(p.height - r.height),
      ),
      flaeche: getComputedStyle(reiter).backgroundColor,
    };
  });
}

/** Merkt sich jede Phase, die der Anzeiger der Reiterleiste annimmt. */
async function phasenMitschreiben(page: Page) {
  await reiterleiste(page).evaluate((nav) => {
    const phasen: string[] = [];
    (window as unknown as { phasen: string[] }).phasen = phasen;
    new MutationObserver(() => {
      const phase = nav.querySelector('[data-gleitanzeiger]')?.getAttribute('data-phase');
      if (phase && phasen.at(-1) !== phase) phasen.push(phase);
    }).observe(nav, { attributes: true, subtree: true, attributeFilter: ['data-phase'] });
  });
}

const phasen = (page: Page) =>
  page.evaluate(() => (window as unknown as { phasen: string[] }).phasen);

/**
 * Klappt „Erledigt heute“ auf und misst die Höhe des Aufklappers je Bild -
 * und ob sein Inhalt gleich nach dem Tipp da ist (sonst ginge ein Fokus
 * gleich nach dem Öffnen ins Leere).
 */
async function aufklappenUndMessen(page: Page): Promise<{ hoehen: number[]; sofort: string }> {
  return page.evaluate(async () => {
    const kopf = [...document.querySelectorAll('summary')].find((element) =>
      element.textContent?.includes('Erledigt heute'),
    );
    const aufklapper = kopf?.closest('details');
    if (!kopf || !aufklapper) throw new Error('Aufklapper „Erledigt heute“ fehlt');
    const hoehen = [aufklapper.getBoundingClientRect().height];
    kopf.click();
    const sofort = getComputedStyle(aufklapper, '::details-content').contentVisibility;
    const start = performance.now();
    while (performance.now() - start < 700) {
      await new Promise((weiter) => requestAnimationFrame(weiter));
      hoehen.push(aufklapper.getBoundingClientRect().height);
    }
    return { hoehen, sofort };
  });
}

/** Zählt die View Transitions, die die Seite startet. */
async function uebergaengeZaehlen(page: Page) {
  await page.evaluate(() => {
    const fenster = window as unknown as { uebergaenge: number };
    fenster.uebergaenge = 0;
    if (typeof document.startViewTransition !== 'function') return;
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = ((
      aufruf?: Parameters<typeof document.startViewTransition>[0],
    ) => {
      fenster.uebergaenge += 1;
      return original(aufruf);
    }) as typeof document.startViewTransition;
  });
}

const uebergaenge = (page: Page) =>
  page.evaluate(() => (window as unknown as { uebergaenge: number }).uebergaenge);

test.describe('Bewegung (ANN-567)', () => {
  test('die Pille liegt in Ruhe genau auf dem offenen Reiter, nur einmal, und gleitet zum neuen', async ({
    page,
  }) => {
    await oeffnen(page);
    const ruhe = await pilleUndReiter(page);
    expect(ruhe?.name).toBe('Einheiten');
    expect(ruhe?.abstand).toBeLessThan(0.5);
    // Die Fläche trägt die Pille; der Reiter selbst wird durchsichtig. Er
    // blendet seine eigene dabei über, gleichfarbig über der Pille.
    await expect.poll(async () => (await pilleUndReiter(page))?.flaeche).toBe('rgba(0, 0, 0, 0)');

    await phasenMitschreiben(page);
    await reiterleiste(page).getByRole('link', { name: 'Verlauf' }).click();
    await expect
      .poll(async () => {
        const stand = await pilleUndReiter(page);
        return stand?.name === 'Verlauf' && stand.abstand < 0.5;
      })
      .toBe(true);
    expect(await phasen(page)).toEqual(['dehnen', 'gleiten']);
  });

  test('ein Aufklapper geht auf, statt zu springen - sein Inhalt ist sofort da', async ({
    page,
  }) => {
    await oeffnen(page);
    const { hoehen, sofort } = await aufklappenUndMessen(page);
    expect(sofort).toBe('visible');
    const zu = hoehen[0]!;
    const auf = hoehen.at(-1)!;
    expect(auf).toBeGreaterThan(zu + 10);
    expect(hoehen.some((hoehe) => hoehe > zu + 1 && hoehe < auf - 1)).toBe(true);
  });

  test('eine Zeile mit Ziel öffnet sich über einen View Transition', async ({ page }) => {
    await oeffnen(page);
    await uebergaengeZaehlen(page);
    await page.getByRole('link', { name: /Max Mustermann/ }).click();
    await expect.poll(() => uebergaenge(page)).toBe(1);
  });

  test('der Titel eines Felds nimmt beim Fokus die Hauptfarbe an, der Text bleibt', async ({
    page,
  }) => {
    await oeffnen(page);
    const feld = page.getByLabel('Bezeichnung der Schau');
    const titel = page.locator('label', { hasText: 'Bezeichnung der Schau' });
    const hauptfarbe = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-accent)';
      document.body.append(probe);
      const farbe = getComputedStyle(probe).color;
      probe.remove();
      return farbe;
    });
    await feld.focus();
    await expect(titel).toHaveCSS('color', hauptfarbe);
    await expect(titel).toHaveText('Bezeichnung der Schau');
  });

  test('bei reduzierter Bewegung springt alles wie bisher', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await oeffnen(page);

    const { hoehen } = await aufklappenUndMessen(page);
    const auf = hoehen.at(-1)!;
    // Spätestens im zweiten Bild steht der Aufklapper ganz offen.
    expect(hoehen[2]).toBeCloseTo(auf, 0);

    await phasenMitschreiben(page);
    await reiterleiste(page).getByRole('link', { name: 'Vertrag' }).click();
    await expect
      .poll(async () => {
        const stand = await pilleUndReiter(page);
        return stand?.name === 'Vertrag' && stand.abstand < 0.5;
      })
      .toBe(true);
    expect(await phasen(page)).not.toContain('dehnen');

    await uebergaengeZaehlen(page);
    await page.getByRole('link', { name: /Max Mustermann/ }).click();
    expect(await uebergaenge(page)).toBe(0);
  });
});
