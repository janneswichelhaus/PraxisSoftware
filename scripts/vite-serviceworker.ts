/**
 * Baut den Service Worker als eigenes Skript (KOM-011, ADR-024 Punkt 1, W5).
 *
 * Nach dem Build der Anwendung: Die Liste des Gerüsts entsteht aus den
 * Dateien dieses Builds und aus `public/` (`geruestliste`), und ein zweiter,
 * kleiner Build bündelt `src/serviceworker/sw.ts` mit dieser Liste zu
 * `sw.js` - ein klassisches Skript ohne Module, damit es jeder Browser lädt.
 * Die Fassung ist eine Prüfsumme der Liste und des Inhalts von `public/`:
 * Ändert sich eine Datei, entsteht
 * ein neuer Speicher, und der alte fällt beim Übernehmen.
 *
 * Nur für `vite build`; `pnpm dev` und die E2E-Tests laufen ohne Service
 * Worker (die Registrierung prüft `import.meta.env.PROD`).
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { build, type Plugin, type ResolvedConfig } from 'vite';
import { geruestliste } from '../src/serviceworker/geruest';

export const SW_DATEI = 'sw.js';

function alleDateien(verzeichnis: string, basis = verzeichnis): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- das eigene public/, keine Eingabe.
  return readdirSync(verzeichnis, { withFileTypes: true }).flatMap((eintrag) => {
    const pfad = join(verzeichnis, eintrag.name);
    return eintrag.isDirectory() ? alleDateien(pfad, basis) : [relative(basis, pfad)];
  });
}

export function serviceWorker(): Plugin {
  let config: ResolvedConfig | null = null;
  let dateien: string[] = [];
  return {
    name: 'praxis-serviceworker',
    apply: 'build',
    configResolved(aufgeloest) {
      config = aufgeloest;
    },
    writeBundle(_optionen, buendel) {
      dateien = Object.keys(buendel);
    },
    async closeBundle() {
      if (config === null || config.build.lib || config.build.ssr) return;
      const oeffentlich = config.publicDir ? alleDateien(config.publicDir) : [];
      const liste = geruestliste(dateien, oeffentlich, SW_DATEI);
      // Die Fassung hängt an Namen und, für `public/`, am Inhalt: Dort tragen
      // die Dateien keine Prüfsumme im Namen (Zweitreview S3).
      const pruefsumme = createHash('sha256').update(liste.join('\n'));
      for (const datei of oeffentlich.sort()) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- das eigene public/, keine Eingabe.
        pruefsumme.update(readFileSync(join(config.publicDir, datei)));
      }
      const fassung = pruefsumme.digest('hex').slice(0, 12);
      await build({
        configFile: false,
        root: config.root,
        logLevel: 'warn',
        publicDir: false,
        define: {
          __GERUEST__: JSON.stringify(liste),
          __GERUEST_FASSUNG__: JSON.stringify(fassung),
        },
        build: {
          outDir: resolve(config.root, config.build.outDir),
          emptyOutDir: false,
          copyPublicDir: false,
          sourcemap: false,
          lib: {
            entry: resolve(config.root, 'src/serviceworker/sw.ts'),
            formats: ['iife'],
            name: 'praxisServiceWorker',
            fileName: () => SW_DATEI,
          },
        },
      });
    },
  };
}
