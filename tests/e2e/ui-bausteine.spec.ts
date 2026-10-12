import { expect, test } from '@playwright/test';

/**
 * Die Bausteine aus dem Design-Handoff vom 2026-10-01 in einem echten Browser
 * (UI-Redesign, Schritt 2).
 *
 * Die Komponententests prüfen Klassen, Texte und Rechnung. Hier geht es um
 * das, was jsdom nicht misst: ob bei 375 px nichts waagerecht überläuft, ob
 * die Legende des Wegbalkens in einer Zeile bleibt, ob die Fahrt mittig auf
 * der Spur liegt, ob Zeilen und Aufklapper ein Tippziel von 44 px sind und ob
 * `offenAb="lg"` der Fensterbreite folgt.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/ui-bausteine.html';

for (const breite of [375, 1280]) {
  test(`laeuft bei ${breite} px nicht waagerecht ueber`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 800 });
    await page.goto(PRUEFSEITE);
    await expect(page.getByRole('heading', { name: 'Oberflächen-Bausteine' })).toBeVisible();
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });
}

test('haelt die Legende des Wegbalkens bei 375 px in einer Zeile und die Fahrt mittig', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);

  const karte = page.getByRole('region', { name: 'Nächster Weg' }).first();
  const oben = async (text: string) => (await karte.getByText(text).boundingBox())!.y;
  const puffer = await oben('28 min Puffer');
  expect(Math.abs((await oben('≈ 12 min Rad')) - puffer)).toBeLessThan(2);
  expect(Math.abs((await oben('40 min eingeplant')) - puffer)).toBeLessThan(2);

  // Die Fahrt liegt mittig auf der Spur: gleich viel Puffer links wie rechts.
  const masse = await karte.evaluate((element) => {
    const fahrt = element.querySelector<HTMLElement>('[style]')!;
    const spur = fahrt.previousElementSibling!;
    const f = fahrt.getBoundingClientRect();
    const s = spur.getBoundingClientRect();
    return { links: f.left - s.left, rechts: s.right - f.right, spur: s.height, fahrt: f.height };
  });
  expect(Math.abs(masse.links - masse.rechts)).toBeLessThan(1.5);
  expect(masse.links).toBeGreaterThan(8);
  // Spur 6 px, Fahrt 10 px.
  expect(masse.spur).toBeCloseTo(6, 0);
  expect(masse.fahrt).toBeCloseTo(10, 0);
});

test('laesst dem Balken auch mit langen Namen Platz und kuerzt die Namen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const karte = page.getByRole('region').filter({ hasText: 'Zu spät, Abfahrt sofort' });
  const spur = (await karte.locator('[aria-hidden="true"] > div').first().boundingBox())!;
  expect(spur.width).toBeGreaterThanOrEqual(48);
  const name = karte.getByText('Ende Carl Muster mit einem sehr langen Namen');
  const gekuerzt = await name.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(gekuerzt).toBe(true);
});

test('macht Zeilen und Aufklapper zu Tippzielen von mindestens 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);

  const zeile = page.getByRole('link', { name: /Max Mustermann/ });
  const kasten = (await zeile.boundingBox())!;
  expect(kasten.height).toBeGreaterThanOrEqual(56);
  // Die Zeile reicht über die ganze Breite ihrer Karte.
  const karte = (await zeile.locator('xpath=ancestor::ul').boundingBox())!;
  expect(kasten.width).toBeGreaterThanOrEqual(karte.width - 2.5);

  const knopf = page.getByRole('button', { name: /Berta Bestand/ });
  expect((await knopf.boundingBox())!.width).toBeGreaterThanOrEqual(karte.width - 2.5);

  for (const titel of ['Erledigt heute (3)', 'Tagesplan des Teams (4)', 'Alle Angaben']) {
    const kopf = page.locator('summary', { hasText: titel });
    expect((await kopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // In der Karte ist der zugeklappte Aufklapper 52 px hoch (plus Rahmen).
  const zu = (await page.locator('details', { hasText: 'Alle Angaben' }).boundingBox())!;
  expect(zu.height).toBeGreaterThanOrEqual(52);
  expect(zu.height).toBeLessThanOrEqual(56);
});

test('haelt Kacheln einer Reihe gleich hoch und mindestens 72 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const wann = (await page.getByText('Wann', { exact: true }).locator('..').boundingBox())!;
  const anschrift = (await page
    .getByText('Anschrift', { exact: true })
    .locator('..')
    .boundingBox())!;
  // Bei 375 px stehen zwei nebeneinander.
  expect(Math.abs(wann.y - anschrift.y)).toBeLessThan(1);
  expect(Math.abs(wann.height - anschrift.height)).toBeLessThan(1);
  expect(wann.height).toBeGreaterThanOrEqual(72);
});

test('oeffnet „Alle Angaben" am Rechner von Anfang an, am Telefon nicht', async ({ page }) => {
  const text = page.getByText('Am Rechner von Anfang an offen, am Telefon zu.');

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  await expect(text).toBeHidden();
  await page.locator('summary', { hasText: 'Alle Angaben' }).click();
  await expect(text).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(PRUEFSEITE);
  await expect(text).toBeVisible();
});

test('setzt die Jetzt-Marke auf die Schiene des Zeitstrahls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const marke = page.locator('[data-jetzt]');
  await expect(marke.getByText('Jetzt, 09:42 Uhr')).toBeAttached();
  const mitten = await page.evaluate(() => {
    const mitte = (element: Element) => {
      const kasten = element.getBoundingClientRect();
      return kasten.left + kasten.width / 2;
    };
    const jetzt = document.querySelector('[data-jetzt]')!;
    const punktJetzt = jetzt.querySelector('.bg-accent')!;
    const schiene = jetzt.querySelector('.bg-line')!;
    const punktTermin = document.querySelector('ol > li:not([data-jetzt]) .border-line-strong')!;
    return { jetzt: mitte(punktJetzt), schiene: mitte(schiene), termin: mitte(punktTermin) };
  });
  // Punkt der Marke, Schiene und Punkt eines Termins liegen auf einer Achse.
  expect(Math.abs(mitten.jetzt - mitten.schiene)).toBeLessThan(1);
  expect(Math.abs(mitten.termin - mitten.schiene)).toBeLessThan(1);
});

/*
 * Die Bausteine des Design-Fundaments (docs/design/DESIGN.md) im echten
 * Browser: was jsdom nicht misst - Breiten, Lage, Höhe der Tippziele, was am
 * Telefon zu und am Rechner offen steht.
 */

test('Objektkopf: am Telefon Pfeil vor dem Namen, Aktionen teilen sich die Breite', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const kopf = page.locator('header', { hasText: 'Karla Vorlage' });
  const pfeil = kopf.getByRole('link', { name: 'Zurück zur Liste' });
  const name = kopf.getByRole('heading', { level: 1, name: 'Karla Vorlage' });
  await expect(pfeil).toBeVisible();
  const p = (await pfeil.boundingBox())!;
  const n = (await name.boundingBox())!;
  // Pfeil und Name in einer Zeile, der Pfeil davor.
  expect(p.x + p.width).toBeLessThanOrEqual(n.x + 1);
  expect(Math.abs(p.y + p.height / 2 - (n.y + n.height / 2))).toBeLessThan(6);

  const planen = (await kopf.getByRole('link', { name: 'Einheit planen' }).boundingBox())!;
  const plan = (await kopf.getByRole('link', { name: 'Plan erstellen' }).boundingBox())!;
  expect(Math.abs(planen.y - plan.y)).toBeLessThan(1);
  expect(Math.abs(planen.width - plan.width)).toBeLessThan(2);
  expect(planen.height).toBeGreaterThanOrEqual(44);
  expect(planen.height).toBeLessThan(48);

  // Der offene Reiter ist markiert und ein Tippziel von 44 px.
  const offen = kopf.getByRole('link', { name: 'Einheiten' });
  await expect(offen).toHaveAttribute('aria-current', 'page');
  expect((await offen.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('Objektkopf: am Rechner ohne Pfeil, Aktionen rechts neben dem Namen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(PRUEFSEITE);
  const kopf = page.locator('header', { hasText: 'Karla Vorlage' });
  await expect(kopf.getByRole('link', { name: 'Zurück zur Liste' })).toBeHidden();
  const name = (await kopf.getByRole('heading', { level: 1 }).boundingBox())!;
  const planen = (await kopf.getByRole('link', { name: 'Einheit planen' }).boundingBox())!;
  expect(planen.x).toBeGreaterThan(name.x + name.width);
  expect(Math.abs(planen.y - name.y)).toBeLessThan(20);
});

test('Kopfaktionen sind kompakt: 44 px statt 48', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const anlegen = (await page.getByRole('link', { name: 'Anlegen', exact: true }).boundingBox())!;
  expect(anlegen.height).toBeGreaterThanOrEqual(44);
  expect(anlegen.height).toBeLessThan(48);
});

test('Segment: Wahlen 44 px hoch, ohne Lücke aneinander, der Tipp wechselt die Wahl', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const gruppe = page.getByRole('group', { name: 'Ansicht der Schau' });
  const woche = gruppe.getByRole('button', { name: 'Woche' });
  const team = gruppe.getByRole('button', { name: 'Team' });
  const w = (await woche.boundingBox())!;
  const t = (await team.boundingBox())!;
  expect(w.height).toBeGreaterThanOrEqual(44);
  // Aneinandergesetzt: Der Rand teilt sich (-1 px), keine Lücke dazwischen.
  expect(Math.abs(w.x + w.width - 1 - t.x)).toBeLessThan(1.5);
  await team.click();
  await expect(team).toHaveAttribute('aria-pressed', 'true');
  await expect(woche).toHaveAttribute('aria-pressed', 'false');
});

test('Filterleiste: am Telefon weitere Filter hinter „Filter (n)“, am Rechner offen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const leiste = page.getByRole('search', { name: 'Übungen filtern' });
  const suche = leiste.getByRole('searchbox', { name: 'Übungen durchsuchen' });
  await expect(suche).toBeVisible();
  // Die Suche reicht über die ganze Breite des Inhalts (375 - 2 × 16).
  expect((await suche.boundingBox())!.width).toBeGreaterThan(340);
  // Ein Filter ist gesetzt (Knie): die Leiste steht offen.
  await expect(leiste.getByRole('button', { name: 'Filter (1)' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await leiste.getByRole('button', { name: 'Filter zurücksetzen' }).click();
  const schalter = leiste.getByRole('button', { name: 'Filter', exact: true });
  await schalter.click();
  await expect(leiste.getByRole('combobox', { name: 'Ausrüstung' })).toBeHidden();
  await schalter.click();
  await expect(leiste.getByRole('combobox', { name: 'Ausrüstung' })).toBeVisible();
  expect(
    (await leiste.getByRole('button', { name: 'Hüfte' }).boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(PRUEFSEITE);
  const breit = page.getByRole('search', { name: 'Übungen filtern' });
  await expect(breit.getByRole('button', { name: /^Filter( \(\d+\))?$/ })).toBeHidden();
  const auswahl = (await breit.getByRole('combobox', { name: 'Ausrüstung' }).boundingBox())!;
  expect(auswahl.width).toBeLessThanOrEqual(320.5);
  // Die Beschriftungen der Filter stehen auf einer Linie.
  const a = (await breit.getByText('Ausrüstung', { exact: true }).boundingBox())!;
  const k = (await breit.getByText('Körperregion', { exact: true }).boundingBox())!;
  expect(Math.abs(a.y - k.y)).toBeLessThan(1);
});

test('Zeile mit Aktion: das Ziel endet vor dem Knopf, beide sind Tippziele', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const ziel = (await page.getByRole('link', { name: /Jonas Test/ }).boundingBox())!;
  const haken = (await page
    .getByRole('button', { name: 'Termin von Jonas Test abschließen' })
    .boundingBox())!;
  const doku = (await page.getByRole('button', { name: 'Doku', exact: true }).boundingBox())!;
  expect(ziel.height).toBeGreaterThanOrEqual(56);
  expect(ziel.x + ziel.width).toBeLessThanOrEqual(doku.x + 0.5);
  expect(haken.width).toBeGreaterThanOrEqual(44);
  expect(haken.height).toBeGreaterThanOrEqual(44);
  expect(doku.height).toBeGreaterThanOrEqual(44);

  // Das Vorschaubild steht vorn in 56 × 56 px.
  const rahmen = (await page
    .getByRole('link', { name: /Wandsitz/ })
    .locator('.size-14')
    .first()
    .boundingBox())!;
  expect(Math.round(rahmen.width)).toBe(56);
  expect(Math.round(rahmen.height)).toBe(56);
});

test('Datenliste: am Telefon Zeilen ohne Kopf, am Rechner Spalten mit bündigen Beträgen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const liste = page.getByRole('list', { name: 'Rechnungen der Schau' });
  await expect(liste.locator('xpath=preceding-sibling::div[1]')).toBeHidden();
  const betrag = (await liste.getByText('126,40 €').boundingBox())!;
  const nummer = (await liste.getByRole('link', { name: '2026-014' }).boundingBox())!;
  // Der Betrag steht oben rechts neben der Nummer.
  expect(Math.abs(betrag.y - nummer.y)).toBeLessThan(6);
  expect(betrag.x).toBeGreaterThan(nummer.x + nummer.width);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(PRUEFSEITE);
  const breit = page.getByRole('list', { name: 'Rechnungen der Schau' });
  await expect(breit.locator('xpath=preceding-sibling::div[1]')).toBeVisible();
  const rechts = await Promise.all(
    ['126,40 €', '84,00 €', '1.204,00 €'].map(async (wert) => {
      const kasten = (await breit.getByText(wert).boundingBox())!;
      return kasten.x + kasten.width;
    }),
  );
  expect(Math.max(...rechts) - Math.min(...rechts)).toBeLessThan(1);
});

test('Medienbild hält 4:3 und zeigt ohne Bild den Platzhalter', async ({ page }) => {
  for (const breite of [375, 1280]) {
    await page.setViewportSize({ width: breite, height: 800 });
    await page.goto(PRUEFSEITE);
    const figur = page.getByRole('img', { name: /Wandsitz: Rücken an der Wand/ });
    const kasten = (await figur.locator('..').boundingBox())!;
    expect(Math.abs(kasten.width / kasten.height - 4 / 3)).toBeLessThan(0.02);
    await expect(
      page.getByRole('img', { name: 'Seitstütz - Noch kein Bild' }).last(),
    ).toBeVisible();
  }
});

test('Formularfuß: am Telefon volle Breite untereinander, am Rechner nebeneinander', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  let speichern = (await page
    .getByRole('button', { name: 'Speichern', exact: true })
    .boundingBox())!;
  let abbrechen = (await page.getByRole('link', { name: 'Abbrechen', exact: true }).boundingBox())!;
  expect(speichern.width).toBeGreaterThan(340);
  expect(speichern.height).toBeGreaterThanOrEqual(48);
  expect(abbrechen.y).toBeGreaterThan(speichern.y + speichern.height - 1);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(PRUEFSEITE);
  speichern = (await page.getByRole('button', { name: 'Speichern', exact: true }).boundingBox())!;
  abbrechen = (await page.getByRole('link', { name: 'Abbrechen', exact: true }).boundingBox())!;
  expect(speichern.width).toBeLessThan(200);
  expect(Math.abs(abbrechen.y - speichern.y)).toBeLessThan(1);
  expect(abbrechen.x).toBeGreaterThan(speichern.x + speichern.width);
});

test('Aktionsleiste klebt am Telefon über der Tableiste', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const knopf = page.getByRole('button', { name: 'Festschreiben' });
  const leiste = knopf.locator('xpath=../..');
  expect(await leiste.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
  // Der Abschnitt oben im Bild: Ohne Kleben stünde die Leiste unter dem Rand.
  await page
    .getByRole('heading', { name: 'Aktionsleiste', exact: true })
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  // 56 px Tableiste und ihre Linie Abstand zum Fensterrand.
  const kasten = (await leiste.boundingBox())!;
  expect(Math.round(800 - (kasten.y + kasten.height))).toBe(57);
  expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('Zweispalter: ab 900 px Inhaltsbreite die Kontextspalte rechts, schmal darunter', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(PRUEFSEITE);
  const haupt = (await page.getByText('Ab 900 px Inhaltsbreite').boundingBox())!;
  const kontext = (await page.getByText('Selbstzahler · 10er-Karte').boundingBox())!;
  expect(kontext.x).toBeGreaterThan(haupt.x + haupt.width);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const hauptSchmal = (await page.getByText('Ab 900 px Inhaltsbreite').boundingBox())!;
  const kontextSchmal = (await page.getByText('Selbstzahler · 10er-Karte').boundingBox())!;
  expect(kontextSchmal.y).toBeGreaterThan(hauptSchmal.y);
});
