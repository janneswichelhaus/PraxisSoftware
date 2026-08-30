import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  terminKachel,
  arbeitszeitBestaetigen,
  KONTEN,
  PATIENTEN,
  anmelden,
  detailWert,
} from './helpers';

/**
 * Neue Kalenderdarstellung und Verschieben per Zeigegerät (CAL-006).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Die Zieh-Gesten laufen über echte Maus-Ereignisse; das Ergebnis
 * wird anschließend in der Detailansicht nachgelesen, nicht in der Kachel.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Nächster Mittwoch weit in der Zukunft - im Seed ein Arbeitstag. */
function mittwoch(versatzWochen = 0): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 800 + (LAUF % 120) + versatzWochen * 7);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Volle Stunde in der Seed-Arbeitszeit, je Lauf leicht verschoben. */
function stunde(versatz = 0): string {
  return `${String(8 + ((LAUF + versatz) % 3)).padStart(2, '0')}:00`;
}

async function terminAnlegen(
  page: Page,
  opts: { tag: string; von: string; bis: string; person?: string },
): Promise<string> {
  await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
  await page
    .getByLabel('Behandelnde Person *')
    .selectOption({ label: opts.person ?? 'Anna Beispiel' });
  await page.getByLabel('Terminart *').selectOption('video');
  await page.getByLabel('Datum *').fill(opts.tag);
  await page.getByLabel('Beginn *').fill(opts.von);
  await page.getByLabel('Ende *').fill(opts.bis);
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/**
 * Zieht eine Kachel auf die Mitte eines Ziels.
 *
 * boundingBox liefert Koordinaten im Sichtfenster und scrollt nicht von
 * selbst. Liegt die Kachel unterhalb des Falzes, zeigten die Mauskoordinaten
 * sonst auf eine ganz andere Stelle - genau das machte den Ablauf flatterhaft.
 */
async function ziehen(page: Page, kachel: Locator, ziel: { x: number; y: number }) {
  await kachel.scrollIntoViewIfNeeded();
  const kasten = await kachel.boundingBox();
  if (!kasten) throw new Error('Die Kachel ist nicht sichtbar.');
  await page.mouse.move(kasten.x + kasten.width / 2, kasten.y + 8);
  await page.mouse.down();
  // Zwei Schritte: der erste überschreitet die Schwelle, der zweite zielt.
  await page.mouse.move(kasten.x + kasten.width / 2 + 12, kasten.y + 20);
  await page.mouse.move(ziel.x, ziel.y);
  await page.mouse.up();
}

/**
 * Bestätigt die Rückfrage des Kalenders, falls das Ziel außerhalb der
 * Arbeitszeit liegt. Die Rückfrage selbst hat eigene Tests weiter unten.
 */
async function verschiebenBestaetigen(page: Page) {
  const rueckfrage = page.getByRole('group', { name: 'Außerhalb der Arbeitszeit' });
  await rueckfrage.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await rueckfrage.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Trotzdem verschieben' }).click();
  }
  await expect(page.getByText('Der Termin wird verschoben …')).toHaveCount(0);
}

test.describe('CAL-006: Darstellung', () => {
  test('zeigt in der Tagesansicht eine Spalte je behandelnder Person', async ({ page }) => {
    const tag = mittwoch();

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);

    const gitter = page.getByRole('grid', { name: 'Tagesansicht nach behandelnder Person' });
    await expect(gitter).toBeVisible();
    for (const name of ['Jannes Test', 'Anna Beispiel', 'Tim Teamleitung']) {
      await expect(page.getByRole('gridcell', { name })).toBeVisible();
    }
  });

  test('zeigt in der Wochenansicht sieben Tagesspalten einer Person', async ({ page }) => {
    const tag = mittwoch();

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=woche&datum=${tag}`);

    await expect(
      page.getByRole('grid', { name: 'Wochenansicht einer behandelnden Person' }),
    ).toBeVisible();
    await expect(page.getByRole('gridcell')).toHaveCount(7);

    // In der Woche gibt es kein "Alle": es steht immer genau eine Person im Gitter.
    const auswahl = page.getByLabel('Behandelnde Person');
    await expect(auswahl.getByRole('option', { name: 'Alle' })).toHaveCount(0);
  });

  test('haelt Zeitachse und Spaltenkoepfe beim Blaettern stehen', async ({ page }) => {
    const tag = mittwoch();

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByRole('gridcell', { name: 'Anna Beispiel' })).toBeVisible();

    // Der Kopf ist klebend gesetzt; die Auszeichnung ist Teil der Zusage.
    // Bewusst innerhalb des Gitters gesucht: derselbe Name steht auch in der
    // Personenauswahl darueber.
    const kopf = page
      .getByRole('grid', { name: 'Tagesansicht nach behandelnder Person' })
      .getByText('Anna Beispiel', { exact: true });
    await expect(kopf.locator('xpath=..')).toHaveCSS('position', 'sticky');
  });

  test('laeuft auf schmalen Displays ohne Ueberlauf der Seite', async ({ page }) => {
    const tag = mittwoch();

    await anmelden(page, KONTEN.office);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByRole('gridcell', { name: 'Anna Beispiel' })).toBeVisible();

    // Das Gitter selbst scrollt waagerecht - die Seite nicht.
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf, 'die Seite scrollt nicht waagerecht').toBe(false);
  });
});

test.describe('CAL-006: Verschieben', () => {
  test('verschiebt einen Termin auf eine andere behandelnde Person', async ({ page }) => {
    const tag = mittwoch(1);
    const von = stunde();
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const kachel = terminKachel(page, terminId);
    await expect(kachel).toBeVisible();

    const ziel = page.getByRole('gridcell', { name: 'Tim Teamleitung' });
    const zielKasten = await ziel.boundingBox();
    const kachelKasten = await kachel.boundingBox();
    await ziehen(page, kachel, {
      x: zielKasten!.x + zielKasten!.width / 2,
      y: kachelKasten!.y + 8,
    });
    await verschiebenBestaetigen(page);

    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Behandelnde Person')).toContainText('Tim Teamleitung');
    // Die Zeit bleibt unveraendert - verschoben wurde nur die Spalte.
    await expect(detailWert(page, 'Zeit')).toContainText(`${von}–${bis}`);
  });

  test('bietet das Verschieben auch ohne Ziehen an', async ({ page }) => {
    const tag = mittwoch(2);
    const von = stunde(1);
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    // Ziehen ist eine Abkuerzung, kein eigener Weg.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByText(/über „Bearbeiten" in der Detailansicht/)).toBeVisible();

    await page.goto(`/termine/${terminId}`);
    await expect(page.getByRole('link', { name: 'Bearbeiten' })).toBeVisible();
  });

  test('zieht einen abgeschlossenen Termin nicht', async ({ page }) => {
    const tag = mittwoch(3);
    const von = stunde(2);
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });
    await page.getByRole('button', { name: 'Termin abschließen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');

    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const kachel = terminKachel(page, terminId);
    await expect(kachel).toBeVisible();

    const ziel = page.getByRole('gridcell', { name: 'Tim Teamleitung' });
    const zielKasten = await ziel.boundingBox();
    const kachelKasten = await kachel.boundingBox();
    await ziehen(page, kachel, {
      x: zielKasten!.x + zielKasten!.width / 2,
      y: kachelKasten!.y + 8,
    });

    // Der Termin bleibt unveraendert bei seiner Person.
    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Behandelnde Person')).toContainText('Anna Beispiel');
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');
  });

  test('fragt beim Ziehen in eine Randzeit nach', async ({ page }) => {
    const tag = mittwoch(4);
    const von = stunde(3);
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const kachel = terminKachel(page, terminId);
    await expect(kachel).toBeVisible();

    // Weit nach unten: die Seed-Arbeitszeit endet um 18:00.
    const gitter = page.getByRole('grid').first();
    const gitterKasten = await gitter.boundingBox();
    const kachelKasten = await kachel.boundingBox();
    await ziehen(page, kachel, {
      x: kachelKasten!.x + kachelKasten!.width / 2,
      y: gitterKasten!.y + gitterKasten!.height - 4,
    });

    const rueckfrage = page.getByRole('group', { name: 'Außerhalb der Arbeitszeit' });
    await expect(rueckfrage).toBeVisible();
    await expect(rueckfrage).toContainText(/noch nicht verschoben/);

    // Ohne Bestaetigung bleibt der Termin, wo er war.
    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Zeit')).toContainText(`${von}–${bis}`);
  });
});
