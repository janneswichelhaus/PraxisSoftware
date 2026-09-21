import { expect, test } from '@playwright/test';

/**
 * Der Kartenprototyp in einem echten Browser (MAP-002).
 *
 * Komponententests laufen in jsdom, und jsdom hat kein WebGL: Ob MapLibre
 * überhaupt zeichnet und ob die acht Marker am Ende im Bild stehen, kann dort
 * niemand sehen. Diese Prüfung öffnet deshalb die Prüfseite
 * `fixtures/karte.html` - dieselbe Komponente, dieselben Stopps, ein Style
 * ohne Netz.
 *
 * Sie läuft in beiden Projekten der Konfiguration: `desktop` (1280 px) und
 * `mobile` (Pixel 7, 412 px); zusätzlich wird 375 px ausdrücklich geprüft,
 * weil das die schmalste Größe der Oberflächen-Checkliste ist.
 *
 * Was sie **nicht** zeigt: dass die Kacheln des Anbieters ankommen. Dafür
 * braucht es den Schlüssel, und der liegt nur lokal (docs/abnahme).
 */

const PRUEFSEITE = '/tests/e2e/fixtures/karte.html';
const STOPPS = 8;

test.describe('Kartenprototyp', () => {
  test('zeichnet die Karte und stellt jeden Stopp ins Bild', async ({ page }) => {
    await page.goto(PRUEFSEITE);

    const karte = page.getByRole('region', { name: /Teststopps in Tübingen/ });
    await expect(karte).toBeVisible();

    // MapLibre legt das Kartenbild als Canvas an. Ohne WebGL entstuende sie
    // nicht, und die Prueffrage "laeuft eine Karte in der Anwendung" waere
    // mit "nein" beantwortet.
    const leinwand = page.locator('canvas.maplibregl-canvas');
    await expect(leinwand).toBeVisible();
    const flaeche = await leinwand.boundingBox();
    expect(flaeche?.width ?? 0).toBeGreaterThan(200);
    expect(flaeche?.height ?? 0).toBeGreaterThan(200);

    // Fit-Bounds: Alle Stopps stehen im Bild, keiner ausserhalb.
    for (let nummer = 1; nummer <= STOPPS; nummer += 1) {
      const marker = karte.getByText(String(nummer), { exact: true });
      await expect(marker).toBeVisible();
      const kasten = await marker.boundingBox();
      expect(kasten, `Stopp ${nummer} hat keine Position`).not.toBeNull();
      expect(kasten!.x).toBeGreaterThanOrEqual(flaeche!.x - 1);
      expect(kasten!.x + kasten!.width).toBeLessThanOrEqual(flaeche!.x + flaeche!.width + 1);
      expect(kasten!.y).toBeGreaterThanOrEqual(flaeche!.y - 1);
      expect(kasten!.y + kasten!.height).toBeLessThanOrEqual(flaeche!.y + flaeche!.height + 1);
    }

    // Lizenzbedingung: Die Quellenangabe steht sichtbar auf der Karte.
    await expect(karte.getByText('Prüfstyle ohne Netz')).toBeVisible();
  });

  test('bleibt bei 375 px bedienbar und laeuft nicht waagerecht ueber', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(PRUEFSEITE);

    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);

    for (let nummer = 1; nummer <= STOPPS; nummer += 1) {
      await expect(page.getByText(String(nummer), { exact: true })).toBeVisible();
    }

    // Zoomen geht auch ohne Geste: Die Schaltflaechen sind da und bedienbar.
    await expect(page.getByRole('button', { name: 'Hineinzoomen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Herauszoomen' })).toBeVisible();

    // ... und sie sind ein Tippziel nach der Oberflaechen-Checkliste. Der
    // Renderer liefert 29 px; `karte.css` bringt sie auf die Bedienhoehe des
    // Systems. Ohne diese Zeile faellt der Rueckbau nicht auf.
    for (const name of ['Hineinzoomen', 'Herauszoomen']) {
      const kasten = await page.getByRole('button', { name }).boundingBox();
      expect(kasten!.width, name).toBeGreaterThanOrEqual(44);
      expect(kasten!.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test('ist mit der Tastatur erreichbar und zoombar', async ({ page }) => {
    await page.goto(PRUEFSEITE);
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();

    // Nach dem Hineinzoomen liegen die Stopps weiter auseinander; dass der
    // Knopf wirkt, zeigt der Abstand zweier Marker. Gemessen wird **vor** dem
    // Tastendruck: Wer danach misst, hat womoeglich schon die fertige
    // Bewegung in der Hand und vergleicht sie mit sich selbst.
    const abstand = async () => {
      const eins = await page.getByText('1', { exact: true }).boundingBox();
      const acht = await page.getByText('8', { exact: true }).boundingBox();
      return Math.hypot((eins?.x ?? 0) - (acht?.x ?? 0), (eins?.y ?? 0) - (acht?.y ?? 0));
    };
    const vorher = await abstand();

    await page.getByRole('button', { name: 'Hineinzoomen' }).focus();
    await expect(page.getByRole('button', { name: 'Hineinzoomen' })).toBeFocused();
    await page.keyboard.press('Enter');

    // Gewartet wird auf das Ergebnis, nicht auf die Uhr: Die Bewegung dauert
    // auf einem langsamen Rechner laenger als auf einem schnellen.
    await expect.poll(abstand, { timeout: 5_000 }).toBeGreaterThan(vorher);
  });

  test('sagt im Browser, wenn kein Kartenmaterial ankommt (BEF-021)', async ({ page }) => {
    // Der Fall, der MAP-002 am ersten Tag mit Schluessel eingeholt hat: Die
    // Marker standen, der Hintergrund fehlte, und die Seite schwieg dazu.
    await page.goto(`${PRUEFSEITE}?fehler=1`);

    await expect(page.getByText(/Kartenmaterial konnte nicht geladen werden/)).toBeVisible();
    // Die Stopps bleiben sichtbar - sie kommen aus der Anwendung, nicht vom
    // Kartendienst.
    await expect(page.getByText('1', { exact: true })).toBeVisible();
  });

  test('fragt waehrend des ganzen Laufs keinen fremden Host', async ({ page }) => {
    // Gegenprobe zur Datenschutzzusage aus ADR-019 Punkt 12 und 15: Ausser
    // Kacheln geht nichts hinaus - und hier, ohne Kachelquelle, gar nichts.
    const fremde: string[] = [];
    const eigene: string[] = [];
    page.on('request', (anfrage) => {
      const url = new URL(anfrage.url());
      if (!url.protocol.startsWith('http')) return;
      if (url.hostname === '127.0.0.1') eigene.push(anfrage.url());
      else fremde.push(anfrage.url());
    });

    await page.goto(PRUEFSEITE);
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Hineinzoomen' }).click();
    await page.waitForTimeout(700);

    expect(fremde).toEqual([]);

    // Und die Gegenprobe zur Vite-Einstellung `optimizeDeps.exclude`: Der
    // Worker, der spaeter die Vektorkacheln entpackt, wird wirklich geladen.
    // Fehlt er, bleibt die Karte leer, sobald ein Kachelschluessel vorliegt -
    // und das faellt ohne diese Zeile erst Jannes auf.
    expect(eigene.some((url) => url.includes('maplibre-gl-worker'))).toBe(true);
  });
});
