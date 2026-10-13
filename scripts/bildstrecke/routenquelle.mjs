// -----------------------------------------------------------------------------
// Liest die Routenmuster aus dem Quelltext einer Routentabelle (JSX), ohne sie
// auszufuehren - fuer den Abgleich mit scripts/bildstrecke/routen.mjs.
//
// Bewusst klein: Es versteht genau die Formen, die in
// src/routes/AuthenticatedRoutes.tsx und src/features/platform/PlattformApp.tsx
// vorkommen - `path="..."`, `path={`${KONSTANTE}/...`}`, `path={variable}`
// (aus einer Liste), `index` und verschachtelte <Route>...</Route>. Eine
// neue Form, die es nicht kennt, faellt als Fehler auf statt still zu fehlen.
// -----------------------------------------------------------------------------

/**
 * Das Ende eines `<Route`-Tags ab `start`: das erste `>` ausserhalb von
 * geschweiften Klammern (Attribute wie `element={<Seite />}` enthalten selbst
 * spitze Klammern).
 */
function tagEnde(quelle, start) {
  let tiefe = 0;
  for (let i = start; i < quelle.length; i += 1) {
    const zeichen = quelle.charAt(i);
    if (zeichen === '{') tiefe += 1;
    else if (zeichen === '}') tiefe -= 1;
    else if (zeichen === '>' && tiefe === 0) return i;
  }
  throw new Error(`Unvollstaendiges <Route>-Tag ab Zeichen ${start}`);
}

function pfadAusTag(tag, konstanten, variablen) {
  const index = /\sindex(\s|\/|$)/.test(tag);
  const text = /\spath="([^"]*)"/.exec(tag);
  if (text) return { pfade: [text[1]], index };
  const vorlage = /\spath=\{`([^`]*)`\}/.exec(tag);
  if (vorlage) {
    const ersetzt = vorlage[1].replace(/\$\{(\w+)\}/g, (_, name) => {
      if (!konstanten.has(name)) throw new Error(`Unbekannte Konstante im Pfad: ${name}`);
      return konstanten.get(name);
    });
    return { pfade: [ersetzt], index };
  }
  const ausdruck = /\spath=\{(\w+)\}/.exec(tag);
  if (ausdruck) {
    const name = ausdruck[1];
    if (konstanten.has(name)) return { pfade: [konstanten.get(name)], index };
    if (variablen.has(name)) return { pfade: [...variablen.get(name)], index };
    throw new Error(`Unbekannter Ausdruck im Pfad: ${name}`);
  }
  if (/\spath=/.test(tag)) throw new Error(`Unbekannte Pfadform: ${tag.slice(0, 120)}`);
  return { pfade: [], index };
}

function verbinden(eltern, pfad) {
  if (pfad.startsWith('/') || pfad === '*') return pfad;
  const basis = eltern.at(-1) ?? '';
  return `${basis.replace(/\/$/, '')}/${pfad}`;
}

/**
 * Alle Routenmuster einer Datei, verschachtelte mit dem Pfad des Rahmens
 * davor, in der Reihenfolge des Quelltexts und ohne Doppelte.
 *
 * @param {string} quelle Quelltext der Datei
 * @param {{ konstanten?: Map<string, string>, variablen?: Map<string, string[]> }} [optionen]
 *   `konstanten`: Werte fuer `${NAME}` und `{NAME}` im Pfad; `variablen`:
 *   die Werte einer Laufvariable wie `alt` in `ALTE_AKTENBEREICHE.map((alt) => ...)`.
 */
export function routenmusterAusQuelle(quelle, optionen = {}) {
  const konstanten = optionen.konstanten ?? new Map();
  const variablen = optionen.variablen ?? new Map();
  const ergebnis = [];
  const eltern = [];
  const muster = /<Route\b|<\/Route>/g;
  let treffer;
  while ((treffer = muster.exec(quelle)) !== null) {
    if (treffer[0] === '</Route>') {
      eltern.pop();
      continue;
    }
    const ende = tagEnde(quelle, treffer.index);
    const tag = quelle.slice(treffer.index, ende + 1);
    muster.lastIndex = ende + 1;
    const selbstschliessend = quelle.charAt(ende - 1) === '/';
    const { pfade, index } = pfadAusTag(tag, konstanten, variablen);
    if (index) {
      const rahmen = eltern.at(-1);
      if (rahmen === undefined) throw new Error('index-Route ohne Rahmen');
      ergebnis.push(rahmen);
    }
    for (const pfad of pfade) ergebnis.push(verbinden(eltern, pfad));
    if (!selbstschliessend) {
      if (pfade.length !== 1) throw new Error(`Rahmenroute ohne eindeutigen Pfad: ${tag}`);
      eltern.push(verbinden(eltern, pfade[0]));
    }
  }
  if (eltern.length !== 0) throw new Error('Nicht geschlossene <Route>-Rahmen');
  return [...new Set(ergebnis)];
}

/**
 * Ein Muster mit `:parameter` als regulaerer Ausdruck fuer einen Pfad (ohne
 * Suchteil und Anker).
 */
export function musterAlsAusdruck(routenmuster) {
  const teile = routenmuster
    .split('/')
    .map((teil) =>
      teil.startsWith(':') ? '[^/]+' : teil.replace(/[.*+?^${}()|[\]\\]/g, (z) => `\\${z}`),
    );
  // eslint-disable-next-line security/detect-non-literal-regexp -- Muster aus der eigenen Routentabelle, maskiert
  return new RegExp(`^${teile.join('/')}$`);
}
