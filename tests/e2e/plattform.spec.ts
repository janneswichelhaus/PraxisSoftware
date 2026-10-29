import { expect, test, type Page } from '@playwright/test';

/**
 * Plattformzugang im echten Browser (POR-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: kein waagerechtes Scrollen bei 375 px, auch mit langen
 * Adressen, ein QR-Code, der ganz auf den Schirm passt, und Tippziele von
 * 44 px im Gerüst.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Plattform', () => {
  for (const breite of [375, 1280]) {
    test(`Abschnitt "Plattform" und QR laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=abschnitt`);
      await expect(page.getByText('Kein Zugang')).toBeVisible();
      await page.getByRole('button', { name: 'Per Mail einladen' }).click();
      await expect(
        page.getByRole('checkbox', { name: 'Die Person hat mir diese Adresse selbst bestätigt.' }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=abschnitt-aktiv`);
      await expect(page.getByText('Eingerichtet')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sperren' }).first()).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      // POR-005: Vertretungen und das Formular mit dem Wortlaut der Einwilligung.
      await expect(page.getByText('Paula Mustermann-Langenscheidt')).toBeVisible();
      await page.getByRole('button', { name: 'Vertretung einrichten' }).click();
      await expect(page.getByRole('form', { name: 'Vertretung einrichten' })).toBeVisible();
      await page.getByLabel('Name der vertretenden Person').fill('Paula Mustermann-Langenscheidt');
      await expect(page.getByText(/Ich möchte, dass Paula Mustermann-Langenscheidt/)).toBeVisible();
      for (const name of [/^Begleitung/, /^Rechtliche Vertretung/]) {
        const ziel = await page.getByRole('radio', { name }).boundingBox();
        expect(ziel).not.toBeNull();
      }
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=qr`);
      const code = page.getByRole('img', { name: 'Code zum Einlösen der Einladung' });
      await expect(code).toBeVisible();
      const box = await code.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(breite);
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Termine, Wünsche, Rechnungen, Dokumente und Befundbogen laufen bei ${breite} px nicht über (POR-EPIC-002)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      // Die Übersicht trägt den Fragebogen als Hauptsache, den nächsten
      // Besuch und die offene Rechnung (Schritt 1e).
      await page.goto(`${PRUEFSEITE}?seite=geruest`);
      await expect(
        // Die Prüfseite kennt einen vergangenen Termin: „nächsten“, nicht „ersten“.
        page.getByRole('region', { name: 'Fragebogen vor Ihrem nächsten Termin' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Nächster Besuch' })).toBeVisible();
      await expect(page.getByRole('link', { name: /^Rechnung RG-2026-0007/ })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      // Der nächste Termin als Karte, die übrigen als „Weitere Termine“.
      await page.goto(`${PRUEFSEITE}?seite=termine`);
      await expect(page.getByRole('region', { name: /^Besuch / })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Weitere Termine' })).toBeVisible();
      await expect(page.getByText('Änderung angefragt')).toBeVisible();
      const wunschKnopf = await page.getByRole('link', { name: 'Termin wünschen' }).boundingBox();
      expect(wunschKnopf!.height).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);

      // Überholung 6: Wünschen und Absagen führen im Fenster Seite für Seite.
      await page.goto(`${PRUEFSEITE}?seite=wunsch`);
      await expect(page.getByRole('dialog', { name: 'Wann passt es Ihnen?' })).toBeVisible();
      // Die Tageszeiten sind Wahlflächen, mindestens 44 hoch.
      const flaeche = page.getByRole('button', { name: 'Vormittag' });
      expect((await flaeche.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);

      // Das Absagen beginnt auf der Seite des Termins.
      await page.goto(`${PRUEFSEITE}?seite=termin`);
      await page.getByRole('link', { name: 'Termin absagen' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Ausfallhonorar' }).getByText(/kein Ausfallhonorar/),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=rechnungen`);
      await expect(page.getByRole('link', { name: /Rechnung RG-2026-0007.*offen$/ })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=rechnung`);
      await expect(page.getByRole('heading', { name: 'Rechnung RG-2026-0007' })).toBeVisible();
      await expect(page.getByText('420,00 €').first()).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=dokumente`);
      await expect(
        page.getByText('Arztbrief_Orthopaedie_Dr_Beispiel_2026-09.pdf', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /Herunterladen/ }).first()).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=befundbogen`);
      await expect(
        page.getByRole('heading', { name: 'Fragebogen vor dem ersten Termin' }),
      ).toBeVisible();
      // In Schritten mit sichtbarem Fortschritt (ANN-467); „Absenden“ im letzten.
      await expect(page.getByText(/^Schritt 1 von \d+$/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Absenden' })).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);
      while ((await page.getByRole('button', { name: 'Absenden' }).count()) === 0) {
        await page.getByRole('button', { name: 'Weiter' }).click();
      }
      await expect(page.getByRole('button', { name: 'Absenden' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });

    test(`Einlöseseite und Gerüst laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=einladung#code=AbCdEfGhIjKlMnOpQrStUvWxYz012345`);
      await expect(
        page.getByRole('heading', { name: 'Own Motion lädt Sie ein', level: 1 }),
      ).toBeVisible();
      await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
      // Kein Kennwort (ADR-025 Fassung 2, Punkt 13).
      await expect(page.getByLabel(/Kennwort/)).toHaveCount(0);
      // Der Code verlässt die Adresszeile sofort.
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=geruest`);
      // Der Gruß hängt an der Tageszeit (Schritt 1e).
      await expect(
        page.getByRole('heading', { level: 1, name: /^Guten (Morgen|Tag|Abend)/ }),
      ).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Bereich' })).toBeVisible();
      // Seit DRP-EPIC-003 heißt auch die Wortmarke im Kopf „Übersicht“ - jedes Ziel zählt.
      for (const name of ['Behandlung', 'Training', 'Ich', 'Übersicht']) {
        for (const ziel of await page.getByRole('link', { name, exact: true }).all()) {
          expect((await ziel.boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
        }
      }
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=ich`);
      await expect(page.getByRole('button', { name: 'Überall abmelden' })).toBeVisible();
      // POR-007: wer für die Person Zugang hat, mit „Begleitung beenden".
      await expect(page.getByRole('heading', { name: /Wer für Sie Zugang hat/ })).toBeVisible();
      const beenden = await page.getByRole('button', { name: 'Begleitung beenden' }).boundingBox();
      expect(beenden!.height).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);

      // POR-006: „Sie handeln für …" steht über dem Inhalt, der Schalter
      // trennt eigenen Bereich und Begleitung.
      await page.goto(`${PRUEFSEITE}?seite=handeln-fuer`);
      // Seit DR-118 steht im Gerüst auch die (leere) Verbindungszeile als Live-Region.
      await expect(page.getByRole('status').filter({ hasText: 'Sie handeln für' })).toContainText(
        'Sie handeln für Maximilian Mustermann-Langenscheidt',
      );
      const fuer = page.getByRole('link', { name: 'Für Maximilian Mustermann-Langenscheidt' });
      await expect(fuer).toHaveAttribute('aria-current', 'page');
      expect((await fuer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=gesperrt`);
      await expect(page.getByRole('heading', { name: 'Ihr Zugang ist gesperrt' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});
