import { describe, expect, it } from 'vitest';
import {
  eigeneFiltern,
  energieFuer,
  feldtext,
  leereLebensmittelWerte,
  lebensmittelfehler,
  lebensmittelPruefen,
  lebensmittelWerteAus,
  portionText,
  suchschluessel,
  trefferMeta,
  type Lebensmittel,
} from './lebensmittel';

const APFEL: Lebensmittel = {
  kind: 'catalog',
  id: 'a',
  source: 'bls',
  name: 'Apfel roh',
  brand: null,
  base_unit: 'g',
  per_100: {
    energy_kcal: 54,
    protein_g: 0.3,
    fat_g: 0.1,
    carbohydrate_g: 12,
    sugar_g: 10.3,
    fibre_g: 2,
    saturated_fat_g: null,
    salt_g: 0,
  },
  portions: [{ label: '1 Stück (mittel)', amount: 150 }],
};

describe('Lebensmittel: Suchschlüssel und Filter (ERN-EPIC-002)', () => {
  it('normalisiert wie app.food_search_key', () => {
    expect(suchschluessel('Käse')).toBe('kase');
    expect(suchschluessel('Kaese')).toBe('kase');
    expect(suchschluessel('Hühnerei, gekocht')).toBe('huhnerei gekocht');
    expect(suchschluessel('Weißbrot')).toBe('weissbrot');
    expect(suchschluessel('  Crème fraîche 30 %  ')).toBe('creme fraiche 30');
  });

  it('filtert eigene Lebensmittel nach jedem Wort in Name und Marke', () => {
    const eigene = [
      { ...APFEL, id: '1', name: 'Omas Dinkelbrot', brand: null },
      { ...APFEL, id: '2', name: 'Müsliriegel', brand: 'Kornhaus' },
    ];
    expect(eigeneFiltern(eigene, 'dinkel').map((f) => f.id)).toEqual(['1']);
    expect(eigeneFiltern(eigene, 'Muesli korn').map((f) => f.id)).toEqual(['2']);
    expect(eigeneFiltern(eigene, 'brot riegel')).toEqual([]);
  });
});

describe('Lebensmittel: Anzeige (ERN-EPIC-002)', () => {
  it('Nebenzeile, Portion und Energie einer Menge', () => {
    expect(trefferMeta(APFEL)).toBe('54 kcal je 100 g · BLS');
    expect(trefferMeta({ ...APFEL, source: 'off', brand: 'Nordkorn', base_unit: 'ml' })).toBe(
      'Nordkorn · 54 kcal je 100 ml · Open Food Facts',
    );
    expect(portionText(APFEL.portions[0]!, 'g')).toBe('1 Stück (mittel) · 150 g');
    expect(portionText({ label: '1 Glas', amount: 12.5 }, 'ml')).toBe('1 Glas · 12,5 ml');
    expect(energieFuer(APFEL, 150)).toBe(81);
  });

  it('Feldtext ohne Nullen am Ende, ganze Zahlen bleiben ganz', () => {
    expect(feldtext(50)).toBe('50');
    expect(feldtext(0.3)).toBe('0,3');
    expect(feldtext(12.25)).toBe('12,25');
    expect(feldtext(null)).toBe('');
  });
});

describe('Lebensmittel: Eingabe prüfen (ADR-027 Punkt 9)', () => {
  const gut = {
    ...leereLebensmittelWerte(),
    name: ' Omas Dinkelbrot ',
    energy_kcal: '240',
    protein_g: '9',
    fat_g: '2,5',
    carbohydrate_g: '44',
  };

  it('nimmt die vier Pflichtwerte mit Komma, das Übrige leer', () => {
    const ergebnis = lebensmittelPruefen(gut);
    expect(ergebnis).toEqual({
      angaben: {
        name: 'Omas Dinkelbrot',
        brand: null,
        base_unit: 'g',
        energy_kcal: 240,
        protein_g: 9,
        fat_g: 2.5,
        carbohydrate_g: 44,
        sugar_g: null,
        fibre_g: null,
        saturated_fat_g: null,
        salt_g: null,
        portions: [],
      },
    });
  });

  it('meldet fehlende und falsche Werte je Feld', () => {
    const ergebnis = lebensmittelPruefen({
      ...gut,
      name: '',
      fat_g: '',
      salt_g: 'viel',
      energy_kcal: '1200',
    });
    expect('fehler' in ergebnis && Object.keys(ergebnis.fehler).sort()).toEqual([
      'energy_kcal',
      'fat_g',
      'name',
      'salt_g',
    ]);
  });

  it('Makros über 100 g und halbe Portionen sind Fehler', () => {
    const zuviel = lebensmittelPruefen({ ...gut, protein_g: '60', fat_g: '30' });
    expect('fehler' in zuviel && zuviel.fehler.carbohydrate_g).toMatch(/mehr als 100 g/);
    const halb = lebensmittelPruefen({ ...gut, portion_label: '1 Scheibe' });
    expect('fehler' in halb && Object.keys(halb.fehler)).toEqual(['portion_amount']);
    const ganz = lebensmittelPruefen({ ...gut, portion_label: '1 Scheibe', portion_amount: '45' });
    expect('angaben' in ganz && ganz.angaben.portions).toEqual([
      { label: '1 Scheibe', amount: 45 },
    ]);
  });

  it('Werte eines Lebensmittels zurück ins Formular und wieder heraus', () => {
    const werte = lebensmittelWerteAus({ ...APFEL, kind: 'practice', source: 'practice' });
    expect(werte).toMatchObject({ name: 'Apfel roh', protein_g: '0,3', portion_amount: '150' });
    const ergebnis = lebensmittelPruefen(werte);
    expect('angaben' in ergebnis && ergebnis.angaben.energy_kcal).toBe(54);
  });

  it('Fehler des Servers als Satz', () => {
    expect(lebensmittelfehler('food changed meanwhile')).toMatch(/inzwischen geändert/);
    expect(lebensmittelfehler('too many own foods')).toMatch(/500/);
    expect(lebensmittelfehler('nutrition consent missing')).toMatch(/darf das gerade nicht/);
    expect(lebensmittelfehler(undefined)).toMatch(/Verbindung/);
  });
});
