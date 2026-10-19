import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  KONTEN,
  MITARBEITENDE,
  PATIENTEN,
  anmelden,
  rpcAufrufen,
  supabaseKonfiguration,
  zugriffstoken,
} from './helpers';

/**
 * G9 „Ins Zeitkonto eintragen“ und G9b „zurückweisen“ (ZK-001) gegen den
 * echten Stack bei 375 × 667 - Browser → GoTrue → PostgREST →
 * SECURITY-DEFINER-Funktionen, nichts gestubbt.
 *
 * Überstunden: Anna trägt 30 Minuten ab Dienstende des letzten Arbeitstags ein
 * (Budget ≤ 6 Tipps, Ziel 5; Dauer am Regler, ANN-606) und nimmt sie danach
 * zurück. Freizeitausgleich:
 * Anna nimmt an einem Donnerstag zwei Stunden früher frei; am Server steht der
 * Tag als Abweichung mit den übrigen Blöcken; von zwei Terminen des Tages
 * wählt „Tag umplanen“ nur den in der freien Zeit vor. Jannes weist den
 * Freizeitausgleich aus Annas Konto mit Grund zurück (3 Tipps und der Grund),
 * die Zeit ist wieder Arbeitszeit. Olivia (Büro) bucht für Tim Minusstunden
 * am Regler mit Grund (Budget ≤ 6 Tipps) und nimmt sie zurück. Zurückgewiesenes,
 * Zurückgenommenes und die abgesagten Termine sperren spätere Läufe nicht.
 * Ausschließlich synthetische Seed-Konten.
 */
test.describe.configure({ mode: 'serial' });

const TELEFON = { width: 375, height: 667 };
const LAUF = Date.now();

const TAGESNAME = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' });
const PRAXISTAG = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Berlin',
});

function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function wochentag(tag: string): number {
  return new Date(`${tag}T00:00:00Z`).getUTCDay() || 7;
}

const HEUTE = PRAXISTAG.format(new Date());

/** Der letzte Arbeitstag Annas bis heute (Montag bis Freitag). */
function letzterArbeitstag(): string {
  let tag = HEUTE;
  while (wochentag(tag) > 5) tag = plusTage(tag, -1);
  return tag;
}

/**
 * Ein Donnerstag zwei bis vier Wochen voraus - je Lauf ein anderer, höchstens
 * einen Monat weiter: So viel blättert man für einen Freizeitausgleich.
 */
function donnerstag(): string {
  let tag = plusTage(HEUTE, 1);
  while (wochentag(tag) !== 4) tag = plusTage(tag, 1);
  return plusTage(tag, 7 * (1 + (LAUF % 3)));
}

const ARBEITSTAG = letzterArbeitstag();
const DONNERSTAG = donnerstag();

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    get tipps() {
      return tipps;
    },
  };
}

function tag(dialog: Locator, datum: string): Locator {
  return dialog.getByRole('button', { name: TAGESNAME.format(new Date(`${datum}T00:00:00Z`)) });
}

const MONATSNAME = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Blättert das Monatsblatt zum Monat des Tages; jeder Tipp zählt mit. */
async function blaettereZu(
  dialog: Locator,
  datum: string,
  tippe: (ziel: Locator) => Promise<void>,
): Promise<void> {
  const monat = dialog.getByRole('group', {
    name: MONATSNAME.format(new Date(`${datum}T00:00:00Z`)),
  });
  const richtung = datum < HEUTE ? 'Vorheriger Monat' : 'Nächster Monat';
  for (let i = 0; i < 14 && !(await monat.isVisible()); i += 1) {
    await tippe(dialog.getByRole('button', { name: richtung }));
  }
  await expect(monat).toBeVisible();
}

/** Keine Fläche im Fenster rollt - je Seite eine Frage ohne Rollen (DESIGN.md). */
async function rolltNicht(dialog: Locator): Promise<void> {
  const rollend = await dialog.evaluate(
    (fenster) =>
      [fenster, ...fenster.querySelectorAll('*')]
        .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY))
        .filter((el) => el.scrollHeight > el.clientHeight + 1).length,
  );
  expect(rollend).toBe(0);
}

/** Bildschirmfoto im ruhenden Stand: nach dem Startbild und der Tippsperre (wie Überholung 8). */
async function bild(seite: Page, name: string): Promise<void> {
  await seite
    .locator('[data-startbild]')
    .waitFor({ state: 'detached', timeout: 6_000 })
    .catch(() => undefined);
  await seite.waitForTimeout(800);
  await seite.screenshot({ path: `.tmp/screenshots/${name}.png` });
}

/** Die Seite läuft nicht in die Breite; Frage und Fuß stehen im Bild. */
async function stehtImBild(page: Page, dialog: Locator, knopf: Locator): Promise<void> {
  await expect(dialog.getByRole('heading').first()).toBeInViewport();
  await expect(knopf).toBeInViewport();
  const breit = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(breit).toBe(true);
}

/** Die Abweichungen an Annas Donnerstag, wie der Kalender sie liest. */
async function abweichungen(
  page: Page,
  token: string,
): Promise<{ kind: string; starts_at: string | null; ends_at: string | null }[]> {
  const { url, anonKey } = supabaseKonfiguration();
  const antwort = await page.request.get(
    `${url}/rest/v1/staff_working_hour_exceptions?select=kind,starts_at,ends_at` +
      `&staff_member_id=eq.${MITARBEITENDE.anna}&on_date=eq.${DONNERSTAG}&order=starts_at`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  expect(antwort.status()).toBe(200);
  return (await antwort.json()) as {
    kind: string;
    starts_at: string | null;
    ends_at: string | null;
  }[];
}

test('G9: Anna trägt Überstunden ab Dienstende in fünf Tipps ein (ZK-001, ANN-606)', async ({
  page,
}) => {
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.therapist);
  await page.goto('/betrieb/zeitkonto');
  await expect(page.getByRole('heading', { level: 1, name: 'Zeitkonto' })).toBeVisible();
  await bild(page, 'b9-g9-00-zeitkonto-375');

  const t = zaehler();
  await t.tippe(page.getByRole('link', { name: 'Eintragen' }));
  const art = page.getByRole('dialog', { name: 'Was tragen Sie ein?' });
  await expect(art).toBeVisible();
  await bild(page, 'b9-g9-01-art-375');
  await t.tippe(art.getByRole('button', { name: 'Überstunden' }));

  const datum = page.getByRole('dialog', { name: 'An welchem Tag?' });
  await expect(datum).toBeVisible();
  await rolltNicht(datum);
  await bild(page, 'b9-g9-02-tag-375');
  // Werktags „Heute“, am Samstag „Gestern“, sonst der Freitag im Kalender -
  // je ein Tipp (am Monatsanfang dazu einer zurück). „Heute“ exakt: Der
  // heutige Tag im Monatsblatt heißt „…, heute“ (BEF-186).
  if (ARBEITSTAG === HEUTE) {
    await t.tippe(datum.getByRole('button', { name: 'Heute', exact: true }));
  } else if (ARBEITSTAG === plusTage(HEUTE, -1)) {
    await t.tippe(datum.getByRole('button', { name: 'Gestern' }));
  } else {
    await blaettereZu(datum, ARBEITSTAG, (ziel) => t.tippe(ziel));
    await t.tippe(tag(datum, ARBEITSTAG));
  }

  // Beginn am Dienstende, die Dauer am Regler im Fuß (30 min vorgestellt).
  const zeiten = page.getByRole('dialog', { name: 'Wie lange?' });
  await expect(zeiten.getByText(/Plan: 08:00–12:00, 13:00–18:00/)).toBeVisible();
  await expect(zeiten.getByLabel('Beginn')).toHaveValue('18:00');
  const regler = zeiten.getByRole('slider', { name: 'Dauer' });
  await expect(regler).toHaveAttribute('aria-valuetext', '30 Minuten');
  await expect(zeiten.getByText('18:00–18:30')).toBeVisible();
  const weiter = zeiten.getByRole('button', { name: 'Weiter' });
  await stehtImBild(page, zeiten, regler);
  await stehtImBild(page, zeiten, weiter);
  await rolltNicht(zeiten);
  await bild(page, 'b9-g9-03-zeiten-375');
  await t.tippe(weiter);

  const abschluss = page.getByRole('dialog', { name: 'Eintragen?' });
  const eintragen = abschluss.getByRole('button', { name: 'Eintragen' });
  await expect(abschluss.getByText(/^Saldo danach /)).toBeVisible();
  await expect(eintragen).toBeEnabled();
  await stehtImBild(page, abschluss, eintragen);
  await bild(page, 'b9-g9-04-zusammenfassung-375');
  await t.tippe(eintragen);
  // Die Bestätigung beginnt mit dem ausgeblendeten Häkchen - gesucht wird in der
  // Statuszeile, nicht am Textanfang.
  await expect(
    page.getByRole('status').filter({ hasText: /Eingetragen: Überstunden .*18:00–18:30/ }),
  ).toBeVisible();
  await bild(page, 'b9-g9-05-eingetragen-375');
  test.info().annotations.push({ type: 'G9', description: `${t.tipps} Tipps bis eingetragen` });
  expect(t.tipps).toBeLessThanOrEqual(6);

  // Aufräumen: Anna nimmt die Überstunden zurück - sie zählen nicht mehr.
  const eintraege = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Einträge/ }) });
  const zeile = eintraege.getByRole('listitem').filter({ hasText: '18:00–18:30' }).first();
  await zeile.getByRole('button', { name: 'Zurücknehmen' }).click();
  await page.getByRole('button', { name: 'Ja, zurücknehmen' }).click();
  await expect(
    eintraege
      .getByRole('listitem')
      .filter({ hasText: '18:00–18:30' })
      .filter({
        has: page.getByRole('button', { name: 'Zurücknehmen' }),
      }),
  ).toHaveCount(0);
});

test('G9 Freizeitausgleich und G9b: Anna nimmt frei, Jannes weist mit Grund zurück (ZK-001)', async ({
  page,
  browser,
}) => {
  // Termine anlegen, eintragen, umplanen, zurückweisen - länger als ein Ablauf.
  test.setTimeout(120_000);
  await page.setViewportSize(TELEFON);
  // Zwei Termine Annas an diesem Donnerstag: einer vor der freien Zeit, einer
  // darin - über die RPC, damit dieser Test die Terminmaske nicht mitprüft.
  const token = await zugriffstoken(page.request, KONTEN.owner);
  for (const [patient, von, bis] of [
    [PATIENTEN.erika, '10:15', '11:00'],
    [PATIENTEN.max, '16:30', '17:15'],
  ] as const) {
    const angelegt = await rpcAufrufen(page.request, token, 'create_appointment', {
      p_patient_id: patient,
      p_staff_member_id: MITARBEITENDE.anna,
      p_appointment_type: 'video',
      p_date: DONNERSTAG,
      p_start_time: von,
      p_end_time: bis,
      p_location_id: null,
      p_allow_outside_working_hours: false,
    });
    expect(angelegt.status(), `Vorbereitung: Termin ${von}`).toBe(200);
  }

  await anmelden(page, KONTEN.therapist);
  await page.goto('/betrieb/zeitkonto');

  const t = zaehler();
  await t.tippe(page.getByRole('link', { name: 'Eintragen' }));
  await t.tippe(
    page
      .getByRole('dialog', { name: 'Was tragen Sie ein?' })
      .getByRole('button', { name: 'Freizeitausgleich' }),
  );
  const tagSeite = page.getByRole('dialog', { name: 'An welchem Tag?' });
  await rolltNicht(tagSeite);
  await blaettereZu(tagSeite, DONNERSTAG, (ziel) => t.tippe(ziel));
  await t.tippe(tag(tagSeite, DONNERSTAG));
  const zeiten = page.getByRole('dialog', { name: 'Welche Zeit nehmen Sie frei?' });
  const frueher = zeiten.getByRole('button', { name: '2 Std. früher gehen: 16:00–18:00' });
  await stehtImBild(page, zeiten, frueher);
  await bild(page, 'b9-g9-06-freizeit-375');
  await t.tippe(frueher);
  const abschluss = page.getByRole('dialog', { name: 'Eintragen?' });
  await expect(abschluss.getByText(/−2:00\sStd\./).first()).toBeVisible();
  await bild(page, 'b9-g9-07-zusammenfassung-freizeit-375');
  await t.tippe(abschluss.getByRole('button', { name: 'Eintragen' }));
  // Der Termin in der freien Zeit steht zum Umplanen da.
  const fertig = page.getByRole('dialog', { name: 'Eingetragen' });
  await expect(fertig.getByText('1 Termin in der freien Zeit')).toBeVisible();
  await bild(page, 'b9-g9-08-termine-375');
  test.info().annotations.push({ type: 'G9 Freizeit', description: `${t.tipps} Tipps` });
  expect(t.tipps).toBeLessThanOrEqual(6);

  // „Tag umplanen“ ist der Hauptknopf; vorgewählt ist dort nur der Termin in
  // der freien Zeit, nicht der ganze Tag (Praxis-Review Überholung 9).
  const umplanen = fertig.getByRole('link', { name: 'Tag umplanen' });
  await expect(umplanen).toHaveAttribute('href', /zeiten=00:00-16:00,18:00-23:59/);
  await umplanen.click();
  await page
    .getByRole('dialog', { name: 'Warum fallen die Termine aus?' })
    .getByRole('button', { name: 'Praxis hat abgesagt' })
    .click();
  const auswahl = page.getByRole('dialog', { name: 'Welche Termine absagen?' });
  const frei = auswahl.getByRole('checkbox', { name: /16:30–17:15/ });
  const davor = auswahl.getByRole('checkbox', { name: /10:15–11:00/ });
  await expect(frei).toBeChecked();
  await expect(davor).not.toBeChecked();
  await bild(page, 'b9-g9-09-tag-umplanen-375');
  // Aufräumen über denselben Weg: genau diese beiden absagen, sonst nichts.
  for (const kasten of await auswahl.getByRole('checkbox', { checked: true }).all()) {
    await kasten.uncheck();
  }
  await frei.check();
  await davor.check();
  await auswahl.getByRole('button', { name: 'Weiter mit 2 Terminen' }).click();
  await page
    .getByRole('dialog', { name: '2 Termine absagen?' })
    .getByRole('button', { name: 'Ja, 2 Termine absagen' })
    .click();
  await expect(page.getByRole('dialog', { name: / erreicht\?$/ })).toBeVisible();
  await page.goto('/betrieb/zeitkonto');

  // Am Server: die übrigen Blöcke des Tages als Abweichung.
  expect(await abweichungen(page, token)).toEqual([
    { kind: 'block', starts_at: '08:00:00', ends_at: '12:00:00' },
    { kind: 'block', starts_at: '13:00:00', ends_at: '16:00:00' },
  ]);

  // Jannes weist ihn aus Annas Konto zurück.
  const inhaber = await browser.newPage({ viewport: TELEFON });
  await anmelden(inhaber, KONTEN.owner);
  await inhaber.goto('/betrieb/zeitkonto');
  const konten = inhaber
    .locator('section')
    .filter({ has: inhaber.getByRole('heading', { name: /^Zeitkonten/ }) });
  await konten.getByRole('link', { name: /Anna Beispiel/ }).click();
  await expect(
    inhaber.getByRole('heading', { level: 1, name: 'Zeitkonto von Anna Beispiel' }),
  ).toBeVisible();
  await bild(inhaber, 'b9-g9b-00-konto-anna-375');

  const e = zaehler();
  const zeile = inhaber
    .getByRole('listitem')
    .filter({ hasText: '16:00–18:00' })
    .filter({ has: inhaber.getByRole('link', { name: 'Zurückweisen' }) })
    .first();
  await e.tippe(zeile.getByRole('link', { name: 'Zurückweisen' }));
  const eintrag = inhaber.getByRole('dialog', { name: 'Eintrag zurückweisen?' });
  const weiter = eintrag.getByRole('button', { name: 'Zurückweisen' });
  await stehtImBild(inhaber, eintrag, weiter);
  await bild(inhaber, 'b9-g9b-01-eintrag-375');
  await e.tippe(weiter);
  const grund = inhaber.getByRole('dialog', { name: 'Warum nicht?' });
  await grund.getByLabel(/^Grund/).fill(`Teamsitzung (Lauf ${LAUF})`);
  const zurueckweisen = grund.getByRole('button', { name: 'Zurückweisen' });
  await stehtImBild(inhaber, grund, zurueckweisen);
  await bild(inhaber, 'b9-g9b-02-grund-375');
  await e.tippe(zurueckweisen);
  const erledigt = inhaber.getByRole('dialog', { name: 'Zurückgewiesen' });
  await expect(erledigt.getByText(/Die Zeit ist wieder Arbeitszeit\./)).toBeVisible();
  await bild(inhaber, 'b9-g9b-03-zurueckgewiesen-375');
  test.info().annotations.push({ type: 'G9b', description: `${e.tipps} Tipps und der Grund` });
  expect(e.tipps).toBeLessThanOrEqual(3);

  // Die Zeit ist wieder Arbeitszeit; Anna sieht den Grund.
  expect(await abweichungen(page, token)).toEqual([]);
  await page.reload();
  const zurueckgewiesen = page
    .getByRole('listitem')
    .filter({ hasText: `Teamsitzung (Lauf ${LAUF})` });
  await expect(zurueckgewiesen).toHaveCount(1);
  await expect(zurueckgewiesen).toContainText(/Zurückgewiesen von .+: Teamsitzung/);
  await bild(page, 'b9-g9b-04-anna-sieht-375');
  await inhaber.close();
});

test('G9 Minusstunden: Olivia (Büro) bucht für Tim mit Grund und nimmt sie zurück (ZK-001)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.office);
  await page.goto('/betrieb/zeitkonto');

  const t = zaehler();
  const konten = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Zeitkonten/ }) });
  await t.tippe(konten.getByRole('link', { name: /Tim Teamleitung/ }));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Zeitkonto von Tim Teamleitung' }),
  ).toBeVisible();
  await t.tippe(page.getByRole('link', { name: 'Eintragen' }));
  await t.tippe(
    page
      .getByRole('dialog', { name: 'Was tragen Sie für Tim Teamleitung ein?' })
      .getByRole('button', { name: 'Minusstunden' }),
  );
  // Dauer und Grund je auf einer Seite (Design-Review Überholung 9); die
  // Dauer am Regler, Bild auf eine Stunde weiter (ANN-606).
  const stunden = page.getByRole('dialog', { name: 'Wie viele Minusstunden?' });
  const regler = stunden.getByRole('slider', { name: 'Minusstunden' });
  await regler.press('PageUp');
  await expect(regler).toHaveAttribute('aria-valuetext', '1 Stunde 30 Minuten');
  await rolltNicht(stunden);
  await bild(page, 'b9-g9k-01-stunden-375');
  await t.tippe(stunden.getByRole('button', { name: 'Weiter' }));
  const grund = page.getByRole('dialog', { name: 'Warum die Minusstunden?' });
  const text = `Stundenliste September (Lauf ${LAUF})`;
  await grund.getByLabel('Grund').fill(text);
  await bild(page, 'b9-g9k-02-grund-375');
  await t.tippe(grund.getByRole('button', { name: 'Weiter' }));
  const abschluss = page.getByRole('dialog', { name: 'Eintragen?' });
  await expect(abschluss.getByText('−1:30 Std.', { exact: true })).toBeVisible();
  await expect(abschluss.getByText(text)).toBeVisible();
  await rolltNicht(abschluss);
  await bild(page, 'b9-g9k-03-zusammenfassung-375');
  await t.tippe(abschluss.getByRole('button', { name: 'Eintragen' }));
  await expect(
    page.getByRole('status').filter({ hasText: /Eingetragen: Minusstunden .*\(−1:30\sStd\.\)/ }),
  ).toBeVisible();
  await bild(page, 'b9-g9k-04-eingetragen-375');
  test.info().annotations.push({
    type: 'G9 Minusstunden',
    description: `${t.tipps} Tipps, dazu Regler und Grund`,
  });
  expect(t.tipps).toBeLessThanOrEqual(6);

  // Aufräumen: Olivia nimmt die Minusstunden zurück - sie zählen nicht mehr.
  const zeile = page.getByRole('listitem').filter({ hasText: text });
  await zeile.getByRole('button', { name: 'Zurücknehmen' }).click();
  await page.getByRole('button', { name: 'Ja, zurücknehmen' }).click();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: text })
      .filter({ has: page.getByRole('button', { name: 'Zurücknehmen' }) }),
  ).toHaveCount(0);
});
