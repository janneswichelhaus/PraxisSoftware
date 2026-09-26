import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  KONTEN,
  TAGESFENSTER,
  anmelden,
  detailWert,
  laufTagImFenster,
  terminKachel,
  terminUeberOberflaeche,
} from './helpers';

/**
 * Neue Kalenderdarstellung und Verschieben per Zeigegerät (CAL-006).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Die Zieh-Gesten laufen über echte Maus-Ereignisse; das Ergebnis
 * wird anschließend in der Detailansicht nachgelesen, nicht in der Kachel.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Nächster Mittwoch weit in der Zukunft - im Seed ein Arbeitstag. */
function mittwoch(versatzWochen = 0): string {
  // Startpunkt aus dem eigenen Tagesfenster dieser Spezifikation (helpers.ts);
  // die Ausrichtung auf den Mittwoch schiebt hoechstens sechs Tage weiter und
  // bleibt damit in der Reserve des Fensters.
  const d = laufTagImFenster(TAGESFENSTER.calendarInteraction, LAUF, versatzWochen * 7);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Volle Stunde in der Seed-Arbeitszeit, je Lauf leicht verschoben: 08, 09 oder
 * 10 Uhr. Mit `spanne = 2` nur 08 oder 09 Uhr - für einen Test, der den Termin
 * noch eine Stunde weiterzieht, ohne in die Seed-Mittagspause (12 bis 13 Uhr)
 * zu geraten.
 */
function stunde(versatz = 0, spanne = 3): string {
  return `${String(8 + ((LAUF + versatz) % spanne)).padStart(2, '0')}:00`;
}

const terminAnlegen = (
  page: Page,
  opts: { tag: string; von: string; bis: string; person?: string },
) => terminUeberOberflaeche(page, { ...opts, art: 'video' });

interface Kasten {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Scrollt eine Kachel ins Sichtfenster und misst sie dort.
 *
 * MUSS vor dem Berechnen jeder Zielkoordinate laufen. `boundingBox` misst im
 * Sichtfenster und scrollt nicht von selbst; wird danach noch gescrollt,
 * zeigen die Zahlen auf eine andere Stelle. Das Ziehen rechnet mit dem WEG des
 * Zeigers (`useTerminZiehen`: `dy = clientY - zeigerY`), nicht mit absoluten
 * Gitterkoordinaten - ein vorher gemessener Kasten verschiebt den Termin also
 * um genau die Bildlaufstrecke. Bei 96 px je Stunde sind das schnell Stunden.
 */
async function sichtbarerKasten(kachel: Locator): Promise<Kasten> {
  await kachel.scrollIntoViewIfNeeded();
  const kasten = await kachel.boundingBox();
  if (!kasten) throw new Error('Die Kachel ist nicht sichtbar.');
  return kasten;
}

/**
 * Zieht eine bereits sichtbare Kachel auf einen Punkt.
 *
 * Nimmt den Kasten bewusst als Wert entgegen statt selbst zu scrollen: so
 * stammen Griff und Ziel garantiert aus demselben Bildlaufstand.
 */
async function ziehen(page: Page, kasten: Kasten, ziel: { x: number; y: number }) {
  await page.mouse.move(kasten.x + kasten.width / 2, kasten.y + 8);
  await page.mouse.down();
  // Zwei Schritte: der erste überschreitet die Schwelle, der zweite zielt.
  await page.mouse.move(kasten.x + kasten.width / 2 + 12, kasten.y + 20);
  await page.mouse.move(ziel.x, ziel.y);
  await page.mouse.up();
}

/** Die Rückfrage nach dem Loslassen (CAL-023) - sie kommt immer. */
function rueckfrage(page: Page): Locator {
  return page.getByRole('group', { name: 'Termin verschieben?' });
}

/**
 * Bestätigt die Rückfrage des Kalenders (CAL-023). Liegt das Ziel außerhalb
 * der Arbeitszeit, heißt die Schaltfläche „Trotzdem verschieben" - derselbe
 * Kasten. Die Rückfrage selbst hat eigene Tests weiter unten.
 */
async function verschiebenBestaetigen(page: Page) {
  const kasten = rueckfrage(page);
  await expect(kasten).toBeVisible();
  await kasten.getByRole('button', { name: /^(Trotzdem v|V)erschieben$/ }).click();
  await expect(kasten).toHaveCount(0);
}

test.describe('CAL-006: Darstellung', () => {
  test('zeigt in der Tagesansicht eine Spalte je behandelnder Person', async ({ page }) => {
    const tag = mittwoch();

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);

    const gitter = page.getByRole('grid', { name: 'Tagesansicht nach behandelnder Person' });
    await expect(gitter).toBeVisible();
    for (const name of ['Jannes Test', 'Anna Beispiel', 'Tim Teamleitung']) {
      await expect(page.getByRole('gridcell', { name })).toBeVisible();
    }
  });

  test('zeigt in der Wochenansicht sieben Tagesspalten einer Person', async ({ page }) => {
    const tag = mittwoch();

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=woche&datum=${tag}`);

    await expect(
      page.getByRole('grid', { name: 'Wochenansicht einer behandelnden Person' }),
    ).toBeVisible();
    await expect(page.getByRole('gridcell')).toHaveCount(7);

    // In der Woche gibt es kein "Alle": es steht immer genau eine Person im Gitter.
    const auswahl = page.getByLabel('Behandelnde Person');
    await expect(auswahl.getByRole('option', { name: 'Alle' })).toHaveCount(0);
  });

  test('haelt Zeitachse und Spaltenkoepfe beim Blaettern stehen', async ({ page }) => {
    const tag = mittwoch();

    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByRole('gridcell', { name: 'Anna Beispiel' })).toBeVisible();

    // Der Kopf ist klebend gesetzt; die Auszeichnung ist Teil der Zusage.
    // Bewusst innerhalb des Gitters gesucht: derselbe Name steht auch in der
    // Personenauswahl darueber.
    //
    // Angefasst wird der Link, den CAL-012 in den Kopf gesetzt hat: er traegt
    // einen eindeutigen Namen, und sein Elternelement ist genau die Kopfzelle.
    // Vorher wurde ueber die Beschriftung gesucht - seit zwischen Beschriftung
    // und Zelle der Link liegt, traf `..` den Link statt der Zelle. Die
    // Klebrigkeit selbst hat sich nie geaendert.
    const kopf = page
      .getByRole('grid', { name: 'Tagesansicht nach behandelnder Person' })
      .getByRole('link', { name: 'Wochenplan von Anna Beispiel' });
    await expect(kopf.locator('xpath=..')).toHaveCSS('position', 'sticky');
  });

  test('laeuft auf schmalen Displays ohne Ueberlauf der Seite', async ({ page }) => {
    const tag = mittwoch();

    await anmelden(page, KONTEN.office);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByRole('gridcell', { name: 'Anna Beispiel' })).toBeVisible();

    // Das Gitter selbst scrollt waagerecht - die Seite nicht.
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf, 'die Seite scrollt nicht waagerecht').toBe(false);
  });
});

test.describe('CAL-006: Verschieben', () => {
  test('verschiebt einen Termin auf eine andere behandelnde Person', async ({ page }) => {
    const tag = mittwoch(1);
    const von = stunde();
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const kachel = terminKachel(page, terminId);
    await expect(kachel).toBeVisible();

    // Erst scrollen, dann messen - sonst zieht die Bildlaufstrecke den Termin
    // senkrecht mit (siehe `sichtbarerKasten`).
    const kachelKasten = await sichtbarerKasten(kachel);
    const ziel = page.getByRole('gridcell', { name: 'Tim Teamleitung' });
    const zielKasten = await ziel.boundingBox();
    await ziehen(page, kachelKasten, {
      x: zielKasten!.x + zielKasten!.width / 2,
      y: kachelKasten.y + 8,
    });
    await verschiebenBestaetigen(page);

    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Behandelnde Person')).toContainText('Tim Teamleitung');
    // Die Zeit bleibt unveraendert - verschoben wurde nur die Spalte.
    await expect(detailWert(page, 'Zeit')).toContainText(`${von}–${bis}`);
  });

  test('bietet das Verschieben auch ohne Ziehen an', async ({ page }) => {
    const tag = mittwoch(2);
    const von = stunde(1);
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    // Ziehen ist eine Abkuerzung, kein eigener Weg.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByText(/über „Bearbeiten" in der Detailansicht/)).toBeVisible();

    await page.goto(`/termine/${terminId}`);
    await expect(page.getByRole('link', { name: 'Bearbeiten' })).toBeVisible();
  });

  test('zieht einen abgeschlossenen Termin nicht', async ({ page }) => {
    const tag = mittwoch(3);
    const von = stunde(2);
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });
    await page.getByRole('button', { name: 'Termin abschließen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');

    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const kachel = terminKachel(page, terminId);
    await expect(kachel).toBeVisible();

    const kachelKasten = await sichtbarerKasten(kachel);
    const ziel = page.getByRole('gridcell', { name: 'Tim Teamleitung' });
    const zielKasten = await ziel.boundingBox();
    await ziehen(page, kachelKasten, {
      x: zielKasten!.x + zielKasten!.width / 2,
      y: kachelKasten.y + 8,
    });

    // Der Termin bleibt unveraendert bei seiner Person.
    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Behandelnde Person')).toContainText('Anna Beispiel');
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');
  });

  test('fragt beim Ziehen in eine Randzeit nach', async ({ page }) => {
    const tag = mittwoch(4);
    const von = stunde(3);
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const kachel = terminKachel(page, terminId);
    await expect(kachel).toBeVisible();

    // Weit nach unten: die Seed-Arbeitszeit endet um 18:00.
    const kachelKasten = await sichtbarerKasten(kachel);
    const gitter = page.getByRole('grid').first();
    const gitterKasten = await gitter.boundingBox();
    await ziehen(page, kachelKasten, {
      x: kachelKasten.x + kachelKasten.width / 2,
      y: gitterKasten!.y + gitterKasten!.height - 4,
    });

    // CAL-023: dieselbe Rueckfrage wie sonst, mit dem Hinweis darin - kein
    // zweiter Kasten.
    const kasten = rueckfrage(page);
    await expect(kasten).toBeVisible();
    await expect(kasten).toContainText(/außerhalb der hinterlegten Arbeitszeit/);
    await expect(kasten).toContainText(/noch nicht verschoben/);
    await expect(kasten.getByRole('button', { name: 'Trotzdem verschieben' })).toBeVisible();
    await expect(page.getByRole('group', { name: /verschieben|Arbeitszeit/ })).toHaveCount(1);

    // Ohne Bestaetigung bleibt der Termin, wo er war.
    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Zeit')).toContainText(`${von}–${bis}`);
  });

  test('fragt auch bei freier Zielzeit nach und laesst beim Abbrechen alles stehen (CAL-023)', async ({
    page,
  }) => {
    const tag = mittwoch(5);
    // Beginn um 10 Uhr hieße Ziel 11:05-12:05 - das ragt in die Mittagspause,
    // und die Rückfrage meldete zu Recht „außerhalb der Arbeitszeit".
    const von = stunde(0, 2);
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const kachel = terminKachel(page, terminId);
    await expect(kachel).toBeVisible();

    // Eine Stunde nach unten, in derselben Spalte - mitten in der Arbeitszeit.
    const kachelKasten = await sichtbarerKasten(kachel);
    await ziehen(page, kachelKasten, {
      x: kachelKasten.x + kachelKasten.width / 2,
      y: kachelKasten.y + kachelKasten.height + 8,
    });

    const kasten = rueckfrage(page);
    await expect(kasten).toBeVisible();
    await expect(kasten).toContainText(`${von}–${bis}`);
    await expect(kasten).not.toContainText(/außerhalb/);
    await expect(kasten.getByRole('button', { name: 'Verschieben' })).toBeFocused();

    await kasten.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(kasten).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rückgängig' })).toHaveCount(0);

    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Zeit')).toContainText(`${von}–${bis}`);
  });
});
