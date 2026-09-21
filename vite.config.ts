import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  /**
   * MapLibre bringt seinen eigenen Worker mit und laedt ihn ueber
   * `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
   *
   * Der Abhaengigkeits-Optimierer von Vite baut die Bibliothek in `.vite/deps`
   * um und verliert dabei genau diese Datei: "The file does not exist at
   * .../maplibre-gl-worker.mjs". Der Worker entpackt die Vektorkacheln - ohne
   * ihn bliebe die Karte in `pnpm dev` leer, sobald ein Kachelschluessel
   * vorliegt. Ausgenommen laedt Vite die Bibliothek unveraendert (MAP-002).
   * Der Auslieferungsstand ist davon nicht beruehrt: `optimizeDeps` gilt nur
   * fuer die Entwicklung.
   */
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // Keine Sourcemaps im Auslieferungsstand: Sie wuerden den vollstaendigen
  // Quelltext der Anwendung mit ausliefern (PROJECT_PRINCIPLES.md 16).
  build: { sourcemap: false },
});
