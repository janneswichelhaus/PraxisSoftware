import { Readable } from 'node:stream';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { blsZeilen, zahl } from './bls.mjs';
import { portionenFuer, suchschluessel, zeilenfehler } from './gemeinsam.mjs';
import { laden, stapel } from './laden.mjs';
import { offLesen, offZeile } from './off.mjs';
import { erstesBlatt, spalte, zipEintraege } from './xlsx.mjs';

/** Ein ZIP mit Deflate - so, wie Excel es schreibt. */
function zip(dateien) {
  const lokal = [];
  const zentral = [];
  let versatz = 0;
  for (const [name, inhalt] of Object.entries(dateien)) {
    const roh = Buffer.from(inhalt, 'utf8');
    const gepackt = deflateRawSync(roh);
    const n = Buffer.from(name, 'utf8');
    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(8, 8);
    kopf.writeUInt32LE(gepackt.length, 18);
    kopf.writeUInt32LE(roh.length, 22);
    kopf.writeUInt16LE(n.length, 26);
    const eintrag = Buffer.alloc(46);
    eintrag.writeUInt32LE(0x02014b50, 0);
    eintrag.writeUInt16LE(8, 10);
    eintrag.writeUInt32LE(gepackt.length, 20);
    eintrag.writeUInt32LE(roh.length, 24);
    eintrag.writeUInt16LE(n.length, 28);
    eintrag.writeUInt32LE(versatz, 42);
    lokal.push(kopf, n, gepackt);
    zentral.push(eintrag, n);
    versatz += kopf.length + n.length + gepackt.length;
  }
  const verzeichnis = Buffer.concat(zentral);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(Object.keys(dateien).length, 8);
  ende.writeUInt16LE(Object.keys(dateien).length, 10);
  ende.writeUInt32LE(verzeichnis.length, 12);
  ende.writeUInt32LE(versatz, 16);
  return Buffer.concat([...lokal, verzeichnis, ende]);
}

const SPALTEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Ein Blatt wie BLS_4_0_Daten_2025_DE.xlsx, Texte über sharedStrings. */
function blsXlsx(kopf, zeilen) {
  const texte = [];
  const zelle = (wert, ref) => {
    if (typeof wert === 'number') return `<c r="${ref}"><v>${wert}</v></c>`;
    texte.push(wert);
    return `<c r="${ref}" t="s"><v>${texte.length - 1}</v></c>`;
  };
  const xmlZeilen = [kopf, ...zeilen]
    .map(
      (z, i) =>
        `<row r="${i + 1}">${z.map((w, j) => (w === null ? '' : zelle(w, `${SPALTEN.charAt(j)}${i + 1}`))).join('')}</row>`,
    )
    .join('');
  const geteilt = texte
    .map((t) => `<si><t>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`)
    .join('');
  return zip({
    'xl/workbook.xml': '<workbook/>',
    'xl/sharedStrings.xml': `<sst>${geteilt}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${xmlZeilen}</sheetData></worksheet>`,
  });
}

const KOPF = [
  'BLS Code',
  'Lebensmittelbezeichnung',
  'Food name',
  'ENERCC Energie (Kilokalorien) [kcal/100g]',
  'ENERCC Datenherkunft',
  'PROT625 Protein (Nx6,25) [g/100g]',
  'FAT Fett [g/100g]',
  'CHO Kohlenhydrate, verfügbar [g/100g]',
  'SUGAR Zucker [g/100g]',
  'FIBT Ballaststoffe [g/100g]',
  'NA Natrium [mg/100g]',
  'Hinweis',
];

describe('XLSX-Leser (ERN-004)', () => {
  it('liest Spaltenbuchstaben, ZIP mit Deflate und geteilte Texte samt Entitäten', () => {
    expect(spalte('A1')).toBe(0);
    expect(spalte('Z9')).toBe(25);
    expect(spalte('AB12')).toBe(27);
    const datei = blsXlsx(['BLS Code', 'Name'], [['A1', 'Brot & Butter <frisch>']]);
    expect([...zipEintraege(datei).keys()]).toContain('xl/worksheets/sheet1.xml');
    expect(erstesBlatt(datei)).toEqual([
      ['BLS Code', 'Name'],
      ['A1', 'Brot & Butter <frisch>'],
    ]);
  });

  it('lässt leere Zellen als null stehen', () => {
    const datei = blsXlsx(['a', 'b', 'c'], [['x', null, 3]]);
    expect(erstesBlatt(datei)[1]).toEqual(['x', null, 3]);
  });
});

describe('BLS-Umwandler (ERN-004)', () => {
  const zeilen = [
    ['F110000', 'Apfel roh', 'Apple raw', 54, 'A', 0.3, 0.1, 12, 10.3, 2, 1, null],
    ['B100000', 'Vollkornbrot', 'Wholemeal bread', 210, 'A', 7, 1.5, 39, 'TR', '-', 440, null],
    ['X999999', 'Ohne Energie', 'No energy', '-', 'A', 1, 1, 1, 1, 1, 1, null],
    ['Q12', 'Falscher Schlüssel', 'Bad', 1, 'A', 1, 1, 1, 1, 1, 1, null],
  ];

  it('nimmt nur Wertspalten, rechnet Salz aus Natrium, Spuren als 0, "-" als unbekannt', () => {
    const {
      zeilen: ergebnis,
      uebersprungen,
      gelesen,
    } = blsZeilen(erstesBlatt(blsXlsx(KOPF, zeilen)));
    expect(gelesen).toBe(4);
    expect(uebersprungen).toEqual({ 'energy_kcal fehlt': 1, Schlüssel: 1 });
    expect(ergebnis[0]).toEqual({
      source_code: 'F110000',
      name: 'Apfel roh',
      energy_kcal: 54,
      protein_g: 0.3,
      fat_g: 0.1,
      carbohydrate_g: 12,
      sugar_g: 10.3,
      fibre_g: 2,
      saturated_fat_g: null,
      salt_g: 0.003,
      base_unit: 'g',
      portions: [{ label: '1 Stück (mittel)', amount: 150 }],
    });
    expect(ergebnis[1]).toMatchObject({ sugar_g: 0, fibre_g: null, salt_g: 1.1 });
    expect(ergebnis[1].portions).toEqual([{ label: '1 Scheibe', amount: 50 }]);
  });

  it('bricht ab, wenn eine Einheit nicht passt oder eine Pflichtspalte fehlt', () => {
    const falsch = KOPF.map((k) => k.replace('[mg/100g]', '[g/100g]'));
    expect(() => blsZeilen(erstesBlatt(blsXlsx(falsch, zeilen)))).toThrow(/Einheit von NA/);
    const ohneFett = KOPF.filter((k) => !k.startsWith('FAT'));
    expect(() => blsZeilen(erstesBlatt(blsXlsx(ohneFett, [])))).toThrow(/FAT fehlt/);
    expect(() => blsZeilen([['Code', 'Name']])).toThrow(/BLS Code/);
  });

  it('liest Zahlen aus Text mit Komma', () => {
    expect(zahl('12,5')).toBe(12.5);
    expect(zahl('<LOQ')).toBe(0);
    expect(zahl('-')).toBeNull();
    expect(zahl('n.a.')).toBeNull();
  });
});

describe('Open-Food-Facts-Umwandler (ERN-004)', () => {
  const produkt = {
    code: '4000000000017',
    product_name: 'Rolled oats',
    product_name_de: 'Haferflocken  zart',
    brands: 'Nordkorn, Handel',
    countries_tags: 'en:austria,en:germany',
    quantity: '500 g',
    serving_size: '40 g',
    serving_quantity: '40',
    'energy-kcal_100g': '372',
    proteins_100g: '13.5',
    fat_100g: '7',
    carbohydrates_100g: '58.7',
    sugars_100g: '0.7',
    fiber_100g: '10',
    'saturated-fat_100g': '1.3',
    salt_100g: '0.01',
  };

  it('übernimmt deutsche Produkte mit Name, Marke, Werten und Portion', () => {
    expect(offZeile(produkt).zeile).toEqual({
      source_code: '4000000000017',
      name: 'Haferflocken zart',
      brand: 'Nordkorn',
      energy_kcal: 372,
      protein_g: 13.5,
      fat_g: 7,
      carbohydrate_g: 58.7,
      sugar_g: 0.7,
      fibre_g: 10,
      saturated_fat_g: 1.3,
      salt_g: 0.01,
      base_unit: 'g',
      portions: [{ label: '1 Portion (40 g)', amount: 40 }],
    });
  });

  it('rechnet kJ in kcal, erkennt Getränke an der Menge, lässt Unvollständiges weg', () => {
    const saft = offZeile({
      ...produkt,
      'energy-kcal_100g': '',
      energy_100g: '192',
      quantity: '1 l',
      serving_quantity: '',
    }).zeile;
    expect(saft).toMatchObject({ energy_kcal: 45.9, base_unit: 'ml', portions: [] });
    expect(offZeile({ ...produkt, countries_tags: 'en:france' }).grund).toBe(
      'nicht in Deutschland',
    );
    expect(offZeile({ ...produkt, fat_100g: '' }).grund).toBe('fat_g fehlt');
    expect(offZeile({ ...produkt, code: '123' }).grund).toBe('Barcode');
    expect(offZeile({ ...produkt, proteins_100g: '80', fat_100g: '30' }).grund).toBe(
      'Summe der Makros',
    );
  });

  it('liest die CSV zeilenweise und nimmt jeden Barcode einmal', async () => {
    const kopf = Object.keys(produkt);
    const zeile = Object.values(produkt).join('\t');
    const csv = [kopf.join('\t'), zeile, zeile, zeile.replace('en:germany', 'en:italy')].join('\n');
    const genommen = [];
    const bericht = await offLesen(Readable.from([csv]), (z) => genommen.push(z));
    expect(genommen).toHaveLength(1);
    expect(bericht).toEqual({
      gelesen: 3,
      uebernommen: 1,
      uebersprungen: { doppelt: 1, 'nicht in Deutschland': 1 },
    });
  });
});

describe('Gemeinsames (ERN-004)', () => {
  it('der Suchschlüssel gleicht app.food_search_key (food-catalog.test.ts)', () => {
    expect(suchschluessel('Käse')).toBe('kase');
    expect(suchschluessel('Kaese')).toBe('kase');
    expect(suchschluessel('Hühnerei, gekocht')).toBe('huhnerei gekocht');
    expect(suchschluessel('Weißbrot')).toBe('weissbrot');
    expect(suchschluessel('  Crème fraîche 30 %  ')).toBe('creme fraiche 30');
  });

  it('Portionen aus dem Startinhalt, Brot und Brötchen getrennt', () => {
    expect(portionenFuer('Vollkornbrot')).toEqual([{ label: '1 Scheibe', amount: 50 }]);
    expect(portionenFuer('Vollkornbrötchen')).toEqual([{ label: '1 Stück', amount: 60 }]);
    expect(portionenFuer('Apfelsaft')).toEqual([{ label: '1 Glas', amount: 200 }]);
    expect(portionenFuer('Rapsöl')[0]).toEqual({ label: '1 Esslöffel', amount: 10 });
    expect(portionenFuer('Seelachs gedünstet')).toEqual([]);
  });

  it('die Prüfung spiegelt die Constraints des Katalogs', () => {
    const gut = {
      source_code: 'A000001',
      name: 'X',
      energy_kcal: 1,
      protein_g: 1,
      fat_g: 1,
      carbohydrate_g: 1,
    };
    expect(zeilenfehler(gut, 'bls')).toBeNull();
    expect(zeilenfehler({ ...gut, brand: 'M' }, 'bls')).toBe('Marke');
    expect(zeilenfehler({ ...gut, energy_kcal: 951 }, 'bls')).toBe('Energie');
    expect(zeilenfehler({ ...gut, salt_g: 101 }, 'bls')).toBe('salt_g');
  });
});

describe('Laden (ERN-004)', () => {
  it('teilt in Stapel und überspringt Leerzeilen', async () => {
    const zeilen = Readable.from(['{"a":1}', '', '{"a":2}', '{"a":3}']);
    const ergebnis = [];
    for await (const s of stapel(zeilen, 2)) ergebnis.push(s);
    expect(ergebnis).toEqual([[{ a: 1 }, { a: 2 }], [{ a: 3 }]]);
  });

  it('lädt in einer Transaktion und rollt bei einem Fehler zurück', async () => {
    const aufrufe = [];
    const client = (scheitert) => ({
      query: async (sql) => {
        aufrufe.push(sql.split(' ')[0] === 'select' ? sql.split('(')[0] : sql);
        if (scheitert && sql.includes('batch')) throw new Error('kaputt');
        return { rows: [{ n: 2 }] };
      },
    });
    async function* zwei() {
      yield [{}, {}];
    }
    expect(await laden(client(false), 'bls', '4.0', zwei())).toEqual({
      geladen: 2,
      zurueckgezogen: 2,
    });
    expect(aufrufe).toEqual([
      'begin',
      'select app.import_food_catalog_batch',
      'select app.finish_food_catalog_import',
      'commit',
    ]);
    aufrufe.length = 0;
    await expect(laden(client(true), 'bls', '4.0', zwei())).rejects.toThrow('kaputt');
    expect(aufrufe.at(-1)).toBe('rollback');
  });
});
