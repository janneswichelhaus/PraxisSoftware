import { expect, test } from '@playwright/test';

/**
 * Die Reiter und Ansichten von Organisation in einem echten Browser (ORG-001).
 *
 * Die Komponententests prüfen, was wo steht. Hier geht es um das, was jsdom
 * nicht misst: ob Reiter und Ansichten bei 375 px ohne waagerechtes Scrollen
 * der Seite auskommen und Tippziele von 44 px haben.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/organisation.html';

for (const breite of [375, 1280]) {
  test(`öffnet Team → Mitarbeitende mit fünf Reitern und den Ansichten darunter (${breite} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: breite, height: 800 });
    await page.goto(PRUEFSEITE);

    const menue = page.getByRole('navigation', { name: 'Bereich Organisation' });
    for (const reiter of ['Eingang', 'Team', 'Radflotte', 'Bibliothek', 'Praxis']) {
      await expect(menue.getByRole('link', { name: reiter, exact: true })).toHaveCount(1);
    }
    await expect(menue.getByRole('link', { name: 'Team', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const ansichten = page.getByRole('navigation', { name: 'Ansichten' });
    await expect(ansichten.getByRole('link', { name: 'Mitarbeitende' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const ansicht of ['Arbeitszeit', 'Urlaub', 'Zeitkonto', 'Erstattungen']) {
      const link = ansichten.getByRole('link', { name: ansicht, exact: true });
      await expect(link).toHaveCount(1);
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole('heading', { name: 'Mitarbeitende' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mitarbeiter:in anlegen' })).toBeVisible();
    await expect(menue.getByText('Vorschau')).toHaveCount(0);

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });
}

test('zeigt einem reinen Trainingskonto Organisation ohne Mitarbeiterliste (ORG-001)', async ({
  page,
}) => {
  // Seit ORG-001 hat die Trainingsbetreuung Organisation mit Eingang, Team
  // (die eigenen Zeiten) und Bibliothek - die Mitarbeiterliste liest sie
  // nicht (`app.is_staff()`).
  await page.goto(`${PRUEFSEITE}?rolle=trainer`);
  await expect(page.getByRole('link', { name: 'Training' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Organisation' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mitarbeitende' })).toHaveCount(0);
});
