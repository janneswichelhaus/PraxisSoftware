#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Fortschritt bis zur Eroeffnung (M5) als eine Zahl.
//
// ROADMAP.md beantwortet "was als Naechstes" und sonst nichts. Die Frage
// "wie weit sind wir insgesamt" beantwortet sie absichtlich nicht - die
// Fortschrittstabelle dort zaehlt abgehakte Loops, aber ein Loop ist nicht so
// viel wert wie eine Probewoche und eine Probewoche nicht so viel wie die
// externe Datenschutzpruefung. Dieses Skript gewichtet deshalb fuenf Bloecke
// gegeneinander und rechnet sie zu einem Prozentwert zusammen.
//
// Gerechnet wird gegen M5 (erster Behandlungstag mit der Software), nicht
// gegen "Code fertig": der Engpass ist laut ROADMAP.md nicht die
// Baukapazitaet, sondern Jannes' Zeit fuer Entscheidungen, Abnahmen und
// externe Anfragen. Deshalb stehen Software (Bloecke A und B) mit 40 Prozent
// und Betrieb, Eroeffnung und Entscheidungen mit 60 Prozent im Modell.
//
// Ein fertig gebauter, aber nicht abgenommener Loop zaehlt 0,85 - "abgenommen"
// ist er erst, wenn Jannes docs/abnahme/ durchlaufen hat (Definition of Done
// in ROADMAP.md; die Stufen heissen wie in der Fortschrittstabelle dort). Eine
// von Jannes vorlaeufig entschiedene Frage zaehlt 0,5, weil sie das Bauen
// loest, fuer M3 aber nicht zaehlt (Spur B).
//
// Die Zahlen sind eine Schaetzung mit offengelegtem Modell, keine Messung.
// Gepflegt wird docs/development/fortschritt.json - am Ende eines Loops,
// zusammen mit der Fortschrittstabelle in ROADMAP.md.
//
// Aufruf:
//   pnpm fortschritt              # Uebersicht je Block
//   pnpm fortschritt --posten     # zusaetzlich jeder einzelne Posten
//   pnpm fortschritt --json       # maschinenlesbar
// -----------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const quelle = join(wurzel, 'docs/development/fortschritt.json');

const argumente = process.argv.slice(2);
const alsJson = argumente.includes('--json');
const mitPosten = argumente.includes('--posten');

const daten = JSON.parse(await readFile(quelle, 'utf8'));
const { statuswerte } = daten;

/** Anteil eines Status, mit klarer Meldung statt stiller Null bei Tippfehlern. */
function anteilVon(status, postenId) {
  // status stammt aus der versionierten fortschritt.json; ein Fehlwert wirft
  // direkt darunter, statt still eine Null zu liefern.
  // eslint-disable-next-line security/detect-object-injection
  const eintrag = statuswerte[status];
  if (!eintrag) {
    throw new Error(
      `Posten "${postenId}": Status "${status}" kennt das Modell nicht. ` +
        `Erlaubt sind: ${Object.keys(statuswerte).join(', ')}.`,
    );
  }
  return eintrag.anteil;
}

const bloecke = daten.bloecke.map((block) => {
  const summeGewichte = block.posten.reduce((summe, posten) => summe + posten.gewicht, 0);
  if (summeGewichte === 0) {
    throw new Error(`Block ${block.id} hat kein Gewicht.`);
  }
  const erreicht = block.posten.reduce(
    (summe, posten) => summe + posten.gewicht * anteilVon(posten.status, posten.id),
    0,
  );
  const grad = erreicht / summeGewichte;
  return { ...block, grad, beitrag: grad * block.gewicht };
});

const summeBlockgewichte = bloecke.reduce((summe, block) => summe + block.gewicht, 0);
if (summeBlockgewichte !== 100) {
  throw new Error(
    `Die Blockgewichte ergeben ${summeBlockgewichte}, nicht 100. ` +
      `Ohne 100 ist das Ergebnis keine Prozentzahl.`,
  );
}

const gesamt = bloecke.reduce((summe, block) => summe + block.beitrag, 0);

if (alsJson) {
  console.log(
    JSON.stringify(
      {
        stand: daten.stand,
        ziel: daten.ziel,
        prozent: Number(gesamt.toFixed(1)),
        bloecke: bloecke.map((block) => ({
          id: block.id,
          name: block.name,
          gewicht: block.gewicht,
          grad: Number((block.grad * 100).toFixed(1)),
          beitrag: Number(block.beitrag.toFixed(1)),
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

/** Balken aus Vollblock und Schattenblock - laeuft in jedem Terminal. */
function balken(anteil, breite = 24) {
  const voll = Math.round(anteil * breite);
  return '█'.repeat(voll) + '░'.repeat(breite - voll);
}

const prozent = (wert) => `${wert.toFixed(1).padStart(5)} %`;

console.log('');
console.log(`Fortschritt bis ${daten.ziel.meilenstein} — ${daten.ziel.name}`);
console.log(`Ziel ${daten.ziel.termin} · Stand ${daten.stand}`);
console.log('');
console.log(`  ${balken(gesamt / 100, 40)}  ${prozent(gesamt)}`);
console.log('');

for (const block of bloecke) {
  console.log(
    `  ${block.id}  ${balken(block.grad)}  ${prozent(block.grad * 100)}` +
      `   ${block.name} (Gewicht ${block.gewicht})`,
  );
  if (!mitPosten) continue;
  for (const posten of block.posten) {
    const status = posten.status.padEnd(10);
    console.log(`        ${status} ${posten.name}`);
  }
  console.log('');
}

console.log('');
console.log('  Modell: docs/development/fortschritt.json · Reihenfolge: ROADMAP.md');
console.log('  Schaetzung mit offengelegtem Modell, keine Messung.');
console.log('');
