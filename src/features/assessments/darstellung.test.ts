import { describe, expect, it, vi } from 'vitest';
import { laengstesWort, offeneFragen, ohneAbsenden } from './darstellung';
import { instrumentFuer } from './instrumente';

/** Hilfen der Erhebungsseite und der Leseansicht (FRB-002b, UXR-009). */
const anamnese = instrumentFuer('anamnese_v8')!;

describe('Offene Fragen (BEF-11)', () => {
  it('nennt eine Nummer nur, wenn alle ihre Items offen sind', () => {
    const offen = offeneFragen(anamnese.items, {});
    expect(offen.slice(0, 5)).toEqual(['Beruf', 'Sport/Hobby', '1', '2', '3']);
    expect(offen).toContain('12');
    expect(offen).toContain('26');
    expect(offen.filter((eintrag) => eintrag.startsWith('26'))).toEqual(['26']);
  });

  it('nennt nach „nein" auf die Tumorfrage nur die offenen Folgefragen, nicht die 26', () => {
    const offen = offeneFragen(anamnese.items, { tumor: { auswahl: 'nein' } });
    expect(offen).not.toContain('26');
    expect(offen).toContain('26 (Welche/n?, Wann?, Letzte Nachuntersuchung?)');
  });

  it('nennt eine offene Teilfrage mit ihrem Buchstaben aus dem Bogen', () => {
    const offen = offeneFragen(anamnese.items, { verbessert_durch: { auswahl: ['liegen'] } });
    expect(offen).toContain('12b');
    expect(offen).not.toContain('12');
    expect(offen).not.toContain('12a');
  });

  it('lässt eine vollständig beantwortete Nummer weg', () => {
    const offen = offeneFragen(anamnese.items, {
      verbessert_durch: { auswahl: ['liegen'] },
      verschlechtert_durch: { auswahl: ['sitzen'] },
    });
    expect(offen.some((eintrag) => eintrag.startsWith('12'))).toBe(false);
  });
});

describe('Enter in einem einzeiligen Feld (BEF-09)', () => {
  it('hält Enter an und lässt jede andere Taste durch', () => {
    const enter = { key: 'Enter', preventDefault: vi.fn() };
    const buchstabe = { key: 'a', preventDefault: vi.fn() };
    ohneAbsenden(enter);
    ohneAbsenden(buchstabe);
    expect(enter.preventDefault).toHaveBeenCalledTimes(1);
    expect(buchstabe.preventDefault).not.toHaveBeenCalled();
  });
});

describe('Spaltenbreite der Kästchen (ANN-497)', () => {
  const optionen = (...labels: string[]) => labels.map((label) => ({ label }));

  it('misst das längste Wort, nicht die längste Option', () => {
    expect(laengstesWort(optionen('Ruheschmerzen', 'Nachtschmerzen', 'nein'))).toBe(14);
    expect(laengstesWort(optionen('Gefühl einer schmerzhaften Kälte'))).toBe(13);
  });

  it('trennt nach einem Bindestrich vor einem Buchstaben, nie vor einem Schrägstrich', () => {
    expect(laengstesWort(optionen('Hals-Nasen-Ohren'))).toBe(6);
    expect(laengstesWort(optionen('Treppe hoch-/runtergehen'))).toBe(17);
    expect(laengstesWort(optionen('Verdauungsbeschwerden/Sodbrennen'))).toBe(32);
  });

  it('kennt die Optionen der Anamnese ohne Wort über 32 Zeichen', () => {
    for (const item of anamnese.items) {
      if (item.typ !== 'mehrfachauswahl') continue;
      expect(laengstesWort(item.optionen ?? [])).toBeGreaterThan(0);
      expect(laengstesWort(item.optionen ?? [])).toBeLessThanOrEqual(32);
    }
  });
});
