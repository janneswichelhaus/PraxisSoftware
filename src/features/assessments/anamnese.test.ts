import { describe, expect, it } from 'vitest';
import { bibliothek } from './bibliothek';

/**
 * Der Anamnesebogen V8 (FRB-EPIC-002, `PROJECT_PRINCIPLES.md` §7).
 *
 * Der Zähltest steht gegen das Inventar („39 nummerierte Fragen"), nicht gegen
 * die Datei: Eine vergessene Frage fällt hier auf, eine erfundene auch. Der
 * Wortlaut selbst wird für jede Definition mit Vorlage in
 * `definitionen.test.ts` gegen den Extrakt gehalten.
 */

const anamnese = bibliothek.scores.find((score) => score.meta.id === 'anamnese_v8');

describe('Anamnesebogen V8', () => {
  it('liegt in der Bibliothek, aktiv und mit Vorlage', () => {
    expect(anamnese).toBeDefined();
    expect(anamnese?.meta.aktiv).toBe(true);
    expect(anamnese?.meta.quelle.datei).toBe('Anamnesebogen_Version-8_DIGOTOR_07-2026.pdf');
  });

  it('hat genau die 39 nummerierten Fragen der Vorlage, lückenlos', () => {
    const nummern = [...new Set(anamnese?.items.flatMap((item) => item.nummer ?? []))];
    expect(nummern).toEqual(Array.from({ length: 39 }, (_, index) => index + 1));
  });

  it('rechnet nichts und bewertet nichts (Inventar: „Kein Scoring")', () => {
    expect(anamnese?.scoring.gesamt).toBeNull();
    expect(anamnese?.scoring.subskalen).toEqual([]);
    expect(anamnese?.scoring.richtung).toBe('nicht_anwendbar');
    expect(anamnese?.items.every((item) => !item.gewertet)).toBe(true);
    expect(
      anamnese?.items.flatMap((item) => item.optionen ?? []).every((o) => o.wert === undefined),
    ).toBe(true);
  });

  it('fragt nach dem Ort der Beschwerden mit dem Körperschema', () => {
    const frage1 = anamnese?.items.find((item) => item.nummer === 1);
    expect(frage1?.typ).toBe('koerperschema');
  });

  it('führt „nein" in jeder Mehrfachauswahl mit Verneinung als exklusive Option', () => {
    const mitNein = anamnese?.items.filter(
      (item) => item.typ === 'mehrfachauswahl' && item.optionen?.some((o) => o.label === 'nein'),
    );
    expect(mitNein?.map((item) => item.nummer)).toEqual([4, 7, 23, 24, 25, 27, 28, 29, 30]);
    for (const item of mitNein ?? []) {
      expect(item.optionen?.find((o) => o.label === 'nein')?.exklusiv).toBe(true);
    }
  });

  it('erhebt Name, Alter und Unterschrift nicht noch einmal', () => {
    // Name und Alter stehen in der Akte, die Unterschrift gehört aufs Papier.
    // Eine zweite Fassung im Bogen wäre eine zweite Quelle, die abweichen kann.
    const texte = anamnese?.items.map((item) => item.text) ?? [];
    expect(texte).not.toContain('Name:');
    expect(texte).not.toContain('Alter:');
    expect(texte).not.toContain('Unterschrift:');
  });
});
