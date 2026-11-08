import { expect, test, type Page, type Route } from '@playwright/test';
import { axeVerstoesse, kleineZiele } from '../../../scripts/bildstrecke/barrierefreiheit.mjs';
import { IDS, ROUTEN, type Route as Seite } from '../../../scripts/bildstrecke/routen.mjs';
import { anmelden } from './helpers';

// Zustände ohne eigene Route (G17): jede Praxisseite beim Laden und nach gescheitertem Abruf, dazu
// Fenster ohne Adresse, bei 375 px mit Touch. Angehalten werden nur Datenabrufe, nie die Anmeldung;
// den geladenen Stand prüft `barrierefreiheit.spec.ts`.
const PRAXISKONTEN: Record<string, string> = {
  owner: 'jannes.test@praxis.invalid',
  therapist: 'anna.beispiel@praxis.invalid',
  trainer: 'tom.training@praxis.invalid',
};

const DATENABRUF = /\/(rest|functions|storage)\/v1\//;
const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

type Zustand = 'laden' | 'fehler';

/** Fenster ohne eigene Adresse: Seite, Auslöser und der Name des Fensters (synthetische Daten). */
const FENSTER: { pfad: string; ausloeser: string | RegExp; fenster: string | RegExp }[] = [
  {
    pfad: `/termine/${IDS.terminMax}`,
    ausloeser: 'Aktionen …',
    fenster: 'Max Mustermann',
  },
  { pfad: `/betrieb/flotte/rad/${IDS.rad}`, ausloeser: 'Freigeben', fenster: /freigeben\?$/ },
  { pfad: `/patienten/${IDS.erika}/ernaehrung`, ausloeser: /Einträge/, fenster: /\d{2}\.\d{2}\./ },
  { pfad: '/uebungen/vorlagen', ausloeser: /Übungen ·/, fenster: /./ },
  {
    pfad: `/betrieb/flotte/nachrichten/${IDS.threadPanne}`,
    ausloeser: 'Karte von Anna Beispiel',
    fenster: 'Anna Beispiel',
  },
  {
    pfad: `/betrieb/flotte/nachrichten/${IDS.threadPanne}`,
    ausloeser: 'Handlungen zur Nachricht von Anna Beispiel',
    fenster: 'Nachricht von Anna Beispiel',
  },
];

// Je Route ein Konto, das sie sieht - Zustände hängen am Baustein, nicht an der Rolle.
const gruppen = new Map<string, { konto: string; routen: Seite[] }>();
for (const route of ROUTEN) {
  const konto = Object.keys(PRAXISKONTEN).find((k) => route.konten.includes(k));
  if (!konto) continue;
  const schluessel = `${konto} · ${route.bereich}`;
  const gruppe = gruppen.get(schluessel) ?? { konto, routen: [] };
  gruppe.routen.push(route);
  gruppen.set(schluessel, gruppe);
}

/**
 * Wechselt die Seite in der Anwendung, ohne Neuladen, über eine leere Adresse, damit auch dieselbe
 * Route neu aufbaut. Was schon im Zwischenspeicher liegt, zeigt sich als veralteter Stand.
 */
async function wechseln(page: Page, pfad: string) {
  await page.evaluate(async (ziel) => {
    const idx = ((window.history.state as { idx?: number } | null)?.idx ?? 0) + 1;
    window.history.pushState({ usr: null, key: String(idx), idx }, '', '/__zustand');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state as unknown }));
    await new Promise((fertig) => setTimeout(fertig, 50));
    window.history.pushState({ usr: null, key: String(idx + 1), idx: idx + 1 }, '', ziel);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state as unknown }));
    window.scrollTo(0, 0);
  }, pfad);
}

/**
 * Hält jeden Datenabruf an (`laden`) oder weist ihn mit 500 ab (`fehler`; 503 wiederholt der
 * Client selbst). Das Ergebnis gibt die angehaltenen Anfragen frei.
 */
async function zustandHerstellen(page: Page, zustand: Zustand) {
  const angehalten: Route[] = [];
  await page.route(DATENABRUF, async (anfrage) => {
    if (zustand === 'laden') {
      angehalten.push(anfrage);
      return;
    }
    await anfrage.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Dienst nicht erreichbar', code: 'PGRST000' }),
    });
  });
  return async () => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await Promise.all(angehalten.map((anfrage) => anfrage.continue().catch(() => undefined)));
  };
}

async function pruefen(page: Page, pfad: string, zustand: Zustand) {
  // Ein Fehler zeigt sich ohne Wiederholung (`retry: false`) sofort, Laden steht von Anfang an.
  await page.waitForTimeout(zustand === 'fehler' ? 1_200 : 600);
  const ort = `${zustand} auf ${pfad}`;
  expect.soft(await axeVerstoesse(page), `axe ${ort}`).toEqual([]);
  expect.soft(await page.evaluate(kleineZiele), `Ziele unter 44 px ${ort}`).toEqual([]);
  const ueberbreit = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect.soft(ueberbreit, `Querrollen ${ort}`).toBeLessThanOrEqual(2);
}

test.describe.configure({ mode: 'parallel' });
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

for (const zustand of ['laden', 'fehler'] as const) {
  for (const [name, { konto, routen }] of gruppen) {
    test(`${zustand} · ${name}: axe, Ziele ab 44 px, kein Querrollen bei 375 px`, async ({
      page,
    }) => {
      test.setTimeout(60_000 + routen.length * 8_000);
      await page.addInitScript(() => sessionStorage.setItem('startbild-gezeigt', '1'));
      await anmelden(page, PRAXISKONTEN[konto]!);
      await page.waitForLoadState('networkidle');
      for (const route of routen) {
        const pfad = route.pfad.replaceAll('{heute}', heute);
        const freigeben = await zustandHerstellen(page, zustand);
        await wechseln(page, pfad);
        await pruefen(page, pfad, zustand);
        await freigeben();
      }
    });
  }
}

test('Fenster ohne eigene Adresse: axe, Ziele ab 44 px, kein Querrollen bei 375 px', async ({
  page,
}) => {
  test.setTimeout(60_000 + FENSTER.length * 10_000);
  await page.addInitScript(() => sessionStorage.setItem('startbild-gezeigt', '1'));
  await anmelden(page, PRAXISKONTEN.owner!);
  for (const { pfad, ausloeser, fenster } of FENSTER) {
    await page.goto(pfad);
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: ausloeser, exact: typeof ausloeser === 'string' })
      .first()
      .click();
    const offen = page.getByRole('dialog', { name: fenster }).last();
    await expect(offen, `Fenster nach „${String(ausloeser)}“ auf ${pfad}`).toBeVisible();
    await page.waitForTimeout(400);
    const ort = `im Fenster nach „${String(ausloeser)}“ auf ${pfad}`;
    expect.soft(await axeVerstoesse(page), `axe ${ort}`).toEqual([]);
    expect.soft(await page.evaluate(kleineZiele), `Ziele unter 44 px ${ort}`).toEqual([]);
    const ueberbreit = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect.soft(ueberbreit, `Querrollen ${ort}`).toBeLessThanOrEqual(2);
  }
});
