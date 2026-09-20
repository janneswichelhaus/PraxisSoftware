import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

/**
 * Erlaubt es, einen bereits vorhandenen Chromium zu verwenden, statt ihn
 * herunterzuladen - etwa in Containern mit vorinstalliertem Browser.
 * Ohne die Variable gilt das Standardverhalten von Playwright.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const launchOptions = executablePath
  ? { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  : {};

/**
 * Die Abläufe hinter der Anmeldung brauchen einen laufenden Supabase-Stack
 * (GoTrue + PostgREST). Beide Werte stammen aus `supabase status` und gehören
 * zu einer lokalen Wegwerf-Instanz; sie stehen deshalb nicht im Repository.
 *
 * Ohne sie läuft ausschließlich die Abdeckung des nicht angemeldeten Zustands
 * - so wie bisher. Vorgetäuschte Anmeldungen gibt es nicht: entweder der
 * echte Stack antwortet, oder die Tests laufen gar nicht erst.
 */
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
const mitSupabase = Boolean(supabaseUrl && supabaseAnonKey);

const HINTER_ANMELDUNG = '**/authenticated/**/*.spec.ts';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  /**
   * Der angemeldete Lauf läuft seriell (BEF-009, R3-027).
   *
   * `fullyParallel: false` am Projekt ordnet nur die Tests **innerhalb** einer
   * Datei; die Dateien laufen weiter nebeneinander. Genau daran scheiterte der
   * Lauf: `staff-workflows` deaktiviert Anna Beispiel, während andere Dateien
   * sie im Terminformular auswählen wollen („did not find some options").
   * Playwright kennt `workers` nur oben, nicht je Projekt — gesetzt wird es
   * deshalb genau dann, wenn der Stack vorhanden ist, und das ist der Lauf
   * `--project authenticated`. Der nicht angemeldete Lauf bleibt parallel.
   */
  ...(mitSupabase ? { workers: 1 } : {}),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'on-first-retry', launchOptions },
  projects: [
    { name: 'mobile', testIgnore: HINTER_ANMELDUNG, use: { ...devices['Pixel 7'] } },
    { name: 'desktop', testIgnore: HINTER_ANMELDUNG, use: { ...devices['Desktop Chrome'] } },
    ...(mitSupabase
      ? [
          {
            name: 'authenticated',
            testMatch: HINTER_ANMELDUNG,
            // Diese Tests ändern echte Daten und stellen sie wieder her. Sie
            // dürfen sich deshalb nicht gegenseitig überholen.
            fullyParallel: false,
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
  ],
  webServer: {
    // Die Bindeadresse wird ausdruecklich gesetzt und nicht Vite ueberlassen.
    // Ohne --host bindet Vite an den Namen 'localhost'; auf Rechnern mit
    // IPv6 (unter anderem den CI-Runnern) loest der zuerst nach ::1 auf,
    // waehrend Playwright 127.0.0.1 abfragt - der Start laeuft dann in den
    // Timeout, obwohl der Server laeuft.
    command: 'pnpm dev --host 127.0.0.1',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // VITE_*-Variablen aus der Umgebung haben in Vite Vorrang vor .env-Dateien.
    // Die Anwendung spricht damit garantiert dieselbe Instanz an wie die
    // API-seitigen Nachweise - auch wenn lokal eine .env.local existiert.
    ...(mitSupabase
      ? { env: { VITE_SUPABASE_URL: supabaseUrl!, VITE_SUPABASE_ANON_KEY: supabaseAnonKey! } }
      : {}),
  },
});
