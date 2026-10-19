import { expect, test, type Page } from '@playwright/test';
import { KONTEN, anmelden } from './helpers';

/**
 * Profilbild und Farbe im Teamchat (TEAM-006, TEAM-007, ADR-017 Abschnitt O)
 * gegen den echten Stack: Das Foto rechnet der echte Browser auf dem Gerät zum
 * Quadrat, und der Server nimmt es nur an, wenn es seine Prüfung am Inhalt
 * besteht - JPEG ohne Metadaten, 256 × 256. Ein Foto mit Ortsangabe, das
 * gespeichert wird, beweist deshalb, dass das Gerät die Angabe entfernt hat.
 *
 * Budgets: Foto setzen in drei Tipps und der Auswahl (Bild antippen, Foto
 * wählen, Foto speichern), Farbe wählen in zwei (Bild, Farbe).
 */
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const TELEFON = { width: 375, height: 812 };

/**
 * Ein Hochformat-Foto ohne Kamera: Farbflächen aus dem Canvas, als JPEG - mit
 * einem eingesetzten EXIF-Segment, das eine Ortsangabe trägt („GPS“), wie es
 * ein Telefon schreibt.
 */
async function fotoMitOrt(page: Page) {
  const daten = await page.evaluate(() => {
    const leinwand = document.createElement('canvas');
    leinwand.width = 900;
    leinwand.height = 1200;
    const stift = leinwand.getContext('2d')!;
    stift.fillStyle = '#e9e4da';
    stift.fillRect(0, 0, 900, 1200);
    stift.fillStyle = '#2f6f68';
    stift.beginPath();
    stift.arc(450, 420, 260, 0, Math.PI * 2);
    stift.fill();
    stift.fillStyle = '#f2c14e';
    stift.fillRect(150, 820, 600, 240);
    return leinwand.toDataURL('image/jpeg', 0.92).split(',')[1]!;
  });
  const jpeg = Buffer.from(daten, 'base64');
  const inhalt = Buffer.concat([
    Buffer.from('Exif\0\0', 'latin1'),
    Buffer.from(
      'II*\0\x08\0\0\0\x01\0\x25\x88\x04\0\x01\0\0\0\x1a\0\0\0\0\0\0\0GPS 48.52 9.05',
      'latin1',
    ),
  ]);
  const laenge = inhalt.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, laenge >> 8, laenge & 0xff]), inhalt]);
  return {
    name: 'urlaub.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]),
  };
}

async function zumTeamchat(page: Page): Promise<void> {
  await anmelden(page, KONTEN.therapist);
  await page.setViewportSize(TELEFON);
  await page.goto('/team');
  await expect(page.getByRole('navigation', { name: 'Gespräche' })).toBeVisible();
}

test('setzt ein Profilbild aus dem Teamchat heraus in drei Tipps; der Ort fällt auf dem Gerät weg', async ({
  page,
}) => {
  await zumTeamchat(page);
  let tipps = 0;

  // 1: das eigene Bild oben in der Liste führt zu Bild und Farbe.
  await page.getByRole('link', { name: 'Eigenes Bild und eigene Farbe ändern' }).click();
  tipps += 1;
  await expect(page.getByRole('heading', { name: 'Bild und Farbe im Teamchat' })).toBeVisible();

  // 2: Foto wählen - die Auswahl im Dateiwähler zählt wie ein Tipp nicht mit.
  const wahl = page.waitForEvent('filechooser');
  // „Anderes Foto“, wenn ein früherer Lauf schon eines gesetzt hat.
  await page.getByRole('button', { name: /^(Foto wählen|Anderes Foto)$/ }).click();
  tipps += 1;
  await (await wahl).setFiles(await fotoMitOrt(page));
  await expect(page.getByText('Vorschau – noch nicht gespeichert.')).toBeVisible();

  // 3: speichern. Der Server lehnt jedes Bild mit EXIF oder anderer Größe ab.
  await page.getByRole('button', { name: 'Foto speichern' }).click();
  tipps += 1;
  await expect(page.getByText('Foto gespeichert.')).toBeVisible();
  expect(tipps).toBeLessThanOrEqual(3);

  // Das gespeicherte Bild ist 256 × 256 und steht im Teamchat vor der Liste.
  const bild = page.locator('[data-personenbild="foto"]').first();
  await expect(bild).toBeVisible();
  const groesse = await bild.evaluate((el: HTMLImageElement) => [
    el.naturalWidth,
    el.naturalHeight,
  ]);
  expect(groesse).toEqual([256, 256]);

  await page.goto('/team');
  const ich = page.getByRole('link', { name: 'Eigenes Bild und eigene Farbe ändern' });
  await expect(ich.locator('img[data-personenbild="foto"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test('zeigt das Bild den anderen im Team vor der Nachricht', async ({ page, browser }) => {
  await zumTeamchat(page);
  await page.goto('/team/neu');
  await page.getByRole('button', { name: /^Jannes Test/ }).click();
  const text = `Mit Bild ${Date.now()}`;
  await page.getByRole('textbox', { name: /^Nachricht an/ }).fill(text);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: text })).toBeVisible();

  // Jannes sieht Annas Bild vor ihrer Nachricht und an der Direktnachricht.
  const andere = await browser.newPage();
  await anmelden(andere, KONTEN.owner);
  await andere.setViewportSize(TELEFON);
  await andere.goto('/team');
  const direkt = andere
    .getByRole('navigation', { name: 'Gespräche' })
    .getByRole('link', { name: /^Anna Beispiel/ });
  await expect(direkt.locator('img[data-personenbild="foto"]')).toBeVisible();
  await direkt.click();
  await expect(andere.getByRole('listitem').filter({ hasText: text })).toBeVisible();
  // Im Gespräch schreiben nur Anna (mit Bild) und Jannes (ohne): Das Bild steht
  // vor Annas Nachrichten. Eine Nachricht binnen fünf Minuten hängt ohne
  // Kopf an ihrer vorigen - deshalb nicht an genau dieser Zeile gesucht.
  await expect(
    andere.locator('[data-nachricht] img[data-personenbild="foto"]').first(),
  ).toBeVisible();
  await andere.close();
});

test('wählt die eigene Farbe in zwei Tipps und entfernt das Bild nach Rückfrage', async ({
  page,
}) => {
  await zumTeamchat(page);
  await page.getByRole('link', { name: 'Eigenes Bild und eigene Farbe ändern' }).click();
  await page.getByText('Nacht', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Nacht' })).toBeChecked();
  await expect(page.locator('[data-personenbild="foto"]').first()).toHaveClass(
    /outline-person-nacht/,
  );

  await page.getByRole('button', { name: 'Foto entfernen' }).click();
  await page.getByRole('button', { name: 'Entfernen', exact: true }).click();
  await expect(page.getByText('Foto entfernt.')).toBeVisible();
  await expect(page.locator('[data-personenbild="initialen"]').first()).toHaveText('AB');
  await expect(page.locator('[data-personenbild="initialen"]').first()).toHaveClass(
    /bg-person-nacht/,
  );

  // Zurück zur Farbe aus der Vergabe, damit andere Läufe sie so vorfinden.
  await page.getByText('Ozean', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Ozean' })).toBeChecked();
});
