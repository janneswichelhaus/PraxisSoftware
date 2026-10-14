import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * B2 (ANN-530): „Auf 16:25 verschieben“ im Terminformular, in einem echten
 * Browser.
 *
 * Die Komponententests prüfen Rechnung und Texte. Hier geht es um das, was
 * jsdom nicht misst: ob der Knopf am Telefon in voller Breite unter seiner
 * Zeile steht, ob er das Tippziel hält, ob nichts waagerecht überläuft - und
 * ob die Auskunft nach dem Tipp mit dem neuen Beginn neu fragt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/terminformular.html';

interface Passfrage {
  index: number;
  duration_minutes: number;
  starts_at: string;
  previous_end?: string;
  travel_to_seconds?: number;
  next_start?: string;
  travel_from_seconds?: number;
}

/** Aufrunden auf das 5-Minuten-Raster; Berlin liegt um ganze Stunden versetzt. */
function aufRaster(ms: number): number {
  const raster = 5 * 60 * 1000;
  return Math.ceil(ms / raster) * raster;
}

/**
 * `check_travel_fit` wie im Server (§8.1): frühester Beginn = Ende plus
 * Fahrzeit, aufs Raster aufgerundet; Luft in ganzen Minuten.
 */
function passt(frage: Passfrage) {
  const beginn = Date.parse(frage.starts_at);
  const an =
    frage.previous_end !== undefined && frage.travel_to_seconds !== undefined
      ? aufRaster(Date.parse(frage.previous_end) + frage.travel_to_seconds * 1000)
      : null;
  const weiter =
    frage.next_start !== undefined && frage.travel_from_seconds !== undefined
      ? aufRaster(beginn + frage.duration_minutes * 60_000 + frage.travel_from_seconds * 1000)
      : null;
  return {
    item_index: frage.index,
    starts_at: frage.starts_at,
    arrival_earliest_start: an === null ? null : new Date(an).toISOString(),
    arrival_slack_minutes: an === null ? null : Math.floor((beginn - an) / 60_000),
    next_earliest_start: weiter === null ? null : new Date(weiter).toISOString(),
    departure_slack_minutes:
      weiter === null ? null : Math.floor((Date.parse(frage.next_start!) - weiter) / 60_000),
  };
}

async function oeffne(page: Page, breite: number): Promise<Passfrage[]> {
  const fragen: Passfrage[] = [];
  await page.route('**/rest/v1/**', async (route: Route) => {
    if (route.request().url().includes('/rpc/check_travel_fit')) {
      const { p_items } = route.request().postDataJSON() as { p_items: Passfrage[] };
      fragen.push(...p_items);
      await route.fulfill({ json: p_items.map(passt) });
      return;
    }
    await route.fulfill({ json: [] });
  });
  // Die Route liegt im Zwischenspeicher; der Kartendienst wird nicht gefragt.
  await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.setViewportSize({ width: breite, height: 812 });
  await page.goto(PRUEFSEITE);
  await expect(page.getByRole('heading', { level: 1, name: 'Termin anlegen' })).toBeVisible();
  return fragen;
}

async function ohneUeberlauf(page: Page) {
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(ueberlauf).toBe(false);
}

test('bietet bei zu knapper Anfahrt „Auf 16:25 verschieben“ in voller Breite an (375 px)', async ({
  page,
}) => {
  const fragen = await oeffne(page, 375);
  const auskunft = page.getByTestId('wegauskunft');
  await expect(
    auskunft.getByText('Anfahrt: zu knapp um 10 Min., frühester Beginn 16:25 Uhr'),
  ).toBeVisible();
  await expect(auskunft.getByText('Rückfahrt: passt · 15 Min. Luft')).toBeVisible();

  const knopf = auskunft.getByRole('button', { name: 'Auf 16:25 verschieben' });
  await knopf.scrollIntoViewIfNeeded();
  const box = (await knopf.boundingBox())!;
  const breite = (await auskunft.boundingBox())!;
  // Kompakt, aber nie unter dem Tippziel; am Telefon so breit wie die Auskunft.
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(box.width - breite.width)).toBeLessThanOrEqual(1);
  // Unter der Zeile, zu der er gehört, über der Rückfahrt.
  const anfahrt = (await auskunft.getByText(/Anfahrt: zu knapp/).boundingBox())!;
  const rueckfahrt = (await auskunft.getByText(/Rückfahrt: passt/).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(anfahrt.y + anfahrt.height);
  expect(box.y + box.height).toBeLessThanOrEqual(rueckfahrt.y);
  await expect(
    auskunft.getByText('Nur Auskunft – der Termin lässt sich trotzdem anlegen.'),
  ).toBeVisible();
  await ohneUeberlauf(page);

  await knopf.click();

  await expect(page.getByLabel('Beginn *')).toHaveValue('16:25');
  await expect(page.getByText('Ende: 17:25 Uhr')).toBeVisible();
  // Die Auskunft fragt mit dem neuen Beginn neu - und bietet nichts mehr an.
  await expect(auskunft.getByText('Anfahrt: passt · 0 Min. Luft')).toBeVisible();
  await expect(auskunft.getByText('Rückfahrt: passt · 5 Min. Luft')).toBeVisible();
  await expect(auskunft.getByRole('button')).toHaveCount(0);
  expect(fragen.map((f) => f.starts_at)).toEqual([
    '2027-05-12T14:15:00.000Z',
    '2027-05-12T14:25:00.000Z',
  ]);
  await ohneUeberlauf(page);
});

test('stellt den Knopf ab 640 px nur so breit wie sein Wort (1280 px)', async ({ page }) => {
  await oeffne(page, 1280);
  const auskunft = page.getByTestId('wegauskunft');
  const knopf = auskunft.getByRole('button', { name: 'Auf 16:25 verschieben' });
  await expect(knopf).toBeVisible();
  const box = (await knopf.boundingBox())!;
  const breite = (await auskunft.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeLessThan(breite.width / 2);
});
