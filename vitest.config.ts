import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          // Komponenten brauchen das DOM von jsdom.
          include: ['src/**/*.test.tsx'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'logik',
          globals: true,
          // Reine Logik laeuft ohne jsdom: Dessen Aufbau kostete je Datei
          // mehr als die meisten Tests selbst (ANN-571). Braucht eine Datei
          // doch `window` oder `document`, sagt sie es in der ersten Zeile:
          // `// @vitest-environment jsdom`.
          environment: 'node',
          setupFiles: ['./src/test-setup-logik.ts'],
          // Die Edge Functions sind dabei: Ihre Prueffragen (Fehlerklassen,
          // Sitzungspruefung, Feldliste der Anfrage) beantwortet ein
          // Unit-Test, und `supabase start` laeuft in der Cloud-Umgebung
          // nicht (MAP-003a).
          // Dazu die Regeln des Dokumentationsgates (G19): reine Funktionen, die
          // `pnpm docs:check` benutzt und ein Test festhaelt.
          include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts', 'scripts/**/*.test.mjs'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          globals: true,
          environment: 'node',
          include: ['supabase/tests/**/*.test.ts'],
          // Migrationen und RLS laufen gegen EINE echte Datenbank. Alle
          // Dateien muessen deshalb nacheinander im selben Prozess laufen,
          // sonst setzen sie sich gegenseitig die Datenbank zurueck.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
