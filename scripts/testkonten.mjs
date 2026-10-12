// -----------------------------------------------------------------------------
// Anmeldung mit den synthetischen Testkonten - gemeinsam fuer
// scripts/screenshots.mjs und scripts/bildstrecke.mjs.
//
// Die Konten und das Kennwort sind dieselben wie in
// tests/e2e/authenticated/helpers.ts (KONTEN, TESTKENNWORT) und
// supabase/seed.sql. Kein Secret im Sinne von PROJECT_PRINCIPLES.md 3.3: Sie
// oeffnen ausschliesslich synthetische Konten in einer Datenbank ohne reale
// Daten.
// -----------------------------------------------------------------------------

// Map statt Objekt: ein Zugriff mit einem beliebigen CLI-Argument als
// Schluessel waere sonst ein von eslint-plugin-security zu Recht gemeldeter
// Object-Injection-Sink.
export const KONTEN = new Map([
  // Praxis (supabase/seed.sql, user_roles)
  ['owner', 'jannes.test@praxis.invalid'], // owner und therapist
  ['office', 'olivia.office@praxis.invalid'],
  ['therapist', 'anna.beispiel@praxis.invalid'],
  ['teamleitung', 'tim.teamleitung@praxis.invalid'], // therapist und team_lead
  ['trainer', 'tom.training@praxis.invalid'],
  // Patientenplattform (platform_accesses im Seed)
  ['plattform', 'erika.plattform@patient.invalid'], // Behandlung und Training
  ['plattform-training', 'tina.plattform@patient.invalid'], // nur Training
  ['begleitung', 'paula.begleitung@patient.invalid'], // Begleitung fuer Max Mustermann
]);

/** Konten, die nach der Anmeldung in der Patientenplattform unter `/p` landen. */
export const PLATTFORMKONTEN = new Set(['plattform', 'plattform-training', 'begleitung']);

export const TESTKENNWORT = 'LokalerTestzugang!2026';

/**
 * Der Merker des Startbilds (src/lib/startbildMerker.ts). Ist er im
 * sessionStorage gesetzt, bevor die Anwendung startet, laeuft das Intro
 * (RAH-009, knapp zwei Sekunden) gar nicht erst.
 */
export const STARTBILD_MERKER = 'startbild-gezeigt';

/** Fuer `context.addInitScript`: das Startbild in jedem Tab ueberspringen. */
export function startbildUeberspringen(merker) {
  try {
    // eslint-disable-next-line no-undef -- laeuft im Browser, nicht in Node
    window.sessionStorage.setItem(merker, '1');
  } catch {
    // Ohne Speicher laeuft das Intro eben; startbildAbwarten faengt es ab.
  }
}

/** Wartet, bis ein Startbild (falls eines laeuft) die Seite freigibt. */
export async function startbildAbwarten(seite) {
  await seite
    .locator('[data-startbild]')
    .waitFor({ state: 'detached', timeout: 6_000 })
    .catch(() => undefined);
}

/**
 * Meldet ein Konto ueber den Kennwortweg der Testkonten an (ADR-025
 * Punkt 15) und gibt erst zurueck, wenn die angemeldete Oberflaeche steht:
 * die Praxis mit ihrem Knopf „Abmelden", die Plattform unter `/p`.
 * Wirft mit einem lesbaren Satz, wenn die Anmeldung scheitert.
 */
export async function anmelden(seite, basis, kontoName) {
  const adresse = KONTEN.get(kontoName);
  if (!adresse) {
    throw new Error(`Unbekanntes Konto "${kontoName}". Bekannt: ${[...KONTEN.keys()].join(', ')}`);
  }
  await seite.goto(basis + '/', { waitUntil: 'networkidle', timeout: 30_000 });
  // Der Kennwortweg liegt zugeklappt hinter „Testkonten" (ADR-025 Punkt 15),
  // wie in tests/e2e/authenticated/helpers.ts.
  await seite.getByText('Testkonten', { exact: true }).click();
  await seite.getByLabel('E-Mail-Adresse').fill(adresse);
  // exact grenzt das Feld gegen den Sichtbar-Schalter ab.
  await seite.getByLabel('Kennwort', { exact: true }).fill(TESTKENNWORT);
  await seite.getByRole('button', { name: 'Anmelden', exact: true }).click();
  if (PLATTFORMKONTEN.has(kontoName)) {
    await seite.waitForURL((url) => url.pathname.startsWith('/p'), { timeout: 15_000 });
  } else {
    // `exact` wie in den E2E-Tests: eine offene Rueckfrage traegt sonst
    // ebenfalls „abmelden" im Namen (FIX-014).
    await seite
      .getByRole('button', { name: 'Abmelden', exact: true })
      .waitFor({ state: 'visible', timeout: 15_000 });
  }
  return adresse;
}

/** Der Hinweis, wenn eine Anmeldung scheitert. */
export const ANMELDUNG_VORAUSSETZUNG =
  'Laeuft ein Supabase-Stack (pnpm dlx supabase@2.116.0 start oder ./scripts/cloud-stack.sh start) und die Anwendung (pnpm dev)?';
