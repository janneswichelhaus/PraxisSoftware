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
          include: ['src/**/*.test.{ts,tsx}'],
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
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
