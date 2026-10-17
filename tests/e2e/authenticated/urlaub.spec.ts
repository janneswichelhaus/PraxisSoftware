import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  KONTEN,
  MITARBEITENDE,
  anmelden,
  rpcAufrufen,
  supabaseKonfiguration,
  zugriffstoken,
} from './helpers';

/**
 * G7 „Urlaub beantragen“ und G7b „Urlaub entscheiden“ (URL-001) gegen den
 * echten Stack bei 375 × 667 - Browser → GoTrue → PostgREST → SECURITY-
 * DEFINER-Funktionen, nichts gestubbt.
 *
 * Anna beantragt eine Woche (Budget ≤ 6 Tipps, Ziel 5: „Urlaub beantragen“,
 * Monat, erster Tag, letzter Tag, Absenden - liegt der Freitag im nächsten
 * Monat, ein Blättern dazu); keine Seite rollt. Jannes genehmigt aus „Offene
 * Punkte“ (Genehmigen 2 Tipps). Danach am Server: die Tage stehen als
 * Abwesenheit mit Bezug auf den Antrag in den Arbeitszeiten (ANN-578). Am
 * Ende storniert Anna, Jannes genehmigt den Storno, und die Tage sind wieder
 * frei - so bleibt der Kalender späterer Läufe unberührt. Ausschließlich
 * synthetische Seed-Konten.
 */
test.describe.configure({ mode: 'serial' });

const TELEFON = { width: 375, height: 667 };
const LAUF = Date.now();

const TAGESNAME = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' });

function iso(datum: Date): string {
  return datum.toISOString().slice(0, 10);
}

/**
 * Eine Woche Montag bis Freitag, 8 bis 27 Wochen voraus - je Lauf eine
 * andere, damit sich zwei Läufe ohne Zurücksetzen nicht überschneiden.
 */
function urlaubswoche(): { von: string; bis: string } {
  const heute = new Date();
  const montag = new Date(
    Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate()),
  );
  montag.setUTCDate(montag.getUTCDate() + ((8 - montag.getUTCDay()) % 7 || 7));
  montag.setUTCDate(montag.getUTCDate() + 7 * (8 + (LAUF % 20)));
  const freitag = new Date(montag);
  freitag.setUTCDate(freitag.getUTCDate() + 4);
  return { von: iso(montag), bis: iso(freitag) };
}

const WOCHE = urlaubswoche();

const MONATSNAME = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Der Name einer Monatskachel, „Juli 2027“ (`monatLang`). */
function monatsKachel(datum: string): string {
  return MONATSNAME.format(new Date(`${datum.slice(0, 7)}-01T00:00:00Z`));
}

/** Monatsnamen wie in den Zeilen (Kurzform des Duden). */
const MONAT_KURZ = [
  'Jan.',
  'Feb.',
  'März',
  'Apr.',
  'Mai',
  'Juni',
  'Juli',
  'Aug.',
  'Sept.',
  'Okt.',
  'Nov.',
  'Dez.',
] as const;

/** Der Zeitraum, wie die Zeile ihn schreibt (`zeitraumText`, ohne laufendes Jahr). */
function zeitraumZeile(von: string, bis: string): string {
  const jahr = (datum: string) =>
    datum.slice(0, 4) === String(new Date().getUTCFullYear()) ? '' : ` ${datum.slice(0, 4)}`;
  const tagMonat = (datum: string) =>
    `${Number(datum.slice(8, 10))}. ${MONAT_KURZ[Number(datum.slice(5, 7)) - 1]}`;
  if (von.slice(0, 7) === bis.slice(0, 7)) {
    return `${Number(von.slice(8, 10))}.–${tagMonat(bis)}${jahr(bis)}`;
  }
  return `${tagMonat(von)} – ${tagMonat(bis)}${jahr(bis)}`;
}

/** Der letzte Tag des Monats - steht er im Bild, rollt das Blatt nicht. */
function monatsende(datum: string): string {
  return iso(new Date(Date.UTC(Number(datum.slice(0, 4)), Number(datum.slice(5, 7)), 0)));
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
  const name = TAGESNAME.format(new Date(`${datum}T00:00:00Z`));
  // Ohne `exact` vergleicht Playwright als Teil des Namens - ein Feiertag oder
  // eigener Urlaub hängt sich hinten an.
  return dialog.getByRole('button', { name });
}

/** Bildschirmfoto im ruhenden Stand: nach der Tippsperre und dem Aufgehen des Fensters. */
async function bild(seite: Page, name: string): Promise<void> {
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

/**
 * Die Abwesenheiten der Woche, wie der Kalender sie liest - ohne Bezug auf
 * den Antrag; den sieht keine Praxisrolle (Spaltenrecht, ANN-580).
 */
async function abwesenheiten(
  page: Page,
  token: string,
): Promise<{ on_date: string; kind: string }[]> {
  const { url, anonKey } = supabaseKonfiguration();
  const antwort = await page.request.get(
    `${url}/rest/v1/staff_working_hour_exceptions?select=on_date,kind` +
      `&staff_member_id=eq.${MITARBEITENDE.anna}&on_date=gte.${WOCHE.von}&on_date=lte.${WOCHE.bis}` +
      `&order=on_date`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  expect(antwort.status()).toBe(200);
  return (await antwort.json()) as { on_date: string; kind: string }[];
}

test('G7: Anna beantragt eine Woche in fünf Tipps, Jannes genehmigt in zwei (URL-001)', async ({
  page,
  browser,
}) => {
  // Zwei Personen, vier Kalenderseiten und der Storno am Ende - länger als
  // die 30 Sekunden eines einzelnen Ablaufs.
  test.setTimeout(120_000);
  await page.setViewportSize(TELEFON);
  await anmelden(page, KONTEN.therapist);
  await page.goto('/betrieb/urlaub');

  const t = zaehler();
  await t.tippe(page.getByRole('link', { name: 'Urlaub beantragen' }));
  const monate = page.getByRole('dialog', { name: 'Ab welchem Monat?' });
  const kachel = monate.getByRole('button', { name: monatsKachel(WOCHE.von) });
  // Alle dreizehn Monate stehen ohne Rollen im Bild.
  await stehtImBild(page, monate, monate.getByRole('button').last());
  await rolltNicht(monate);
  await bild(page, 'b7-g7-01-monat-375');
  await t.tippe(kachel);

  // Je Kalenderseite ein Monat: Frage, letzter Tag des Monats und Fuß im Bild.
  const beginn = page.getByRole('dialog', { name: 'Erster Urlaubstag?' });
  await stehtImBild(page, beginn, tag(beginn, monatsende(WOCHE.von)));
  await rolltNicht(beginn);
  await bild(page, 'b7-g7-02-beginn-375');
  await t.tippe(tag(beginn, WOCHE.von));

  const ende = page.getByRole('dialog', { name: 'Letzter Urlaubstag?' });
  await stehtImBild(page, ende, ende.getByRole('button', { name: '3 Wochen' }));
  await expect(tag(ende, monatsende(WOCHE.von))).toBeInViewport();
  await rolltNicht(ende);
  await bild(page, 'b7-g7-03-ende-375');
  if (WOCHE.bis.slice(0, 7) !== WOCHE.von.slice(0, 7)) {
    await t.tippe(ende.getByRole('button', { name: 'Nächster Monat' }));
  }
  await t.tippe(tag(ende, WOCHE.bis));

  const abschluss = page.getByRole('dialog', { name: 'Urlaub beantragen?' });
  const absenden = abschluss.getByRole('button', { name: 'Urlaub beantragen' });
  // Die Tage zählt der Server: Montag bis Freitag ohne Feiertag. Zwischen
  // Zahl und Wort steht ein geschütztes Leerzeichen (`urlaubstage`).
  await expect(abschluss.getByText(/\d+\sUrlaubstag/)).toBeVisible();
  await expect(absenden).toBeEnabled();
  await stehtImBild(page, abschluss, absenden);
  await bild(page, 'b7-g7-04-zusammenfassung-375');
  await t.tippe(absenden);
  // Die Rückmeldung trägt vorn das Häkchen (für Vorlesesoftware ausgeblendet).
  await expect(page.getByRole('status').filter({ hasText: 'Urlaub beantragt:' })).toBeVisible();
  // Der Zustand steht als Abzeichen mit Zeichen und Wort an der Zeile.
  await expect(page.getByRole('listitem').filter({ hasText: 'Beantragt' }).first()).toBeVisible();
  test.info().annotations.push({ type: 'G7', description: `${t.tipps} Tipps bis beantragt` });
  expect(t.tipps).toBeLessThanOrEqual(6);

  // Jannes entscheidet aus „Offene Punkte“.
  const inhaber = await browser.newPage({ viewport: TELEFON });
  await anmelden(inhaber, KONTEN.owner);
  await inhaber.goto('/offen');
  const e = zaehler();
  const antraege = inhaber
    .locator('section')
    .filter({ has: inhaber.getByRole('heading', { name: /^Urlaubsanträge/ }) });
  await e.tippe(antraege.getByRole('link', { name: /Anna Beispiel/ }).first());
  const entscheiden = inhaber.getByRole('dialog', { name: 'Urlaub genehmigen?' });
  await expect(entscheiden.getByText(/Urlaubstage?$/).first()).toBeVisible();
  // Die Notiz der Person steht hier nie (BEF-066, ANN-580).
  await expect(entscheiden.getByText(/Notiz/)).toHaveCount(0);
  const genehmigen = entscheiden.getByRole('button', { name: 'Genehmigen' });
  await stehtImBild(inhaber, entscheiden, genehmigen);
  await bild(inhaber, 'b7-g7b-01-entscheiden-375');
  await e.tippe(genehmigen);
  const fertig = inhaber.getByRole('dialog', { name: 'Genehmigt' });
  await expect(fertig.getByText(/ist genehmigt/)).toBeVisible();
  await bild(inhaber, 'b7-g7b-02-genehmigt-375');
  test.info().annotations.push({ type: 'G7b', description: `${e.tipps} Tipps bis genehmigt` });
  expect(e.tipps).toBeLessThanOrEqual(2);

  // Am Server: jeder Tag der Woche als Abwesenheit, wie der Kalender sie liest.
  const token = await zugriffstoken(page.request, KONTEN.owner);
  const tage = await abwesenheiten(page, token);
  expect(tage).toHaveLength(5);
  expect(tage.every((zeile) => zeile.kind === 'unavailable')).toBe(true);

  // Anna sieht ihn genehmigt; sie storniert, Jannes genehmigt den Storno -
  // die Tage sind wieder frei.
  await page.reload();
  const zeile = page
    .getByRole('listitem')
    .filter({ hasText: zeitraumZeile(WOCHE.von, WOCHE.bis) })
    .filter({ hasText: 'Genehmigt' });
  await expect(zeile).toBeVisible();
  // Die Rückfrage öffnet unter der Zeile in voller Breite (Design-Review).
  await zeile.getByRole('button', { name: 'Stornieren' }).click();
  const bestaetigen = zeile.getByRole('button', { name: 'Storno beantragen' });
  await expect(bestaetigen).toBeInViewport();
  await bild(page, 'b7-g7-05-storno-rueckfrage-375');
  await bestaetigen.click();
  await expect(page.getByText('Storno beantragt')).toBeVisible();
  const liste = await rpcAufrufen(page.request, token, 'list_leave', {
    p_from: WOCHE.von,
    p_to: WOCHE.bis,
  });
  const { to_decide: offen } = (await liste.json()) as {
    to_decide: { id: string; kind: string }[];
  };
  const storno = offen.find((a) => a.kind === 'cancellation');
  expect(storno).toBeDefined();
  const entscheidung = await rpcAufrufen(page.request, token, 'decide_leave_request', {
    p_request_id: storno!.id,
    p_approve: true,
    p_note: null,
  });
  expect(entscheidung.status()).toBe(200);
  expect(await abwesenheiten(page, token)).toEqual([]);
  await inhaber.close();
});
