import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type AxeCore from 'axe-core';
import type { Bike, BikeDetail, Fleet, Spot } from '../../src/features/fleet/api';
import { testDetail, testFlotte, testRad } from '../../src/features/fleet/testdaten';

/**
 * Radflotte im Browser bei 375 px mit gezählten Tipps je Ablauf; das Budget steht im Namen jedes
 * Tests. Der Server ist eine Nachbildung über abgefangene Anfragen, Rechte und Fristen prüft
 * `pnpm test:db`. Bildschirmfotos dienen der Selbstsichtung.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/radflotte.html';

/** Nach dem Speichern laufen Fotos und das Neuladen des Rads; gezählt werden Tipps, nicht Sekunden. */
const NACH_DEM_SPEICHERN = 20_000;
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
test.use({
  // Ein Bildpunkt je CSS-Pixel: Die Prüfungen ohne Scrollen und die Bildschirmfotos bleiben so
  // mit den früheren Läufen vergleichbar.
  deviceScaleFactor: 1,
  launchOptions: {
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Künstliche Kamera mit Testbild für die Seitenfotos, Freigabe ohne Rückfrage - wie in
      // fotos.spec.ts.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
  permissions: ['camera'],
});

function nachbildung(rolle: 'therapie' | 'teamleitung' = 'therapie', weitere: Bike[] = []) {
  const start = testFlotte({ can_release: rolle === 'teamleitung' });
  const raeder: Bike[] = [...start.bikes, ...weitere].map((rad) => ({ ...rad }));
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
    // Von Hand zu Hand (ANN-575): Der offene Vorgang endet, ein neuer beginnt.
    hand_over_fleet_key: (p) => {
      const rad = raeder.find((eintrag) => eintrag.id === p.p_bike_id)!;
      const halter = String(p.p_holder_staff_id);
      rad.key = {
        holder_staff_id: halter,
        holder_name: start.staff.find((person) => person.id === halter)?.name ?? null,
        taken_at: new Date().toISOString(),
      };
      return 'schluessel';
    },
    record_fleet_checkup: (p) => ({
      checkup_id: 'checkup-neu',
      spot_ids: neueStellen(String(p.p_bike_id), 'checkup', p),
    }),
    // Fotos (ANN-552): vorbereiten, ablegen, bestätigen - ohne Prüfung am Server.
    prepare_fleet_photo_upload: (p) => {
      const id = `foto-${(aufrufe.prepare_fleet_photo_upload ?? []).length}`;
      return [
        {
          photo_id: id,
          bucket_id: 'radflotte',
          object_key: `org/${String(p.p_checkup_id ?? p.p_spot_id)}/${id}`,
        },
      ];
    },
    confirm_fleet_photo_upload: () => null,
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
    /** Eine Auswahl in einer Liste zählt als ein Tipp (`kernablaeufe.md`, Zählweise). */
    async waehle(feld: Locator, wert: string) {
      tipps += 1;
      await feld.selectOption(wert);
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
  // Die Ablage nimmt jedes Foto an; die Prüfung am Server gibt es hier nicht.
  await page.route('**/storage/v1/**', (route) =>
    route.fulfill({ json: { Key: 'radflotte/foto', Id: 'objekt' } }),
  );
  await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 404, json: {} }));
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

/** Das Fenster des geführten Check-Ups; sein Name ist die Frage der Seite. */
function checkupFenster(page: Page, name: string) {
  return page.getByRole('dialog', { name });
}

/** Ob das Fenster ohne Scrollen auskommt: weder Fenster noch Fragefläche laufen über. */
async function scrolltNicht(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const fenster = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!fenster) return false;
    const flaechen = [fenster, ...fenster.querySelectorAll<HTMLElement>('.overflow-y-auto')];
    return flaechen.every((flaeche) => flaeche.scrollHeight <= flaeche.clientHeight + 1);
  });
}

/**
 * Haken und „Check-Up speichern“ stehen im Abschluss fest unter der
 * Zusammenfassung, ganz im Bild - wie viel auch auffiel (Praxis-Review
 * FLT-005, Bruchstelle 5).
 */
async function festImBild(abschluss: Locator) {
  await expect(abschluss.getByRole('checkbox', { name: /habe das ganze Rad/ })).toBeInViewport({
    ratio: 1,
  });
  await expect(abschluss.getByRole('button', { name: 'Check-Up speichern' })).toBeInViewport({
    ratio: 1,
  });
}

/**
 * Nach den zwölf Punkten (FLT-007, ANN-568): „Abgewischt“, dann je Seite die
 * Kamera - sie öffnet sich selbst - mit „Auslösen“ und „Foto verwenden“.
 */
async function reinigenUndFotografieren(page: Page, z: ReturnType<typeof zaehler>) {
  const werbung = checkupFenster(page, 'Werbeflächen abwischen');
  await expect(werbung.getByText('Reinigung', { exact: true })).toBeVisible();
  expect(await scrolltNicht(page), 'Werbeflächen ohne Scrollen').toBe(true);
  await mindestens44(werbung.getByRole('button', { name: 'Abgewischt' }));
  await z.tippe(werbung.getByRole('button', { name: 'Abgewischt' }));
  for (const [index, titel] of [
    'Foto von links',
    'Foto von vorne',
    'Foto von rechts',
    'Foto von hinten',
  ].entries()) {
    await expect(
      checkupFenster(page, titel).getByText(`Foto ${index + 1} von 4`, { exact: true }),
    ).toBeVisible();
    const kamera = page.getByRole('dialog', { name: titel }).last();
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.videoWidth ?? 0))
      .toBeGreaterThan(0);
    await z.tippe(kamera.getByRole('button', { name: 'Auslösen' }));
    await z.tippe(kamera.getByRole('button', { name: 'Foto verwenden' }));
  }
}

test('R3: geführter Check-Up ohne Befund in höchstens 25 Tipps, jede Seite ohne Scrollen', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const server = nachbildung();
  await oeffne(page, server);
  // Das kleinste übliche Telefon: 375 × 667.
  await page.setViewportSize({ width: 375, height: 667 });
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Check-Up', exact: true }));
  await expect(page.getByRole('combobox', { name: 'Rad' })).toHaveValue('rad-1');
  await z.tippe(page.getByRole('button', { name: 'Weiter' }));

  const erste = checkupFenster(page, 'Reifen und Luftdruck');
  await expect(erste.getByText('Prüfpunkt 1 von 12', { exact: true })).toBeVisible();
  // Unter dem Titel das Rad mit Bauart (Regel 6).
  await expect(erste.getByText('Lastenrad 1 · Load 60 · Riemenantrieb')).toBeVisible();
  expect(await axeVerstoesse(page)).toEqual([]);
  for (const [index, label] of [
    'Reifen und Luftdruck',
    'Speichen',
    'Bremsen',
    'Riemen und Antrieb',
    'Licht vorne',
    'Licht hinten',
    'Akku-Zustand',
    'Schrauben und Sattel fest',
    'Klingel',
    'Schutzbleche',
    'Ständer',
    'Transportbox',
  ].entries()) {
    const seite = checkupFenster(page, label);
    await expect(seite.getByText(`Prüfpunkt ${index + 1} von 12`, { exact: true })).toBeVisible();
    expect(await scrolltNicht(page), `${label} ohne Scrollen`).toBe(true);
    for (const name of ['In Ordnung', 'Beobachten', 'Problem']) {
      await mindestens44(seite.getByRole('button', { name, exact: true }));
    }
    await z.tippe(seite.getByRole('button', { name: 'In Ordnung' }));
  }
  await reinigenUndFotografieren(page, z);

  const abschluss = checkupFenster(page, 'Alles geprüft?');
  await expect(
    abschluss.getByText('0 Probleme · 0 zu beobachten · 0 Stellen am Rad markiert', {
      exact: true,
    }),
  ).toBeVisible();
  await festImBild(abschluss);
  expect(await axeVerstoesse(page)).toEqual([]);
  await z.tippe(abschluss.getByRole('checkbox', { name: /habe das ganze Rad/ }));
  await z.tippe(abschluss.getByRole('button', { name: 'Check-Up speichern' }));
  await expect(page.getByText('Check-Up gespeichert, mit 4 Fotos.')).toBeVisible({
    timeout: NACH_DEM_SPEICHERN,
  });
  const eingabe = server.aufrufe.record_fleet_checkup![0]!;
  expect((eingabe.p_items as { rating: string }[]).map((item) => item.rating)).toEqual(
    Array(12).fill('ok'),
  );
  expect(eingabe.p_ad_surfaces).toBe('wiped');
  expect(server.aufrufe.prepare_fleet_photo_upload!.map((p) => [p.p_checkup_id, p.p_side])).toEqual(
    [
      ['checkup-neu', 'left'],
      ['checkup-neu', 'front'],
      ['checkup-neu', 'right'],
      ['checkup-neu', 'back'],
    ],
  );
  test.info().annotations.push({
    type: 'R3',
    description: `${z.tipps} Tipps (vorher 16 ohne Werbeflächen und Fotos)`,
  });
  expect(z.tipps).toBeLessThanOrEqual(25);
});

test('R4: geführter Check-Up mit einer Stelle in höchstens 26 Tipps und Text', async ({ page }) => {
  test.setTimeout(120_000);
  const server = nachbildung();
  await oeffne(page, server);
  await page.setViewportSize({ width: 375, height: 667 });
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Check-Up', exact: true }));
  await z.tippe(page.getByRole('button', { name: 'Weiter' }));
  for (const label of [
    'Reifen und Luftdruck',
    'Speichen',
    'Bremsen',
    'Riemen und Antrieb',
    'Licht vorne',
    'Licht hinten',
    'Akku-Zustand',
    'Schrauben und Sattel fest',
    'Klingel',
    'Schutzbleche',
    'Ständer',
  ]) {
    await z.tippe(checkupFenster(page, label).getByRole('button', { name: 'In Ordnung' }));
  }

  // Transportbox: nur ein Bauteil - „Problem“ führt gleich zum Befund an der Box.
  const box = checkupFenster(page, 'Transportbox');
  await z.tippe(box.getByRole('button', { name: 'Problem' }));
  await expect(box.getByLabel('Was ist aufgefallen?')).toBeVisible();
  await expect(box.getByRole('radio', { name: 'Problem' })).toBeChecked();
  expect(await scrolltNicht(page)).toBe(true);
  expect(await axeVerstoesse(page)).toEqual([]);
  await box.getByLabel('Was ist aufgefallen?').fill('Deckel klemmt');
  await z.tippe(box.getByRole('button', { name: 'Weiter' }));
  await reinigenUndFotografieren(page, z);

  const abschluss = checkupFenster(page, 'Alles geprüft?');
  await expect(
    abschluss.getByText('1 Problem · 0 zu beobachten · 1 Stelle am Rad markiert', { exact: true }),
  ).toBeVisible();
  await festImBild(abschluss);
  await z.tippe(abschluss.getByRole('checkbox', { name: /habe das ganze Rad/ }));
  await z.tippe(abschluss.getByRole('button', { name: 'Check-Up speichern' }));

  await expect(page.getByText('Check-Up gespeichert, mit 4 Fotos.')).toBeVisible({
    timeout: NACH_DEM_SPEICHERN,
  });
  const eingabe = server.aufrufe.record_fleet_checkup![0]!;
  // Bauteil, Einstufung und Notiz - kein Punkt am Modell.
  expect(eingabe.p_spots).toEqual([
    { zone: 'transportbox', severity: 'problem', note: 'Deckel klemmt' },
  ]);
  await expect(page.getByRole('listitem').filter({ hasText: 'Transportbox' })).toContainText(
    'Deckel klemmt',
  );
  test.info().annotations.push({
    type: 'R4',
    description: `${z.tipps} Tipps + Text (vorher 17 ohne Werbeflächen und Fotos)`,
  });
  expect(z.tipps).toBeLessThanOrEqual(26);
});

test('Check-Up mit zwei Befunden bei 375 × 667: Zurückgeste, Bauteil ohne Frage, fester Abschluss', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const server = nachbildung();
  await oeffne(page, server);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('link', { name: 'Check-Up', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Die Zurückgeste des Telefons geht im Fenster einen Schritt zurück, statt
  // den Check-Up samt Antworten zu schließen.
  await checkupFenster(page, 'Reifen und Luftdruck')
    .getByRole('button', { name: 'In Ordnung' })
    .click();
  await expect(checkupFenster(page, 'Speichen')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __zurueck: () => Promise<void> }).__zurueck());
  const reifen = checkupFenster(page, 'Reifen und Luftdruck');
  await expect(reifen.getByRole('button', { name: 'In Ordnung' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await reifen.getByRole('button', { name: 'In Ordnung' }).click();
  // Ein Doppeltipp trifft die nächste Seite nicht: Sie nimmt kurz nichts an.
  const speichen = checkupFenster(page, 'Speichen');
  await expect(speichen.getByRole('status')).toHaveText('Reifen und Luftdruck: ✓ In Ordnung');
  await speichen.getByRole('button', { name: 'In Ordnung' }).click();

  // Bremsen: drei Bauteile, also „Wo genau?“ als Auswahl, dann „Weiter“.
  const bremsen = checkupFenster(page, 'Bremsen');
  await bremsen.getByRole('button', { name: 'Problem' }).click();
  await bremsen.getByLabel('Wo genau?').selectOption('bremse-vorne');
  expect(await scrolltNicht(page), 'Wo genau? ohne Scrollen').toBe(true);
  await mindestens44(bremsen.getByLabel('Wo genau?'));
  await bremsen.getByRole('button', { name: 'Weiter' }).click();
  await bremsen.getByLabel('Was ist aufgefallen?').fill('Belag schleift');
  await bremsen.getByRole('button', { name: 'Weiter' }).click();
  for (const label of [
    'Riemen und Antrieb',
    'Licht vorne',
    'Licht hinten',
    'Akku-Zustand',
    'Schrauben und Sattel fest',
    'Klingel',
    'Schutzbleche',
    'Ständer',
  ]) {
    await checkupFenster(page, label).getByRole('button', { name: 'In Ordnung' }).click();
  }

  // Transportbox: nur ein Bauteil - kein „Wo genau?“, gleich der Befund.
  const box = checkupFenster(page, 'Transportbox');
  await box.getByRole('button', { name: 'Beobachten' }).click();
  await expect(box.getByLabel('Was ist aufgefallen?')).toHaveAttribute(
    'placeholder',
    'z. B. Deckel klemmt',
  );
  await box.getByLabel('Was ist aufgefallen?').fill('Deckel klemmt');
  expect(await scrolltNicht(page)).toBe(true);
  await box.getByRole('button', { name: 'Weiter' }).click();
  await reinigenUndFotografieren(page, zaehler());

  const abschluss = checkupFenster(page, 'Alles geprüft?');
  await expect(
    abschluss.getByText('1 Problem · 1 zu beobachten · 2 Stellen am Rad markiert', {
      exact: true,
    }),
  ).toBeVisible();
  await festImBild(abschluss);
  expect(await ueberlaeuft(page)).toBe(false);
  expect(await axeVerstoesse(page)).toEqual([]);
  // Auch aufgeklappt rollt nur die Zusammenfassung.
  await abschluss.getByText('Notiz, Fotos, weitere Stelle').click();
  await festImBild(abschluss);

  await abschluss.getByRole('checkbox', { name: /habe das ganze Rad/ }).click();
  await abschluss.getByRole('button', { name: 'Check-Up speichern' }).click();
  await expect(page.getByText('Check-Up gespeichert, mit 4 Fotos.')).toBeVisible({
    timeout: NACH_DEM_SPEICHERN,
  });
  const eingabe = server.aufrufe.record_fleet_checkup![0]!;
  expect(eingabe.p_spots).toEqual([
    { zone: 'bremse-vorne', severity: 'problem', note: 'Belag schleift' },
    { zone: 'transportbox', severity: 'beobachten', note: 'Deckel klemmt' },
  ]);
});

/** Das Fenster eines geführten Ablaufs (Panne, Schlüssel); sein Name ist die Frage der Seite. */
function fenster(page: Page, name: string) {
  return page.getByRole('dialog', { name, exact: true });
}

/**
 * Ein Bildschirmfoto der Seite bei 375 × 667, mit `breit` dazu bei 1280 px -
 * danach wieder am Telefon (Überholung 6, Selbstsichtung).
 */
async function bild(page: Page, name: string, breit = false) {
  // Ein Seitenwechsel gleitet kurz; das Foto zeigt die Seite dort, wo sie stehen bleibt.
  const animations = 'disabled';
  await page.screenshot({ path: `.tmp/screenshots/b6-${name}-375.png`, animations });
  if (!breit) return;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: `.tmp/screenshots/b6-${name}-1280.png`, animations });
  await page.setViewportSize({ width: 375, height: 667 });
}

/**
 * Eine Seite der Panne: die Frage als Name des Fensters, „Schritt n“ ohne
 * Gesamtzahl, die Herkunft der Vorlage, kein Scrollen und jede Antwort im
 * Fuß mindestens 44 px hoch.
 */
/** Ein Mittwoch (Ruhetag der Vorlage) und ein Freitag, je 12 Uhr in Berlin. */
const MITTWOCH = new Date('2026-10-21T12:00:00+02:00');
const FREITAG = new Date('2026-10-23T12:00:00+02:00');

async function panneSeite(page: Page, frage: string, schritt: number, antworten: string[]) {
  const seite = fenster(page, frage);
  await expect(seite.getByText(`Schritt ${schritt}`, { exact: true })).toBeVisible();
  await expect(seite.getByText('Für Tübingen noch zu prüfen.')).toBeVisible();
  expect(await scrolltNicht(page), `${frage} ohne Scrollen`).toBe(true);
  for (const antwort of antworten) {
    await mindestens44(seite.getByRole('button', { name: antwort, exact: true }));
  }
  return seite;
}

test('R5: Panne, Rad weiter fahrbar, mit einer Stelle in höchstens sieben Tipps und Text', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const server = nachbildung();
  await oeffne(page, server);
  // Das kleinste übliche Telefon: 375 × 667.
  await page.setViewportSize({ width: 375, height: 667 });
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Panne melden' }));
  // Die Radwahl bleibt eine gewöhnliche Seite, das eigene Rad vorbelegt.
  await expect(page.getByRole('combobox', { name: 'Rad' })).toHaveValue('rad-1');
  await bild(page, 'panne-01-rad', true);
  await z.tippe(page.getByRole('button', { name: 'Weiter' }));

  // „Wo ist der Schaden?“ im Fenster: das Bauteil aus der Liste.
  const schaden = fenster(page, 'Wo ist der Schaden?');
  await expect(schaden.getByText('Panne melden · Lastenrad 1')).toBeVisible();
  await expect(schaden.getByText('Schritt 1', { exact: true })).toBeVisible();
  expect(await ueberlaeuft(page)).toBe(false);
  expect(await scrolltNicht(page), 'Wo ist der Schaden? ohne Scrollen').toBe(true);
  expect(await axeVerstoesse(page)).toEqual([]);
  await mindestens44(schaden.getByRole('button', { name: 'Weiter' }));
  await mindestens44(schaden.getByLabel('Bauteil', { exact: true }));
  await bild(page, 'panne-02-schaden');

  await z.waehle(schaden.getByLabel('Bauteil', { exact: true }), 'transportbox');
  await schaden.getByLabel('Was ist passiert?').fill('Deckel klemmt');
  // Die offene Stelle mit „Stelle setzen“ im Bild, ohne Rollen.
  expect(await scrolltNicht(page), 'offene Stelle ohne Scrollen').toBe(true);
  await mindestens44(schaden.getByRole('button', { name: 'Stelle setzen' }));
  await bild(page, 'panne-03-stelle');
  await z.tippe(schaden.getByRole('button', { name: 'Stelle setzen' }));
  await expect(schaden.getByRole('list', { name: 'Schäden am Rad' })).toContainText(
    'Deckel klemmt',
  );
  expect(await scrolltNicht(page), 'Schaden gesetzt ohne Scrollen').toBe(true);
  await bild(page, 'panne-04-schaden-gesetzt');
  await z.tippe(schaden.getByRole('button', { name: 'Weiter' }));

  const weiterfahrt = await panneSeite(page, 'Ist die Weiterfahrt gehindert?', 2, ['Ja', 'Nein']);
  expect(await axeVerstoesse(page)).toEqual([]);
  await bild(page, 'panne-05-weiterfahrt');
  await z.tippe(weiterfahrt.getByRole('button', { name: 'Nein', exact: true }));

  const auffaellig = await panneSeite(page, 'Rad ist weiter fahrbar. Was genau ist auffällig?', 3, [
    'Melden',
  ]);
  await expect(auffaellig.getByLabel('Was ist auffällig?')).toHaveValue(
    'Transportbox: Deckel klemmt',
  );
  expect(await axeVerstoesse(page)).toEqual([]);
  await bild(page, 'panne-06-auffaellig');
  await z.tippe(auffaellig.getByRole('button', { name: 'Melden', exact: true }));

  await expect(page.getByText('Panne gemeldet. Lastenrad 1 bleibt in der Planung.')).toBeVisible({
    timeout: NACH_DEM_SPEICHERN,
  });
  expect(server.aufrufe.record_fleet_breakdown![0]).toEqual(
    expect.objectContaining({ p_outcome: 'meldungOhneSperre', p_location_note: '' }),
  );
  // Die Stelle geht als Bauteil und Notiz, ohne Punkt am Modell.
  expect(server.aufrufe.record_fleet_breakdown![0]!.p_spots).toEqual([
    { zone: 'transportbox', note: 'Deckel klemmt' },
  ]);
  test.info().annotations.push({ type: 'R5', description: `${z.tipps} Tipps + Text (vorher 7)` });
  expect(z.tipps).toBeLessThanOrEqual(7);
});

test('G3: Panne bis „Rad zurückgelassen“ in elf Tipps wie vorher, jede Seite ohne Scrollen', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Mittwoch, der Ruhetag der Vorlage: Die Panne weiß ihn (BEF-176).
  await page.clock.setFixedTime(MITTWOCH);
  const server = nachbildung();
  await oeffne(page, server);
  await page.setViewportSize({ width: 375, height: 667 });
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Panne melden' }));
  await z.tippe(page.getByRole('button', { name: 'Weiter' }));
  await z.tippe(fenster(page, 'Wo ist der Schaden?').getByRole('button', { name: 'Weiter' }));

  // Je Frage der Vorlage eine Seite, die Antworten im festen Fuß.
  for (const [schritt, frage, antworten, antwort, name] of [
    [2, 'Ist die Weiterfahrt gehindert?', ['Ja', 'Nein'], 'Ja', null],
    [3, 'Wie groß ist der Schaden?', ['Klein', 'Groß'], 'Groß', 'panne-07-groesse'],
    // Je Bedingung eine Frage (BEF-176), die Ruhetagsfrage entfällt.
    [4, 'War das die letzte Behandlung am Tag?', ['Ja', 'Nein'], 'Ja', 'panne-08-letzte'],
    [5, 'Ist das Raddepot 15–30 Minuten entfernt?', ['Ja', 'Nein'], 'Nein', 'panne-09-depot'],
  ] as const) {
    const seite = await panneSeite(page, frage, schritt, [...antworten]);
    if (name) await bild(page, name);
    await z.tippe(seite.getByRole('button', { name: antwort, exact: true }));
  }

  // Der längste Schritt: Standort, Anrufe, Akku und Liege.
  const zuruecklassen = await panneSeite(page, 'Fahrrad zurücklassen. Wo genau steht es?', 6, [
    'Weiter',
  ]);
  await zuruecklassen.getByLabel('Standort / Adresse').fill('Hinterhof Beispielweg 3');
  await bild(page, 'panne-10-zuruecklassen');
  await z.tippe(zuruecklassen.getByRole('button', { name: 'Weiter' }));

  const fuehrerschein = await panneSeite(page, 'Haben Sie einen Autoführerschein?', 7, [
    'Ja',
    'Nein',
  ]);
  await bild(page, 'panne-11-fuehrerschein');
  await z.tippe(fuehrerschein.getByRole('button', { name: 'Ja', exact: true }));
  const carsharing = await panneSeite(
    page,
    'Ist ein Carsharing-Fahrzeug in 15 Minuten Fußweg erreichbar?',
    8,
    ['Ja', 'Nein'],
  );
  await bild(page, 'panne-12-carsharing');
  await z.tippe(carsharing.getByRole('button', { name: 'Ja', exact: true }));

  // Der Abschluss: Die Zusammenfassung darf rollen, der Knopf steht fest im Bild.
  const abschluss = fenster(page, 'Zusammenfassung – bitte prüfen:');
  await expect(abschluss.getByText('Schritt 9', { exact: true })).toBeVisible();
  await expect(abschluss.getByRole('list', { name: 'Zusammenfassung' })).toContainText(
    'Standort: Hinterhof Beispielweg 3',
  );
  const bestaetigen = abschluss.getByRole('button', { name: /^Bestätigen/ });
  await expect(bestaetigen).toBeInViewport({ ratio: 1 });
  await mindestens44(bestaetigen);
  expect(await ueberlaeuft(page)).toBe(false);
  expect(await axeVerstoesse(page)).toEqual([]);
  await bild(page, 'panne-13-zusammenfassung', true);
  await z.tippe(bestaetigen);

  await expect(
    page.getByText(
      'Panne gemeldet. Lastenrad 1 ist in Reparatur und steht nicht mehr in der Planung. ' +
        'Bis zur Freigabe',
    ),
  ).toBeVisible({ timeout: NACH_DEM_SPEICHERN });
  expect(server.aufrufe.record_fleet_breakdown![0]).toEqual(
    expect.objectContaining({
      p_outcome: 'transportFortsetzung',
      p_location_note: 'Hinterhof Beispielweg 3',
      p_transport: 'carsharing',
    }),
  );
  test.info().annotations.push({ type: 'G3', description: `${z.tipps} Tipps + Text (vorher 11)` });
  expect(z.tipps).toBeLessThanOrEqual(11);
});

test('G3: auch die übrigen Seiten der Panne stehen bei 375 × 667 ohne Scrollen', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(MITTWOCH);
  const server = nachbildung();
  await oeffne(page, server, `?pfad=${encodeURIComponent('/betrieb/flotte/panne?rad=rad-1')}`);
  await page.setViewportSize({ width: 375, height: 667 });
  const tippe = (frage: string, antwort: string) =>
    fenster(page, frage).getByRole('button', { name: antwort, exact: true }).click();
  const zurueck = (frage: string) =>
    fenster(page, frage).getByRole('button', { name: '← Zurück' }).click();
  await tippe('Wo ist der Schaden?', 'Weiter');
  await tippe('Ist die Weiterfahrt gehindert?', 'Ja');

  // Kleiner Schaden, Werkstatt in der Nähe, Reparatur vor Ort.
  await tippe('Wie groß ist der Schaden?', 'Klein');
  await panneSeite(page, 'Werkstatt in der Nähe (15–30 Minuten Fußweg)?', 4, ['Ja', 'Nein']);
  await bild(page, 'panne-14-werkstatt-nah');
  await tippe('Werkstatt in der Nähe (15–30 Minuten Fußweg)?', 'Ja');
  await panneSeite(page, 'Anruf Werkstatt: Reparatur direkt vor Ort möglich?', 5, ['Ja', 'Nein']);
  await bild(page, 'panne-15-vor-ort');
  await tippe('Anruf Werkstatt: Reparatur direkt vor Ort möglich?', 'Ja');
  await panneSeite(page, 'Rad vor Ort reparieren lassen.', 6, [
    'Erledigt – Rad als „In Reparatur“ markieren',
  ]);
  await bild(page, 'panne-16-werkstatt-reparieren');

  // „← Zurück“ dorthin, woher man kam: drei Seiten bis zur Schadensgröße.
  await zurueck('Rad vor Ort reparieren lassen.');
  await zurueck('Anruf Werkstatt: Reparatur direkt vor Ort möglich?');
  await zurueck('Werkstatt in der Nähe (15–30 Minuten Fußweg)?');
  await tippe('Wie groß ist der Schaden?', 'Groß');
  await tippe('War das die letzte Behandlung am Tag?', 'Ja');
  await tippe('Ist das Raddepot 15–30 Minuten entfernt?', 'Ja');
  await panneSeite(page, 'Lastenrad ins Raddepot bringen.', 6, [
    'Rad als „In Reparatur“ markieren',
  ]);
  await bild(page, 'panne-17-depot-bringen');
  expect(server.aufrufe.record_fleet_breakdown).toBeUndefined();
});

test('G3: ohne Ruhetag zur Vertragswerkstatt, jede Seite bei 375 × 667 ohne Scrollen', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(FREITAG);
  const server = nachbildung();
  await oeffne(page, server, `?pfad=${encodeURIComponent('/betrieb/flotte/panne?rad=rad-1')}`);
  await page.setViewportSize({ width: 375, height: 667 });
  const tippe = (frage: string, antwort: string) =>
    fenster(page, frage).getByRole('button', { name: antwort, exact: true }).click();
  const zurueck = (frage: string) =>
    fenster(page, frage).getByRole('button', { name: '← Zurück' }).click();
  await tippe('Wo ist der Schaden?', 'Weiter');
  await tippe('Ist die Weiterfahrt gehindert?', 'Ja');
  // Groß, kein Ruhetag: gleich zur Vertragswerkstatt (BEF-176).
  await tippe('Wie groß ist der Schaden?', 'Groß');
  const nah = 'Vertragswerkstatt in der Nähe (15–30 Minuten Fußweg)?';
  await panneSeite(page, nah, 4, ['Ja', 'Nein']);
  await bild(page, 'panne-18-vertragswerkstatt-nah');
  await tippe(nah, 'Ja');
  await panneSeite(page, 'Reparatur direkt vor Ort möglich?', 5, ['Ja', 'Nein']);
  await bild(page, 'panne-19-vertragswerkstatt-kontakt');
  await tippe('Reparatur direkt vor Ort möglich?', 'Ja');
  await panneSeite(page, 'Reparatur durchführen lassen.', 6, [
    'Erledigt – Rad als „In Reparatur“ markieren',
  ]);
  await bild(page, 'panne-20-vertragswerkstatt-reparieren');
  await zurueck('Reparatur durchführen lassen.');
  await tippe('Reparatur direkt vor Ort möglich?', 'Nein');
  const uebergabe = 'Teamleitung informieren und mit dem Ersatzrad weiterarbeiten.';
  await panneSeite(page, uebergabe, 6, ['Weiter']);
  await bild(page, 'panne-21-uebergabe');
  await tippe(uebergabe, 'Weiter');
  await tippe('Haben Sie einen Autoführerschein?', 'Nein');

  const abschluss = fenster(page, 'Zusammenfassung – bitte prüfen:');
  await expect(abschluss.getByRole('list', { name: 'Zusammenfassung' })).toContainText(
    'Vertragswerkstatt kontaktiert – Rad übergeben',
  );
  await expect(abschluss.getByRole('button', { name: /^Bestätigen/ })).toBeInViewport({
    ratio: 1,
  });
  await bild(page, 'panne-22-zusammenfassung-uebergabe');
  expect(server.aufrufe.record_fleet_breakdown).toBeUndefined();
});

/** Lastenrad 2, dessen Schlüssel Anna hat (Spec Überholung 6, Szenario 4). */
const BEI_ANNA = testRad({
  id: 'rad-2',
  name: 'Lastenrad 2',
  regular_rider: null,
  planned_weekdays: [],
  key: {
    holder_staff_id: 'staff-anna',
    holder_name: 'Anna Beispiel',
    taken_at: '2026-10-16T05:40:00+00:00',
  },
});

test('G4: Schlüssel von Anna an Tim in drei Tipps nach dem Einstieg, in einem Vorgang', async ({
  page,
}) => {
  const server = nachbildung('therapie', [BEI_ANNA]);
  await oeffne(page, server);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('link', { name: 'Schlüssel übergeben' }).click();
  const z = zaehler();

  const rad = fenster(page, 'Welches Rad?');
  await expect(rad.getByText('Schritt 1 von 3', { exact: true })).toBeVisible();
  // Räder mit Schlüssel im Tresor und bei jemandem, das gesperrte nicht.
  await expect(rad.getByRole('list', { name: 'Räder' }).getByRole('listitem')).toHaveCount(4);
  await expect(rad.getByRole('button', { name: /Lastenrad 3/ })).toHaveCount(0);
  expect(await scrolltNicht(page), 'Welches Rad? ohne Scrollen').toBe(true);
  expect(await ueberlaeuft(page)).toBe(false);
  expect(await axeVerstoesse(page)).toEqual([]);
  const zeile = rad.getByRole('button', { name: /^Lastenrad 2/ });
  await expect(zeile).toContainText('Schlüssel bei Ihnen');
  await mindestens44(zeile);
  await bild(page, 'schluessel-01-rad', true);
  await z.tippe(zeile);

  const person = fenster(page, 'An wen?');
  await expect(person.getByText('Schlüssel übergeben · Lastenrad 2')).toBeVisible();
  // Bei Anna liegt er schon - an sie geht er nicht noch einmal.
  await expect(person.getByRole('list', { name: 'Personen' }).getByRole('listitem')).toHaveText([
    'Nina Neu',
    'Tim Teamleitung',
  ]);
  expect(await scrolltNicht(page), 'An wen? ohne Scrollen').toBe(true);
  expect(await axeVerstoesse(page)).toEqual([]);
  await mindestens44(person.getByRole('button', { name: 'Tim Teamleitung' }));
  await bild(page, 'schluessel-02-person');
  await z.tippe(person.getByRole('button', { name: 'Tim Teamleitung' }));

  const abschluss = fenster(page, 'Alles richtig?');
  await expect(abschluss.getByRole('list', { name: 'Übergabe' }).getByRole('listitem')).toHaveText([
    'RadLastenrad 2Ändern',
    'VonAnna Beispiel (Sie)',
    'AnTim TeamleitungÄndern',
  ]);
  const uebergeben = abschluss.getByRole('button', {
    name: 'Schlüssel an Tim Teamleitung übergeben',
  });
  await expect(uebergeben).toBeInViewport({ ratio: 1 });
  await mindestens44(uebergeben);
  expect(await scrolltNicht(page), 'Abschluss ohne Scrollen').toBe(true);
  expect(await axeVerstoesse(page)).toEqual([]);
  await bild(page, 'schluessel-03-abschluss', true);
  await z.tippe(uebergeben);

  await expect(
    page.getByText('Schlüssel von Lastenrad 2 an Tim Teamleitung übergeben.'),
  ).toBeVisible();
  // Ein Vorgang von Hand zu Hand, nicht über den Tresor.
  expect(server.aufrufe.hand_over_fleet_key).toEqual([
    { p_bike_id: 'rad-2', p_holder_staff_id: 'staff-tim' },
  ]);
  expect(server.aufrufe.return_fleet_key).toBeUndefined();
  expect(server.aufrufe.take_fleet_key).toBeUndefined();
  await expect(page.getByText(/Schlüssel bei Tim Teamleitung/).first()).toBeVisible();
  test.info().annotations.push({
    type: 'G4',
    description: `${z.tipps} Tipps nach dem Einstieg (vorher 4 über den Tresor, zwei Vorgänge)`,
  });
  expect(z.tipps).toBeLessThanOrEqual(3);
});

test('G4: mit dem Rad aus der Adresse in zwei Tipps - der Schlüssel liegt bei einer Kollegin', async ({
  page,
}) => {
  const server = nachbildung('teamleitung', [BEI_ANNA]);
  // `?rad=` wie vom Rad aus; die Seite „Welches Rad?“ entfällt.
  await oeffne(
    page,
    server,
    `?rolle=teamleitung&pfad=${encodeURIComponent('/betrieb/flotte/schluessel?rad=rad-2')}`,
  );
  await page.setViewportSize({ width: 375, height: 667 });
  const z = zaehler();

  const person = fenster(page, 'An wen?');
  await expect(person.getByText('Schritt 2 von 3', { exact: true })).toBeVisible();
  await expect(person.getByRole('list', { name: 'Personen' }).getByRole('listitem')).toHaveText([
    'Tim Teamleitung (Sie)',
    'Nina Neu',
  ]);
  await z.tippe(person.getByRole('button', { name: 'Tim Teamleitung (Sie)' }));
  await z.tippe(
    fenster(page, 'Alles richtig?').getByRole('button', {
      name: 'Schlüssel an Tim Teamleitung übergeben',
    }),
  );
  await expect(page.getByText('Schlüssel von Lastenrad 2 an Sie übergeben.')).toBeVisible();
  expect(server.aufrufe.hand_over_fleet_key).toEqual([
    { p_bike_id: 'rad-2', p_holder_staff_id: 'staff-tim' },
  ]);
  test.info().annotations.push({
    type: 'G4',
    description: `${z.tipps} Tipps mit dem Rad aus der Adresse`,
  });
  expect(z.tipps).toBeLessThanOrEqual(2);
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
  await expect(drucken).toBeEnabled();
  expect(await ueberlaeuft(page)).toBe(false);
  // Bauteilnamen statt gerenderter Ansichten des Rads.
  const tabelle = page.getByRole('region', { name: 'Seite 1 von 2' }).getByRole('table');
  await expect(tabelle).toContainText('Bremse vorne');
  await expect(tabelle).toContainText('Riemen und Riemenscheiben');
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
    '/betrieb/flotte/panne?rad=rad-1',
    '/betrieb/flotte/schluessel',
  ]) {
    await page.goto(`${PRUEFSEITE}?pfad=${encodeURIComponent(pfad)}`);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await ueberlaeuft(page), pfad).toBe(false);
  }
});
