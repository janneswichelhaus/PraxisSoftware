import { describe, expect, it } from 'vitest';
import { antwortenSchema, antwortText } from './antworten';
import { instrumentFuer } from './instrumente';

/**
 * Die Antworten auf den Anamnesebogen gegen seine Definition (FRB-002b).
 *
 * Der Server prüft nur die Form (ANN-105); was eine gültige Antwort auf eine
 * bestimmte Frage ist, entscheidet hier die Definition.
 */
const anamnese = instrumentFuer('anamnese_v8')!;
const pruefe = (antworten: unknown) => antwortenSchema(anamnese).safeParse(antworten).success;
const item = (id: string) => anamnese.items.find((i) => i.id === id)!;

describe('Antworten auf den Anamnesebogen', () => {
  it('nimmt einen leeren Bogen an - jede Frage darf offen bleiben', () => {
    expect(pruefe({})).toBe(true);
  });

  it('nimmt gültige Antworten jedes Typs an', () => {
    expect(
      pruefe({
        schmerzen_aktuell: { auswahl: 'ja' },
        schmerzstaerke: { wert: 7 },
        schmerzart: { auswahl: ['nachtschmerzen', 'ruheschmerzen'] },
        verbessert_durch: { auswahl: ['liegen', 'sonstiges'], freitext: 'Wärme' },
        beschwerden_seit: { text: 'seit März' },
      }),
    ).toBe(true);
  });

  it('weist eine Option ab, die es an der Frage nicht gibt', () => {
    expect(pruefe({ schmerzen_aktuell: { auswahl: 'vielleicht' } })).toBe(false);
  });

  it('weist „nein" zusammen mit einer anderen Angabe ab', () => {
    expect(pruefe({ schmerzart: { auswahl: ['nachtschmerzen', 'nein'] } })).toBe(false);
    expect(pruefe({ schmerzart: { auswahl: ['nein'] } })).toBe(true);
  });

  it('nimmt eine eigene Angabe nur zu einer Option an, die sie vorsieht', () => {
    expect(pruefe({ verbessert_durch: { auswahl: ['liegen'], freitext: 'Wärme' } })).toBe(false);
  });

  it('haelt die Skala in ihren Grenzen und ganzzahlig', () => {
    expect(pruefe({ schmerzstaerke: { wert: 11 } })).toBe(false);
    expect(pruefe({ schmerzstaerke: { wert: 2.5 } })).toBe(false);
  });

  it('weist eine Antwort auf eine unbekannte Frage und leeren Freitext ab', () => {
    expect(pruefe({ erfunden: { text: 'x' } })).toBe(false);
    expect(pruefe({ beschwerden_seit: { text: '   ' } })).toBe(false);
  });

  it('gibt die Antwort wörtlich wieder, ohne Deutung', () => {
    expect(antwortText(item('schmerzart'), { auswahl: ['nachtschmerzen'] })).toBe('Nachtschmerzen');
    expect(antwortText(item('schmerzstaerke'), { wert: 7 })).toBe('7 von 10');
    expect(
      antwortText(item('erkrankungen'), { auswahl: ['andere_erkrankung'], freitext: 'Gicht' }),
    ).toBe('andere Erkrankung? („Gicht“)');
    expect(antwortText(item('schmerzart'), undefined)).toBeNull();
  });
});
