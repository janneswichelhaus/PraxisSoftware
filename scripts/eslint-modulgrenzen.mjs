/**
 * ESLint-Regeln der Modulgrenzen: eine fremde Domäne nur über ihre index.ts (ANN-755), ein Modul mit
 * index.ts nur darüber (ANN-748), außerhalb der Seiten nur tiefere Domänen (ANN-754).
 */
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { importziel } from './aufraeumen.mjs';
import { DOMAENEN, EBENEN, ortIn } from './domaenen.mjs';

const WURZEL = join(import.meta.dirname, '..');
const mitIndex = new Map();

function hatIndex({ domaene, modul }) {
  // An der Wurzel einer Domäne ist die index.ts deren Schnittstelle (nur-ueber-schnittstelle).
  if (modul === domaene) return false;
  const ordner = [domaene, modul];
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

/** Seiten stehen in keiner Schnittstelle; wer eine einbindet, importiert sie direkt. */
const istSeitenziel = (rest) => /(Page|Seite|Layout)$/.test(rest);

/**
 * Was ein Import an der Schnittstelle einer Domäne vorbei holt: `{ domaene }` aus einer fremden,
 * `{ eigene }` über die eigene index.ts, die die Domäne im Kreis zu sich selbst führte; sonst `null`.
 */
export function anDerSchnittstelleVorbei(datei, spezifizierer) {
  const ziel = importziel(datei, spezifizierer);
  if (!ziel) return null;
  const eigene = /^src\/features\/[^/]+\//.test(datei) ? ortIn(datei).domaene : null;
  const schnittstelle = ziel.modul === ziel.domaene && ['', 'index'].includes(ziel.rest);
  if (ziel.domaene === eigene) return schnittstelle ? { eigene } : null;
  return schnittstelle || istSeitenziel(ziel.rest) ? null : { domaene: ziel.domaene };
}

const nurUeberSchnittstelle = {
  meta: {
    type: 'problem',
    docs: { description: 'Eine fremde Domäne nur über ihre index.ts importieren.' },
    schema: [],
    messages: {
      vorbei:
        '{{domaene}} ist eine fremde Domäne: aus @/features/{{domaene}} importieren, nicht aus {{pfad}} (ANN-755).',
      eigene:
        'Innerhalb von {{eigene}} direkt importieren, nicht über @/features/{{eigene}}: Die index.ts führte im Kreis zurück.',
    },
  },
  create(context) {
    const datei = relative(WURZEL, context.filename).split(sep).join('/');
    const pruefe = (quelle) => {
      if (quelle?.type !== 'Literal' || typeof quelle.value !== 'string') return;
      const verstoss = anDerSchnittstelleVorbei(datei, quelle.value);
      if (verstoss?.eigene) context.report({ node: quelle, messageId: 'eigene', data: verstoss });
      else if (verstoss)
        context.report({
          node: quelle,
          messageId: 'vorbei',
          data: { ...verstoss, pfad: quelle.value },
        });
    };
    return {
      ImportDeclaration: (knoten) => pruefe(knoten.source),
      ExportNamedDeclaration: (knoten) => pruefe(knoten.source),
      ExportAllDeclaration: (knoten) => pruefe(knoten.source),
      ImportExpression: (knoten) => pruefe(knoten.source),
    };
  },
};

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

export default {
  rules: {
    'nur-ueber-index': nurUeberIndex,
    'nach-unten': nachUnten,
    'nur-ueber-schnittstelle': nurUeberSchnittstelle,
  },
};
