import { expect, test, type Page } from '@playwright/test';
import { axeVerstoesse, kleineZiele } from '../../../scripts/bildstrecke/barrierefreiheit.mjs';
import { ROUTEN, type Route } from '../../../scripts/bildstrecke/routen.mjs';
import { anmelden } from './helpers';

// Jede Praxisseite der Bildstrecke bei 375 px mit Touch (G17): axe mit Kontrast, Ziele ab 44 px,
// kein Querrollen. Die Plattform prüft `plattform-barrierefreiheit.spec.ts`.
const PRAXISKONTEN: Record<string, string> = {
  owner: 'jannes.test@praxis.invalid',
  office: 'olivia.office@praxis.invalid',
  therapist: 'anna.beispiel@praxis.invalid',
  teamleitung: 'tim.teamleitung@praxis.invalid',
  trainer: 'tom.training@praxis.invalid',
};

const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

const gruppen = new Map<string, { konto: string; bereich: string; routen: Route[] }>();
for (const route of ROUTEN) {
  for (const konto of route.konten) {
    if (!(konto in PRAXISKONTEN)) continue;
    const schluessel = `${konto} · ${route.bereich}`;
    const gruppe = gruppen.get(schluessel) ?? { konto, bereich: route.bereich, routen: [] };
    gruppe.routen.push(route);
    gruppen.set(schluessel, gruppe);
  }
}

/** Wechselt die Seite wie die Anwendung selbst, ohne Neuladen (wie die Bildstrecke). */
async function wechseln(page: Page, pfad: string) {
  await page.evaluate((ziel) => {
    const idx = ((window.history.state as { idx?: number } | null)?.idx ?? 0) + 1;
    window.history.pushState({ usr: null, key: String(idx), idx }, '', ziel);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state as unknown }));
    window.scrollTo(0, 0);
  }, pfad);
  await page.waitForLoadState('networkidle');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            ![...document.querySelectorAll('[role="status"]')].some((el) =>
              /…$/.test((el.textContent ?? '').trim()),
            ),
        ),
      { timeout: 10_000 },
    )
    .toBe(true);
  await page.waitForTimeout(250);
}

// Die Tests lesen nur; so verteilen sie sich auf die Teile der CI.
test.describe.configure({ mode: 'parallel' });
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

for (const [name, { konto, routen }] of gruppen) {
  test(`${name}: axe, Ziele ab 44 px, kein Querrollen bei 375 px`, async ({ page }) => {
    test.setTimeout(60_000 + routen.length * 10_000);
    await page.addInitScript(() => sessionStorage.setItem('startbild-gezeigt', '1'));
    await anmelden(page, PRAXISKONTEN[konto]!);
    for (const route of routen) {
      const pfad = route.pfad.replaceAll('{heute}', heute);
      await wechseln(page, pfad);
      expect.soft(await axeVerstoesse(page), `axe auf ${pfad}`).toEqual([]);
      expect.soft(await page.evaluate(kleineZiele), `Ziele unter 44 px auf ${pfad}`).toEqual([]);
      const ueberbreit = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect.soft(ueberbreit, `Querrollen auf ${pfad}`).toBeLessThanOrEqual(2);
    }
  });
}
