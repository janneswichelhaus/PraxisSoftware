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

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'on-first-retry', launchOptions },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
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
  },
});
