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

/** Sichtbarer Text unter 18 px - ohne Inhalte nur für Vorlesesoftware. */
async function kleineSchrift(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    const gehen = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let knoten = gehen.nextNode(); knoten; knoten = gehen.nextNode()) {
      const text = knoten.textContent?.trim();
      const element = knoten.parentElement;
      if (!text || !element || element.closest('svg, .sr-only, [aria-hidden="true"]')) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const groesse = parseFloat(getComputedStyle(element).fontSize);
      if (groesse < 17.9) funde.push(`${groesse}px: ${text.slice(0, 40)}`);
    }
    return funde;
  });
}

/** Bedienelemente unter 44 px Höhe im Inhalt und in einem Fenster. */
async function kleineZiele(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const funde: string[] = [];
    for (const ziel of document.querySelectorAll<HTMLElement>(
      'main a, main button, [role="dialog"] a, [role="dialog"] button',
    )) {
      const box = ziel.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < 43.5) {
        funde.push(`${Math.round(box.height)}px: ${(ziel.textContent ?? '').trim().slice(0, 40)}`);
      }
    }
    return funde;
  });
}

/**
 * Die Hauptknöpfe im Inhalt des Reiters: Knöpfe des Systems (`h-12`) mit der
 * Fläche der Hauptfarbe oder als Knopf `marke` auf Tiefgrün (die Vorschau) -
 * nicht die gewählten Tage der Wochenleiste, die auch in der Hauptfarbe stehen.
 */
async function hauptknoepfeImReiter(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main a[class~="h-12"], main button[class~="h-12"]')]
      .filter(
        (k) =>
          k.classList.contains('bg-accent') ||
          (k.classList.contains('bg-surface') && k.classList.contains('text-surface-inverse')),
      )
      .map((k) => (k.textContent ?? '').trim()),
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

    test(`Plan als PDF bei ${breite} px (Schritt 2d): Titel, Satz, ein Hauptknopf, Schrift, Ziele`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=blatt`);
      const titel = page.getByRole('heading', { level: 1, name: 'Plan als PDF' });
      await expect(titel).toBeVisible();
      await expect(
        page.getByText(
          'Drucken Sie den Plan aus oder sichern Sie ihn als PDF. Die Datei bleibt auf Ihrem Gerät.',
        ),
      ).toBeVisible();
      const blatt = page.getByRole('article', { name: 'Planblatt' });
      await expect(blatt.getByText(/^Stand \d/)).toBeVisible();
      await expect(blatt.getByText(/^Ihre Übungstage: /)).toBeVisible();
      expect(await hauptknoepfe(page)).toEqual(['Drucken oder als PDF sichern']);
      expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
      expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
      // Am Rechner steht der Knopf rechts neben Titel und Satz, am Telefon
      // darunter über die ganze Breite (Handoff 5.7).
      const knopf = await page
        .getByRole('button', { name: 'Drucken oder als PDF sichern' })
        .boundingBox();
      const kopf = await titel.boundingBox();
      if (!knopf || !kopf) throw new Error('Titel oder Knopf ohne Maße');
      if (breite >= 1024) expect(knopf.x).toBeGreaterThan(kopf.x + kopf.width);
      else expect(knopf.y).toBeGreaterThan(kopf.y + kopf.height);
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

  test('Rechner: Plan links, Vorschau rechts; am Telefon die Vorschau oben', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=uebungen&lage=heute`);
    const vorschau = page.getByRole('region', { name: 'Ihre Übungen für heute' });
    const plan = page.getByRole('heading', { level: 2, name: /^Heimprogramm/ });
    await expect(vorschau).toBeVisible();
    const rechts = (await vorschau.boundingBox())!;
    const links = (await plan.boundingBox())!;
    expect(rechts.x).toBeGreaterThan(links.x + links.width - 1);
    expect(rechts.width).toBeLessThanOrEqual(461);
    // Der Knopf so breit wie sein Text, nicht über die ganze Karte.
    const knopf = (await vorschau.getByRole('link', { name: 'Übungen beginnen' }).boundingBox())!;
    expect(knopf.width).toBeLessThan(rechts.width - 64);

    await page.setViewportSize({ width: 375, height: 900 });
    const oben = (await vorschau.boundingBox())!;
    const darunter = (await plan.boundingBox())!;
    expect(oben.y + oben.height).toBeLessThan(darunter.y);
  });

  test('Übung zum Nachlesen: Fenster über die ganze Höhe, Fokus am Anfang, große Ziele', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=uebungen&lage=heute`);
    await page.getByRole('button', { name: /^2\. Gelbes Band/ }).click();
    const fenster = page.getByRole('dialog', { name: 'Gelbes Band zum Körper heranziehen' });
    await expect(fenster).toBeVisible();
    await expect(fenster.getByText('Übung 2 von 3')).toBeVisible();
    expect((await fenster.boundingBox())!.height).toBeGreaterThanOrEqual(800);
    // Der Fokus steht vor der Bühne, nicht auf „Schließen“ unten.
    expect(
      await page.evaluate(() => document.activeElement?.hasAttribute('data-autofocus') ?? false),
    ).toBe(true);
    expect(await kleineZiele(page)).toEqual([]);
    expect(await kleineSchrift(page)).toEqual([]);
    expect(await ueberlaeuft(page)).toBe(false);
    expect(await axeVerstoesse(page)).toEqual([]);
    await fenster.getByRole('button', { name: 'Schließen' }).first().click();
    await expect(fenster).toBeHidden();
  });

  test('Übung zum Nachlesen bei 188 px (200 %) und bei „Sehr groß“: kein waagerechtes Rollen (BEF-215)', async ({
    page,
  }) => {
    // Das Fenster trägt seit BEF-215 die Anleitung der Durchführung: „So
    // geht’s“ als Abschnittstitel, große Schritte.
    const fensterOeffnen = async () => {
      await page.goto(`${PRUEFSEITE}?seite=uebungen&lage=heute`);
      await page.getByRole('button', { name: /^2\. Gelbes Band/ }).click();
      const fenster = page.getByRole('dialog', { name: 'Gelbes Band zum Körper heranziehen' });
      await expect(fenster.getByRole('heading', { level: 3, name: 'So geht’s' })).toBeVisible();
    };
    await page.setViewportSize({ width: 188, height: 900 });
    await fensterOeffnen();
    expect(await ueberlaeuft(page)).toBe(false);

    await page.addInitScript(() =>
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross'),
    );
    await page.setViewportSize({ width: 375, height: 900 });
    await fensterOeffnen();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.schrift))
      .toBe('sehr-gross');
    expect(await ueberlaeuft(page)).toBe(false);
    expect(await kleineZiele(page)).toEqual([]);
  });

  test('ohne Netz: „Geht auch ohne Netz.“, die Übungstage gesperrt', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=uebungen&lage=heute`);
    await expect(page.getByRole('region', { name: 'Ihre Übungen für heute' })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText('Geht auch ohne Netz.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Montag' })).toBeDisabled();
    await expect(page.getByText(/Ändern geht wieder mit Verbindung\./)).toBeVisible();
    expect(await axeVerstoesse(page)).toEqual([]);
    await context.setOffline(false);
  });

  test('das Blatt druckt ohne Bedienelemente und ohne Reiterleiste', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?seite=blatt`);
    await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Drucken oder als PDF sichern' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Plattform' })).toBeHidden();
    await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
  });

  test('der Druck (Schritt 2d): nur das Blatt, Marke 40, Text 16, ohne Rahmen der Vorschau', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?seite=blatt`);
    const blatt = page.getByRole('article', { name: 'Planblatt' });
    await expect(blatt).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('heading', { level: 1, name: 'Plan als PDF' })).toBeHidden();
    const marke = blatt.getByRole('img', { name: 'Own Motion' });
    await expect(marke).toHaveCount(1);
    expect((await marke.boundingBox())?.height).toBe(40);
    await expect(blatt.getByText(/^Ihre Übungstage: /)).toHaveCSS('font-size', '16px');
    await expect(blatt.getByRole('heading', { level: 2 })).toHaveCSS('font-size', '28px');
    await expect(blatt.getByRole('heading', { level: 3 }).first()).toHaveCSS('font-size', '20px');
    // Der Rahmen der Vorschau fällt weg: Das Blatt steht an der Kante des Papiers.
    await expect(blatt.locator('xpath=..')).toHaveCSS('border-top-width', '0px');
    await expect(blatt.locator('xpath=..')).toHaveCSS('padding-left', '0px');
    await expect(blatt.locator('xpath=../..')).toHaveCSS('padding-left', '0px');
    // Eine Übung bricht nicht über zwei Seiten.
    await expect(blatt.locator('> ol > li').first()).toHaveCSS('break-inside', 'avoid');
    // Die Spalte des Gerüsts begrenzt das Papier nicht - am Telefon wie am
    // Rechner gleich breit (Design-Review 2d, H2).
    await expect(page.locator('main')).toHaveCSS('max-width', 'none');
  });

  test('Plan als PDF bei 188 px (200 %) und bei „Sehr groß“: kein waagerechtes Rollen (Schritt 2d)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 188, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=blatt`);
    await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
    expect(await ueberlaeuft(page)).toBe(false);

    await page.addInitScript(() =>
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross'),
    );
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=blatt`);
    await expect(page.getByRole('article', { name: 'Planblatt' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.schrift))
      .toBe('sehr-gross');
    expect(await ueberlaeuft(page)).toBe(false);
  });
});

/**
 * Der Reiter in allen Lagen (Schritt 2c, Handoff 2026-10-24, Abschnitte 5.1,
 * 5.6 und 8): Schrift, Ziele, axe und genau ein Hauptknopf bei 375 und 1280
 * px; kein waagerechtes Rollen bei 188 px (200 %) und bei „Sehr groß“. Ob ein
 * Wort ohne Strich bricht (BEF-196), zeigt die Sichtung der Bildstrecke.
 */
const LAGEN: { lage: string; merkmal: RegExp; haupt: number }[] = [
  { lage: 'heute', merkmal: /Ihre Übungen für heute/, haupt: 1 },
  { lage: 'anderer-tag', merkmal: /Nächster Übungstag/, haupt: 1 },
  { lage: 'geuebt', merkmal: /Noch einmal üben/, haupt: 0 },
  { lage: 'erledigt', merkmal: /Heute erledigt/, haupt: 1 },
  { lage: 'ab', merkmal: /^Ab /, haupt: 0 },
  { lage: 'lesefrist', merkmal: /Ihr Plan zum Mitnehmen/, haupt: 1 },
  { lage: 'mehrere', merkmal: /Schulter mobil am Morgen/, haupt: 1 },
  { lage: 'ohne-plan', merkmal: /Noch kein Plan/, haupt: 0 },
  { lage: 'geraet', merkmal: /Die Praxis antwortet gerade nicht/, haupt: 1 },
  { lage: 'fehler', merkmal: /Ihre Übungen lassen sich gerade nicht laden/, haupt: 0 },
  { lage: 'laden', merkmal: /Übungen werden geladen/, haupt: 0 },
  // BEF-218: die Einheit auf dem Gerät - beendet und nur dort gehakt.
  { lage: 'geraet-geuebt', merkmal: /Heute geübt/, haupt: 0 },
  { lage: 'geraet-begonnen', merkmal: /Weiter bei Übung 3/, haupt: 1 },
];

test.describe('Reiter Übungen in allen Lagen (Schritt 2c)', () => {
  for (const { lage, merkmal, haupt } of LAGEN) {
    for (const breite of [375, 1280]) {
      test(`${lage} bei ${breite} px: Schrift, Ziele, axe, ein Hauptknopf`, async ({ page }) => {
        await page.setViewportSize({ width: breite, height: 900 });
        await page.goto(`${PRUEFSEITE}?seite=uebungen&lage=${lage}`);
        await expect(page.getByText(merkmal).first()).toBeAttached();
        await expect(page.getByRole('heading', { level: 1, name: 'Übungen' })).toBeVisible();
        expect(await kleineSchrift(page), 'Schrift unter 18 px').toEqual([]);
        expect(await kleineZiele(page), 'Ziele unter 44 px').toEqual([]);
        expect(await hauptknoepfeImReiter(page)).toHaveLength(haupt);
        expect(await ueberlaeuft(page)).toBe(false);
        expect(await axeVerstoesse(page), 'axe').toEqual([]);
      });
    }

    test(`${lage} bei 188 px (200 %) und bei „Sehr groß“ ohne waagerechtes Rollen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 188, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=uebungen&lage=${lage}`);
      await expect(page.getByText(merkmal).first()).toBeAttached();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.addInitScript(() =>
        window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross'),
      );
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=uebungen&lage=${lage}`);
      await expect(page.getByText(merkmal).first()).toBeAttached();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.schrift))
        .toBe('sehr-gross');
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('Training: Titel „Training“, die Vorschau „Ihr Plan für zu Hause“', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=training&lage=heute`);
    await expect(page.getByRole('heading', { level: 1, name: 'Training' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ihr Plan für zu Hause' })).toBeVisible();
    expect(await axeVerstoesse(page)).toEqual([]);
  });
});
