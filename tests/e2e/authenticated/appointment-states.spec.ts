import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  MITARBEITENDE,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  detailWert,
  tagImFenster,
  terminKachel,
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

function zeit(minutenAbAcht: number): string {
  // Der Beginn muss auf dem Praxisraster liegen (CAL-005; im Seed 5 Minuten).
  const gesamt = 8 * 60 + (LAUF % 12) * 5 + minutenAbAcht;
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

async function terminAnlegen(
  page: Page,
  opts: { tag: string; von: string; bis: string; patient?: string },
): Promise<string> {
  await page.goto(`/patienten/${opts.patient ?? PATIENTEN.max}/termine/neu`);
  await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
  await page.getByLabel('Terminart *').selectOption('practice');
  // Bei genau einem Standort waehlt das Formular ihn vor - aber erst, wenn die
  // Standorte geladen sind (`NewAppointmentPage`, useEffect auf die Abfrage).
  // Wer vorher abschickt, schickt ein leeres Pflichtfeld ab und bleibt auf dem
  // Formular stehen. Auf einem belasteten Runner ist genau das passiert;
  // derselbe Riegel steht in appointment-workflows.spec.ts.
  await expect(page.getByLabel('Standort *')).toHaveValue(/.+/);
  await page.getByLabel('Datum *').fill(opts.tag);
  await page.getByLabel('Beginn *').fill(opts.von);
  // Das Ende ist seit CAL-010a eine Ableitung aus dem Beginn (8.1) und kein
  // Feld mehr. Geprueft wird es trotzdem - sonst waere `bis` nur noch Zierde.
  await expect(page.getByText(`${opts.bis} Uhr`)).toBeVisible();
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

test.describe('CAL-008a: Der Zustand heisst bestaetigt', () => {
  test('legt einen Termin als bestaetigt an und filtert im Kalender danach', async ({ page }) => {
    const tag = laufTag();

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');

    await page.goto(`/kalender?ansicht=tag&datum=${tag}&status=confirmed`);
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
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');

    await page.getByLabel('Absagegrund').selectOption('moved');
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    await expect(detailWert(page, 'Absagegrund')).toContainText('Termin verlegt');

    await page.reload();
    await expect(detailWert(page, 'Absagegrund')).toContainText('Termin verlegt');
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
    await expect(rueckfrage).toContainText('Eine Gebühr entsteht daraus nicht');
    await expect(page.getByLabel('Ausfallhonorar berechnen?')).toHaveCount(0);

    await page.getByRole('button', { name: 'Ja, niemand angetroffen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Nicht angetroffen');
    await expect(page.getByText('Gebühr vorgemerkt')).toHaveCount(0);

    // Kein zweites Vermerken, kein Absagen - erst wieder oeffnen.
    await expect(page.getByRole('button', { name: 'Nicht angetroffen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Termin wieder öffnen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');
  });
});

test.describe('CAL-014c: Absage unter 24 Stunden', () => {
  /**
   * Der Termin liegt zwei Tage voraus; die Absage geht "gerade eben" ein.
   * Damit sind es mehr als 24 Stunden - und genau das soll KEINE Gebuehr
   * ausloesen. Die Gegenprobe unter der Frist braucht einen Termin am selben
   * Tag und laeuft in der Abnahme von Hand (docs/abnahme).
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
    await page.getByLabel('Absagegrund').selectOption('patient_request');
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    await expect(detailWert(page, 'Absage eingegangen')).not.toBeEmpty();
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
    await page.getByLabel('Absagegrund').selectOption('patient_request');
    await page.getByLabel('Wann ist die Absage eingegangen?').selectOption('frueher');
    // Gestern: ein Eingang in der Zukunft wird zu Recht abgewiesen, und die
    // Tagesfenster dieser Datei liegen in der Zukunft.
    await page.getByLabel('Datum des Eingangs').fill(gestern());
    await page.getByLabel('Uhrzeit').fill('08:00');
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    await expect(detailWert(page, 'Absage eingegangen')).toContainText('08:00');
  });
});

test.describe('CAL-008d: Dokumentiert kommt aus der Finalisierung', () => {
  test('hebt den Termin mit "Behandlung abschliessen" auf dokumentiert', async ({ page }) => {
    const tag = laufTag(3);

    await anmelden(page, KONTEN.therapist);
    const terminId = await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });

    // Seit UX-012e heisst der Weg am Termin „Dokumentieren und abschließen";
    // die Seite dahinter traegt weiterhin „Behandlung abschließen".
    await page.getByRole('link', { name: 'Dokumentieren und abschließen' }).click();
    await page
      .getByLabel(/Behandlung/)
      .first()
      .fill('Synthetischer Behandlungstext, E2E.');
    await page
      .getByRole('button', { name: /abschließen/ })
      .last()
      .click();

    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Status')).toContainText('Dokumentiert');

    // Ohne Rueckweg: weder aendern noch absagen noch wieder oeffnen.
    await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin wieder öffnen' })).toHaveCount(0);
  });
});

test.describe('CAL-009: Tag umplanen', () => {
  test('sagt den ganzen Tag ab und zeigt die Anrufliste', async ({ page }) => {
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
    await expect(page.getByRole('link', { name: 'Tag umplanen' })).toHaveCount(0);

    await page.goto(`/kalender?ansicht=tag&datum=${tag}&person=${MITARBEITENDE.anna}`);
    await page.getByRole('link', { name: 'Tag umplanen' }).click();

    await expect(page.getByRole('heading', { name: 'Tag umplanen' })).toBeVisible();
    await expect(page.getByText(/Diese Termine werden abgesagt \(2\)/)).toBeVisible();

    await page.getByLabel('Absagegrund').selectOption('practice_request');
    await page.getByRole('button', { name: '2 Termine absagen' }).click();
    await page.getByRole('button', { name: 'Ja, alle absagen' }).click();

    await expect(page.getByText('2 Termine sind abgesagt. Jetzt anrufen.')).toBeVisible();
    await expect(page.getByText(/nicht gespeichert/)).toBeVisible();

    // Und im Kalender sind beide Termine tatsaechlich abgesagt. Adressiert ueber
    // die Kachel des jeweiligen Termins, nicht ueber den Text "Abgesagt": den
    // findet `getByText` als Teilstring ohne Ruecksicht auf Gross- und
    // Kleinschreibung auch im Statusfilter ("Alle ausser abgesagten"), und ein
    // Eintrag in einer geschlossenen Auswahlliste ist nie sichtbar.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}&person=${MITARBEITENDE.anna}&status=all`);
    for (const id of [ersterTermin, zweiterTermin]) {
      const kachel = terminKachel(page, id);
      await expect(kachel).toBeVisible();
      await expect(kachel).toContainText('Abgesagt');
    }
  });
});
