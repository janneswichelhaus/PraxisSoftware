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
 * G8 „Arbeitszeitänderung beantragen“ und G8b „entscheiden“ (AZ-001) gegen
 * den echten Stack bei 375 × 667 - Browser → GoTrue → PostgREST →
 * SECURITY-DEFINER-Funktionen, nichts gestubbt.
 *
 * Einmalig: Anna arbeitet an einem Dienstag 07:00 bis 17:00 statt 08:00 bis
 * 18:00 (Budget ≤ 8 Tipps und die Zeiten, Ziel 5); Jannes genehmigt aus
 * „Offene Punkte“ (2 Tipps). Danach am Server: der Tag steht als Abweichung in
 * den Arbeitszeiten. Dauerhaft: Anna verschiebt dienstags die Pause (Ziel 7)
 * und zieht den Antrag danach zurück; die Termine außerhalb der neuen Zeiten
 * legt der Test vorher selbst an und nimmt sie danach zurück (BEF-219). Am
 * Ende wird die Abweichung entfernt - so bleibt der Kalender späterer Läufe
 * unberührt. Ausschließlich synthetische Seed-Konten.
 */
test.describe.configure({ mode: 'serial' });

const TELEFON = { width: 375, height: 667 };
const LAUF = Date.now();

const TAGESNAME = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' });

function iso(datum: Date): string {
  return datum.toISOString().slice(0, 10);
}

/** Ein Dienstag zwei bis sieben Wochen voraus - je Lauf ein anderer. */
function dienstag(): string {
  const heute = new Date();
  const tag = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate()));
  tag.setUTCDate(tag.getUTCDate() + ((9 - tag.getUTCDay()) % 7 || 7));
  tag.setUTCDate(tag.getUTCDate() + 7 * (1 + (LAUF % 6)));
  return iso(tag);
}

const DIENSTAG = dienstag();

/**
 * Vier Samstage ab der sechsten Woche: nach jedem Monatsersten der
 * Schnellwahl „Ab wann?“ und im Jahr danach, das der Server prüft.
 */
function samstage(): string[] {
  const heute = new Date();
  const erster = new Date(
    Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate()),
  );
  erster.setUTCDate(erster.getUTCDate() + ((13 - erster.getUTCDay()) % 7 || 7) + 7 * 5);
  return [0, 1, 2, 3].map((woche) => {
    const tag = new Date(erster);
    tag.setUTCDate(erster.getUTCDate() + 7 * woche);
    return iso(tag);
  });
}

/** Ein eben angelegter Termin mit seinem Stand - so nimmt der Server ihn zurück. */
interface AngelegterTermin {
  id: string;
  stand: string;
}

/**
 * Die Termine außerhalb der neuen Zeiten, selbst angelegt statt von den
 * Terminen anderer Dateien abhängig (BEF-219): an vier Samstagen je ein Termin
 * Annas vor sieben - außerhalb jedes Wochenplans, auch des neuen. Die
 * Zusammenfassung nennt dann drei Tage und die übrigen als Zahl, die längste
 * Form der Zeile. Je Versuch eine andere Uhrzeit: Eine Wiederholung trifft
 * nicht auf Termine, die der erste Versuch nicht mehr zurücknehmen konnte.
 */
async function termineAusserhalb(
  page: Page,
  token: string,
  termine: AngelegterTermin[],
): Promise<void> {
  const [von, bis] = test.info().retry === 0 ? ['06:00', '06:30'] : ['06:30', '07:00'];
  const { url, anonKey } = supabaseKonfiguration();
  for (const tag of samstage()) {
    const angelegt = await rpcAufrufen(page.request, token, 'create_appointment', {
      p_patient_id: PATIENTEN.petra,
      p_staff_member_id: MITARBEITENDE.anna,
      p_appointment_type: 'video',
      p_date: tag,
      p_start_time: von,
      p_end_time: bis,
      p_location_id: null,
      p_allow_outside_working_hours: true,
    });
    expect(angelegt.status(), `Vorbereitung: Termin am ${tag}`).toBe(200);
    const id = (await angelegt.json()) as string;
    const gelesen = await page.request.get(
      `${url}/rest/v1/appointment_directory?select=updated_at&id=eq.${id}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
    );
    expect(gelesen.status()).toBe(200);
    const [zeile] = (await gelesen.json()) as { updated_at: string }[];
    expect(zeile, `Vorbereitung: Stand des Termins am ${tag}`).toBeDefined();
    termine.push({ id, stand: zeile?.updated_at ?? '' });
  }
}

/** Nimmt die Termine zurück; scheitert das, bleibt der Fehler des Tests sichtbar. */
async function termineZuruecknehmen(
  page: Page,
  token: string,
  termine: readonly AngelegterTermin[],
): Promise<void> {
  for (const termin of termine) {
    const antwort = await rpcAufrufen(page.request, token, 'undo_appointment_creation', {
      p_appointment_id: termin.id,
      p_expected_updated_at: termin.stand,
    });
    expect.soft(antwort.status(), `Aufräumen: Termin ${termin.id}`).toBe(204);
  }
}

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

/** Blättert das Monatsblatt bis zum Monat des Tages; jeder Tipp zählt mit. */
async function blaettereZu(
  dialog: Locator,
  datum: string,
  tippe: (ziel: Locator) => Promise<void>,
): Promise<void> {
  const monat = dialog.getByRole('group', {
    name: MONATSNAME.format(new Date(`${datum}T00:00:00Z`)),
  });
  for (let i = 0; i < 14 && !(await monat.isVisible()); i += 1) {
    await tippe(dialog.getByRole('button', { name: 'Nächster Monat' }));
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

/** Eine Zeile Kleingedrucktes - so viel Reserve braucht der Abschluss mindestens. */
const ZEILE = 20;

/**
 * Der Abschluss rollt auch eine Zeile niedriger nicht (BEF-219): Mehr Termine
 * außerhalb, zweistellige Zahlen oder ein längerer Monatsname brauchen höchstens
 * eine Zeile mehr, als dieser Lauf zeigt.
 */
async function rolltNichtMitReserve(page: Page, dialog: Locator): Promise<void> {
  await rolltNicht(dialog);
  await page.setViewportSize({ width: TELEFON.width, height: TELEFON.height - ZEILE });
  await rolltNicht(dialog);
  await page.setViewportSize(TELEFON);
}

/** Bildschirmfoto im ruhenden Stand: nach der Tippsperre und dem Aufgehen des Fensters. */
async function bild(seite: Page, name: string): Promise<void> {
  // Erst wenn das Startbild die Seite freigegeben hat (Praxis-Review: Bild 00
  // zeigte es statt der Seite).
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

/** Die Abweichungen am Tag, wie der Kalender sie liest. */
async function abweichungen(
  page: Page,
  token: string,
): Promise<{ kind: string; starts_at: string; ends_at: string }[]> {
  const { url, anonKey } = supabaseKonfiguration();
  const antwort = await page.request.get(
    `${url}/rest/v1/staff_working_hour_exceptions?select=kind,starts_at,ends_at` +
      `&staff_member_id=eq.${MITARBEITENDE.anna}&on_date=eq.${DIENSTAG}&order=starts_at`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  expect(antwort.status()).toBe(200);
  return (await antwort.json()) as { kind: string; starts_at: string; ends_at: string }[];
}

test('G8 einmalig: Anna ändert einen Tag in fünf Tipps, Jannes genehmigt in zwei (AZ-001)', async ({
  page,
  browser,
}) => {
  // Zwei Personen nacheinander - länger als ein Ablauf (wie Urlaub und Zeitkonto).
  test.setTimeout(120_000);
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.therapist);
  await page.goto('/betrieb/arbeitszeit');
  await expect(page.getByRole('heading', { name: 'Mein Wochenplan' })).toBeVisible();
  await bild(page, 'b8-g8-00-arbeitszeit-375');

  const t = zaehler();
  await t.tippe(page.getByRole('link', { name: 'Änderung beantragen' }));
  const art = page.getByRole('dialog', { name: 'Was möchten Sie ändern?' });
  await expect(art).toBeVisible();
  await bild(page, 'b8-g8-01-art-375');
  await t.tippe(art.getByRole('button', { name: 'Einen Tag' }));

  const datum = page.getByRole('dialog', { name: 'An welchem Tag?' });
  await expect(datum).toBeVisible();
  // Ein Monat je Seite: Der Dienstag liegt einen oder zwei Monate voraus.
  await rolltNicht(datum);
  await bild(page, 'b8-g8-02-tag-375');
  await blaettereZu(datum, DIENSTAG, (ziel) => t.tippe(ziel));
  await t.tippe(tag(datum, DIENSTAG));

  const zeiten = page.getByRole('dialog', { name: /^Ihre Zeiten am / });
  await expect(zeiten.getByText(/^Bisher: 08:00–12:00, 13:00–18:00/)).toBeVisible();
  await zeiten.getByLabel('Beginn').fill('07:00');
  await zeiten.getByLabel('Ende').fill('17:00');
  const weiter = zeiten.getByRole('button', { name: 'Weiter' });
  await expect(weiter).toBeEnabled();
  await stehtImBild(page, zeiten, weiter);
  await bild(page, 'b8-g8-03-zeiten-375');
  await t.tippe(weiter);

  const abschluss = page.getByRole('dialog', { name: 'Änderung beantragen?' });
  const absenden = abschluss.getByRole('button', { name: 'Änderung beantragen' });
  await expect(abschluss.getByText(/außerhalb der neuen Zeiten/)).toBeVisible();
  await expect(absenden).toBeEnabled();
  await stehtImBild(page, abschluss, absenden);
  // Auch der Abschluss rollt nicht: Angaben, Termine und „Grund angeben“.
  await rolltNichtMitReserve(page, abschluss);
  await bild(page, 'b8-g8-04-zusammenfassung-375');
  await t.tippe(absenden);
  await expect(page.getByRole('status').filter({ hasText: 'Änderung beantragt:' })).toBeVisible();
  // Der Zustand steht als Abzeichen mit Zeichen und Wort an der Zeile.
  await expect(page.getByRole('listitem').filter({ hasText: 'Beantragt' }).first()).toBeVisible();
  test.info().annotations.push({ type: 'G8', description: `${t.tipps} Tipps bis beantragt` });
  expect(t.tipps).toBeLessThanOrEqual(8);

  // Jannes entscheidet aus „Offene Punkte“.
  const inhaber = await browser.newPage({ viewport: TELEFON });
  await anmelden(inhaber, KONTEN.owner);
  await inhaber.goto('/offen');
  const e = zaehler();
  const antraege = inhaber
    .locator('section')
    .filter({ has: inhaber.getByRole('heading', { name: /^Arbeitszeitänderungen/ }) });
  await e.tippe(antraege.getByRole('link', { name: /Anna Beispiel/ }).first());
  const entscheiden = inhaber.getByRole('dialog', { name: 'Änderung genehmigen?' });
  const genehmigen = entscheiden.getByRole('button', { name: 'Genehmigen' });
  await expect(entscheiden.getByText('07:00–12:00, 13:00–17:00 · 9:00 Std.')).toBeVisible();
  await stehtImBild(inhaber, entscheiden, genehmigen);
  await bild(inhaber, 'b8-g8b-01-entscheiden-375');
  await e.tippe(genehmigen);
  const fertig = inhaber.getByRole('dialog', { name: 'Genehmigt' });
  // Ohne Genitiv (Design-Review): „Arbeitszeit von Anna Beispiel ist geändert: …“.
  await expect(fertig.getByText(/Arbeitszeit von Anna Beispiel ist geändert: /)).toBeVisible();
  await bild(inhaber, 'b8-g8b-02-genehmigt-375');
  test.info().annotations.push({ type: 'G8b', description: `${e.tipps} Tipps bis genehmigt` });
  expect(e.tipps).toBeLessThanOrEqual(2);

  // Am Server: der Tag als Abweichung, wie der Kalender sie liest.
  const token = await zugriffstoken(page.request, KONTEN.owner);
  expect(await abweichungen(page, token)).toEqual([
    { kind: 'block', starts_at: '07:00:00', ends_at: '12:00:00' },
    { kind: 'block', starts_at: '13:00:00', ends_at: '17:00:00' },
  ]);

  // Aufräumen: Der Tag gilt wieder nach dem Wochenplan.
  const entfernt = await rpcAufrufen(page.request, token, 'set_staff_working_hour_exception', {
    p_staff_member_id: MITARBEITENDE.anna,
    p_date: DIENSTAG,
    p_unavailable: false,
    p_blocks: [],
  });
  expect(entfernt.status()).toBe(200);
  expect(await abweichungen(page, token)).toEqual([]);
  await inhaber.close();
});

test('G8 dauerhaft: Anna verschiebt dienstags die Pause in sieben Tipps (AZ-001)', async ({
  page,
}) => {
  // Zwei Personen nacheinander - länger als ein Ablauf (wie Urlaub und Zeitkonto).
  test.setTimeout(120_000);
  await page.setViewportSize(TELEFON);
  const token = await zugriffstoken(page.request, KONTEN.owner);
  const termine: AngelegterTermin[] = [];
  try {
    await termineAusserhalb(page, token, termine);
    await anmelden(page, KONTEN.therapist);
    await page.goto('/betrieb/arbeitszeit');

    const t = zaehler();
    await t.tippe(page.getByRole('link', { name: 'Änderung beantragen' }));
    await t.tippe(
      page
        .getByRole('dialog', { name: 'Was möchten Sie ändern?' })
        .getByRole('button', { name: 'Den Wochenplan ab einem Datum' }),
    );
    // Ein Wochenplan beginnt am Monatsersten: Schnellwahl statt Blättern.
    const abWann = page.getByRole('dialog', { name: 'Ab wann?' });
    await rolltNicht(abWann);
    await bild(page, 'b8-g8-05a-ab-wann-375');
    await t.tippe(abWann.getByRole('button', { name: /^Ab \S+, 1\. / }).first());

    const woche = page.getByRole('dialog', { name: /^Wochenplan ab / });
    await expect(woche.getByRole('button', { name: /^Dienstag / })).toBeVisible();
    // Sieben Tage und der Fuß ohne Rollen (Design-Review Überholung 8).
    await rolltNicht(woche);
    await bild(page, 'b8-g8-05-woche-375');
    await t.tippe(woche.getByRole('button', { name: /^Dienstag / }));
    const dienstagSeite = page.getByRole('dialog', { name: /^Dienstags ab / });
    await dienstagSeite.getByLabel('Pause ab').fill('12:30');
    const uebernehmen = dienstagSeite.getByRole('button', { name: 'Übernehmen' });
    await stehtImBild(page, dienstagSeite, uebernehmen);
    await rolltNicht(dienstagSeite);
    await bild(page, 'b8-g8-06-dienstag-375');
    await t.tippe(uebernehmen);
    await t.tippe(woche.getByRole('button', { name: 'Weiter' }));

    const abschluss = page.getByRole('dialog', { name: 'Änderung beantragen?' });
    await expect(abschluss.getByText(/^Dienstag 08:00–12:30, 13:30–18:00/)).toBeVisible();
    await expect(abschluss.getByText(/^\d+ Termine außerhalb der neuen Zeiten$/)).toBeVisible();
    // Die längste Form der Terminzeile: drei Tage und die übrigen als Zahl,
    // jeder Eintrag mit festen Leerzeichen. Wer umplant, sagt die Zeile
    // darunter (BEF-219).
    await expect(abschluss.getByText(/\d+\s(weiterer\sTag|weitere\sTage)$/)).toBeVisible();
    await expect(abschluss.getByText('Praxisinhaber, plant nach dem Genehmigen um')).toBeVisible();
    await rolltNichtMitReserve(page, abschluss);
    const absenden = abschluss.getByRole('button', { name: 'Änderung beantragen' });
    await expect(absenden).toBeEnabled();
    await bild(page, 'b8-g8-07-zusammenfassung-woche-375');
    await t.tippe(absenden);
    await expect(page.getByRole('status').filter({ hasText: 'Änderung beantragt:' })).toBeVisible();
    test.info().annotations.push({ type: 'G8 dauerhaft', description: `${t.tipps} Tipps` });
    expect(t.tipps).toBeLessThanOrEqual(8);

    // Aufräumen: Anna zieht den Antrag zurück - der Plan bleibt, wie er ist.
    await page.getByRole('button', { name: 'Zurückziehen' }).first().click();
    await page.getByRole('button', { name: 'Ja, zurückziehen' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Beantragt' })).toHaveCount(0);
  } finally {
    // Die Termine des Tests fallen wieder weg, auch wenn er scheitert.
    await termineZuruecknehmen(page, token, termine);
  }
});
