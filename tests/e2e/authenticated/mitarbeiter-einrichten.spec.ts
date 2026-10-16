import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { KONTEN, anmelden, rpcAufrufen, supabaseKonfiguration, zugriffstoken } from './helpers';

/**
 * G5 „Neue:n Mitarbeiter:in einrichten“ (Überholung 6) gegen den echten Stack,
 * bei 375 × 667 - Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPCs, nichts
 * gestubbt. Gezählt wird ab der Liste der Mitarbeitenden bis „… einrichten“:
 * ≤ 8 Tipps + Felder (Spec Überholung 6; vorher über drei Seiten verteilt:
 * Anlegen, Zugang, Arbeitszeiten).
 *
 * Danach am Server nachgesehen: Person, Kalender für Behandlungen, Wochenplan,
 * Schlüssel, Einladung. Eine eigene Person je Lauf (Mitarbeiterdatensätze
 * werden nicht gelöscht); am Ende liegt der Schlüssel wieder im Tresor und die
 * Person ist inaktiv - sonst stünde sie in jedem späteren Lauf als
 * Behandelnde im Kalender. Ausschließlich synthetische Seed-Konten.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();
const TELEFON = { width: 375, height: 667 };

/** Lastenrad 5 (Ersatz) aus `supabase/seed.sql`: nicht gesperrt, Schlüssel im Tresor. */
const ERSATZRAD = 'b2b2b2b2-b2b2-4b2b-8b2b-000000000015';

/** Ein Nachname je Lauf aus Buchstaben - wie in `kernablaeufe.spec.ts`. */
function nachname(zusatz: string): string {
  const buchstaben = LAUF.toString(36).replace(/[0-9]/g, (z) => 'abcdefghij'.charAt(Number(z)));
  return `Einrichtung${zusatz}${buchstaben}`;
}

function zaehler() {
  let tipps = 0;
  return {
    /** Ein Tipp; Playwright wartet von selbst, bis die Tippsperre vorbei ist. */
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    get tipps() {
      return tipps;
    },
  };
}

function fenster(page: Page, frage: string) {
  return page.getByRole('dialog', { name: frage });
}

/** Weder Fenster noch Fragefläche laufen über, die Seite nicht in die Breite. */
async function scrolltNicht(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return false;
    const flaechen = [dialog, ...dialog.querySelectorAll<HTMLElement>('.overflow-y-auto')];
    return (
      flaechen.every((flaeche) => flaeche.scrollHeight <= flaeche.clientHeight + 1) &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    );
  });
}

async function lesen<T>(request: APIRequestContext, token: string, pfad: string): Promise<T[]> {
  const { url, anonKey } = supabaseKonfiguration();
  const antwort = await request.get(`${url}/rest/v1/${pfad}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  expect(antwort.status(), pfad).toBe(200);
  return (await antwort.json()) as T[];
}

test('G5 Inhaber:in: vom Team bis eingerichtet in höchstens acht Tipps', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const token = await zugriffstoken(request, KONTEN.owner);
  // Liegt der Schlüssel nach einem abgebrochenen Lauf noch draußen, zurück in den Tresor.
  await rpcAufrufen(request, token, 'return_fleet_key', { p_bike_id: ERSATZRAD });

  const name = nachname('Inhaberin');
  const email = `${name.toLowerCase()}@praxis.invalid`;
  let staffId: string | null = null;
  try {
    await anmelden(page, KONTEN.owner);
    await page.setViewportSize(TELEFON);
    await page.goto('/praxis/team');
    const z = zaehler();
    await z.tippe(page.getByRole('link', { name: 'Mitarbeiter:in anlegen' }));

    const person = fenster(page, 'Wer kommt ins Team?');
    await expect(person.getByText('Schritt 1 von 6', { exact: true })).toBeVisible();
    expect(await scrolltNicht(page), 'Name und Kontakt ohne Scrollen').toBe(true);
    await person.getByLabel('Vorname *').fill('Nina');
    await person.getByLabel('Nachname *').fill(name);
    await person.getByLabel('Dienstliche E-Mail').fill(email);
    await z.tippe(person.getByRole('button', { name: 'Weiter' }));

    const rolle = fenster(page, 'Welche Rolle?');
    await z.tippe(rolle.getByText('Therapeut:in', { exact: true }));
    expect(await scrolltNicht(page), 'Rolle ohne Scrollen').toBe(true);
    await z.tippe(rolle.getByRole('button', { name: 'Weiter' }));

    const zeit = fenster(page, 'Wann arbeitet Nina?');
    expect(await scrolltNicht(page), 'Wochenplan ohne Scrollen').toBe(true);
    await z.tippe(zeit.getByRole('button', { name: /^Vollzeit/ }));

    const rad = fenster(page, 'Fährt Nina ein Lastenrad?');
    // Gesperrte Räder (Lastenrad 3, Lastenrad 6) stehen nicht zur Wahl.
    await expect(rad.getByRole('button', { name: /^Lastenrad 5/ })).toBeVisible();
    await expect(rad.getByRole('button', { name: /^Lastenrad 3/ })).toHaveCount(0);
    expect(await scrolltNicht(page), 'Rad ohne Scrollen').toBe(true);
    await z.tippe(rad.getByRole('button', { name: /^Lastenrad 5/ }));

    const zugang = fenster(page, 'Zugang einladen?');
    await expect(zugang.getByLabel('E-Mail-Adresse für den Zugang')).toHaveValue(email);
    expect(await scrolltNicht(page), 'Einladung ohne Scrollen').toBe(true);
    await z.tippe(zugang.getByRole('button', { name: 'Einladung senden' }));

    const abschluss = fenster(page, 'Alles richtig?');
    await expect(abschluss.getByRole('button', { name: 'Nina einrichten' })).toBeInViewport({
      ratio: 1,
    });
    await z.tippe(abschluss.getByRole('button', { name: 'Nina einrichten' }));

    // Ohne Konto beim Anmeldedienst (der Normalfall einer ersten Einladung,
    // ANN-025) bleibt es bei der Ergebnisseite; sonst geht es gleich weiter.
    const ergebnis = fenster(page, `Nina ${name} ist angelegt`);
    await expect(
      ergebnis.or(page.getByRole('heading', { level: 1, name: `Nina ${name}` })),
    ).toBeVisible({ timeout: 20_000 });
    if (await ergebnis.isVisible()) {
      // Die Kennung schon hier: Scheitert eine Prüfung, räumt `finally` trotzdem auf.
      const weg = ergebnis.getByRole('link', { name: 'Zur Mitarbeiterseite' });
      staffId = (await weg.getAttribute('href'))?.split('/').pop() ?? null;
      const schritte = ergebnis.getByRole('list', { name: 'Schritte' });
      await expect(schritte).toContainText('Arbeitszeiten✓erledigt');
      await expect(schritte).toContainText('Lastenrad✓erledigt');
      await expect(schritte).toContainText('Stammrad!offen');
      await weg.click();
    }
    await expect(page).toHaveURL(/\/praxis\/team\/[0-9a-f-]{36}$/);
    staffId = page.url().split('/').pop()!;

    test.info().annotations.push({
      type: 'G5',
      description: `${z.tipps} Tipps + 3 Felder ab „Mitarbeitende“ (vorher über drei Seiten verteilt)`,
    });
    expect(z.tipps).toBeLessThanOrEqual(8);

    // Am Server: im Kalender für Behandlungen, Wochenplan Mo-Fr, Schlüssel, Einladung.
    const behandelnde = await rpcAufrufen(request, token, 'list_assignable_therapists', {});
    expect(
      ((await behandelnde.json()) as { staff_member_id: string }[]).map((t) => t.staff_member_id),
    ).toContain(staffId);
    const zeiten = await lesen<{ weekday: number }>(
      request,
      token,
      `staff_working_hours?select=weekday&staff_member_id=eq.${staffId}`,
    );
    expect([...new Set(zeiten.map((zeile) => zeile.weekday))].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(zeiten).toHaveLength(10);
    const flotte = await rpcAufrufen(request, token, 'list_fleet', { p_week_start: null });
    const raeder = (
      (await flotte.json()) as { bikes: { id: string; key: { holder_staff_id: string } | null }[] }
    ).bikes;
    expect(raeder.find((eintrag) => eintrag.id === ERSATZRAD)?.key?.holder_staff_id).toBe(staffId);
    const einladungen = await lesen<{ email: string; role_keys: string[]; status: string }>(
      request,
      token,
      `staff_account_invitations?select=email,role_keys,status&staff_member_id=eq.${staffId}`,
    );
    expect(einladungen).toEqual([{ email, role_keys: ['therapist'], status: 'pending' }]);
  } finally {
    await rpcAufrufen(request, token, 'return_fleet_key', { p_bike_id: ERSATZRAD });
    if (staffId) {
      await rpcAufrufen(request, token, 'set_staff_employment_status', {
        p_staff_member_id: staffId,
        p_status: 'inactive',
        p_acknowledge_future_appointments: true,
      });
    }
  }
});

test('G5 Büro: Name, Rad, Abschluss - Rolle, Einladung und Wochenplan bleiben der Inhaber:in', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const name = nachname('Buero');
  await anmelden(page, KONTEN.office);
  await page.setViewportSize(TELEFON);
  await page.goto('/praxis/team');
  const z = zaehler();
  await z.tippe(page.getByRole('link', { name: 'Mitarbeiter:in anlegen' }));

  const person = fenster(page, 'Wer kommt ins Team?');
  await expect(person.getByText('Schritt 1 von 3', { exact: true })).toBeVisible();
  await person.getByLabel('Vorname *').fill('Nora');
  await person.getByLabel('Nachname *').fill(name);
  await z.tippe(person.getByRole('button', { name: 'Weiter' }));

  await z.tippe(
    fenster(page, 'Fährt Nora ein Lastenrad?').getByRole('button', { name: 'Kein Rad' }),
  );

  const abschluss = fenster(page, 'Alles richtig?');
  await expect(abschluss.getByText('Lädt die Inhaber:in ein')).toBeVisible();
  await expect(
    abschluss.getByText('Sobald die Inhaber:in die Person in den Kalender nimmt'),
  ).toBeVisible();
  await z.tippe(abschluss.getByRole('button', { name: 'Nora einrichten' }));

  await expect(page).toHaveURL(/\/praxis\/team\/[0-9a-f-]{36}$/);
  await expect(page.getByText(`Nora ${name} ist eingerichtet.`)).toBeVisible();
  const staffId = page.url().split('/').pop()!;
  test.info().annotations.push({
    type: 'G5 Büro',
    description: `${z.tipps} Tipps + 2 Felder ab „Mitarbeitende“`,
  });
  expect(z.tipps).toBeLessThanOrEqual(4);

  // Ohne owner nicht im Kalender (ANN-226) - und kein Wochenplan.
  const token = await zugriffstoken(request, KONTEN.owner);
  const behandelnde = await rpcAufrufen(request, token, 'list_assignable_therapists', {});
  expect(
    ((await behandelnde.json()) as { staff_member_id: string }[]).map((t) => t.staff_member_id),
  ).not.toContain(staffId);
  expect(
    await lesen(request, token, `staff_working_hours?select=id&staff_member_id=eq.${staffId}`),
  ).toEqual([]);
});
