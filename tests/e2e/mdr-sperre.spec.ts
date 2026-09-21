import { expect, test } from '@playwright/test';

/**
 * Die MDR-Sperre in einem echten Browser (ANN-089, ADR-006 Punkt 6 und 13).
 *
 * Die Komponententests zeigen, **dass** an einer klassifizierten Adresse die
 * Sperre steht und keine Funktion. Was sie nicht zeigen: ob die Auskunft auf
 * einem 375 px breiten Telefon lesbar bleibt, statt waagerecht überzulaufen —
 * jsdom misst nichts. Dafür ist diese Prüfung da; die Adresse selbst liegt
 * hinter der Anmeldung, und in der Cloud-Entwicklungsumgebung läuft dort kein
 * GoTrue (CLAUDE.md, „Cloud-Umgebung").
 */

const PRUEFSEITE = '/tests/e2e/fixtures/mdr-sperre.html';

test.describe('MDR-Sperre', () => {
  test('nennt die Klassifikation, die Fundstelle und den Rueckweg', async ({ page }) => {
    await page.goto(PRUEFSEITE);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Die Kennung steht ausgeschrieben da: Wer die Adresse aufruft, soll den
    // Begriff finden, unter dem die Entscheidung in ADR-006 und im Register
    // geführt wird.
    await expect(page.getByText(/MDR_REVIEW_REQUIRED/)).toBeVisible();
    await expect(page.getByText(/Ein Feature-Flag ersetzt diese Prüfung nicht/)).toBeVisible();
    await expect(page.getByText('Grundlage')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zur Übersicht' })).toBeVisible();
  });

  test('bleibt bei 375 px lesbar und laeuft nicht waagerecht ueber', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(PRUEFSEITE);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);

    // Der Rueckweg ist ein Tippziel nach der Oberflaechen-Checkliste - er ist
    // das Einzige, was auf dieser Seite zu bedienen ist.
    const kasten = await page.getByRole('link', { name: 'Zur Übersicht' }).boundingBox();
    expect(kasten!.height).toBeGreaterThanOrEqual(44);
  });
});
