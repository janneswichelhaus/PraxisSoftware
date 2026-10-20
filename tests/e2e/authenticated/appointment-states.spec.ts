import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  MITARBEITENDE,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  detailWert,
  tagImFenster,
  terminKachel,
  terminUeberOberflaeche,
  zeitImLauf,
  kalenderOptionenOeffnen,
  terminOeffnen,
  terminNeuLaden,
} from './helpers';

/**
 * Terminzustände im echten Ablauf (CAL-EPIC-003a, ADR-018).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Geprüft wird genau das, was die Komponententests nicht können: ob
 * die Pflichtangaben in der laufenden Anwendung tatsächlich greifen, ob der
 * Zustand das Neuladen überlebt und ob „Tag umplanen" am Ende die Anrufliste
 * zeigt.
 *
 * Wie in den übrigen Spezifikationen belegt jeder Lauf einen eigenen Zeitraum:
 * ein angelegter Termin lässt sich fachlich nicht entfernen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.appointmentStates, LAUF, versatz);
}

/** Der gestrige Kalendertag - fuer einen Eingang, der sicher in der Vergangenheit liegt. */
function gestern(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const zeit = (minutenAbAcht: number) => zeitImLauf(LAUF, minutenAbAcht);

const terminAnlegen = (
  page: Page,
  opts: { tag: string; von: string; bis: string; patient?: string },
) => terminUeberOberflaeche(page, { ...opts, standortAbwarten: true });

test.describe('CAL-008a: Der Zustand heisst bestaetigt', () => {
  test('legt einen Termin als bestaetigt an und filtert im Kalender danach', async ({ page }) => {
    const tag = laufTag();

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    await expect(detailWert(page, 'Status')).toContainText('Steht aus');

    await page.goto(`/kalender?ansicht=tag&datum=${tag}&status=confirmed`);
    await kalenderOptionenOeffnen(page);
    await expect(page.getByLabel('Status')).toHaveValue('confirmed');
  });
});

test.describe('CAL-008b: Absage nur mit Grund', () => {
  test('weist die Absage ohne Grund ab und haelt den Grund danach fest', async ({ page }) => {
    const tag = laufTag(1);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });

    await page.getByRole('button', { name: 'Termin absagen' }).click();
    const rueckfrage = page.getByRole('group', { name: 'Termin absagen' });
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();
    await expect(rueckfrage).toContainText('Bitte einen Absagegrund auswählen.');
    await expect(detailWert(page, 'Status')).toContainText('Steht aus');

    await page.getByRole('button', { name: 'Praxis hat verlegt' }).click();
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    await expect(detailWert(page, 'Absagegrund')).toContainText('Praxis hat verlegt');

    await terminNeuLaden(page);
    await expect(detailWert(page, 'Absagegrund')).toContainText('Praxis hat verlegt');
  });
});

test.describe('CAL-014c: Nicht angetroffen ohne Gebuehrenentscheidung', () => {
  test('vermerkt mit einem Schritt und laesst sich wieder oeffnen', async ({ page }) => {
    const tag = laufTag(2);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });

    await page.getByRole('button', { name: 'Nicht angetroffen' }).click();
    const rueckfrage = page.getByRole('group', { name: 'Nicht angetroffen' });
    // Seit ADR-018 Fassung 2: keine Pflichtauswahl mehr an dieser Stelle.
    // Der Satz „Das ist ein organisatorischer Vermerk …" ist gestrichen
    // (Design-Handoff 2026-10-01, Abschnitt 1).
    await expect(rueckfrage).toContainText('wird als „nicht angetroffen“ geführt');
    await expect(rueckfrage).not.toContainText('organisatorischer Vermerk');
    await expect(page.getByLabel('Ausfallhonorar berechnen?')).toHaveCount(0);

    await page.getByRole('button', { name: 'Ja, niemand angetroffen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Nicht angetroffen');
    await expect(page.getByText('Gebühr vorgemerkt')).toHaveCount(0);

    // Kein zweites Vermerken, kein Absagen - erst wieder oeffnen. Im Fenster
    // gesucht: Die Kalenderkachel dahinter nennt den Status in ihrem Namen.
    const fenster = page.getByRole('dialog');
    await expect(fenster.getByRole('button', { name: 'Nicht angetroffen' })).toHaveCount(0);
    await expect(fenster.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Termin wieder öffnen' }).click();
    await page.getByRole('button', { name: 'Ja, wieder öffnen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Steht aus');
  });
});

test.describe('CAL-014c: Absage unter 24 Stunden', () => {
  /**
   * Der Termin liegt zwei Tage voraus; die Absage geht "gerade eben" ein.
   * Damit sind es mehr als 24 Stunden - und genau das soll KEINE Gebuehr
   * ausloesen. Die Gegenprobe unter der Frist braucht einen Termin am selben
   * Tag und laeuft in der Sichtung von Hand (docs/sichtung).
   */
  test('merkt bei rechtzeitiger Absage keine Gebuehr vor', async ({ page }) => {
    // Versatz 5 und nicht 2: Der Test darueber legt an Tag 2 denselben
    // Zeitraum bei derselben Person an und oeffnet ihn am Ende wieder - der
    // Platz ist also belegt, und `create_appointment` wiese den zweiten Termin
    // zu Recht ab. Der Test waere an etwas gescheitert, das er nicht prueft
    // (genau der Fall, den `tests/e2e/tagesfenster.spec.ts` beschreibt).
    const tag = laufTag(5);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });

    await page.getByRole('button', { name: 'Termin absagen' }).click();
    await page.getByRole('button', { name: 'Patient:in hat abgesagt' }).click();
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    await expect(detailWert(page, 'Eingegangen')).not.toBeEmpty();
    await expect(page.getByText('Gebühr vorgemerkt')).toHaveCount(0);
  });

  /**
   * Der nachgetragene Eingang - der Alltagsfall aus dem Buero. Geprueft wird
   * hier der Weg durch die Oberflaeche: Die Angabe kommt an, wird
   * festgehalten und steht danach an der Seite.
   *
   * Ob aus einem bestimmten Abstand eine Gebuehr wird, steht ausdruecklich
   * NICHT hier: Die Grenze haengt an Uhrzeiten, die dieser Lauf nicht
   * festlegt, und sie wird in `supabase/tests/cancellation-notice.test.ts`
   * auf die Sekunde geprueft. Ein E2E-Test, der sie nachstellte, waere von
   * der Tageszeit des Laufs abhaengig.
   */
  test('haelt einen nachgetragenen Eingang fest', async ({ page }) => {
    const tag = laufTag(3);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });

    await page.getByRole('button', { name: 'Termin absagen' }).click();
    await page.getByRole('button', { name: 'Patient:in hat abgesagt' }).click();
    await page.getByLabel('Wann ist die Absage eingegangen?').selectOption('frueher');
    // Gestern: ein Eingang in der Zukunft wird zu Recht abgewiesen, und die
    // Tagesfenster dieser Datei liegen in der Zukunft.
    await page.getByLabel('Datum des Eingangs').fill(gestern());
    await page.getByLabel('Uhrzeit').fill('08:00');
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    await expect(detailWert(page, 'Eingegangen')).toContainText('08:00');
  });
});

test.describe('CAL-008d: Dokumentiert kommt aus der Finalisierung', () => {
  test('hebt den Termin mit "Behandlung abschliessen" auf dokumentiert', async ({ page }) => {
    const tag = laufTag(3);

    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });

    // „Doku" in der Aktionsleiste, „Festschreiben" auf der Schreibseite
    // (Design-Handoff 2026-10-01, Abschnitt 6a).
    await page.getByRole('link', { name: 'Doku schreiben' }).click();
    await page.getByLabel('Eintrag zur Behandlung').fill('Synthetischer Behandlungstext, E2E.');
    await page.getByRole('button', { name: 'Festschreiben' }).click();

    await terminOeffnen(page, terminId);
    await expect(detailWert(page, 'Status')).toContainText('Dokumentiert');

    // Ohne Rueckweg: weder aendern noch absagen noch wieder oeffnen.
    await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin wieder öffnen' })).toHaveCount(0);
    // B4 (ADR-018 Fassung 5): Festschreiben hakt nicht ab - der Haken bleibt
    // ein eigener Schritt, und erst er lässt sich zurücknehmen.
    await expect(page.getByRole('button', { name: 'Abhaken', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Haken zurücknehmen' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Abhaken', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Haken zurücknehmen' })).toBeVisible();
    await expect(detailWert(page, 'Status')).toContainText('Dokumentiert');
  });
});

test.describe('CAL-009: Tag umplanen', () => {
  // G2 (Überholung 6, ANN-574): geführt - Grund, Auswahl (alle vorgewählt,
  // abwählbar), Rückfrage, dann je Person eine Seite. Budget ≤ 4 Tipps bis
  // abgesagt und 2 je Person (Anrufen ist der Weg in die Telefon-App und
  // zählt nicht mit).
  test('G2: plant den Tag geführt um - eine Person abgewählt, je Person ein Anruf', async ({
    page,
  }) => {
    // Zwei Termine anlegen, der Ablauf samt Zurückgeste und der Blick in den
    // Kalender brauchen am Stück knapp 30 s - mehr als die Vorgabe erlaubt.
    test.setTimeout(90_000);
    const tag = laufTag(4);

    await anmelden(page, KONTEN.office);
    const ersterTermin = await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    const zweiterTermin = await terminAnlegen(page, {
      tag,
      von: zeit(60),
      bis: zeit(120),
      patient: PATIENTEN.erika,
    });

    // Der Einstieg steht nur dort, wo Person UND Tag feststehen.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await kalenderOptionenOeffnen(page);
    await expect(page.getByRole('link', { name: 'Tag umplanen' })).toHaveCount(0);

    await page.goto(`/kalender?ansicht=tag&datum=${tag}&person=${MITARBEITENDE.anna}`);
    await kalenderOptionenOeffnen(page);
    await page.setViewportSize({ width: 375, height: 667 });
    let tipps = 0;
    const tippe = async (ziel: ReturnType<Page['getByRole']>) => {
      tipps += 1;
      await ziel.click();
    };
    await tippe(page.getByRole('link', { name: 'Tag umplanen' }));

    const grund = page.getByRole('dialog', { name: 'Warum fällt der Tag aus?' });
    await expect(grund.getByText('Schritt 1 von 3', { exact: true })).toBeVisible();
    await page.screenshot({ path: '.tmp/screenshots/b6-g2-01-grund-375.png' });
    await tippe(grund.getByRole('button', { name: 'Praxis hat abgesagt' }));

    const auswahl = page.getByRole('dialog', { name: 'Welche Termine absagen?' });
    await expect(auswahl.getByRole('checkbox')).toHaveCount(2);
    await page.screenshot({ path: '.tmp/screenshots/b6-g2-02-termine-375.png' });
    // Erika übernimmt eine Kollegin - abgewählt, er bleibt bestätigt.
    await tippe(auswahl.getByRole('checkbox', { name: /Erika Beispiel/ }));
    await tippe(auswahl.getByRole('button', { name: 'Weiter mit 1 Termin' }));

    const rueckfrage = page.getByRole('dialog', { name: '1 Termin absagen?' });
    await page.screenshot({ path: '.tmp/screenshots/b6-g2-03-rueckfrage-375.png' });
    await tippe(rueckfrage.getByRole('button', { name: 'Ja, 1 Termin absagen' }));

    const anruf = page.getByRole('dialog', { name: 'Max Mustermann erreicht?' });
    await expect(anruf.getByText('Ein Termin ist abgesagt. Jetzt anrufen.')).toBeVisible();
    await page.screenshot({ path: '.tmp/screenshots/b6-g2-04-anruf-375.png' });
    const bisAbgesagt = tipps;
    await tippe(anruf.getByRole('button', { name: 'Nicht erreicht' }));

    const ende = page.getByRole('dialog', { name: '1 noch nicht erreicht' });
    await expect(ende.getByText('Max Mustermann')).toBeVisible();
    await page.screenshot({ path: '.tmp/screenshots/b6-g2-05-fertig-375.png' });
    // Die Zurückgeste geht einen Schritt zurück zur Person, nicht aus dem
    // Ablauf (BEF-175) - auch nach der Absage, ohne Ungespeichertes. Kein
    // Tipp für das Budget: Danach geht es wie vorher weiter.
    await page.goBack();
    const nochmal = page.getByRole('dialog', { name: 'Max Mustermann erreicht?' });
    await expect(nochmal).toBeVisible();
    await nochmal.getByRole('button', { name: 'Nicht erreicht' }).click();
    await expect(page.getByRole('dialog', { name: '1 noch nicht erreicht' })).toBeVisible();
    // Der Anrufstand steht in der Adresse - ein Neuladen nimmt ihn mit (ANN-574).
    await page.reload();
    await expect(page.getByRole('dialog', { name: '1 noch nicht erreicht' })).toBeVisible();

    test.info().annotations.push({
      type: 'G2',
      description: `${bisAbgesagt} Tipps bis abgesagt (mit einer Abwahl), ${tipps - bisAbgesagt} je Person`,
    });
    // Ohne die Abwahl wären es vier; die Abwahl ist ein bewusster Tipp mehr.
    expect(bisAbgesagt).toBeLessThanOrEqual(5);
    expect(tipps - bisAbgesagt).toBeLessThanOrEqual(2);

    // Und im Kalender: genau der gewählte Termin ist abgesagt, der andere nicht.
    // Adressiert über die Kachel des jeweiligen Termins, nicht über den Text
    // "Abgesagt": den findet `getByText` als Teilstring ohne Rücksicht auf Groß-
    // und Kleinschreibung auch im Statusfilter ("Alle außer abgesagten").
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/kalender?ansicht=tag&datum=${tag}&person=${MITARBEITENDE.anna}&status=all`);
    await expect(terminKachel(page, ersterTermin)).toContainText('Abgesagt');
    await expect(terminKachel(page, zweiterTermin)).toBeVisible();
    await expect(terminKachel(page, zweiterTermin)).not.toContainText('Abgesagt');
  });
});
