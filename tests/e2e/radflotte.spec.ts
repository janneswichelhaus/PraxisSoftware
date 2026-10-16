import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type AxeCore from 'axe-core';
import type { Bike, BikeDetail, Fleet, Spot } from '../../src/features/fleet/api';
import { testDetail, testFlotte } from '../../src/features/fleet/testdaten';

/**
 * Die Radflotte (FLT-EPIC-001) im echten Browser bei 375 px, mit gezählten
 * Tipps je Ablauf der Spec:
 *
 *   * **R1** Schlüssel des eigenen Rads nehmen: 1 Tipp ab der Radflotte
 *     (vorher 2 Tipps und ein Seitenwechsel);
 *   * **R2** Schlüssel zurücklegen: 1 Tipp (vorher 1);
 *   * **R3** Check-Up ohne Befund: ≤ 4 Tipps ab der Radflotte;
 *   * **R4** Check-Up mit einer Stelle am 3D-Rad: ≤ 6 Tipps + Text;
 *   * **R5** Panne, Rad weiter fahrbar, mit einer Stelle: ≤ 7 Tipps + Text;
 *   * **R6** Freigabe durch die Teamleitung: ≤ 3 Tipps;
 *   * **R7** Unterlage für die Werkstatt ab dem Rad: 2 Tipps bis zum
 *     Druckdialog.
 *
 * Der Server ist eine kleine Nachbildung über abgefangene Anfragen; Rechte,
 * Nummern und Fristen prüft `pnpm test:db`. WebGL kommt aus SwiftShader, wie
 * auf einem Rechner ohne Grafikkarte. Alles ist synthetisch.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/radflotte.html';

/**
 * Nach dem Speichern zeigt die Seite das Rad mit seinem 3D-Modell. Auf einem
 * Rechner ohne Grafikkarte (SwiftShader, auch in der CI) baut WebGL dafür die
 * Shader neu - das dauert dort länger als die üblichen 5 s. Gezählt werden
 * Tipps, nicht Sekunden.
 */
const NACH_DEM_SPEICHERN = 20_000;
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
test.use({
  // Ein Bildpunkt je CSS-Pixel: SwiftShader zeichnet in Software, und bei der
  // Dichte des Pixel 7 dauert ein Bild in der CI Sekunden. Tipps, Layout und
  // axe hängen an CSS-Pixeln, nicht an der Dichte.
  deviceScaleFactor: 1,
  launchOptions: {
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
    ],
  },
});

function nachbildung(rolle: 'therapie' | 'teamleitung' = 'therapie') {
  const start = testFlotte({ can_release: rolle === 'teamleitung' });
  const raeder: Bike[] = start.bikes.map((rad) => ({ ...rad }));
  const stellen: Spot[] = testDetail().spots.map((stelle) => ({ ...stelle }));
  const aufrufe: Record<string, Record<string, unknown>[]> = {};
  let folge = 10;

  function offen(radId: string) {
    return stellen
      .filter((stelle) => stelle.resolved_at === null && radOf(stelle) === radId)
      .map((stelle, index) => ({ ...stelle, number: index + 1 }));
  }
  // Die Stellen des Seeds gehören zu Lastenrad 3, neue zu ihrem Rad.
  const zuordnung = new Map<string, string>(stellen.map((stelle) => [stelle.id, 'rad-3']));
  function radOf(stelle: Spot) {
    return zuordnung.get(stelle.id) ?? '';
  }

  function flotte(): Fleet {
    return {
      ...start,
      my_staff_member_id: rolle === 'teamleitung' ? 'staff-tim' : 'staff-anna',
      bikes: raeder.map((rad) => ({
        ...rad,
        open_spots: offen(rad.id).length,
        open_problems: offen(rad.id).filter((stelle) => stelle.severity === 'problem').length,
      })),
    };
  }

  function detail(radId: string): BikeDetail {
    const vorlage = testDetail();
    const rad = flotte().bikes.find((eintrag) => eintrag.id === radId)!;
    return {
      ...vorlage,
      bike: rad,
      spots: offen(radId),
      blocks: rad.block ? vorlage.blocks : [],
      checkups: radId === 'rad-3' ? vorlage.checkups : [],
      breakdowns: radId === 'rad-3' ? vorlage.breakdowns : [],
    };
  }

  function neueStellen(radId: string, quelle: 'checkup' | 'breakdown', p: Record<string, unknown>) {
    const liste = JSON.parse(JSON.stringify(p.p_spots ?? [])) as {
      zone: string;
      severity?: 'problem' | 'beobachten';
      point: [number, number, number] | null;
      note: string | null;
    }[];
    return liste.map((eingabe) => {
      folge += 1;
      const id = `neu-${folge}`;
      zuordnung.set(id, radId);
      stellen.push({
        id,
        number: null,
        zone: eingabe.zone,
        point: eingabe.point,
        model_version: 1,
        severity: quelle === 'breakdown' ? 'problem' : (eingabe.severity ?? 'problem'),
        note: eingabe.note,
        source: quelle,
        source_id: `${quelle}-${folge}`,
        created_at: new Date().toISOString(),
        resolved_at: null,
      });
      return id;
    });
  }

  const antworten: Record<string, (p: Record<string, unknown>) => unknown> = {
    list_fleet: () => flotte(),
    get_fleet_bike: (p) => detail(String(p.p_bike_id)),
    list_fleet_photos: () => [],
    take_fleet_key: (p) => {
      const rad = raeder.find((eintrag) => eintrag.id === p.p_bike_id)!;
      const ich = rolle === 'teamleitung' ? 'staff-tim' : 'staff-anna';
      const halter = (p.p_holder_staff_id as string | null) ?? ich;
      rad.key = {
        holder_staff_id: halter,
        holder_name: halter === 'staff-tim' ? 'Tim Teamleitung' : 'Anna Beispiel',
        taken_at: new Date().toISOString(),
      };
      return 'schluessel';
    },
    return_fleet_key: (p) => {
      raeder.find((eintrag) => eintrag.id === p.p_bike_id)!.key = null;
      return null;
    },
    record_fleet_checkup: (p) => ({
      checkup_id: 'checkup-neu',
      spot_ids: neueStellen(String(p.p_bike_id), 'checkup', p),
    }),
    record_fleet_breakdown: (p) => {
      const ids = neueStellen(String(p.p_bike_id), 'breakdown', p);
      const sperrt = p.p_outcome !== 'meldungOhneSperre';
      if (sperrt) {
        raeder.find((eintrag) => eintrag.id === p.p_bike_id)!.block = {
          id: 'sperre-neu',
          blocked_at: new Date().toISOString(),
          reason: null,
          breakdown_id: 'panne-neu',
        };
      }
      return { breakdown_id: 'panne-neu', spot_ids: ids, blocked: sperrt };
    },
    release_fleet_bike: (p) => {
      const radId = String(p.p_bike_id);
      const rad = raeder.find((eintrag) => eintrag.id === radId)!;
      const zahl = offen(radId).length;
      for (const stelle of stellen) {
        if (radOf(stelle) === radId && stelle.resolved_at === null) {
          stelle.resolved_at = new Date().toISOString();
        }
      }
      const gesperrt = rad.block !== null;
      rad.block = null;
      return { released: gesperrt, resolved_spots: zahl };
    },
    get_fleet_workshop_sheet: (p) => {
      const radId = String(p.p_bike_id);
      const rad = raeder.find((eintrag) => eintrag.id === radId)!;
      return {
        name: rad.name,
        bike_type: rad.bike_type,
        blocked_since: rad.block?.blocked_at ?? null,
        spots: offen(radId).map((stelle) => ({
          id: stelle.id,
          number: stelle.number,
          zone: stelle.zone,
          point: stelle.point,
          model_version: stelle.model_version,
          severity: stelle.severity,
          note: stelle.note,
          source: stelle.source,
          source_at: stelle.created_at,
        })),
      };
    },
  };

  async function beantworte(route: Route) {
    const name = new URL(route.request().url()).pathname.split('/rpc/')[1];
    if (!name) {
      await route.fulfill({ json: [] });
      return;
    }
    const parameter = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    (aufrufe[name] ??= []).push(parameter);
    const antwort = antworten[name];
    await route.fulfill({ json: antwort ? antwort(parameter) : [] });
  }

  return { aufrufe, beantworte };
}

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    /** Ein Antippen am 3D-Rad: in der Mitte der Transportbox. */
    async tippeAmRad(page: Page) {
      tipps += 1;
      const rad = page.locator('canvas[role="img"]').first();
      await expect(page.getByText('Ziehen dreht · Antippen markiert')).toBeVisible();
      const box = (await rad.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45);
    },
    get tipps() {
      return tipps;
    },
  };
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function mindestens44(ziel: Locator) {
  await expect(ziel).toBeVisible();
  expect((await ziel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
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

async function oeffne(page: Page, server: ReturnType<typeof nachbildung>, suche = '') {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));
  await page.goto(`${PRUEFSEITE}${suche}`);
}

test('R1 und R2: Schlüssel des eigenen Rads mit je einem Tipp nehmen und zurücklegen', async ({
  page,
}) => {
  const server = nachbildung();
  await oeffne(page, server);
  await expect(page.getByRole('heading', { name: 'Ihr Rad' })).toBeVisible();
  expect(await ueberlaeuft(page)).toBe(false);
  expect(await axeVerstoesse(page)).toEqual([]);

  const z = zaehler();
  const nehmen = page.getByRole('button', { name: 'Schlüssel von Lastenrad 1 nehmen' });
  await mindestens44(nehmen);
  await z.tippe(nehmen);
  await expect(page.getByText('Schlüssel von Lastenrad 1 bei Ihnen eingetragen.')).toBeVisible();
  expect(server.aufrufe.take_fleet_key).toEqual([{ p_bike_id: 'rad-1', p_holder_staff_id: null }]);
  test
    .info()
    .annotations.push({ type: 'R1', description: `${z.tipps} Tipp (vorher 2 und ein Wechsel)` });
  expect(z.tipps).toBe(1);

  await z.tippe(page.getByRole('button', { name: 'Schlüssel von Lastenrad 1 zurücklegen' }));
  await expect(page.getByText('Schlüssel von Lastenrad 1 zurückgelegt.')).toBeVisible();
  test.info().annotations.push({ type: 'R2', description: '1 Tipp (vorher 1)' });
  expect(z.tipps).toBe(2);
});

test('R3: Check-Up ohne Befund in höchstens vier Tipps', async ({ page }) => {
  const server = nachbildung();
  await oeffne(page, server);
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Check-Up', exact: true }));
  await expect(page.getByRole('combobox', { name: 'Rad' })).toHaveValue('rad-1');
  await z.tippe(page.getByRole('button', { name: 'Weiter' }));
  await z.tippe(page.getByRole('checkbox', { name: /habe das ganze Rad/ }));
  await z.tippe(page.getByRole('button', { name: 'Check-Up speichern' }));
  await expect(page.getByText('Check-Up gespeichert.')).toBeVisible({
    timeout: NACH_DEM_SPEICHERN,
  });
  expect(server.aufrufe.record_fleet_checkup).toHaveLength(1);
  test.info().annotations.push({ type: 'R3', description: `${z.tipps} Tipps` });
  expect(z.tipps).toBeLessThanOrEqual(4);
});

test('R4: Check-Up mit einer Stelle am 3D-Rad in höchstens sechs Tipps und Text', async ({
  page,
}) => {
  const server = nachbildung();
  await oeffne(page, server);
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Check-Up', exact: true }));
  await z.tippe(page.getByRole('button', { name: 'Weiter' }));
  await expect(page.getByRole('group', { name: 'Bremsen' })).toBeVisible();
  expect(await ueberlaeuft(page)).toBe(false);
  expect(await axeVerstoesse(page)).toEqual([]);

  await z.tippeAmRad(page);
  const stelle = page.getByRole('group', { name: 'Transportbox' });
  await expect(stelle.getByText('Gehört zum Prüfpunkt „Transportbox“.')).toBeVisible();
  await stelle.getByLabel('Notiz zur Stelle').fill('Deckel klemmt');
  await z.tippe(stelle.getByRole('button', { name: 'Stelle setzen' }));
  // Die Stelle hebt ihren Prüfpunkt an.
  await expect(
    page.getByRole('group', { name: 'Transportbox' }).getByRole('radio', { name: 'Problem' }),
  ).toBeChecked();
  await z.tippe(page.getByRole('checkbox', { name: /habe das ganze Rad/ }));
  await z.tippe(page.getByRole('button', { name: 'Check-Up speichern' }));

  await expect(page.getByText('Check-Up gespeichert.')).toBeVisible({
    timeout: NACH_DEM_SPEICHERN,
  });
  const eingabe = server.aufrufe.record_fleet_checkup![0]!;
  expect(eingabe.p_spots).toEqual([
    expect.objectContaining({ zone: 'transportbox', severity: 'problem', note: 'Deckel klemmt' }),
  ]);
  // Danach steht die Stelle mit Nummer 1 am Rad.
  await expect(
    page.getByRole('button', { name: 'Stelle 1 am Rad zeigen: Transportbox' }),
  ).toBeVisible();
  test.info().annotations.push({ type: 'R4', description: `${z.tipps} Tipps + Text` });
  expect(z.tipps).toBeLessThanOrEqual(6);
});

test('R5: Panne, Rad weiter fahrbar, mit einer Stelle in höchstens sieben Tipps und Text', async ({
  page,
}) => {
  const server = nachbildung();
  await oeffne(page, server);
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Panne melden' }));
  await z.tippe(page.getByRole('button', { name: 'Weiter' }));
  await expect(page.getByRole('heading', { name: 'Wo ist der Schaden?' })).toBeVisible();
  expect(await ueberlaeuft(page)).toBe(false);
  expect(await axeVerstoesse(page)).toEqual([]);

  await z.tippeAmRad(page);
  await page.getByLabel('Was ist passiert?').fill('Deckel klemmt');
  await z.tippe(page.getByRole('button', { name: 'Stelle setzen' }));
  await z.tippe(page.getByRole('button', { name: 'Weiter' }));
  await z.tippe(page.getByRole('button', { name: 'Nein', exact: true }));
  await expect(page.getByLabel('Was ist auffällig?')).toHaveValue('Transportbox: Deckel klemmt');
  await z.tippe(page.getByRole('button', { name: 'Melden', exact: true }));

  await expect(page.getByText('Panne gemeldet. Lastenrad 1 bleibt in der Planung.')).toBeVisible({
    timeout: NACH_DEM_SPEICHERN,
  });
  expect(server.aufrufe.record_fleet_breakdown![0]).toEqual(
    expect.objectContaining({ p_outcome: 'meldungOhneSperre', p_location_note: '' }),
  );
  test.info().annotations.push({ type: 'R5', description: `${z.tipps} Tipps + Text` });
  expect(z.tipps).toBeLessThanOrEqual(7);
});

test('R6: Freigabe durch die Teamleitung in höchstens drei Tipps, mit Rückfrage', async ({
  page,
}) => {
  const server = nachbildung('teamleitung');
  await oeffne(page, server, '?rolle=teamleitung');
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: /^Lastenrad 3/ }));
  await expect(page.getByRole('heading', { name: 'Lastenrad 3', level: 1 })).toBeVisible();
  expect(await ueberlaeuft(page)).toBe(false);
  expect(await axeVerstoesse(page)).toEqual([]);
  const freigeben = page.getByRole('button', { name: 'Freigeben' });
  await mindestens44(freigeben);
  await z.tippe(freigeben);
  await z.tippe(page.getByRole('button', { name: 'Ja, freigeben' }));
  await expect(
    page.getByText('Lastenrad 3 freigegeben. Die 3 Stellen gelten als erledigt.'),
  ).toBeVisible();
  test
    .info()
    .annotations.push({ type: 'R6', description: `${z.tipps} Tipps (vorher 1, ohne Rückfrage)` });
  expect(z.tipps).toBeLessThanOrEqual(3);
});

test('R7: Unterlage für die Werkstatt in zwei Tipps bis zum Druckdialog, zwei A4-Seiten', async ({
  page,
}) => {
  const server = nachbildung();
  await oeffne(page, server, `?pfad=${encodeURIComponent('/betrieb/flotte/rad/rad-3')}`);
  await page.evaluate(() => {
    (window as unknown as { __gedruckt: number }).__gedruckt = 0;
    window.print = () => {
      (window as unknown as { __gedruckt: number }).__gedruckt += 1;
    };
  });
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Unterlage für die Werkstatt' }));
  const drucken = page.getByRole('button', { name: 'Drucken oder als PDF sichern' });
  await expect(drucken).toBeEnabled({ timeout: 20_000 });
  expect(await ueberlaeuft(page)).toBe(false);
  await expect(page.getByText('Rechte Seite mit Antrieb: Stellen 2 und 3')).toBeVisible();
  await expect(page.getByText('Linke Seite: Stelle 1')).toBeVisible();
  await z.tippe(drucken);
  expect(await page.evaluate(() => (window as unknown as { __gedruckt: number }).__gedruckt)).toBe(
    1,
  );
  test.info().annotations.push({
    type: 'R7',
    description: `${z.tipps} Tipps (vorher fehlte die Unterlage)`,
  });
  expect(z.tipps).toBeLessThanOrEqual(2);

  // Im Druckbild: keine Bedienung, zwei Seiten, keine Namen aus dem Team.
  await page.emulateMedia({ media: 'print' });
  await expect(drucken).toBeHidden();
  await expect(page.getByRole('region', { name: 'Seite 2 von 2' })).toBeVisible();
  const blatt = page.getByRole('article', { name: 'Unterlage für die Werkstatt' });
  await expect(blatt).not.toContainText('Tim');
  await expect(blatt).not.toContainText('Anna');
});

test('die Seiten der Radflotte laufen bei 1280 px nicht über', async ({ page }) => {
  const server = nachbildung();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));
  for (const pfad of [
    '/betrieb/flotte',
    '/betrieb/flotte/rad/rad-3',
    '/betrieb/flotte/checkup?rad=rad-1',
  ]) {
    await page.goto(`${PRUEFSEITE}?pfad=${encodeURIComponent(pfad)}`);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await ueberlaeuft(page), pfad).toBe(false);
  }
});
