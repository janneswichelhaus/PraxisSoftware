/**
 * ESLint-Regeln der Modulgrenzen: `nur-ueber-index` lässt ein Modul mit index.ts nur darüber
 * importieren (ANN-748), `nach-unten` außerhalb der Seiten nur tiefere Domänen (ANN-754).
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

/** Die 14 Domänen der Module unter src/features (Tiefenanalyse 1a.5). */
export const DOMAENEN = {
  session: 'core',
  auth: 'core',
  preview: 'core',
  patients: 'patients',
  'treatment-bases': 'patients',
  files: 'patients',
  intake: 'patients',
  'training-offers': 'patients',
  datenschutz: 'privacy',
  retention: 'privacy',
  audit: 'privacy',
  fleet: 'fleet',
  billing: 'billing',
  statistics: 'billing',
  staff: 'workforce',
  vacation: 'workforce',
  'working-time': 'workforce',
  timeaccount: 'workforce',
  reimbursements: 'workforce',
  appointments: 'calendar',
  scheduling: 'calendar',
  'slot-search': 'calendar',
  waitlist: 'calendar',
  territories: 'calendar',
  tours: 'calendar',
  today: 'calendar',
  'day-plan': 'calendar',
  documentation: 'clinical',
  'offline-documentation': 'clinical',
  assessments: 'clinical',
  'therapy-reports': 'clinical',
  nutrition: 'nutrition',
  exercises: 'exercise',
  'exercise-plans': 'exercise',
  checkins: 'exercise',
  platform: 'portal',
  'platform-access': 'portal',
  messages: 'portal',
  training: 'training',
  'open-points': 'workplace',
  organisation: 'workplace',
  feedback: 'workplace',
  'practice-settings': 'workplace',
  account: 'workplace',
  teamchat: 'teamchat',
};

/** Die Folge von unten nach oben, mit den wenigsten Importen gegen sie (ANN-754). */
export const EBENEN = [
  'core',
  'patients',
  'privacy',
  'fleet',
  'billing',
  'workforce',
  'calendar',
  'clinical',
  'nutrition',
  'exercise',
  'portal',
  'training',
  'workplace',
  'teamchat',
];

const DOMAENE_VON = new Map(Object.entries(DOMAENEN));

/** Seiten setzen zusammen und dürfen jede Domäne importieren. */
export const istSeite = (datei) => /(Page|Seite|Layout)\.tsx$/.test(datei);

/**
 * Was ein Import außerhalb der Seiten verletzt: `{ hoeher }` bei einer höheren Domäne,
 * `{ ohneDomaene }` bei einem Modul ohne Domäne, sonst `null`.
 */
export function gegenDieFolge(datei, spezifizierer) {
  const eigenes = /^src\/features\/([^/]+)\//.exec(datei)?.[1] ?? null;
  const ziel = importziel(datei, spezifizierer);
  if (!eigenes || !ziel || ziel.modul === eigenes || istSeite(datei)) return null;
  for (const modul of [eigenes, ziel.modul]) {
    if (!DOMAENE_VON.has(modul)) return { ohneDomaene: modul };
  }
  const von = DOMAENE_VON.get(eigenes);
  const nach = DOMAENE_VON.get(ziel.modul);
  return EBENEN.indexOf(nach) > EBENEN.indexOf(von) ? { hoeher: nach, von } : null;
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
        'Das Modul {{modul}} hat keine Domäne: in DOMAENEN in scripts/eslint-modulgrenzen.mjs eintragen.',
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
