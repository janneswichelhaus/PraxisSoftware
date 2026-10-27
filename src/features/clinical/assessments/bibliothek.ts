import { ladeDefinitionen, type Bibliothek } from './definitionen';

/**
 * Sammelt die Definitionsdateien zur Bauzeit ein: Eine neue Definition ist eine Datei, und eine
 * fehlerhafte bricht den Start, nicht erst die Erhebung bei der Patientin. Die freien Instrumente
 * liegen inaktiv bereit (ANN-099); weitere kommen als reine Datenlieferungen.
 */
const rohdaten: Record<string, unknown> = import.meta.glob('./definitionen/**/*.json', {
  eager: true,
  import: 'default',
});

export const bibliothek: Bibliothek = ladeDefinitionen(rohdaten);
