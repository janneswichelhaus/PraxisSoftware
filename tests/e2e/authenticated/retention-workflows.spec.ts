import { expect, test } from '@playwright/test';
import { KONTEN, PATIENTEN, anmelden, detailWert, rpcAufrufen, zugriffstoken } from './helpers';

/**
 * Aufbewahrung und Löschung hinter der Anmeldung (LOE-001b, LOE-001c, LOE-002b).
 *
 * Diese Datei schließt die Lücke, die der Loop selbst benannt hat: In der
 * Cloud-Entwicklungsumgebung gibt es kein GoTrue, die Oberfläche hinter der
 * Anmeldung war dort also nicht zu sehen. **In CI schon** — der Stack läuft
 * dort vollständig. Was hier grün wird, ist damit keine Vermutung mehr,
 * sondern der echte Pfad Browser → GoTrue → PostgREST → RPC → PostgreSQL.
 *
 * Zwei Dinge werden bewusst doppelt geprüft: was die Oberfläche zeigt **und**
 * was der Server einer Rolle erlaubt. Ein ausgeblendeter Knopf ist keine
 * Zugriffskontrolle (ADR-004) — die Nachweise auf RPC-Ebene stehen deshalb
 * neben den Klickwegen.
 *
 * Kein Tagesfenster: Diese Datei legt keine Termine an. Sie ändert den
 * Abschluss der Versorgung und eine Löschsperre — beides ist rücknehmbar, und
 * beides wird am Ende jedes Tests zurückgenommen.
 */
test.describe.configure({ mode: 'serial' });

/** Jahr, bis zu dem die Akte nach einem heutigen Abschluss aufbewahrt wird. */
const AUFBEWAHRUNG_BIS = `${new Date().getFullYear() + 10}`;

test.describe('LOE-002b: Aufbewahrungsübersicht', () => {
  test('führt owner über das Untermenü zum Aufbewahrungsplan', async ({ page }) => {
    await anmelden(page, KONTEN.owner);

    // Der Weg, den Jannes geht: Betrieb, dann der neue Punkt im Untermenü.
    await page.goto('/praxis/team');
    await page.getByRole('link', { name: 'Aufbewahrung' }).click();

    await expect(page.getByRole('heading', { name: 'Aufbewahrung und Löschung' })).toBeVisible();

    // Die gesetzlich geprägte Klasse steht mit Frist, Anker und Fundstelle da.
    // Alle drei Angaben kommen auf dieser Seite genau einmal vor - nur die
    // Patientenakte rechnet ab dem Abschluss der Versorgung.
    await expect(page.getByRole('heading', { name: 'Klinische Patientenakte' })).toBeVisible();
    await expect(page.getByText('10 Jahre', { exact: true })).toBeVisible();
    await expect(page.getByText('ab Abschluss der Versorgung')).toBeVisible();
    await expect(page.getByText('Par. 630f Abs. 3 BGB')).toBeVisible();
  });

  test('sagt bei einer offenen Frist ausdrücklich, dass nicht gelöscht wird', async ({ page }) => {
    await anmelden(page, KONTEN.owner);
    await page.goto('/praxis/sicherheit/aufbewahrung');

    // Beschäftigtendaten haben keine Frist (ANN-030). Das darf nicht als
    // stille Lücke dastehen, sondern muss am Bildschirm benannt sein - mit
    // dem Kürzel der Annahme, die die Datenschutzprüfung abarbeitet.
    //
    // Das Abzeichen steht neben der Überschrift im selben Kasten; die
    // Zuordnung wird deshalb über genau dieses Elternelement geprüft und
    // nicht über die ganze Seite - sonst bewiese der Test nur, dass
    // IRGENDEINE Klasse ein Kürzel trägt.
    const kopf = page.getByRole('heading', { name: 'Beschäftigtendaten' }).locator('..');
    await expect(kopf).toContainText('ANN-030');
    // `exact` ist hier wichtig: ohne ihn trifft der Text auch die Einträge im
    // zugeklappten Aufklappbereich („… — keine automatische Löschung"), und
    // die sind nicht sichtbar.
    await expect(
      page.getByText('Keine automatische Löschung', { exact: true }).first(),
    ).toBeVisible();
  });

  test('zeigt den leeren Zustand als Text, nicht als leere Fläche', async ({ page }) => {
    await anmelden(page, KONTEN.owner);
    await page.goto('/praxis/sicherheit/aufbewahrung');

    await expect(page.getByText('Keine laufende Löschsperre')).toBeVisible();
    await expect(page.getByText('Es wurde noch nichts gelöscht')).toBeVisible();
  });

  test('hält die Übersicht für therapist verschlossen - Menü und Adresse', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);

    await page.goto('/praxis/team');
    await expect(page.getByRole('link', { name: 'Aufbewahrung' })).toHaveCount(0);

    // Der direkte Aufruf landet auf „Mein Tag" - die Seite gibt nichts preis.
    await page.goto('/praxis/sicherheit/aufbewahrung');
    await expect(page.getByRole('heading', { name: 'Aufbewahrung und Löschung' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Guten/ })).toBeVisible();
  });
});

test.describe('LOE-001b: Abschluss der Versorgung', () => {
  test('hält den Abschluss dauerhaft fest und nimmt ihn wieder zurück', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);

    await page.goto(`/patienten/${PATIENTEN.erika}`);
    await expect(page.getByRole('heading', { name: 'Erika Beispiel' })).toBeVisible();
    await expect(detailWert(page, 'Abschluss')).toHaveText('Laufende Versorgung');

    // Der Vorgang verlangt eine Rückfrage; erst der zweite Klick schreibt.
    await page.getByRole('button', { name: 'Versorgung abschließen' }).click();
    await expect(page.getByLabel('Letzter Behandlungstag')).toBeVisible();
    await page.getByRole('button', { name: 'Versorgung abschließen' }).last().click();

    await expect(detailWert(page, 'Abschluss')).toContainText(
      `Aufbewahrung bis ${AUFBEWAHRUNG_BIS}`,
    );

    // Überlebt das Neuladen - der Wert kommt also aus der Datenbank und nicht
    // aus dem Zustand der Anwendung.
    await page.reload();
    await expect(detailWert(page, 'Abschluss')).toContainText(
      `Aufbewahrung bis ${AUFBEWAHRUNG_BIS}`,
    );

    // Ausgangszustand wiederherstellen, damit der Lauf wiederholbar bleibt.
    await page.getByRole('button', { name: 'Abschluss zurücknehmen' }).click();
    await page.getByRole('button', { name: 'Abschluss zurücknehmen' }).last().click();
    await expect(detailWert(page, 'Abschluss')).toHaveText('Laufende Versorgung');
  });

  test('bietet office den Abschluss nicht an, wohl aber den Statuswechsel', async ({ page }) => {
    await anmelden(page, KONTEN.office);

    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(page.getByRole('heading', { name: 'Max Mustermann' })).toBeVisible();

    // Der Rollenschnitt ist hier bewusst ein anderer als beim
    // organisatorischen Status: verwalten ja, über den Behandlungsverlauf
    // urteilen nein (ANN-032).
    await expect(page.getByRole('button', { name: 'Als inaktiv markieren' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Versorgung abschließen' })).toHaveCount(0);
  });

  test('weist office auch auf RPC-Ebene ab - der Knopf ist nicht die Kontrolle', async ({
    request,
  }) => {
    const token = await zugriffstoken(request, KONTEN.office);

    const antwort = await rpcAufrufen(request, token, 'conclude_patient_care', {
      p_patient_id: PATIENTEN.max,
      p_concluded_on: null,
    });

    expect(antwort.status(), 'Abschluss durch office').toBe(403);
    expect((await antwort.json()) as { message?: string }).toMatchObject({
      message: 'not allowed to conclude patient care',
    });
  });
});

test.describe('LOE-001c: Löschsperre', () => {
  test('erscheint in der Übersicht, solange sie läuft', async ({ page, request }) => {
    const ownerToken = await zugriffstoken(request, KONTEN.owner);

    const gesetzt = await rpcAufrufen(request, ownerToken, 'place_legal_hold', {
      p_patient_id: PATIENTEN.max,
      p_reason: 'E2E-Testsperre',
    });
    expect(gesetzt.status(), 'Sperre setzen').toBe(200);
    const holdId = (await gesetzt.json()) as string;

    try {
      await anmelden(page, KONTEN.owner);
      await page.goto('/praxis/sicherheit/aufbewahrung');

      // Name und Grund stehen auf dieser Seite nur in der Sperre.
      const karte = page.getByRole('heading', { name: 'Max Mustermann' });
      await expect(karte).toBeVisible();
      await expect(page.getByText('E2E-Testsperre')).toBeVisible();

      // Der Zustand steht als Wort im Abzeichen, nicht nur als Farbe
      // (Oberflächen-Checkliste Punkt 4). Geprüft wird er im Kopf der Karte
      // und nicht auf der ganzen Seite: `getByText` sucht case-insensitiv
      // nach einem Teilstring und fand sonst auch den Hinweis über dem
      // Abschnitt („Eine gesperrte Akte wird nicht gelöscht …"). Und `exact`
      // hilft hier nicht - das Abzeichen trägt vor dem Wort noch sein
      // Zeichen, sein Textinhalt ist also „!Gesperrt".
      await expect(karte.locator('..')).toContainText('Gesperrt');
    } finally {
      // Auch wenn oben etwas scheitert: die Sperre darf nicht stehen bleiben,
      // sonst findet der nächste Lauf einen anderen Ausgangspunkt vor.
      // Bewusst ohne Zusicherung - eine hier würde im Fehlerfall die
      // eigentliche Ursache verdecken. Dass das Aufheben gewirkt hat, prüft
      // die Zeile nach dem Block.
      await rpcAufrufen(request, ownerToken, 'release_legal_hold', { p_hold_id: holdId });
    }

    await page.reload();
    await expect(page.getByText('Keine laufende Löschsperre')).toBeVisible();
  });

  test('lässt therapist weder sperren noch die Sperrliste lesen', async ({ request }) => {
    const token = await zugriffstoken(request, KONTEN.therapist);

    const setzen = await rpcAufrufen(request, token, 'place_legal_hold', {
      p_patient_id: PATIENTEN.max,
      p_reason: 'Unerlaubter Versuch',
    });
    expect(setzen.status(), 'Sperre durch therapist').toBe(403);

    const lesen = await rpcAufrufen(request, token, 'list_legal_holds', {});
    expect(lesen.status(), 'Sperrliste durch therapist').toBe(403);
  });
});

test.describe('LOE-002a: Der Löschlauf ist kein Anwendungsvorgang', () => {
  test('ist über PostgREST für kein angemeldetes Konto erreichbar (ANN-007)', async ({
    request,
  }) => {
    const token = await zugriffstoken(request, KONTEN.owner);

    // Der Lauf gehört dem Scheduler. Er hat kein Ausführungsrecht für
    // `authenticated` und ist deshalb über die API gar nicht ansprechbar -
    // auch nicht für die Praxisinhaberin.
    for (const name of ['apply_retention', 'reapply_deletion_journal']) {
      const antwort = await rpcAufrufen(request, token, name, {});
      expect(antwort.status(), `${name} über PostgREST`).toBeGreaterThanOrEqual(400);
    }
  });

  test('gibt owner die Zusammenfassung des Löschjournals, therapist nicht', async ({ request }) => {
    const ownerToken = await zugriffstoken(request, KONTEN.owner);
    const therapistToken = await zugriffstoken(request, KONTEN.therapist);

    const fuerOwner = await rpcAufrufen(request, ownerToken, 'list_deletion_runs', {
      p_limit: 50,
    });
    expect(fuerOwner.status(), 'Löschjournal für owner').toBe(200);

    const fuerTherapist = await rpcAufrufen(request, therapistToken, 'list_deletion_runs', {
      p_limit: 50,
    });
    expect(fuerTherapist.status(), 'Löschjournal für therapist').toBe(403);
  });
});
