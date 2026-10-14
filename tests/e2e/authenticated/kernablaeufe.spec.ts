import { expect, test, type Locator } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  fensterSchliessen,
  tagImFenster,
  terminKachel,
  terminUeberOberflaeche,
  zeitImLauf,
} from './helpers';

/**
 * Restbefunde der Praxis-Prüfung (Kernabläufe in `docs/product/kernablaeufe.md`)
 * gegen den echten Stack, bei 375 px.
 *
 * Gezählt wird, was die Software verlangt: Tipps (Berührungen, ohne getippten
 * Text). K3 und K6 zählt die Prüfseite in `tests/e2e/besuch.spec.ts`; hier
 * stehen die Abläufe, die über Kalender und Bibliothek gehen.
 *
 * Wie in den übrigen Spezifikationen belegt jeder Lauf einen eigenen Tag: Ein
 * abgesagter Termin lässt sich fachlich nicht entfernen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();
const TELEFON = { width: 375, height: 812 };

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    get tipps() {
      return tipps;
    },
  };
}

test('K9: Absage am Telefon in höchstens vier Tipps, Grund ohne Vorbelegung', async ({ page }) => {
  const tag = tagImFenster(TAGESFENSTER.kernablaeufe, LAUF);
  await anmelden(page, KONTEN.office);
  const id = await terminUeberOberflaeche(page, {
    tag,
    von: zeitImLauf(LAUF),
    standortAbwarten: true,
  });
  await fensterSchliessen(page);
  await page.setViewportSize(TELEFON);
  await page.getByRole('button', { name: 'Terminpanel schließen' }).click();

  // Ausgangslage: der Kalendertag mit dem Termin, das Telefon klingelt.
  const z = zaehler();
  await z.tippe(terminKachel(page, id));
  const panel = page.locator('section[aria-labelledby="terminpanel-titel"]');
  await z.tippe(panel.getByRole('button', { name: 'Termin absagen' }));
  const gruende = panel.getByRole('group', { name: 'Absagegrund' });
  for (const chip of await gruende.getByRole('button').all()) {
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
  }
  await z.tippe(gruende.getByRole('button', { name: 'Patient:in hat abgesagt' }));
  await z.tippe(panel.getByRole('button', { name: 'Ja, Termin absagen' }));
  // Der abgesagte Termin fällt aus dem Standardfilter; die Bestätigung trägt die Seite.
  await expect(page.getByRole('status').filter({ hasText: 'Termin abgesagt' })).toBeVisible();

  test.info().annotations.push({ type: 'K9', description: `${z.tipps} Tipps (vorher 7)` });
  expect(z.tipps).toBeLessThanOrEqual(4);

  // Kein waagerechtes Scrollen am Telefon.
  const ueberbreit = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(ueberbreit).toBe(false);
});

test('Übung aus der Bibliothek in den Plan: zwei Tipps bis zum Plan, vier bis zugewiesen', async ({
  page,
}) => {
  await anmelden(page, KONTEN.therapist);
  await page.setViewportSize(TELEFON);
  await page.goto('/uebungen');
  // Ausgangslage: die Übung ist gefunden und offen.
  await page.locator('main a[href^="/uebungen/"]').first().click();
  const titel = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  expect(titel).not.toBe('');

  const z = zaehler();
  await z.tippe(page.getByRole('button', { name: 'Zu einem Plan' }));
  const fenster = page.getByRole('dialog', { name: 'Zu einem Übungsplan' });
  await fenster.getByLabel('Für wen?').fill('Mustermann');
  await z.tippe(fenster.getByRole('option', { name: /Max Mustermann/ }));

  await expect(page).toHaveURL(new RegExp(`/patienten/${PATIENTEN.max}/plaene/`));
  expect(z.tipps).toBeLessThanOrEqual(2);

  await z.tippe(page.getByRole('button', { name: 'Zuweisen' }));
  await z.tippe(
    page.getByRole('dialog', { name: 'Plan zuweisen' }).getByRole('button', {
      name: 'Zuweisen',
    }),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);

  test.info().annotations.push({
    type: 'Bibliothek',
    description: `${z.tipps} Tipps bis zugewiesen (vorher ≈ 9 + Suche)`,
  });
  expect(z.tipps).toBeLessThanOrEqual(4);
});
