/**
 * ESLint-Regeln der Modulgrenzen: `nur-ueber-index` lässt ein Modul mit index.ts nur darüber
 * importieren (ANN-748), `nach-unten` außerhalb der Seiten nur tiefere Domänen (ANN-754).
 */
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { importziel } from './aufraeumen.mjs';
import { DOMAENEN, EBENEN, ortIn } from './domaenen.mjs';

const WURZEL = join(import.meta.dirname, '..');
const mitIndex = new Map();

function hatIndex({ domaene, modul }) {
  const ordner = modul === domaene ? [domaene] : [domaene, modul];
  const schluessel = ordner.join('/');
  if (!mitIndex.has(schluessel)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Ordner aus einem Importpfad unter src/features.
    mitIndex.set(schluessel, existsSync(join(WURZEL, 'src', 'features', ...ordner, 'index.ts')));
  }
  return mitIndex.get(schluessel);
}

/** Das Modul, in das `spezifizierer` an seiner index.ts vorbei greift, sonst `null`. */
export function tieferImport(datei, spezifizierer, mitSchnittstelle = hatIndex) {
  const ziel = importziel(datei, spezifizierer);
  const eigenes = /^src\/features\/[^/]+\//.test(datei) ? ortIn(datei).modul : null;
  if (!ziel || ziel.modul === eigenes || ziel.rest === '' || ziel.rest === 'index') return null;
  return mitSchnittstelle(ziel) ? ziel.modul : null;
}

/** Seiten setzen zusammen und dürfen jede Domäne importieren. */
export const istSeite = (datei) => /(Page|Seite|Layout)\.tsx$/.test(datei);

/**
 * Was ein Import außerhalb der Seiten verletzt: `{ hoeher }` bei einer höheren Domäne,
 * `{ ohneDomaene }` bei einem Modul ohne Domäne, sonst `null`.
 */
export function gegenDieFolge(datei, spezifizierer) {
  const von = /^src\/features\/[^/]+\//.test(datei) ? ortIn(datei).domaene : null;
  const ziel = importziel(datei, spezifizierer);
  if (!von || !ziel || ziel.domaene === von || istSeite(datei)) return null;
  for (const domaene of [von, ziel.domaene]) {
    if (!Object.hasOwn(DOMAENEN, domaene)) return { ohneDomaene: domaene };
  }
  return EBENEN.indexOf(ziel.domaene) > EBENEN.indexOf(von) ? { hoeher: ziel.domaene, von } : null;
}

const nachUnten = {
  meta: {
    type: 'problem',
    docs: { description: 'Außerhalb der Seiten nur Domänen darunter importieren.' },
    schema: [],
    messages: {
      hoeher:
        '{{von}} liegt unter {{hoeher}}: nur Seiten setzen höhere Domänen zusammen (ANN-754). Den Teil über die Seite einsetzen oder das Geteilte nach unten legen.',
      ohneDomaene:
        '{{modul}} ist keine der 14 Domänen: Ordner unter einer Domäne anlegen oder in scripts/domaenen.mjs eintragen.',
    },
  },
  create(context) {
    const datei = relative(WURZEL, context.filename).split(sep).join('/');
    const pruefe = (quelle) => {
      if (quelle?.type !== 'Literal' || typeof quelle.value !== 'string') return;
      const verstoss = gegenDieFolge(datei, quelle.value);
      if (verstoss?.ohneDomaene)
        context.report({
          node: quelle,
          messageId: 'ohneDomaene',
          data: { modul: verstoss.ohneDomaene },
        });
      else if (verstoss) context.report({ node: quelle, messageId: 'hoeher', data: verstoss });
    };
    return {
      ImportDeclaration: (knoten) => pruefe(knoten.source),
      ExportNamedDeclaration: (knoten) => pruefe(knoten.source),
      ExportAllDeclaration: (knoten) => pruefe(knoten.source),
      ImportExpression: (knoten) => pruefe(knoten.source),
    };
  },
};

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

export default { rules: { 'nur-ueber-index': nurUeberIndex, 'nach-unten': nachUnten } };
