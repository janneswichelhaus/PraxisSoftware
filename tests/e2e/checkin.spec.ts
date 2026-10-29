import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Check-in und Angaben im echten Browser; Inhalt und Wege prüfen die Komponententests, die Regeln
 * am Server `pnpm test:db`. Hier der geführte Ablauf (Handoff 5.1): Rollen, Stufen ab 44 × 44,
 * genau ein Hauptknopf, axe - und keine Farbe als Bewertung an einem Wert (ADR-006 Punkt 11).
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const SENDEN = '**/rest/v1/rpc/submit_platform_checkin';
const LADEN = '**/rest/v1/rpc/platform_checkins';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Gezeichnete Linien im Inhalt außer dem Pfeil einer Zeile: ein Verlauf als Linie deutete. */
async function linienbilder(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll('main polyline, main path')].filter(
        (linie) => !linie.closest('[data-pfeil]'),
      ).length,
  );
}

/** Bis die Bewegung steht: Beim Seitenwechsel rückt die neue Seite 3rem nach (ANN-663). */
async function bewegungAbwarten(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((bewegung) => bewegung.effect?.getTiming().iterations !== Infinity)
          .every((bewegung) => !bewegung.pending && bewegung.playState !== 'running'),
      ),
    )
    .toBe(true);
}

/** Ist im Fenster eine Fläche breiter als ihr Platz - rollte oder schnitte sie waagerecht? */
async function fensterRolltQuer(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="dialog"] *')].some(
      (el) =>
        !el.closest('.sr-only') &&
        getComputedStyle(el).overflowX !== 'visible' &&
        el.scrollWidth > el.clientWidth + 1,
    ),
  );
}

/**
 * Die Hauptknöpfe einer Ansicht: sichtbare Knöpfe und Links auf der Hauptfarbe außerhalb
 * gesperrter Flächen - ohne die gewählten Stufen, die Schalter sind (Handoff 8: genau einer).
 */
async function hauptknoepfe(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'bg-accent';
    document.body.append(probe);
    const hauptfarbe = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [...document.querySelectorAll<HTMLElement>('button:not([aria-pressed]), a')]
      .filter((el) => el.getBoundingClientRect().height > 0 && !el.closest('[inert]'))
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

/** Was der Server nach dem Senden liefert: beantwortet, der nächste in sieben Tagen. */
function beantwortet() {
  const tag = (tage: number) => {
    const d = new Date();
    d.setDate(d.getDate() + tage);
    return d.toISOString().slice(0, 10);
  };
  return {
    today: tag(0),
    schedule: { interval_days: 7, parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'] },
    due_on: tag(7),
    due: false,
    can_answer: false,
    consent_needed: false,
    last_values: { pain_rest: 4, pain_load: 6, daily_impairment: 2 },
    history: [
      {
        answered_on: tag(0),
        recorded_by_kind: 'self',
        values: { pain_rest: 4, pain_load: 6, daily_impairment: 2 },
      },
    ],
    session_history: [],
  };
}

test.describe('Check-in (TRK-EPIC-001)', () => {
  for (const { breite, hoehe } of [
    { breite: 375, hoehe: 667 },
    { breite: 1280, hoehe: 900 },
  ]) {
    test(`Frage für Frage bis „Angaben senden“ bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: hoehe });
      await page.route(SENDEN, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
      );
      await page.route(LADEN, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(beantwortet()),
        }),
      );
      await page.goto(`${PRUEFSEITE}?seite=checkin-frage`);
      const erste = page.getByRole('dialog', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' });
      await expect(erste).toBeVisible();
      await expect(erste.getByText('Frage 1 von 3', { exact: true })).toBeVisible();
      await expect(
        erste.getByText(
          'Jede Frage ist freiwillig. Lassen Sie offen, was Sie nicht sicher wissen.',
        ),
      ).toBeVisible();
      await expect(erste.getByText(/^Ihre letzte Angabe: 3 am \d{1,2}\.\s\p{L}+/u)).toBeVisible();
      // Jede Stufe ein eigenes Ziel von mindestens 44 × 44 px; am Telefon zwei Reihen.
      const stufen = erste
        .getByRole('group', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' })
        .getByRole('button');
      await expect(stufen).toHaveCount(11);
      for (const stufe of await stufen.all()) {
        const box = (await stufe.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const null_ = (await stufen.nth(0).boundingBox())!;
      const sechs = (await stufen.nth(6).boundingBox())!;
      const weiter = erste.getByRole('button', { name: 'Weiter' });
      if (breite >= 1024) {
        // Am Rechner eine Reihe; „Weiter“ rechts, so breit wie das Wort, mindestens 10rem.
        expect(Math.round(sechs.y)).toBe(Math.round(null_.y));
        const knopf = (await weiter.boundingBox())!;
        const zehn = (await stufen.nth(10).boundingBox())!;
        expect(knopf.width).toBeGreaterThanOrEqual(159.5);
        expect(knopf.width).toBeLessThan(320);
        expect(knopf.x).toBeGreaterThan(zehn.x - knopf.width);
      } else {
        expect(sechs.y).toBeGreaterThan(null_.y + null_.height);
        // Die Frage steht am Telefon (667 hoch) ohne Rollen zwischen Kopf und Fuß.
        expect(
          await erste
            .locator('[tabindex="0"]')
            .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        ).toBe(true);
      }
      await bewegungAbwarten(page);
      expect(await hauptknoepfe(page)).toEqual(['Weiter']);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await fensterRolltQuer(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      await stufen.nth(4).click();
      await expect(stufen.nth(4)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('gewählt: 4')).toHaveCount(1);
      await weiter.click();
      const zweite = page.getByRole('dialog', {
        name: 'Wie stark sind Ihre Schmerzen bei Belastung?',
      });
      await expect(zweite.getByText('Frage 2 von 3', { exact: true })).toBeVisible();
      await expect(zweite.getByRole('button', { name: '← Zurück' })).toBeVisible();
      await expect(zweite.getByRole('button', { name: 'Angaben senden' })).toHaveCount(0);
      // „Weiter“ geht auch ohne Antwort.
      await zweite.getByRole('button', { name: 'Weiter' }).click();

      const letzte = page.getByRole('dialog', {
        name: 'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
      });
      await expect(letzte.getByText('Frage 3 von 3', { exact: true })).toBeVisible();
      await expect(
        letzte.getByText(
          'Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin; sie werden nicht laufend gelesen.',
        ),
      ).toBeVisible();
      for (const nummer of ['112', '116117']) {
        const link = letzte.getByRole('link', { name: `${nummer} anrufen` });
        await expect(link).toHaveAttribute('href', `tel:${nummer}`);
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await bewegungAbwarten(page);
      expect(await hauptknoepfe(page)).toEqual(['Angaben senden']);
      expect(await fensterRolltQuer(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      await letzte.getByRole('button', { name: 'Angaben senden' }).click();
      // Zurück auf der Übersicht: die Rückmeldung mit den Nummern, die Aufgabe ist weg.
      const danke = page
        .getByRole('status')
        .filter({ hasText: 'Danke. Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin.' });
      await expect(danke).toBeVisible();
      await expect(danke.getByRole('link', { name: '116117 anrufen' })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('link', { name: /Check-in beantworten/ })).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Zeile und Dank auf der Übersicht bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=checkin-uebersicht`);
      await expect(page.getByText('3 kurze Fragen', { exact: false })).toBeVisible();
      // Seit Schritt 1e die Hauptsache: der ganze Knopf ist das Ziel.
      const zeile = page.getByRole('link', { name: /Check-in beantworten/ });
      await expect(zeile).toBeVisible();
      expect((await zeile.boundingBox())!.height).toBeGreaterThanOrEqual(56);
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=checkin-danke`);
      // Die Rückmeldung, nicht der Satz der Hauptsache darunter (Schritt 1e).
      const danke = page.getByText(
        /Danke\. Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin/,
      );
      await expect(danke).toBeVisible();
      // Handoff 5.1: 112 und 116117 als `Notrufnummer`, Ziel mindestens 44 hoch.
      for (const nummer of ['112', '116117']) {
        const link = danke.getByRole('link', { name: `${nummer} anrufen` });
        await expect(link).toHaveAttribute('href', `tel:${nummer}`);
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByRole('link', { name: /Check-in beantworten/ })).toHaveCount(0);
    });

    test(`Meine Angaben bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=angaben`);
      await expect(page.getByRole('heading', { level: 1, name: 'Meine Angaben' })).toBeVisible();
      // Je Frage eine Zeile mit dem letzten Wert und seinem Tag, mindestens 72 hoch.
      const ruhe = page.getByRole('link', { name: /^Schmerz in Ruhe\s*, 3 von 10, zuletzt am / });
      await expect(ruhe).toBeVisible();
      expect((await ruhe.boundingBox())!.height).toBeGreaterThanOrEqual(72);
      await expect(page.getByRole('heading', { name: 'Nach den Übungen' })).toBeVisible();
      expect(await linienbilder(page)).toBe(0);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
      // Der Wert steht neben dem Namen; bei 200 % (188 px) passt er nicht mehr und rückt darunter.
      const lage = async () => ({
        name: (await ruhe.getByText('Schmerz in Ruhe', { exact: true }).boundingBox())!,
        wert: (await ruhe.locator('span[aria-hidden="true"]').boundingBox())!,
      });
      const breit = await lage();
      expect(breit.wert.x).toBeGreaterThan(breit.name.x + breit.name.width);
      await page.setViewportSize({ width: 188, height: 900 });
      const schmal = await lage();
      expect(schmal.wert.y).toBeGreaterThan(schmal.name.y + schmal.name.height);
      expect(await ueberlaeuft(page)).toBe(false);
      await page.setViewportSize({ width: breite, height: 900 });

      // Die Seite der Frage: jede Antwort als Zeile mit Balken und Zahl, die jüngste oben.
      await ruhe.click();
      await expect(page.getByRole('heading', { level: 1, name: 'Schmerz in Ruhe' })).toBeVisible();
      const antworten = page
        .getByRole('list', { name: 'Ihre Angaben zu Schmerz in Ruhe' })
        .getByRole('listitem');
      await expect(antworten).toHaveCount(4);
      await expect(antworten.first()).toContainText(': 3');
      await expect(antworten.nth(1)).toContainText('Vertretung');
      expect(await linienbilder(page)).toBe(0);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      // Zurück und zu allen Antworten: Die Tabelle rollt in sich, nicht die Seite.
      await page.getByRole('link', { name: '← Meine Angaben' }).click();
      await page.getByRole('link', { name: 'Alle Antworten als Tabelle' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Alle Antworten' })).toBeVisible();
      const tabelle = page.getByRole('table', { name: /Meine Angaben aus dem Check-in/ });
      await expect(tabelle.getByRole('row', { name: /Schmerzart/ })).toContainText('stechend');
      await expect(page.getByText('Ein Strich heißt: nicht angegeben.')).toHaveCount(2);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Zwischen den Terminen in der Praxis bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=zwischen`);
      await expect(page.getByText('Check-in: alle 7 Tage')).toBeVisible();
      // TRK-006: Check-ins und Einheiten je Größe über die Zeit.
      const checkins = page.getByRole('table', { name: /Angaben aus den Check-ins/ });
      await expect(
        checkins.getByRole('row', { name: /Schmerzmittel in 24 Stunden/ }),
      ).toContainText('nein');
      const einheiten = page.getByRole('table', { name: /Angaben nach den Einheiten/ });
      await expect(einheiten.getByRole('row', { name: /Bewegungssicherheit/ })).toContainText('7');
      // OUT-001: Punktbilder mit nummerierten Ereignissen und Planwechseln.
      const bild = page.getByRole('figure').filter({ hasText: 'Schmerz in Ruhe' }).first();
      await expect(bild).toContainText('Ereignisse: 1 Plan zugewiesen · 2 Erkrankung');
      await expect(bild.locator('polyline, path')).toHaveCount(0);
      await expect(page.getByText('Erkrankung · Erkältung')).toBeVisible();
      // Ein hoher Wert sieht aus wie ein niedriger: keine Farbe als Bewertung.
      const farben = await checkins
        .getByRole('cell')
        .evaluateAll((zellen) => zellen.map((z) => getComputedStyle(z).backgroundColor));
      expect(new Set(farben).size).toBe(1);
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: 'Check-in ändern' }).click();
      await expect(page.getByLabel('Wie oft?')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});

/**
 * Ohne Netz und die Zustände ohne Ablauf (Handoff 5.1): gesperrt heißt gestrichelt mit Satz, ein
 * Leerzustand trägt Titel, Satz und, wo es einen gibt, den Weg.
 */
test.describe('Check-in ohne Netz und ohne Ablauf (Handoff 5.1)', () => {
  test('ohne Netz: Antworten bleiben, „Angaben senden“ gestrichelt gesperrt und mit Satz', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    let gesendet = false;
    await page.route(SENDEN, (route) => {
      gesendet = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
    await page.goto(`${PRUEFSEITE}?seite=checkin-ohne-netz`);
    const letzte = page.getByRole('dialog', {
      name: 'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
    });
    await expect(letzte).toBeVisible();
    await expect(letzte.getByText(/^Keine Verbindung\./)).toBeVisible();
    await expect(letzte.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true');
    const senden = letzte.getByRole('button', { name: 'Angaben senden' });
    await expect(senden).toHaveAttribute('aria-disabled', 'true');
    await expect(senden).toHaveAccessibleDescription(
      'Senden geht wieder mit Verbindung. Ihre Antworten bleiben stehen.',
    );
    await expect(senden).toHaveCSS('border-top-style', 'dashed');
    await expect(senden).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    // Erreichbar, damit der Satz mit dem Knopf vorgelesen wird.
    await senden.focus();
    await expect(senden).toBeFocused();
    await senden.click({ force: true });
    await expect(letzte).toBeVisible();
    expect(gesendet).toBe(false);
    await bewegungAbwarten(page);
    expect(await hauptknoepfe(page)).toEqual([]);
    expect(await fensterRolltQuer(page)).toBe(false);
    expect(await axeVerstoesse(page)).toEqual([]);
  });

  test('im Training: „Außerhalb der Übungen“ mit Dauer und Anstrengung nach einer Wahl', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=checkin-training`);
    const seite = page.getByRole('dialog', { name: 'Außerhalb der Übungen' });
    await expect(seite.getByText('Frage 4 von 4', { exact: true })).toBeVisible();
    const art = seite.getByRole('group', {
      name: 'Was war seit dem letzten Check-in Ihre größte körperliche Belastung außerhalb der Übungen?',
    });
    await expect(art.getByRole('button', { name: 'Sport' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Ganze Zeilen, mindestens 56 hoch (Handoff 3, „Wahlflächen“).
    for (const zeile of await art.getByRole('button').all()) {
      expect((await zeile.boundingBox())!.height).toBeGreaterThanOrEqual(55.5);
    }
    await expect(
      seite.getByLabel('Wie lange hat diese Belastung ungefähr gedauert?', { exact: true }),
    ).toBeVisible();
    await art.getByRole('button', { name: 'nichts Besonderes' }).click();
    await expect(
      seite.getByLabel('Wie lange hat diese Belastung ungefähr gedauert?', { exact: true }),
    ).toHaveCount(0);
    await expect(seite.getByText(/^Ihre Trainingsbetreuung sieht Ihre Angaben/)).toBeVisible();
    await bewegungAbwarten(page);
    expect(await fensterRolltQuer(page)).toBe(false);
    expect(await axeVerstoesse(page)).toEqual([]);
  });

  const ZUSTAENDE = [
    {
      seite: 'checkin-leer',
      titel: 'Zurzeit kein Check-in',
      satz: 'Stellt Ihre Praxis Ihnen Fragen zwischen den Terminen, finden Sie sie hier und auf der Übersicht.',
      weg: null,
    },
    {
      seite: 'checkin-einwilligung',
      titel: 'Ihre Praxis bittet um einen Check-in',
      satz: 'Der Check-in fragt nach Ihrer Gesundheit. Dafür braucht es Ihre Einwilligung.',
      weg: ['Einwilligungen ansehen', '/p/einwilligungen?bereich=training'],
    },
    {
      seite: 'checkin-beantwortet',
      titel: 'Schon beantwortet',
      satz: /^Ihr nächster Check-in ist ab \p{L}+, \d{1,2}\.\s\p{L}+ dran\.$/u,
      weg: ['Meine Angaben', '/p/angaben?bereich=treatment'],
    },
    {
      seite: 'checkin-lesefrist',
      titel: 'Kein Check-in mehr',
      satz: /^Ihre Behandlung ist beendet\. Sie können hier noch bis .+ lesen\.$/,
      weg: ['Meine Angaben', '/p/angaben?bereich=treatment'],
    },
    {
      seite: 'checkin-begleitung',
      titel: 'Check-in für Maximilian Mustermann-Langenscheidt',
      satz: 'Den Check-in beantwortet die Person selbst oder ihre rechtliche Vertretung.',
      weg: null,
    },
  ] as const;

  for (const { seite, titel, satz, weg } of ZUSTAENDE) {
    test(`${seite}: Titel, Satz und Weg unter „Check-in“`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${PRUEFSEITE}?seite=${seite}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Check-in' })).toBeVisible();
      await expect(page.getByRole('link', { name: '← Übersicht' })).toBeVisible();
      await expect(page.getByText(titel, { exact: true })).toBeVisible();
      await expect(page.getByText(satz)).toBeVisible();
      if (weg) {
        await expect(page.getByRole('link', { name: weg[0] })).toHaveAttribute('href', weg[1]);
      } else {
        await expect(page.locator('main').getByRole('link')).toHaveCount(1);
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('beim Laden ein Skelett mit Satz nur für Vorlesesoftware, bei einem Fehler „Erneut versuchen“', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${PRUEFSEITE}?seite=checkin-laden`);
    await expect(page.getByRole('heading', { level: 1, name: 'Check-in' })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toContainText('Ihr Check-in wird geladen');
    await expect(page.locator('main').getByRole('button')).toHaveCount(0);
    await page.goto(`${PRUEFSEITE}?seite=checkin-fehler`);
    await expect(page.getByText('Ihr Check-in konnte nicht geladen werden.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
  });
});

/** Gesperrt bleibt gesperrt, auch mit Maus: keine Fläche unter dem Zeiger, kein Druck (Handoff 6). */
test.describe('Check-in ohne Netz mit Maus', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 900 } });

  test('„Angaben senden“ bleibt unter dem Zeiger und beim Drücken ohne Fläche', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?seite=checkin-ohne-netz`);
    const senden = page.getByRole('button', { name: 'Angaben senden' });
    await expect(senden).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByRole('button', { name: '3' }).and(page.locator('[aria-pressed="true"]')),
    ).toBeVisible();
    await bewegungAbwarten(page);
    await senden.hover();
    await expect(senden).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const box = (await senden.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(senden).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(senden).toHaveCSS('scale', '1');
    await page.mouse.up();
  });
});

test.describe('Assessments im Training (OUT-EPIC-001)', () => {
  for (const breite of [375, 1280]) {
    test(`Messungen, Seitenvergleich und Wiederholung bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=assessments`);
      const tabelle = page.getByRole('table', { name: /Messungen Sprungtests Knie/ });
      await expect(tabelle.getByRole('row', { name: /Einbeinsprung/ })).toContainText(
        'kleinere Seite 86 % der größeren',
      );
      await expect(page.getByText(/Sprungtests Knie · geplant am/)).toBeVisible();
      // Die Tabelle scrollt in sich, nicht die Seite.
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: /Wiederholen wie am/ }).click();
      const formular = page.getByRole('form', { name: 'Assessment festhalten' });
      await expect(formular.getByLabel('Test', { exact: false }).first()).toHaveValue(
        'Sprungtests Knie',
      );
      for (const knopf of await formular.getByRole('button').all()) {
        expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});
