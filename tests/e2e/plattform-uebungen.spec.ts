import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Der Plan dort, wo trainiert wird, im echten Browser (UEB-EPIC-003).
 *
 * Die Komponententests prüfen Inhalt und Wege, `pnpm test:db` die Regeln am
 * Server. Hier geht es um das, was jsdom nicht misst: kein waagerechtes
 * Scrollen bei 375 px mit langen Namen, große Tippziele in der
 * Durchführungsansicht („ein Finger, verschwitzt", IDEA-ORG-003), die
 * Prüfung mit axe und das Druckbild des Blatts ohne Bedienelemente.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform-uebungen.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/**
 * Die Hauptknöpfe einer Ansicht: sichtbare Knöpfe und Links auf der
 * Hauptfarbe (Handoff 2026-10-24, Abschnitt 8: genau einer je Ansicht).
 */
async function hauptknoepfe(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'bg-accent';
    document.body.append(probe);
    const hauptfarbe = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [...document.querySelectorAll<HTMLElement>('button, a')]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .filter((el) => getComputedStyle(el).backgroundColor === hauptfarbe)
      .map((el) => (el.textContent ?? '').trim());
  });
}

async function axeVerstoesse(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof AxeCore }).axe;
    const ergebnis = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return ergebnis.violations.map(
      (v) => `${v.id}: ${v.help} – ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`,
    );
  });
}

test.describe('Übungen auf der Plattform', () => {
  for (const breite of [375, 1280]) {
    test(`Reiter Übungen mit Plan und Übungstagen bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=uebungen`);
      await expect(page.getByRole('heading', { level: 1, name: 'Übungen' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Weiter üben' })).toBeVisible();
      const tag = page.getByRole('button', { name: 'Dienstag' });
      expect((await tag.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Durchführung im Vollbild bis zur Endseite bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      // Der Server nimmt jeden Haken und das Ende an (wie `ohne-netz.spec.ts`).
      await page.route('**/rest/v1/rpc/sync_platform_exercise_session', async (route) => {
        const daten = route.request().postDataJSON() as { p_session_id: string };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            session_id: daten.p_session_id,
            status: 'ok',
            note_dropped: false,
          }),
        });
      });
      await page.goto(`${PRUEFSEITE}?seite=einheit`);
      await expect(
        page.getByRole('heading', { level: 1, name: /^Am Treppengeländer/ }),
      ).toBeVisible();
      // Vollbild: keine Reiterleiste, keine Navigation des Gerüsts (Handoff 5.3).
      await expect(page.locator('nav')).toHaveCount(0);
      const erster = page.getByRole('button', { name: /^1\. Durchgang/ });
      await expect(erster).toHaveAttribute('aria-pressed', 'true');
      expect((await erster.boundingBox())!.height).toBeGreaterThanOrEqual(64);
      // Der Hauptknopf steht fest unten im Bild, 56 hoch.
      const weiter = page.getByRole('button', { name: 'Nächste Übung' });
      const box = (await weiter.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(56);
      expect(box.y + box.height).toBeLessThanOrEqual(800);
      expect(await hauptknoepfe(page)).toEqual(['Nächste Übung']);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      // Pause als Ring in der Zeile des nächsten Durchgangs.
      await page.getByRole('button', { name: /^2\. Durchgang/ }).click();
      await expect(page.getByRole('button', { name: /^3\. Durchgang/ })).toContainText(
        'Pause · 45 Sekunden',
      );
      expect(await axeVerstoesse(page)).toEqual([]);

      await weiter.click();
      await expect(page.getByRole('heading', { level: 1, name: /^Gelbes Band/ })).toBeFocused();
      await page.getByRole('button', { name: 'Nächste Übung' }).click();
      await page.getByRole('button', { name: 'Zum Abschluss' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Einheit beenden' })).toBeVisible();
      // Der Klick auf „Zum Abschluss“ beendet nichts: Der Knopf darunter wartet.
      await expect(page.getByRole('button', { name: 'Einheit beenden' })).toBeEnabled();
      expect(await hauptknoepfe(page)).toEqual(['Einheit beenden']);
      // Die Skala: Stufen 48 hoch, 8 Abstand, zwei Reihen 0 bis 5 und 6 bis 10 (Handoff 5.4, 6).
      const stufen = page
        .getByRole('group', { name: 'Wie anstrengend war die Einheit?' })
        .locator('label');
      const [null_, eins, sechs] = await Promise.all(
        [0, 1, 6].map(async (i) => (await stufen.nth(i).boundingBox())!),
      );
      expect(null_!.height).toBeGreaterThanOrEqual(48);
      expect(eins!.x - (null_!.x + null_!.width)).toBeGreaterThanOrEqual(8);
      expect(sechs!.y).toBeGreaterThan(null_!.y + null_!.height);
      expect(sechs!.x).toBeCloseTo(null_!.x, 0);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      await page.getByRole('button', { name: 'Einheit beenden' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Gespeichert' })).toBeVisible();
      expect(await hauptknoepfe(page)).toEqual(['Zur Übersicht']);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Diese Woche: Termine und Übungstage bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=woche`);
      await expect(page.getByRole('heading', { name: 'Diese Woche' })).toBeVisible();
      await expect(page.getByText('Übungstag').first()).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Plan als Blatt auf der Plattform und in der Praxis bei ${breite} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      for (const art of ['blatt', 'praxisblatt']) {
        await page.goto(`${PRUEFSEITE}?seite=${art}`);
        await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
        expect(await ueberlaeuft(page)).toBe(false);
        expect(await axeVerstoesse(page)).toEqual([]);
      }
    });
  }

  for (const schrift of ['normal', 'sehr-gross'] as const) {
    test(`Durchführung bei 188 px (200 %), Schrift „${schrift}“: kein waagerechtes Rollen, Fuß am Ende`, async ({
      page,
    }) => {
      await page.addInitScript((wert) => {
        if (wert !== 'normal') window.localStorage.setItem('plattform-schriftgroesse', wert);
      }, schrift);
      await page.setViewportSize({ width: 188, height: 406 });
      await page.goto(`${PRUEFSEITE}?seite=einheit`);
      await expect(
        page.getByRole('heading', { level: 1, name: /^Am Treppengeländer/ }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      // Unter 23rem rollen Kopf und Fuß mit (Handoff, Abschnitt 4).
      const fuss = page.getByRole('button', { name: 'Nächste Übung' });
      expect(await fuss.evaluate((el) => getComputedStyle(el.closest('.sticky')!).position)).toBe(
        'static',
      );
      await page.getByRole('button', { name: 'Nächste Übung' }).click();
      await page.getByRole('button', { name: 'Nächste Übung' }).click();
      await page.getByRole('button', { name: 'Zum Abschluss' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Einheit beenden' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      // Die Enden der Skala stehen untereinander; „keine“ bricht nicht (BEF-214).
      const keine = (await page.getByText('0 = keine', { exact: true }).boundingBox())!;
      const staerkste = (await page.getByText(/^10 = stärkste/).boundingBox())!;
      expect(staerkste.y).toBeGreaterThanOrEqual(keine.y + keine.height - 1);
      const zeile = await page
        .getByText('0 = keine', { exact: true })
        .evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      expect(keine.height).toBeLessThan(zeile * 1.5);
    });
  }

  test('Netz weg mitten in der Sitzung: üben, beenden, Endseite „auf diesem Gerät“ (BEF-210, BEF-211)', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=uebungen`);
    await expect(page.getByRole('link', { name: 'Weiter üben' })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Weiter üben' }).click();
    // Die Gerätelesungen halten ohne Netz nicht an.
    await expect(
      page.getByRole('heading', { level: 1, name: /^Am Treppengeländer/ }),
    ).toBeVisible();
    await expect(
      page.getByText('Ohne Verbindung – Ihre Haken liegen auf diesem Gerät.'),
    ).toBeVisible();
    await page.getByRole('button', { name: /^2\. Durchgang/ }).click();
    await page.getByRole('button', { name: 'Nächste Übung' }).click();
    await page.getByRole('button', { name: 'Nächste Übung' }).click();
    await page.getByRole('button', { name: 'Zum Abschluss' }).click();
    await page.getByRole('button', { name: 'Einheit beenden' }).click();
    // Das Ende liegt sofort auf dem Gerät, „Wird gespeichert …“ bleibt nicht stehen.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Auf diesem Gerät gespeichert' }),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Keine Verbindung.')).toBeVisible();
  });

  test('Reiter heißt im Training „Training"', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=training`);
    await expect(page.getByRole('heading', { level: 1, name: 'Training' })).toBeVisible();
    await expect(
      page.getByText('Ihre Trainingsbetreuung stellt Ihnen hier Ihren Plan zusammen.'),
    ).toBeVisible();
  });

  test('das Blatt druckt ohne Bedienelemente und ohne Reiterleiste', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?seite=blatt`);
    await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Drucken oder als PDF sichern' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Plattform' })).toBeHidden();
    await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
  });
});
