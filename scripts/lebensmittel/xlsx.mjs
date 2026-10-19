// -----------------------------------------------------------------------------
// Ein kleiner Leser für ZIP und das erste Blatt einer XLSX-Datei (ERN-004).
//
// Der Bundeslebensmittelschlüssel kommt als ZIP mit einer XLSX-Datei. Eine
// Bibliothek dafür wäre eine neue Abhängigkeit für einen Lauf im Betrieb;
// ZIP (gespeichert oder Deflate) und das Tabellen-XML von Excel reichen für
// diese eine Datei, Node bringt zlib mit. Kein Ersatz für eine allgemeine
// Bibliothek: keine Formeln, keine Datumsformate, kein ZIP64.
// -----------------------------------------------------------------------------
import { inflateRawSync } from 'node:zlib';

/**
 * Die Einträge eines ZIP-Archivs über das Zentralverzeichnis.
 *
 * @param {Buffer} zip
 * @returns {Map<string, Buffer>}
 */
export function zipEintraege(zip) {
  // Ende des Zentralverzeichnisses: Signatur 0x06054b50, höchstens 64 KB
  // Kommentar dahinter.
  let ende = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      ende = i;
      break;
    }
  }
  if (ende < 0) throw new Error('Kein ZIP-Archiv (Ende des Verzeichnisses fehlt).');
  const anzahl = zip.readUInt16LE(ende + 10);
  let pos = zip.readUInt32LE(ende + 16);
  const eintraege = new Map();
  for (let n = 0; n < anzahl; n++) {
    if (zip.readUInt32LE(pos) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt.');
    const methode = zip.readUInt16LE(pos + 10);
    const gepackt = zip.readUInt32LE(pos + 20);
    const nameLaenge = zip.readUInt16LE(pos + 28);
    const extraLaenge = zip.readUInt16LE(pos + 30);
    const kommentarLaenge = zip.readUInt16LE(pos + 32);
    const lokal = zip.readUInt32LE(pos + 42);
    const name = zip.toString('utf8', pos + 46, pos + 46 + nameLaenge);
    if (zip.readUInt32LE(lokal) !== 0x04034b50) throw new Error(`ZIP-Eintrag ${name} beschädigt.`);
    const datenAb = lokal + 30 + zip.readUInt16LE(lokal + 26) + zip.readUInt16LE(lokal + 28);
    const roh = zip.subarray(datenAb, datenAb + gepackt);
    if (methode === 0) eintraege.set(name, roh);
    else if (methode === 8) eintraege.set(name, inflateRawSync(roh));
    else throw new Error(`ZIP-Methode ${methode} in ${name} wird nicht gelesen.`);
    pos += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }
  return eintraege;
}

const ENTITAETEN = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

/** XML-Text ohne Entitäten. */
export function xmlText(roh) {
  return roh.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITAETEN.get(e);
  });
}

/** Spaltennummer ab 0 aus einer Zellreferenz wie "AB12". */
export function spalte(referenz) {
  let n = 0;
  for (const z of /^[A-Z]+/.exec(referenz)?.[0] ?? '') n = n * 26 + (z.charCodeAt(0) - 64);
  return n - 1;
}

/** Die Texte aus sharedStrings.xml; ein <si> kann aus mehreren <t> bestehen. */
function geteilteTexte(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
    [...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join(''),
  );
}

/**
 * Das erste Blatt einer XLSX-Datei als Zeilen; Zellen sind Text, Zahl oder
 * null.
 *
 * @param {Buffer} xlsx
 * @returns {(string | number | null)[][]}
 */
export function erstesBlatt(xlsx) {
  const dateien = zipEintraege(xlsx);
  const texte = geteilteTexte(dateien.get('xl/sharedStrings.xml')?.toString('utf8'));
  const blattName = [...dateien.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort()[0];
  if (!blattName) throw new Error('Keine Tabelle in der XLSX-Datei.');
  const xml = dateien.get(blattName).toString('utf8');
  const zeilen = [];
  for (const zeile of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const werte = [];
    for (const zelle of zeile[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attribute = zelle[1];
      const inhalt = zelle[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attribute)?.[1];
      const typ = /\bt="(\w+)"/.exec(attribute)?.[1];
      const index = ref ? spalte(ref) : werte.length;
      const v = /<v>([\s\S]*?)<\/v>/.exec(inhalt)?.[1];
      let wert = null;
      if (typ === 's' && v !== undefined) wert = texte[Number(v)] ?? null;
      else if (typ === 'inlineStr')
        wert = [...inhalt.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => xmlText(t[1]))
          .join('');
      else if ((typ === 'str' || typ === 'e') && v !== undefined) wert = xmlText(v);
      else if (typ === 'b' && v !== undefined) wert = v === '1';
      else if (v !== undefined) wert = Number(v);
      // Excel schreibt die Zellen einer Zeile in Spaltenfolge; Lücken bleiben null.
      while (werte.length < index) werte.push(null);
      werte.push(wert);
    }
    zeilen.push(werte);
  }
  return zeilen;
}
