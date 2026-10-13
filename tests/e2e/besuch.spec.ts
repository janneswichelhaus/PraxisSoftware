import { expect, test, type Locator, type Route } from '@playwright/test';

/**
 * „Besuch in einem Zug“ (Auftrag C1, Kernablauf K5 in
 * `docs/product/kernablaeufe.md`): von der Tür bis zur Navigation zum
 * nächsten Besuch - dokumentieren, Heilmittel bestätigen, Folgetermin
 * anlegen, zurück in den Tag, losfahren.
 *
 * Gezählt wird, was die Software verlangt: Tipps (Berührungen, ohne den
 * getippten Text) und Wechsel (neue Route in der Anwendung; die Übergabe an
 * die Karten-App ist das Ziel des Ablaufs). Budget: höchstens 6 Tipps und 2
 * Wechsel. Vorher, am 2026-10-12 aus Code und Prüfseiten gezählt: rund 12
 * Tipps und 8 Wechsel über Akte, Kalender und Terminfenster.
 *
 * Die Prüfseite hat keinen Server. Was die Seiten schreiben und nachladen,
 * beantwortet hier eine kleine Nachbildung - und hält fest, dass jeder
 * Vorgang über den bestehenden Weg genau einmal lief (`complete_treatment`,
 * `record_billable_services`, `create_appointment`).
 */
const PRUEFSEITE = '/tests/e2e/fixtures/besuch.html';
const ZONE = 'Europe/Berlin';
const BESUCH_1 = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const STAFF = '55555555-5555-4555-8555-000000000002';

function heute(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
}

function tagePlus(tag: string, tage: number): string {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Heute um diese Uhrzeit in der Zeit der Praxis. */
function um(uhrzeit: string, tag = heute()): Date {
  const utc = Date.parse(`${tag}T${uhrzeit}:00Z`);
  const versatz =
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: ZONE })).getTime() -
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(utc - versatz);
}

/** Der Server der Prüfseite: Stand des Tages und Zähler je Vorgang. */
function nachbildung() {
  const stand = {
    festgeschrieben: false,
    heilmittel: false,
    folgetermin: null as null | string,
    // Der Haken in der Übersicht (`complete_appointment`), zurück über
    // „Rückgängig" (`reopen_appointment`, Praxis-Review R2, P1).
    abgeschlossen: false,
  };
  const aufrufe: Record<string, unknown[]> = {};

  const besuche = (festgeschrieben: boolean) => [
    {
      id: BESUCH_1,
      patient_id: '66666666-6666-4666-8666-000000000101',
      staff_member_id: STAFF,
      appointment_type: 'home_visit',
      kind: 'therapy',
      title: null,
      status: festgeschrieben ? 'documented' : stand.abgeschlossen ? 'completed' : 'confirmed',
      starts_at: um('09:00').toISOString(),
      ends_at: um('10:00').toISOString(),
      patient_given_name: 'Erika',
      patient_family_name: 'Beispiel',
      location_name: null,
      visit_street: 'Testweg',
      visit_house_number: '7',
      visit_postal_code: '72072',
      visit_city: 'Tuebingen',
      patient_phone: null,
      patient_phone_mobile: '+49 160 0000006',
      home_visit_access_note: null,
      special_note: null,
      documentation_status: festgeschrieben ? 'final' : 'none',
      organization_time_zone: ZONE,
      visit_lat: 48.5216,
      visit_lon: 9.0576,
      treatment_table_required: false,
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-000000000002',
      patient_id: '66666666-6666-4666-8666-000000000102',
      staff_member_id: STAFF,
      appointment_type: 'home_visit',
      kind: 'therapy',
      title: null,
      status: 'confirmed',
      starts_at: um('10:30').toISOString(),
      ends_at: um('11:30').toISOString(),
      patient_given_name: 'Max',
      patient_family_name: 'Mustermann',
      location_name: null,
      visit_street: 'Beispielstrasse',
      visit_house_number: '12',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
      patient_phone: null,
      patient_phone_mobile: '+49 160 0000005',
      home_visit_access_note: null,
      special_note: null,
      documentation_status: 'none',
      organization_time_zone: ZONE,
      visit_lat: 48.5262,
      visit_lon: 9.0642,
      treatment_table_required: true,
    },
  ];

  const termin = () => ({
    id: BESUCH_1,
    patient_id: '66666666-6666-4666-8666-000000000101',
    kind: 'therapy',
    title: null,
    event_group_id: null,
    event_series_id: null,
    staff_member_id: STAFF,
    location_id: null,
    appointment_type: 'home_visit',
    status: stand.festgeschrieben ? 'documented' : stand.abgeschlossen ? 'completed' : 'confirmed',
    starts_at: um('09:00').toISOString(),
    ends_at: um('10:00').toISOString(),
    updated_at: `${heute()}T05:00:00.000000+00`,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    completed_at: null,
    cancellation_reason: null,
    no_show_recorded_at: null,
    no_show_protocol_confirmed: null,
    cancellation_received_at: null,
    fee_basis: null,
    fee_waived_at: null,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    location_name: null,
    notification_channels: [],
    treatment_basis_covered: true,
    organization_time_zone: ZONE,
  });

  const slot = (datum: string, von: string, bis: string) => ({
    staff_member_id: STAFF,
    staff_name: 'Anna Beispiel',
    slot_date: datum,
    start_time: `${von}:00`,
    end_time: `${bis}:00`,
    territory_status: 'match',
    prev_appointment_id: null,
    prev_lat: null,
    prev_lon: null,
    next_appointment_id: null,
    next_lat: null,
    next_lon: null,
    target_lat: 48.5216,
    target_lon: 9.0576,
  });

  const antworten: Record<string, (p: Record<string, unknown>) => unknown> = {
    list_day_plan: (p) => (p.p_date === heute() ? besuche(stand.festgeschrieben) : []),
    get_treatment_note: () =>
      stand.festgeschrieben
        ? [
            {
              id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
              appointment_id: BESUCH_1,
              addendum_to_note_id: null,
              status: 'final',
              content: 'Synthetisch: Hausbesuch durchgeführt.',
              visit_without_treatment: false,
              created_at: um('09:50').toISOString(),
              updated_at: um('09:50').toISOString(),
              finalized_at: um('09:50').toISOString(),
              finalisation_kind: 'manual',
              version_count: 1,
              author_name: 'Anna Beispiel',
              last_editor_name: 'Anna Beispiel',
              finalized_by_name: 'Anna Beispiel',
            },
          ]
        : [],
    complete_treatment: () => {
      stand.festgeschrieben = true;
      return null;
    },
    create_treatment_note: () => 'dddddddd-dddd-4ddd-8ddd-000000000001',
    get_billable_service_draft: () =>
      [
        ['k1', 'KG', 'Krankengymnastik'],
        ['k2', 'HB', 'Hausbesuch'],
      ].map(([catalog_item_id, code, label]) => ({
        catalog_item_id,
        code,
        label,
        item_kind: 'treatment',
        unit_price_cents: 3000,
        currency: 'EUR',
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
        service_area: 'therapy',
        suggested: true,
        in_session_fee: false,
      })),
    get_appointment_services: () => [
      {
        appointment_id: BESUCH_1,
        can_record: true,
        services: stand.heilmittel
          ? [
              { code: 'KG', label: 'Krankengymnastik', quantity: 1, status: 'billable' },
              { code: 'HB', label: 'Hausbesuch', quantity: 1, status: 'billable' },
            ]
          : [],
        recorded_at: null,
        recorded_by_name: null,
        basis_items: null,
        session_fee_cents: null,
      },
    ],
    record_billable_services: () => {
      stand.heilmittel = true;
      return null;
    },
    list_patient_upcoming_appointments: () =>
      stand.folgetermin
        ? [
            {
              id: stand.folgetermin,
              starts_at: um('09:00', tagePlus(heute(), 7)).toISOString(),
              ends_at: um('10:00', tagePlus(heute(), 7)).toISOString(),
              appointment_type: 'home_visit',
              status: 'confirmed',
              staff_given_name: 'Anna',
              staff_family_name: 'Beispiel',
              notification_channels: [],
              organization_time_zone: ZONE,
            },
          ]
        : [],
    // Nächste Woche zur gleichen Zeit frei; in den zwei Wochen dazu zwei Plätze.
    find_free_slots: (p) =>
      p.p_from === p.p_to
        ? [slot(String(p.p_from), '09:00', '10:00')]
        : [
            slot(String(p.p_from), '14:00', '15:00'),
            slot(tagePlus(String(p.p_from), 2), '08:00', '09:00'),
          ],
    rate_slot_travel: (p) =>
      (p.p_items as { index: number }[]).map((item) => ({
        item_index: item.index,
        status: 'ok',
        shortfall_minutes: 0,
      })),
    create_appointment: () => {
      stand.folgetermin = 'eeeeeeee-eeee-4eee-8eee-000000000001';
      return stand.folgetermin;
    },
    complete_appointment: () => {
      stand.abgeschlossen = true;
      return null;
    },
    reopen_appointment: () => {
      stand.abgeschlossen = false;
      return BESUCH_1;
    },
  };

  async function beantworte(route: Route) {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/appointment_directory')) {
      await route.fulfill({ json: [termin()] });
      return;
    }
    const name = url.pathname.split('/rpc/')[1];
    if (!name) {
      await route.fulfill({ json: [] });
      return;
    }
    const parameter = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    (aufrufe[name] ??= []).push(parameter);
    const antwort = antworten[name];
    await route.fulfill({ json: antwort ? antwort(parameter) : [] });
  }

  return { stand, aufrufe, beantworte };
}

test('ein Besuch in einem Zug: höchstens 6 Tipps und 2 Wechsel bis zur Navigation (K5)', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.clock.setFixedTime(um('09:20'));
  const server = nachbildung();
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));
  // Der Kartendienst antwortet nicht: Fahrwege bleiben „nicht geprüft", nie „passt".
  await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 503, body: '' }));
  await context.route('https://www.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Karten-App</p>' }),
  );

  let tipps = 0;
  async function tippe(ziel: Locator) {
    tipps += 1;
    await ziel.click();
  }

  await page.goto(PRUEFSEITE);
  const karte = page.getByRole('article');
  await expect(karte.getByRole('heading', { name: 'Jetzt · bis 10:00' })).toBeVisible();

  // 1. „Doku" führt ab dem Beginn direkt auf die Schreibseite.
  await tippe(karte.getByRole('link', { name: 'Doku zu diesem Termin' }));
  await page.getByLabel('Eintrag zur Behandlung').fill('Synthetisch: Hausbesuch durchgeführt.');

  // 2. Festschreiben - die Seite bleibt stehen und zeigt „Danach".
  await tippe(page.getByRole('button', { name: 'Festschreiben' }));
  await expect(
    page.getByText('Eintrag als Version 1 festgeschrieben.', { exact: false }),
  ).toBeVisible();

  // 3. Heilmittel vorbelegt, ein Tipp (ANN-475).
  await expect(page.getByRole('checkbox', { name: 'Krankengymnastik' })).toBeChecked();
  await tippe(page.getByRole('button', { name: 'Heilmittel bestätigen' }));
  await expect(page.getByText(/Bestätigt: Krankengymnastik, Hausbesuch/)).toBeVisible();

  // 4. Folgetermin: nächste Woche, gleiche Zeit, ein Tipp (ANN-477).
  const gleich = page.getByRole('button', {
    name: /Folgetermin anlegen: .* · 09:00 · gleiche Zeit/,
  });
  await tippe(gleich);
  await expect(page.getByText(/Folgetermin angelegt: /)).toBeVisible();

  // 5. Fertig - zurück in den Tag.
  await tippe(page.getByRole('button', { name: 'Fertig' }));
  const naechste = page.getByRole('article');
  await expect(naechste.getByRole('link', { name: 'Max Mustermann', exact: true })).toBeVisible();

  // 6. Navigation zum nächsten Besuch, Übergabe an die Karten-App.
  const karten = page.waitForEvent('popup');
  await tippe(naechste.getByRole('button', { name: 'Navigation starten' }));
  expect((await karten).url()).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);

  const wege = await page.evaluate(() => (window as unknown as { __wege: string[] }).__wege);
  const wechsel = wege.length - 1;
  // Festgehalten für den Bericht: vorher ≈ 12 Tipps, 8 Wechsel.
  test.info().annotations.push({ type: 'K5', description: `${tipps} Tipps, ${wechsel} Wechsel` });
  expect(tipps).toBeLessThanOrEqual(6);
  expect(wechsel).toBeLessThanOrEqual(2);
  expect(wege).toEqual(['/', `/termine/${BESUCH_1}/abschluss?zurueck=%2F`, '/']);

  // Jeder Vorgang lief genau einmal über den bestehenden Weg.
  expect(server.aufrufe.complete_treatment).toHaveLength(1);
  expect(server.aufrufe.record_billable_services).toHaveLength(1);
  expect(server.aufrufe.record_billable_services?.[0]).toMatchObject({
    p_appointment_id: BESUCH_1,
    p_items: [
      { catalog_item_id: 'k1', quantity: 1 },
      { catalog_item_id: 'k2', quantity: 1 },
    ],
  });
  expect(server.aufrufe.create_appointment).toHaveLength(1);
  expect(server.aufrufe.create_appointment?.[0]).toMatchObject({
    p_date: tagePlus(heute(), 7),
    p_start_time: '09:00',
    p_end_time: '10:00',
    p_appointment_type: 'home_visit',
  });
});

// Praxis-Review R2, P1: Die Karte ist kein Flächen-Link mehr, die Knöpfe
// stehen 12 px auseinander, und ein Fehltipp auf den Haken lässt sich an Ort
// und Stelle zurücknehmen - über den bestehenden Weg `reopen_appointment`.
test('nimmt einen Fehltipp auf den Haken mit „Rückgängig" zurück (R2, P1)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.clock.setFixedTime(um('09:20'));
  const server = nachbildung();
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));
  await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 503, body: '' }));

  await page.goto(PRUEFSEITE);
  const karte = page.getByRole('article');
  await expect(karte.getByRole('heading', { name: 'Jetzt · bis 10:00' })).toBeVisible();

  // Doku, Anruf, Haken: 12 px auseinander; dazwischen liegt kein Ziel.
  const doku = (await karte.getByRole('link', { name: 'Doku zu diesem Termin' }).boundingBox())!;
  const anruf = (await karte.getByRole('link', { name: /^Anrufen/ }).boundingBox())!;
  const haken = karte.getByRole('button', { name: /^Termin abschließen/ });
  const hakenKasten = (await haken.boundingBox())!;
  expect(anruf.x - (doku.x + doku.width)).toBeGreaterThanOrEqual(12);
  expect(hakenKasten.x - (anruf.x + anruf.width)).toBeGreaterThanOrEqual(12);
  const dazwischen = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('a, button')?.outerHTML ?? null,
    [hakenKasten.x - 6, hakenKasten.y + hakenKasten.height / 2],
  );
  expect(dazwischen).toBeNull();

  await haken.click();
  await expect(page.getByRole('status').filter({ hasText: 'abgeschlossen' })).toHaveText(
    /Erika Beispiel abgeschlossen\. Doku offen\./,
  );
  expect(server.aufrufe.complete_appointment).toHaveLength(1);

  const zurueck = page.getByRole('button', { name: /^Rückgängig/ });
  expect((await zurueck.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await zurueck.click();
  await expect(page.getByRole('status').filter({ hasText: 'wieder offen' })).toHaveText(
    /Erika Beispiel wieder offen\./,
  );
  expect(server.aufrufe.reopen_appointment).toHaveLength(1);
  expect(server.aufrufe.reopen_appointment?.[0]).toMatchObject({ p_appointment_id: BESUCH_1 });
  // Der Besuch steht wieder offen da, mit dem Haken an seiner Karte.
  await expect(karte.getByRole('heading', { name: 'Jetzt · bis 10:00' })).toBeVisible();
  await expect(karte.getByRole('button', { name: /^Termin abschließen/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Rückgängig/ })).toHaveCount(0);
});

// Praxis-Review R2, P2: Im Funkloch nach dem Besuch scheitert die Suche nach
// freien Zeiten. „Erneut versuchen" fragt noch einmal - die Seite bleibt
// stehen, nichts wird neu geladen. Der Fehler steht wie auf jeder Seite
// (Design-Review R2, P2: `ErrorState`, nicht von Hand).
test('sucht den Folgetermin nach einem Funkloch mit „Erneut versuchen" noch einmal (R2, P2)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.clock.setFixedTime(um('09:20'));
  const server = nachbildung();
  let funkloch = true;
  await page.route('**/rest/v1/**', async (route) => {
    if (funkloch && route.request().url().includes('/rpc/find_free_slots')) {
      await route.abort('internetdisconnected');
      return;
    }
    await server.beantworte(route);
  });
  await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 503, body: '' }));

  await page.goto(PRUEFSEITE);
  await page.getByRole('article').getByRole('link', { name: 'Doku zu diesem Termin' }).click();
  await page.getByLabel('Eintrag zur Behandlung').fill('Synthetisch: Hausbesuch durchgeführt.');
  await page.getByRole('button', { name: 'Festschreiben' }).click();

  const fehler = page.getByText('Die freien Zeiten konnten nicht gesucht werden.');
  await expect(fehler).toBeVisible();
  const meldung = page.getByRole('alert').filter({ has: fehler });
  await expect(meldung).toContainText('Bitte die Verbindung prüfen und erneut versuchen.');
  const erneut = meldung.getByRole('button', { name: 'Erneut versuchen' });
  expect((await erneut.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const wegeVorher = await page.evaluate(
    () => (window as unknown as { __wege: string[] }).__wege.length,
  );

  funkloch = false;
  await erneut.click();
  await expect(page.getByRole('button', { name: /gleiche Zeit/ })).toBeVisible();
  await expect(fehler).toHaveCount(0);
  // Kein Seitenwechsel: „Danach" bleibt, wo es war.
  expect(await page.evaluate(() => (window as unknown as { __wege: string[] }).__wege.length)).toBe(
    wegeVorher,
  );
});

for (const [breite, hoehe] of [
  [375, 667],
  [1280, 800],
] as const) {
  test(`zeigt „Danach" ohne Querrollen, alle Ziele mindestens 44 px (${breite} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: breite, height: hoehe });
    await page.clock.setFixedTime(um('09:20'));
    const server = nachbildung();
    await page.route('**/rest/v1/**', (route) => server.beantworte(route));
    await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 503, body: '' }));

    await page.goto(PRUEFSEITE);
    await page.getByRole('article').getByRole('link', { name: 'Doku zu diesem Termin' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill('Synthetisch: Hausbesuch durchgeführt.');
    await page.getByRole('button', { name: 'Festschreiben' }).click();
    await expect(page.getByRole('button', { name: 'Heilmittel bestätigen' })).toBeVisible();
    await expect(page.getByRole('button', { name: /gleiche Zeit/ })).toBeVisible();

    // „Fertig" bleibt im Bild, am Telefon über der Tableiste.
    const fertig = page.getByRole('button', { name: 'Fertig' });
    await expect(fertig).toBeInViewport();
    const box = (await fertig.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(breite < 640 ? hoehe - 56 : hoehe);

    for (const ziel of await page
      .locator('main')
      .getByRole('button')
      .or(page.locator('main').getByRole('link'))
      .all()) {
      if (!(await ziel.isVisible())) continue;
      const kasten = (await ziel.boundingBox())!;
      expect(kasten.height, await ziel.innerText()).toBeGreaterThanOrEqual(44);
    }
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });
}
