import { expect, test, type Page } from '@playwright/test';

/**
 * Die Übersicht als Zeitstrahl in einem echten Browser (UX-EPIC-003,
 * Design-Handoff 2026-10-01).
 *
 * Die Komponententests prüfen Zählung, Texte und Wege. Hier geht es um das,
 * was jsdom nicht misst: ob Liege, Wegbalken und der Anfang der Karte bei
 * 375 px auf dem ersten Bildschirm stehen, ob die Knöpfe Tippziele sind, ob
 * die Seite ohne waagerechtes Scrollen auskommt und ob die Kontextspalte erst
 * ab 900 px Inhaltsbreite neben den Tag rückt.
 *
 * Die Uhr des Browsers ist gestellt: Was die Seite zeigt, hängt daran, ob ein
 * Besuch schon begonnen hat.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/uebersicht.html';
const ZONE = 'Europe/Berlin';

/** Heute um diese Uhrzeit in der Zeit der Praxis - gleich, wo der Prüfrechner steht. */
function heuteUm(uhrzeit: string): Date {
  const tag = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
  const utc = Date.parse(`${tag}T${uhrzeit}:00Z`);
  const versatz =
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: ZONE })).getTime() -
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(utc - versatz);
}

async function oeffne(page: Page, uhrzeit: string, breite: number, abfrage = '', hoehe = 740) {
  await page.setViewportSize({ width: breite, height: hoehe });
  await page.clock.setFixedTime(heuteUm(uhrzeit));
  await page.goto(PRUEFSEITE + abfrage);
}

async function ohneUeberlauf(page: Page) {
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(ueberlauf).toBe(false);
}

for (const breite of [375, 1280]) {
  test(`zeigt Liege, Wegbalken und den Anfang des ersten Wegs auf dem ersten Bildschirm (${breite} px)`, async ({
    page,
  }) => {
    await oeffne(page, '08:05', breite);

    // Datum und Tagesfortschritt stehen auch am Telefon da (Design-Review R2,
    // U1, U3): am Telefon Monat und Jahr über der Wochenleiste, die Wochentag
    // und Tag nennt (Jannes, 13.10.2026), lang ab 640 px.
    const kopf = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
    await expect(
      kopf.getByText(breite < 640 ? /^\S+ \d{4}$/ : /^\S+, \d{1,2}\. \S+ \d{4}$/),
    ).toBeVisible();
    await expect(
      kopf.getByText(breite < 640 ? '0 von 3' : '0 von 3 Besuchen erledigt', { exact: true }),
    ).toBeVisible();

    const liege = page.getByText('Liege heute', { exact: true }).locator('..');
    await expect(liege).toContainText('Ja');
    await expect(liege).toContainText('ab 2. Besuch, 10:00');

    // Die Kachel „Abfahrt": 25 Minuten bis zum Beginn, 12 davon Fahrt. Der
    // Puffer reicht und steht deshalb nicht da (Jannes, 2026-10-11).
    const abfahrt = page.getByText('Abfahrt', { exact: true }).locator('..');
    await expect(abfahrt).toContainText('spätestens 08:18');
    await expect(abfahrt).toContainText('≈ 12 min Rad');
    await expect(abfahrt).not.toContainText('Puffer');
    // Beide Kacheln in einer Reihe, auch bei 375 px.
    const l = (await liege.boundingBox())!;
    const a = (await abfahrt.boundingBox())!;
    expect(Math.abs(l.y - a.y)).toBeLessThanOrEqual(1);
    expect(a.y + a.height).toBeLessThan(600);

    // Die Karte beginnt auf dem ersten Bildschirm - über der Tableiste.
    const karte = page.getByRole('article');
    const name = karte.getByRole('link', { name: 'Erika Beispiel', exact: true });
    await expect(name).toBeVisible();
    const namensKasten = (await name.boundingBox())!;
    expect(namensKasten.y + namensKasten.height).toBeLessThanOrEqual(740 - 57);

    // Der Hauptknopf in voller Breite der Karte und 48 px hoch.
    const navigation = page.getByRole('button', { name: 'Navigation starten' });
    await expect(navigation).toHaveCount(1);
    const knopf = (await navigation.boundingBox())!;
    expect(knopf.height).toBeGreaterThanOrEqual(48);
    const kartenKasten = (await karte.boundingBox())!;
    expect(knopf.width).toBeGreaterThanOrEqual(kartenKasten.width - 34);

    await ohneUeberlauf(page);
  });
}

// Auftrag C1: Der Hauptknopf des nächsten oder laufenden Besuchs liegt
// vollständig über der Tableiste, auch am kleinen Telefon (iPhone SE) und auch
// am zweiten und dritten Besuch des Tages - der Test prüfte bis dahin nur den
// Anfang der Karte.
for (const [abfrage, uhrzeit, knopf] of [
  ['', '08:05', 'Navigation starten'],
  ['', '08:40', /^Termin abschließen/],
  ['?ansicht=zweiter', '09:45', 'Navigation starten'],
  ['?ansicht=zweiter', '10:05', /^Termin abschließen/],
  ['?ansicht=dritter', '11:05', 'Navigation starten'],
  ['?ansicht=dritter', '11:40', /^Termin abschließen/],
] as const) {
  test(`hält den Hauptknopf bei 375 × 667 über der Tableiste (${abfrage || 'erster'} ${uhrzeit})`, async ({
    page,
  }) => {
    await oeffne(page, uhrzeit, 375, abfrage, 667);
    const karte = page.getByRole('article');
    const haupt = karte.getByRole('button', { name: knopf });
    await expect(haupt).toBeVisible();
    const kasten = (await haupt.boundingBox())!;
    expect(kasten.height).toBeGreaterThanOrEqual(48);
    expect(kasten.y + kasten.height).toBeLessThanOrEqual(667 - 57);
    // Ab dem Beginn steht „Doku" neben dem Haken - ebenfalls im Bild.
    if (typeof knopf !== 'string') {
      const doku = (await karte
        .getByRole('link', { name: 'Doku zu diesem Termin' })
        .boundingBox())!;
      expect(doku.y + doku.height).toBeLessThanOrEqual(667 - 57);
    }
    await ohneUeberlauf(page);
  });
}

// B6: Nach einem abgehakten Besuch trägt die Karte des nächsten Wegs den
// Wegbalken wie die Zeilen - unter dem Kicker, an Stelle der Minuten. Am
// Telefon ohne Zahlen (die Kachel „Abfahrt" nennt den Weg) und ohne eine
// Zeile mehr: Der Hauptknopf bleibt über der Tableiste (Test oben).
for (const breite of [375, 1280]) {
  test(`zeigt den Wegbalken auch an der Karte nach einem abgehakten Besuch (${breite} px, B6)`, async ({
    page,
  }) => {
    await oeffne(page, '09:45', breite, '?ansicht=zweiter', 667);
    const karte = page.getByRole('article');
    const kicker = karte.getByRole('heading', { name: 'Nächster Weg', exact: true });
    await expect(kicker).toBeVisible();
    const fahrt = karte.locator('[aria-hidden="true"] [style*="width"]');
    await expect(fahrt).toBeVisible();
    const k = (await kicker.boundingBox())!;
    const f = (await fahrt.boundingBox())!;
    const n = (await karte
      .getByRole('link', { name: 'Max Mustermann', exact: true })
      .boundingBox())!;
    // Unter dem Kicker, über dem Namen.
    expect(f.y).toBeGreaterThanOrEqual(k.y + k.height);
    expect(f.y + f.height).toBeLessThanOrEqual(n.y);
    // Erika ist seit 09:30 fertig: Der Balken beginnt jetzt wie die Kachel
    // (ANN-196) - 09:45 bis 10:00 bei 9 Minuten Fahrt.
    const zahlen = karte.getByText('≈ 9 min Rad · 6 min Puffer');
    const z = (await zahlen.boundingBox())!;
    if (breite < 640) {
      expect(z.width).toBeLessThanOrEqual(1);
      await expect(page.getByText('Abfahrt', { exact: true })).toBeVisible();
    } else {
      expect(z.width).toBeGreaterThan(100);
    }
    // Uhrzeit und Punkt bleiben auf der Höhe des Kickers.
    const punkt = (await page
      .locator('li[data-termin]', { has: karte })
      .locator('[data-punkt]')
      .boundingBox())!;
    expect(Math.abs(punkt.y + punkt.height / 2 - (k.y + k.height / 2))).toBeLessThanOrEqual(3);
    await ohneUeberlauf(page);
  });
}

test('fasst am Telefon das Erledigte vor dem nächsten Besuch in einer Zeile zusammen', async ({
  page,
}) => {
  await oeffne(page, '11:05', 375, '?ansicht=dritter', 667);
  const strahl = page.getByRole('heading', { name: 'Tagesablauf' }).locator('..');
  const zusammen = strahl.getByRole('button', { name: /^Erledigt \(2\)/ });
  await expect(zusammen).toBeVisible();
  await expect(strahl.getByText('Erika Beispiel')).toBeHidden();
  await zusammen.click();
  await expect(strahl.getByText('Erika Beispiel')).toBeVisible();
  // Ab 640 px stehen sie immer da.
  await oeffne(page, '11:05', 1280, '?ansicht=dritter');
  await expect(strahl.getByRole('button', { name: /^Erledigt/ })).toBeHidden();
  await expect(strahl.getByText('Erika Beispiel')).toBeVisible();
});

test('klappt eine spätere Zeile mit Navigation, Anruf und Doku auf (Auftrag C1)', async ({
  page,
}) => {
  await oeffne(page, '08:05', 375);
  const zeile = page.locator('[data-termin] [data-zeile]', { hasText: 'Max Mustermann' });
  await zeile.click();
  const karten = page.getByRole('article');
  await expect(karten).toHaveCount(2);
  const karte = karten.nth(1);
  await expect(karte.getByRole('heading', { name: 'Später', exact: true })).toBeVisible();
  // Der Balken, der über der Zeile lag, steht jetzt in der Karte - mit
  // Zahlen, denn diesen Weg nennt keine Kachel (B6).
  await expect(karte.getByText('≈ 9 min Rad · 21 min Puffer')).toBeVisible();
  await expect(page.getByText('≈ 9 min Rad · 21 min Puffer')).toHaveCount(1);
  for (const ziel of [
    karte.getByRole('button', { name: 'Navigation starten' }),
    karte.getByRole('link', { name: 'Doku zu diesem Termin' }),
    karte.getByRole('link', { name: 'Anrufen: Max Mustermann' }),
    karte.getByRole('button', { name: 'Zuklappen: Max Mustermann' }),
    karte.getByRole('button', { name: 'Später da?' }),
  ]) {
    await expect(ziel).toBeVisible();
    expect((await ziel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // Keine Nummer im Bild, bevor jemand das „i" öffnet.
  await expect(karte.getByText('+49 160 0000005')).toHaveCount(0);
  await ohneUeberlauf(page);
  await karte.getByRole('button', { name: 'Zuklappen: Max Mustermann' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(zeile).toBeFocused();
});

test('zeigt „Ausfall" an der laufenden Karte mit der 15-Minuten-Uhr (Auftrag C1, B12)', async ({
  page,
}) => {
  await oeffne(page, '08:40', 375);
  const karte = page.getByRole('article');
  await karte.getByRole('button', { name: 'Ausfall' }).click();
  await expect(karte.getByRole('timer')).toHaveText(/^Gewartet \d+:\d\d von 15:00$/);
  const vermerken = karte.getByRole('button', { name: /nicht angetroffen/ });
  expect((await vermerken.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(karte.getByRole('link', { name: 'Ohne Behandlung festhalten' })).toBeVisible();
  await ohneUeberlauf(page);
});

// B12: „Ausfall" an jeder begonnenen Behandlung ohne Doku, nicht nur an der
// Karte des nächsten Wegs. 11:10: Erika und Max sind vorbei und nicht
// abgehakt, Petra (11:30) hat noch nicht begonnen.
for (const breite of [375, 1280]) {
  test(`bietet „Ausfall" an jeder begonnenen Zeile ohne Doku (${breite} px, B12)`, async ({
    page,
  }) => {
    await oeffne(page, '11:10', breite, '', 667);
    const strahl = page.getByRole('heading', { name: 'Tagesablauf' }).locator('..');
    const max = strahl.locator('li[data-termin]', { hasText: 'Max Mustermann' });
    const zeile = max.locator('[data-zeile]');
    // Für Vorlesesoftware trägt jeder „Ausfall“ Name und Uhrzeit (UEB-10).
    const ausfall = max.getByRole('button', {
      name: 'Ausfall für Max Mustermann um 10:00 Uhr',
      exact: true,
    });
    const doku = max.getByRole('link', { name: /^Doku zum Termin um / });
    const haken = max.getByRole('button', { name: /^Termin abschließen/ });
    await expect(ausfall).toBeVisible();
    await expect(
      strahl.locator('li[data-termin]', { hasText: 'Erika Beispiel' }).getByRole('button', {
        name: 'Ausfall für Erika Beispiel um 08:30 Uhr',
        exact: true,
      }),
    ).toBeVisible();
    // Petra hat noch nicht begonnen: kein Ausfall an der Karte des nächsten Wegs.
    await expect(page.getByRole('article').getByRole('button', { name: 'Ausfall' })).toHaveCount(0);

    const [z, a, d, h] = await Promise.all(
      [zeile, ausfall, doku, haken].map(async (ziel) => (await ziel.boundingBox())!),
    );
    for (const kasten of [z!, a!, d!, h!]) expect(kasten.height).toBeGreaterThanOrEqual(44);
    // „Ausfall", „Doku", Haken: 12 px auseinander, der Haken zuletzt.
    expect(d!.x - (a!.x + a!.width)).toBeGreaterThanOrEqual(12);
    expect(h!.x - (d!.x + d!.width)).toBeGreaterThanOrEqual(12);
    expect(Math.abs(a!.y - h!.y)).toBeLessThanOrEqual(1);
    if (breite < 640) {
      // Am Telefon unter Name und Ort, 12 px abgesetzt; die Zeile hat die ganze Breite.
      expect(a!.y).toBeGreaterThanOrEqual(z!.y + z!.height + 11.5);
      expect(z!.width).toBeGreaterThan(220);
    } else {
      // Ab 640 px in einer Reihe mit Name und Ort.
      expect(a!.y).toBeLessThan(z!.y + z!.height);
    }

    // Das Protokoll öffnet sich unter der Zeile über die ganze Breite.
    await ausfall.click();
    const feld = max.getByRole('region', {
      name: 'Ausfall für Max Mustermann um 10:00 Uhr',
      exact: true,
    });
    await expect(feld.getByRole('checkbox')).toHaveCount(3);
    const inhalt = (await max.locator(':scope > div').boundingBox())!;
    const f = (await feld.boundingBox())!;
    expect(f.width).toBeGreaterThanOrEqual(inhalt.width - 1);
    expect(f.y).toBeGreaterThan(a!.y + a!.height);
    const vermerken = feld.getByRole('button', { name: /nicht angetroffen/ });
    expect((await vermerken.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await ohneUeberlauf(page);
  });
}

test('stellt den Tag als Zeitstrahl dar: Jetzt-Marke, Karte, Zeilen mit Uebergaengen', async ({
  page,
}) => {
  await oeffne(page, '08:05', 375);

  const strahl = page.getByRole('heading', { name: 'Tagesablauf' }).locator('..');
  const eintraege = strahl.getByRole('listitem');
  // Jetzt-Marke, drei Besuche, eine Fehlzeit.
  await expect(eintraege).toHaveCount(5);
  await expect(eintraege.nth(0)).toContainText('Jetzt, 08:05 Uhr');
  await expect(eintraege.nth(1).getByRole('article')).toBeVisible();

  // Die späteren Besuche: eine Zeile mit Ort, Liege und Anfahrt, darüber der
  // Übergang.
  const zweite = eintraege.nth(2);
  await expect(zweite.locator('[data-zeile]')).toContainText(
    'Beispielstrasse 12 · ✓ Liege · Anfahrt ≈ 9 min',
  );
  // Daneben ein eigener Knopf „Doku" mit 44 px Tippziel (Leitfaden L3).
  const doku = zweite.getByRole('link', { name: /^Doku zum Termin um / });
  await expect(doku).toBeVisible();
  expect((await doku.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(zweite).toContainText('≈ 9 min Rad · 21 min Puffer');
  // 11:00 bis 11:30 bei 26 Minuten Fahrt: knapp, mit Zeichen und Zahl.
  await expect(eintraege.nth(3)).toContainText('! ≈ 26 min Rad · 4 min Puffer');
  // Die Fehlzeit steht an ihrer Uhrzeit, ohne Übergang.
  await expect(eintraege.nth(4)).toContainText('Teambesprechung');
  await expect(eintraege.nth(4)).toContainText('Fehlzeit · Video');
  await expect(eintraege.nth(4)).not.toContainText('min Rad');

  // Jede Zeile ist ein Tippziel von 44 px - die Besuche klappen auf, die
  // Fehlzeit führt in den Kalender (Auftrag C1).
  for (const zeile of [
    ...(await strahl.locator('[data-zeile]').all()),
    strahl.getByRole('link', { name: /Teambesprechung/ }),
  ]) {
    expect((await zeile.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // Am späteren Besuch steht statt des Hakens das Telefon (Auftrag C1).
  const anruf = zweite.getByRole('link', { name: 'Anrufen: Max Mustermann' });
  await expect(anruf).toHaveAttribute('href', 'tel:+491600000005');
  expect((await anruf.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await expect(zweite.getByRole('button', { name: /^Termin abschließen/ })).toHaveCount(0);

  // Punkt der Marke und Punkte der Termine liegen auf einer Achse.
  const mitten = await page.evaluate(() => {
    const mitte = (element: Element) => {
      const kasten = element.getBoundingClientRect();
      return kasten.left + kasten.width / 2;
    };
    return [
      ...document.querySelectorAll('[data-jetzt] .bg-accent.size-2, [data-termin] [data-punkt]'),
    ].map(mitte);
  });
  expect(mitten.length).toBe(5);
  for (const m of mitten) expect(Math.abs(m - mitten[0]!)).toBeLessThan(1);

  await ohneUeberlauf(page);
});

// AKTE-008: keine Etagen-Pille mehr; Etage, Zugang, Besonderheit und
// Rufnummern hinter dem Info-Knopf. Darunter genau ein „Doku" neben dem Haken.
test('haelt Etage, Zugang und Kontakt hinter dem Info-Knopf', async ({ page }) => {
  await oeffne(page, '08:05', 375);
  const karte = page.getByRole('article');

  await expect(karte.getByText('Testweg 7, 72072 Tuebingen')).toBeVisible();
  await expect(karte.getByRole('button', { name: 'Erdgeschoss' })).toHaveCount(0);
  await expect(karte.getByText('Erdgeschoss', { exact: true })).toHaveCount(0);
  const info = karte.getByRole('button', { name: 'Etage, Zugang und Kontakt' });
  await expect(karte.getByText('Schlüssel bei der Nachbarin.', { exact: false })).toHaveCount(0);
  // Die Nummer steht nicht im Bild: Der Anrufknopf (Auftrag C1) ist ein
  // Symbol, die Nummern selbst liegen hinter dem „i".
  await expect(karte.getByText('+49 160 0000006')).toHaveCount(0);
  const anruf = karte.locator('a[href^="tel:"]');
  await expect(anruf).toHaveCount(1);
  await expect(anruf).toHaveAccessibleName('Anrufen: Erika Beispiel');
  await expect(anruf).toHaveText('');

  // Der Info-Knopf: 22 px im Bild, 44 px zum Tippen.
  const kasten = (await info.boundingBox())!;
  expect(kasten.width).toBeGreaterThanOrEqual(44);
  expect(kasten.height).toBeGreaterThanOrEqual(44);

  await info.click();
  await expect(karte.getByText('Etage', { exact: true })).toBeVisible();
  await expect(karte.getByText('Erdgeschoss', { exact: true })).toBeVisible();
  await expect(karte.getByText('Zugangshinweis', { exact: true })).toBeVisible();
  await expect(karte.getByText('Klingel "Beispiel". Schlüssel bei der Nachbarin.')).toBeVisible();
  const nummer = karte.getByRole('link', { name: '+49 160 0000006' });
  expect((await nummer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await info.click();
  await expect(karte.getByText('Zugangshinweis', { exact: true })).toHaveCount(0);

  // Unter der Navigation: „Doku", Anruf und der Haken in einer Reihe, 44 px hoch.
  await expect(karte.getByRole('link', { name: /^Doku/ })).toHaveCount(1);
  const doku = (await karte.getByRole('link', { name: 'Doku zu diesem Termin' }).boundingBox())!;
  const haken = (await karte
    .getByRole('button', { name: 'Behandlung abschließen' })
    .boundingBox())!;
  const navi = (await karte.getByRole('button', { name: 'Navigation starten' }).boundingBox())!;
  expect(doku.height).toBe(44);
  expect(haken.width).toBe(44);
  expect(haken.height).toBe(44);
  expect(Math.abs(doku.y - haken.y)).toBeLessThanOrEqual(1);
  expect(doku.y).toBeGreaterThan(navi.y + navi.height - 1);
  expect(haken.x).toBeGreaterThan(doku.x + doku.width);

  // Die offene Erstaufnahme führt in die Akte - eine Pille von 36 px, ein
  // Ziel von 44 px (Design-Review R2, H1).
  const erstaufnahme = karte.getByRole('link', { name: /Erstaufnahme offen/ });
  await expect(erstaufnahme).toBeVisible();
  expect((await erstaufnahme.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await ohneUeberlauf(page);
});

test('wird ab dem Beginn zur Arbeitskarte und zeigt den Weg danach', async ({ page }) => {
  await oeffne(page, '08:40', 375);
  const karte = page.getByRole('article');

  await expect(karte.getByRole('heading', { name: 'Jetzt · bis 09:30' })).toBeVisible();
  // „Doku" ist der eine gefüllte Hauptknopf, der Haken 48 mit Rahmen in
  // derselben Reihe (Design-Review R2, U2).
  const haken = (await karte.getByRole('button', { name: /^Termin abschließen/ }).boundingBox())!;
  const doku = (await karte.getByRole('link', { name: 'Doku zu diesem Termin' }).boundingBox())!;
  expect(haken.height).toBe(48);
  expect(haken.width).toBe(48);
  expect(doku.height).toBe(48);
  expect(Math.abs(doku.y - haken.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Navigation starten' })).toHaveCount(0);
  // Genau ein gefüllter Knopf in der Karte (DESIGN.md Regel 4).
  const gefuellt = await karte.evaluate((el) =>
    [...el.querySelectorAll('a, button')]
      .filter((ziel) => ziel.classList.contains('bg-accent'))
      .map((ziel) => ziel.textContent?.trim()),
  );
  expect(gefuellt).toEqual(['Doku zu diesem Termin']);

  const abfahrt = page.getByText('Abfahrt danach', { exact: true }).locator('..');
  await expect(abfahrt).toContainText('spätestens 09:51');
  // Die Jetzt-Marke steht hinter dem laufenden Besuch.
  const eintraege = page
    .getByRole('heading', { name: 'Tagesablauf' })
    .locator('..')
    .getByRole('listitem');
  await expect(eintraege.nth(1)).toContainText('Jetzt, 08:40 Uhr');
  await ohneUeberlauf(page);
});

test('zaehlt den Weg herunter, sobald der Termin davor vorbei ist', async ({ page }) => {
  // 11:10: Der zweite Besuch (bis 11:00) ist nicht abgehakt. Nach der Uhr
  // (ANN-117 Fassung 2) ist der dritte um 11:30 der nächste Weg - 26 Minuten
  // Fahrt, ab jetzt gerechnet.
  await oeffne(page, '11:10', 375);
  const abfahrt = page.getByText('Abfahrt', { exact: true }).locator('..');
  await expect(abfahrt).toContainText('! Sofort');
  await expect(abfahrt).toContainText('≈ 26 min Rad');
  await expect(abfahrt).toContainText('6 min zu knapp');
  await expect(page.getByRole('article')).toContainText('Petra Platzhalter');
  // Der liegengebliebene Besuch steht als Zeile mit „Nicht abgeschlossen“ da.
  const zeilen = page
    .getByRole('heading', { name: 'Tagesablauf' })
    .locator('..')
    .getByRole('listitem');
  await expect(zeilen.filter({ hasText: 'Max Mustermann' })).toContainText('Nicht abgeschlossen');
});

for (const breite of [375, 1280]) {
  test(`schliesst den Tag in Tiefgruen ab (${breite} px)`, async ({ page }) => {
    await oeffne(page, '17:00', breite, '?ansicht=abend');

    const abschluss = page.getByRole('heading', { name: 'Alle Besuche erledigt' }).locator('..');
    await expect(abschluss).toContainText('3 von 3 Besuchen erledigt · 3 Dokus festgeschrieben');
    await expect(page.getByText('Liege heute', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
    // Darunter, was morgen kommt (Jannes, 2026-10-11): Liege und Abfahrt.
    const morgen = page.getByRole('region', { name: /^Morgen · / });
    await expect(morgen.getByRole('link', { name: 'Zum Tag' })).toBeVisible();
    await expect(morgen.getByText('Liege morgen', { exact: true }).locator('..')).toContainText(
      'ab 2. Besuch, 10:00',
    );
    // Der heutige Tag bleibt darunter stehen; die Jetzt-Marke am Ende.
    const eintraege = page
      .getByRole('heading', { name: /^Heute · / })
      .locator('..')
      .getByRole('listitem');
    await expect(eintraege).toHaveCount(5);
    await expect(eintraege.nth(4)).toContainText('Jetzt, 17:00 Uhr');
    await ohneUeberlauf(page);
  });
}

test('listet am Tagesende erst, was heute offen ist, dann morgen (Auftrag C1)', async ({
  page,
}) => {
  await oeffne(page, '17:00', 375, '?ansicht=doku');
  await expect(page.getByRole('heading', { name: 'Alle Besuche erledigt' })).toBeVisible();
  const offen = page.getByRole('heading', { name: 'Heute noch offen (2)' }).locator('../..');
  await expect(offen).toBeVisible();
  const zeilen = offen.getByRole('listitem');
  await expect(zeilen.filter({ hasText: 'Max Mustermann' })).toContainText('Heilmittel offen');
  await expect(zeilen.filter({ hasText: 'Petra Platzhalter' })).toContainText('Doku im Entwurf');
  for (const knopf of await offen.getByRole('link').all()) {
    expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // Vor der Vorschau auf morgen - und ohne zweite Karte dafür.
  const morgen = page.getByRole('heading', { name: /^Morgen · / });
  expect((await offen.boundingBox())!.y).toBeLessThan((await morgen.boundingBox())!.y);
  await expect(page.getByRole('article')).toHaveCount(0);
  // Darunter „Nachzuholen" aus den Tagen davor, zugeklappt.
  await expect(page.getByText('Nachzuholen', { exact: true })).toBeVisible();
  await ohneUeberlauf(page);
});

test('stellt den Tagesplan des Teams ab 900 px Inhaltsbreite neben den Tag, sonst darunter', async ({
  page,
}) => {
  const lage = async () => {
    const tag = (await page
      .getByRole('heading', { name: 'Tagesablauf' })
      .locator('..')
      .boundingBox())!;
    const team = (await page.locator('aside').boundingBox())!;
    return { tag, team };
  };

  // 1280 px: Seitenleiste 248, Inhalt gut 960 - zwei Spalten.
  await oeffne(page, '08:05', 1280);
  let { tag, team } = await lage();
  expect(team.x).toBeGreaterThan(tag.x + tag.width);
  expect(team.width).toBeGreaterThanOrEqual(300);
  expect(team.width).toBeLessThanOrEqual(380);
  // Am Rechner ist der Plan von Anfang an offen, mit Zeichen statt Abzeichen.
  await expect(page.locator('aside').getByText('Nicht angetroffen')).toBeVisible();
  await expect(page.locator('aside').getByRole('link', { name: 'Zum Kalender' })).toBeVisible();

  // 900 px Fenster: Symbolspalte 72, Inhalt unter 900 - eine Spalte.
  await oeffne(page, '08:05', 900);
  ({ tag, team } = await lage());
  expect(team.y).toBeGreaterThan(tag.y + tag.height - 1);
  expect(Math.abs(team.x - tag.x)).toBeLessThan(140);
  await ohneUeberlauf(page);

  // 375 px: zugeklappt unter dem Tag, als Karte mit Zähler.
  await oeffne(page, '08:05', 375);
  const kopf = page.locator('aside summary', { hasText: 'Tagesplan des Teams' });
  await expect(kopf).toContainText('Tagesplan des Teams (4)');
  await expect(page.locator('aside').getByText('Nicht angetroffen')).toBeHidden();
  await kopf.click();
  await expect(page.locator('aside').getByText('Nicht angetroffen')).toBeVisible();
  // Lange Namen werden gekürzt, statt die Karte zu sprengen.
  await ohneUeberlauf(page);
});

test('zeigt in der Akte, dass die Liege mit muss, mit einem Knopf zum Umstellen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(`${PRUEFSEITE}?ansicht=akte`);
  await expect(page.getByText('Behandlungsliege', { exact: true })).toBeVisible();
  await expect(page.getByText('Mitnehmen', { exact: true })).toBeVisible();
  const knopf = page.getByRole('button', { name: 'Liege nicht mehr mitnehmen' });
  expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('zaehlt in der Uebersicht nicht mehr zusammen, was mit muss (Entscheidung 2026-10-01)', async ({
  page,
}) => {
  // PRX-007: Die Liste bleibt an der Person (Akte, Kurzblick am Termin); die
  // einzige Tagesfrage der Übersicht ist die Liege.
  await oeffne(page, '08:05', 375);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.getByText(/Heute mitnehmen/)).toHaveCount(0);
  await expect(page.getByText(/Theraband|Kinesiotape/)).toHaveCount(0);
});

test('pflegt in der Akte das Material mit einer Zeile je Eintrag (PRX-007)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(`${PRUEFSEITE}?ansicht=akte`);
  await expect(page.getByText('Material', { exact: true })).toBeVisible();
  await expect(page.getByText('Kinesiotape', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Liste ändern' }).click();
  await expect(page.getByLabel('Material zum Mitnehmen')).toHaveValue('Theraband\nKinesiotape');
  await ohneUeberlauf(page);
});

for (const breite of [375, 1280]) {
  test(`zeigt am Abend den morgigen Tag mit Liege und erstem Weg (${breite} px, ANN-234)`, async ({
    page,
  }) => {
    await oeffne(page, '20:00', breite, '?ansicht=morgen');

    // Die Wochenleiste: sieben Tage ab heute, morgen gewählt, Punkte je Termin.
    const nav = page.getByRole('navigation', { name: 'Tag wählen' });
    const tage = nav.getByRole('listitem');
    await expect(tage).toHaveCount(7);
    await expect(tage.nth(1).getByRole('link')).toHaveAttribute('aria-current', 'date');
    await expect(tage.nth(0).getByRole('link')).toHaveAccessibleName(/, heute: 3 Termine$/);
    await expect(tage.nth(6).getByRole('link')).toHaveAccessibleName(/: keine Termine$/);
    const liege = page.getByText('Liege morgen', { exact: true }).locator('..');
    await expect(liege).toContainText('ab 2. Besuch, 10:00');
    const karte = page.getByRole('article');
    await expect(karte.getByRole('heading', { name: /^Erster Weg/ })).toBeVisible();
    // Kein Jetzt am anderen Tag, kein Haken für einen Besuch, der noch nicht war.
    await expect(page.getByText(/^Jetzt, /)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /abschließen/ })).toHaveCount(0);
    // Die Knöpfe sind Tippziele.
    for (const link of await nav.getByRole('link').all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await ohneUeberlauf(page);
  });
}

test('oeffnet den Termin ueber „Termin →" in der Kopfzeile, nicht ueber die ganze Karte (R2, P1)', async ({
  page,
}) => {
  await oeffne(page, '08:05', 375);
  const karte = page.getByRole('article');
  const name = karte.getByRole('link', { name: 'Erika Beispiel', exact: true });
  const info = karte.getByRole('button', { name: 'Etage, Zugang und Kontakt' });
  const n = (await name.boundingBox())!;
  const i = (await info.boundingBox())!;
  // Auf einer Höhe: Die Mitten liegen höchstens 6 px auseinander (UBK-004).
  expect(Math.abs(n.y + n.height / 2 - (i.y + i.height / 2))).toBeLessThanOrEqual(6);
  // Keine Fußzeile.
  await expect(karte.locator('.border-t')).toHaveCount(0);

  // „Termin →" steht sichtbar in der Zeile des Kickers, 44 px zum Tippen.
  const termin = karte.getByRole('link', { name: 'Termin öffnen' });
  await expect(termin).toBeVisible();
  await expect(termin).toHaveAttribute('href', /^\/kalender\?termin=/);
  const t = (await termin.boundingBox())!;
  expect(t.height).toBeGreaterThanOrEqual(44);
  const kicker = (await karte.getByRole('heading', { name: /^Erster Weg/ }).boundingBox())!;
  expect(Math.abs(t.y + t.height / 2 - (kicker.y + kicker.height / 2))).toBeLessThanOrEqual(6);
  // Die Ziele überlappen nicht (Design-Review R2, neu1): Bis dahin reichte
  // „Termin →" 10 px in die Zeile des Namens, und ein Tipp auf seinen
  // unteren Rand traf das „i". Die Zeile des Namens beginnt jetzt, wo es endet.
  expect(t.y + t.height).toBeLessThanOrEqual(i.y + 0.5);
  expect(t.y + t.height).toBeLessThanOrEqual(n.y + 0.5);
  expect(n.height).toBeGreaterThanOrEqual(44);
  // Unter dem unteren Rand von Name und „i" liegt die Zeile mit der Uhrzeit;
  // der Tipp geht trotzdem an sie.
  const unterDemFinger = (x: number, y: number) =>
    page.evaluate(
      ([px, py]) => document.elementFromPoint(px!, py!)?.closest('a,button')?.textContent ?? null,
      [x, y],
    );
  expect(await unterDemFinger(t.x + t.width / 2, t.y + t.height - 1)).toContain('Termin');
  expect(await unterDemFinger(i.x + i.width / 2, i.y + 1)).toBe('i');
  expect(await unterDemFinger(i.x + i.width / 2, i.y + i.height - 1)).toBe('i');
  expect(await unterDemFinger(n.x + 4, n.y + n.height - 1)).toBe('Erika Beispiel');

  // Das „i" klappt auf und öffnet nicht den Termin.
  await info.click();
  await expect(karte.getByText('Zugangshinweis')).toBeVisible();
  // Ein Tipp auf die Anschrift trifft nichts mehr - bis R2 war die ganze
  // Karte der Link des Termins, und ein Fehltipp neben „Doku" oder dem Haken
  // landete im Kalender. Einer auf den Namen trifft die Akte. Die Prüfseite
  // hat keine Routen - gemessen wird, was unter dem Finger liegt.
  const ziel = async (text: string) => {
    const kasten = (await karte.getByText(text, { exact: true }).boundingBox())!;
    return page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest('a')?.getAttribute('href') ?? null,
      [kasten.x + kasten.width / 2, kasten.y + kasten.height / 2],
    );
  };
  expect(await ziel('Testweg 7, 72072 Tuebingen')).toBeNull();
  expect(await ziel('Erika Beispiel')).toMatch(/^\/patienten\//);

  // Zwischen „Doku", Anruf und Haken 12 px (P1).
  const doku = (await karte.getByRole('link', { name: 'Doku zu diesem Termin' }).boundingBox())!;
  const anruf = (await karte.getByRole('link', { name: /^Anrufen/ }).boundingBox())!;
  const haken = (await karte
    .getByRole('button', { name: 'Behandlung abschließen' })
    .boundingBox())!;
  expect(anruf.x - (doku.x + doku.width)).toBeGreaterThanOrEqual(12);
  expect(haken.x - (anruf.x + anruf.width)).toBeGreaterThanOrEqual(12);
});

for (const breite of [375, 1280]) {
  test(`laesst die Uebersicht nach einem gescheiterten Nachladen stehen und sagt es (${breite} px, BEF-046)`, async ({
    page,
  }) => {
    await oeffne(page, '07:30', breite, '?ansicht=nachladefehler');

    const zeile = page.getByRole('status').filter({ hasText: 'nicht aktualisieren' });
    await expect(zeile).toHaveText(
      /Ihr Profil ließ sich gerade nicht aktualisieren\. Eingaben bleiben erhalten\./,
    );
    // Die Anwendung bleibt: Kopfzeile und Tag stehen weiter da.
    await expect(page.getByRole('button', { name: 'Abmelden' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const knopf = page.getByRole('button', { name: 'Erneut versuchen' });
    const hoehe = await knopf.evaluate((el) => el.getBoundingClientRect().height);
    expect(hoehe).toBeGreaterThanOrEqual(44);
    await ohneUeberlauf(page);

    await knopf.click();
    await expect(page.getByRole('button', { name: 'Wird erneut geladen …' })).toBeDisabled();
  });
}

// BEF-052, ANN-021 Fassung 3: Das Papier trägt im Ausfall - jeder eigene
// Termin des Tages mit Anschrift, Zugangshinweis und Rufnummer, ohne Knöpfe,
// Links und den Tagesplan des Teams.
test('druckt den eigenen Tag vollständig mit Anschrift und Rufnummer (BEF-052)', async ({
  page,
}) => {
  await oeffne(page, '08:05', 1280);
  const blatt = page.getByTestId('tagesplan-druck');
  // Am Bildschirm unsichtbar.
  await expect(blatt).toBeHidden();

  await page.emulateMedia({ media: 'print' });
  await expect(blatt).toBeVisible();
  // Das Blatt ist `aria-hidden` (am Bildschirm nie da) - deshalb über Elemente,
  // nicht über Rollen.
  await expect(blatt.locator('h1')).toHaveText(/^Tagesplan · /);
  await expect(blatt.locator('li')).toHaveCount(4);
  for (const text of [
    'Erika Beispiel',
    'Testweg 7, 72072 Tuebingen',
    'Klingel "Beispiel". Schlüssel bei der Nachbarin.',
    '+49 160 0000006',
    'Max Mustermann',
    'Beispielstrasse 12, 72070 Tuebingen',
    '+49 160 0000005',
    'Hund im Flur, wird vor dem Termin weggesperrt.',
    'Petra Platzhalter',
    'Fiktivgasse 9, 72074 Tuebingen',
    'Teambesprechung',
  ]) {
    await expect(blatt.getByText(text, { exact: true })).toBeVisible();
  }

  // Nichts außer dem Blatt: kein Knopf, kein Zeitstrahl, kein Plan des Teams.
  // Der Sprunglink „Zum Inhalt" ist 1 px groß (`sr-only`) und zählt nicht.
  const sichtbar = await page.evaluate(
    () =>
      [...document.querySelectorAll('button, a')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      }).length,
  );
  expect(sichtbar).toBe(0);
  await expect(page.getByRole('article')).toBeHidden();
  await expect(page.getByText(/Tagesplan des Teams/)).toBeHidden();
});
