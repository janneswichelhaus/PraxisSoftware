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

async function oeffne(page: Page, uhrzeit: string, breite: number, abfrage = '') {
  await page.setViewportSize({ width: breite, height: 740 });
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

    const liege = page.getByText('Liege heute', { exact: true }).locator('..');
    await expect(liege).toContainText('Ja · ab 2. Besuch 10:00');

    // Der Wegbalken: 25 Minuten bis zum Beginn, 12 davon Fahrt.
    const balken = page.getByRole('region', { name: 'Erster Weg' });
    await expect(balken).toContainText('Abfahrt spätestens 08:18');
    await expect(balken).toContainText('13 min Puffer');
    await expect(balken).toContainText('≈ 12 min Rad');
    expect((await balken.boundingBox())!.y + (await balken.boundingBox())!.height).toBeLessThan(
      600,
    );

    // Die Karte beginnt auf dem ersten Bildschirm - über der Tableiste.
    const karte = page.getByRole('article');
    const name = karte.getByRole('link', { name: 'Erika Beispiel' });
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

  // Die späteren Besuche: eine Zeile mit Ort und Anfahrt, darüber der Übergang.
  const zweite = eintraege.nth(2);
  await expect(zweite.getByRole('link', { name: /Mustermann/ })).toContainText(
    'Beispielstrasse 12 · Anfahrt ≈ 9 min',
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

  // Jede Zeile ist ein Tippziel von 44 px.
  for (const zeile of await strahl
    .getByRole('link', { name: /Mustermann|Platzhalter|Teambesprechung/ })
    .all()) {
    expect((await zeile.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

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
  await expect(karte.locator('a[href^="tel:"]')).toHaveCount(0);

  // Der Info-Knopf: 22 px im Bild, 44 px zum Tippen.
  const kasten = (await info.boundingBox())!;
  expect(kasten.width).toBeGreaterThanOrEqual(44);
  expect(kasten.height).toBeGreaterThanOrEqual(44);

  await info.click();
  await expect(karte.getByText('Etage', { exact: true })).toBeVisible();
  await expect(karte.getByText('Erdgeschoss', { exact: true })).toBeVisible();
  await expect(karte.getByText('Zugangshinweis', { exact: true })).toBeVisible();
  await expect(karte.getByText('Klingel "Beispiel". Schlüssel bei der Nachbarin.')).toBeVisible();
  const nummer = karte.locator('a[href^="tel:"]').first();
  expect((await nummer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await info.click();
  await expect(karte.getByText('Zugangshinweis', { exact: true })).toHaveCount(0);

  // Unter der Navigation: „Doku" und der Haken in einer Reihe, 44 px hoch.
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

  // Die offene Erstaufnahme führt in die Akte.
  await expect(karte.getByRole('link', { name: /Erstaufnahme offen/ })).toBeVisible();
  await ohneUeberlauf(page);
});

test('wird ab dem Beginn zur Arbeitskarte und zeigt den Weg danach', async ({ page }) => {
  await oeffne(page, '08:40', 375);
  const karte = page.getByRole('article');

  await expect(karte.getByRole('heading', { name: 'Jetzt · bis 09:30' })).toBeVisible();
  // Haken 48 und „Doku" teilen sich den Hauptknopf, in einer Reihe (Handoff 6a).
  const haken = (await karte.getByRole('button', { name: /^Termin abschließen/ }).boundingBox())!;
  const doku = (await karte.getByRole('link', { name: 'Doku zu diesem Termin' }).boundingBox())!;
  expect(haken.height).toBe(48);
  expect(haken.width).toBe(48);
  expect(doku.height).toBe(48);
  expect(Math.abs(doku.y - haken.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Navigation starten' })).toHaveCount(0);

  const balken = page.getByRole('region', { name: 'Nächster Weg danach' });
  await expect(balken).toContainText('Ende Erika Beispiel');
  await expect(balken).toContainText('Abfahrt spätestens 09:51');
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
  const balken = page.getByRole('region', { name: 'Nächster Weg' });
  await expect(balken).toContainText('Jetzt');
  await expect(balken).toContainText('Petra Platzhalter');
  await expect(balken).toContainText('! Zu spät, Abfahrt sofort');
  await expect(balken).toContainText('6 min zu knapp');
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
    await expect(abschluss.getByRole('link', { name: 'Morgen im Kalender' })).toBeVisible();
    await expect(page.getByText('Liege heute', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: /Weg/ })).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
    // Der Tag bleibt darunter stehen; die Jetzt-Marke am Ende.
    const eintraege = page
      .getByRole('heading', { name: 'Tagesablauf' })
      .locator('..')
      .getByRole('listitem');
    await expect(eintraege).toHaveCount(5);
    await expect(eintraege.nth(4)).toContainText('Jetzt, 17:00 Uhr');
    await ohneUeberlauf(page);
  });
}

test('klappt am Tagesende die offene Dokumentation aus', async ({ page }) => {
  await oeffne(page, '17:00', 375, '?ansicht=doku');
  await expect(page.getByRole('heading', { name: 'Alle Besuche erledigt' })).toBeVisible();
  const karte = page.getByRole('article');
  await expect(karte.getByRole('heading', { name: 'Doku offen' })).toBeVisible();
  await expect(karte.getByText('Doku im Entwurf')).toBeVisible();
  await expect(karte.getByRole('link', { name: 'Doku zu diesem Termin' })).toBeVisible();
  // Abgeschlossen: kein Haken mehr.
  await expect(karte.getByRole('button', { name: /^Termin abschließen/ })).toHaveCount(0);
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

    const nav = page.getByRole('navigation', { name: 'Tag wechseln' });
    await expect(nav.getByRole('link', { name: 'Heute' })).toBeVisible();
    await expect(nav).toContainText('Morgen');
    const liege = page.getByText('Liege morgen', { exact: true }).locator('..');
    await expect(liege).toContainText('Ja · ab 2. Besuch 10:00');
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

test('oeffnet mit einem Tipp auf die Karte den Termin, das „i" steht neben dem Namen (UBK-004)', async ({
  page,
}) => {
  await oeffne(page, '08:05', 375);
  const karte = page.getByRole('article');
  const name = karte.getByRole('link', { name: 'Erika Beispiel' });
  const info = karte.getByRole('button', { name: 'Etage, Zugang und Kontakt' });
  const n = (await name.boundingBox())!;
  const i = (await info.boundingBox())!;
  // Auf einer Höhe: Die Mitten liegen höchstens 6 px auseinander.
  expect(Math.abs(n.y + n.height / 2 - (i.y + i.height / 2))).toBeLessThanOrEqual(6);
  // Keine Fußzeile mehr; „Termin öffnen" steht nur für Vorlesesoftware da.
  await expect(karte.locator('.border-t')).toHaveCount(0);
  await expect(karte.getByText('Termin öffnen', { exact: true })).toHaveClass(/sr-only/);

  // Das „i" klappt auf und öffnet nicht den Termin.
  await info.click();
  await expect(karte.getByText('Zugangshinweis')).toBeVisible();
  // Ein Tipp auf die Anschrift trifft den Link des Termins, einer auf den
  // Namen den der Akte. Die Prüfseite hat keine Routen - gemessen wird, was
  // unter dem Finger liegt.
  const ziel = async (text: string) => {
    const kasten = (await karte.getByText(text, { exact: true }).boundingBox())!;
    return page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest('a')?.getAttribute('href') ?? null,
      [kasten.x + kasten.width / 2, kasten.y + kasten.height / 2],
    );
  };
  expect(await ziel('Testweg 7, 72072 Tuebingen')).toMatch(/^\/kalender\?termin=/);
  expect(await ziel('Erika Beispiel')).toMatch(/^\/patienten\//);
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
