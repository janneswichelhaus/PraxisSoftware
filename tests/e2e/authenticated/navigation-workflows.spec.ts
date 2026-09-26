import { expect, test, type Page } from '@playwright/test';
import { KONTEN, anmelden } from './helpers';

/**
 * Die Arbeitsbereiche auf einem schmalen Display.
 *
 * Der Umbau auf sechs Arbeitsbereiche ist mobilrelevant: Auf dem Telefon
 * ersetzt eine feste Tableiste am unteren Rand die seitliche Navigation, und
 * mehr als fünf Ziele passen dort nicht nebeneinander. Was nicht passt, rückt
 * hinter „Mehr" auf die Bereichsübersicht — ein Bereich, der dort verloren
 * geht, wäre auf dem Telefon unerreichbar.
 *
 * Diese Prüfung läuft bewusst hier und nicht als Komponententest: jsdom kennt
 * keine Breiten, kein Umbrechen und kein Überlaufen. Das Projekt
 * `authenticated` läuft auf Desktop Chrome, deshalb setzt diese Datei das
 * Sichtfenster selbst auf 375 px — die Breite, die `PROJECT_PRINCIPLES.md` und
 * `CLAUDE.md` als Prüfmaß nennen.
 *
 * Ausschließlich synthetische Seed-Konten (PROJECT_PRINCIPLES.md 3.1).
 */

const SCHMAL = { width: 375, height: 812 };

test.use({ viewport: SCHMAL });

/** Breitester Punkt der Seite gegen das Sichtfenster. */
async function scrolltWaagerecht(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.describe('Arbeitsbereiche auf schmalen Displays', () => {
  test('haelt jeden Arbeitsbereich erreichbar - notfalls hinter „Mehr"', async ({ page }) => {
    await anmelden(page, KONTEN.owner);

    // Seitliche Navigation und Tableiste tragen denselben Namen; welche von
    // beiden im Baum steht, entscheidet die Breite. Bei 375 px ist es die
    // Leiste am unteren Rand - `:visible` waehlt sie eindeutig aus.
    const tableiste = page.locator('nav[aria-label="Arbeitsbereiche"]:visible');
    await expect(tableiste).toBeVisible();

    // Hoechstens fuenf Ziele: vier Bereiche plus „Mehr". Mehr Daumenziele
    // nebeneinander sind bei 375 px nicht sicher zu treffen.
    const ziele = tableiste.getByRole('link');
    await expect(ziele).toHaveCount(5);
    await expect(tableiste.getByRole('link', { name: 'Mehr' })).toBeVisible();

    // Die Bereichsuebersicht hinter „Mehr" fuehrt alle sechs Bereiche - auch
    // die vier, die schon in der Leiste stehen. Niemand muss wissen, welcher
    // Bereich gerade aus der Leiste gefallen ist.
    await tableiste.getByRole('link', { name: 'Mehr' }).click();
    await expect(page).toHaveURL(/\/bereiche$/);
    const uebersicht = page.getByRole('main');
    // Angeheftet an den Anfang des zugaenglichen Namens: dahinter steht auf
    // der Bereichsuebersicht noch die Leitfrage.
    for (const bereich of [
      /^Übersicht/,
      /^Kalender/,
      /^Patient:innen/,
      /^Kommunikation/,
      /^Organisatorisches/,
      /^Abrechnung/,
    ]) {
      await expect(uebersicht.getByRole('link', { name: bereich })).toBeVisible();
    }
  });

  test('laeuft ohne waagerechtes Scrollen', async ({ page }) => {
    await anmelden(page, KONTEN.owner);

    // Die Seiten mit den meisten nebeneinanderliegenden Elementen: die
    // Bereichsuebersicht, das laengste Untermenue (Organisatorisches, mit
    // offener Vorschau) und der Kalender.
    for (const pfad of ['/', '/bereiche', '/praxis/team', '/betrieb/flotte', '/kalender']) {
      await page.goto(pfad);
      await expect(page.getByRole('main')).toBeVisible();
      expect(await scrolltWaagerecht(page), `${pfad} scrollt waagerecht`).toBe(false);
    }
  });

  test('fuehrt die angebundene Mitarbeiterverwaltung unter Organisatorisches', async ({ page }) => {
    await anmelden(page, KONTEN.owner);
    await page.goto('/praxis/team');

    // Das Untermenue gehoert zum Bereich Organisatorisches, und
    // „Mitarbeitende" ist darin der angebundene Punkt - nicht als Vorschau
    // gekennzeichnet.
    const untermenue = page.getByRole('navigation', { name: 'Bereich Organisatorisches' });
    const mitarbeitende = untermenue.getByRole('link', { name: 'Mitarbeitende' });
    await expect(mitarbeitende).toHaveAttribute('aria-current', 'page');
    await expect(mitarbeitende).not.toContainText('Vorschau');
    await expect(page.getByRole('heading', { name: 'Mitarbeitende' })).toBeVisible();

    // Gegenprobe: die Radflotte im selben Menue ist gekennzeichnete Vorschau
    // und steht eingeklappt hinter „Vorschau" (UX-002h).
    await expect(untermenue.getByRole('link', { name: /Radflotte/ })).toHaveCount(0);
    await untermenue.getByRole('button', { name: /^Vorschau/ }).click();
    await expect(untermenue.getByRole('link', { name: /Radflotte/ })).toContainText('Vorschau');
  });
});
