/**
 * ESLint-Regel `modulgrenzen/nur-ueber-index`: Ein Modul unter src/features mit index.ts wird von
 * außen nur über diese Datei importiert (ANN-748). Module ohne index.ts prüft die Regel nicht.
 */
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { importziel } from './aufraeumen.mjs';

const WURZEL = join(import.meta.dirname, '..');
const mitIndex = new Map();

function hatIndex(modul) {
  if (!mitIndex.has(modul)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Modulname aus einem Importpfad unter src/features.
    mitIndex.set(modul, existsSync(join(WURZEL, 'src', 'features', modul, 'index.ts')));
  }
  return mitIndex.get(modul);
}

/** Das Modul, in das `spezifizierer` an seiner index.ts vorbei greift, sonst `null`. */
export function tieferImport(datei, spezifizierer, mitSchnittstelle = hatIndex) {
  const ziel = importziel(datei, spezifizierer);
  const eigenes = /^src\/features\/([^/]+)\//.exec(datei)?.[1] ?? null;
  if (!ziel || ziel.modul === eigenes || ziel.rest === '' || ziel.rest === 'index') return null;
  return mitSchnittstelle(ziel.modul) ? ziel.modul : null;
}

const nurUeberIndex = {
  meta: {
    type: 'problem',
    docs: { description: 'Module mit index.ts nur über ihre Schnittstelle importieren.' },
    schema: [],
    messages: {
      tief: '{{modul}} hat eine Schnittstelle: aus @/features/{{modul}} importieren, nicht aus {{pfad}}.',
    },
  },
  create(context) {
    const datei = relative(WURZEL, context.filename).split(sep).join('/');
    const pruefe = (quelle) => {
      if (quelle?.type !== 'Literal' || typeof quelle.value !== 'string') return;
      const modul = tieferImport(datei, quelle.value);
      if (modul)
        context.report({ node: quelle, messageId: 'tief', data: { modul, pfad: quelle.value } });
    };
    return {
      ImportDeclaration: (knoten) => pruefe(knoten.source),
      ExportNamedDeclaration: (knoten) => pruefe(knoten.source),
      ExportAllDeclaration: (knoten) => pruefe(knoten.source),
      ImportExpression: (knoten) => pruefe(knoten.source),
    };
  },
};

export default { rules: { 'nur-ueber-index': nurUeberIndex } };
