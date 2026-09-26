import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { hervorhebungen } from './hervorhebung';
import { Hervorhebungen } from './Hervorhebungen';
import { instrumentFuer } from './instrumente';
import { scoreDefinitionSchema } from './schema';

/**
 * Hervorhebung nach §7.1 (FRB-002c, ANN-104).
 *
 * Zwei Zusagen: Hervorgehoben wird nur, was angekreuzt ist, wörtlich — und
 * nirgends entsteht eine Aussage über die Bedeutung (ADR-006 Punkt 11 und 12).
 */
const anamnese = instrumentFuer('anamnese_v8')!;

/** Wörter, die aus einer Angabe eine Bewertung oder einen nächsten Schritt machen. */
const BEWERTUNG =
  /risiko|empfehl|warn|arzt|ärzt|abklär|gefahr|gefähr|verdacht|red flag|dringend|sofort|kontraindik|auffällig/i;

describe('Hervorhebung', () => {
  it('hebt nur angekreuzte Angaben hervor, mit der Beschriftung der Vorlage', () => {
    const treffer = hervorhebungen(anamnese, {
      symptome_allgemein: { auswahl: ['nachtschweiss', 'gewichtsverlust'] },
      schmerzart: { auswahl: ['dauerschmerzen'] },
      tumor: { auswahl: 'nein' },
    });
    expect(treffer.map((t) => [t.item.nummer, t.angaben])).toEqual([
      [25, ['Nachtschweiß', 'Gewichtsverlust']],
    ]);
  });

  it('hebt „nein" nie hervor und findet in einem leeren Bogen nichts', () => {
    expect(
      hervorhebungen(anamnese, {
        symptome_allgemein: { auswahl: ['nein'] },
        symptome_neurologisch: { auswahl: ['nein'] },
      }),
    ).toEqual([]);
    expect(hervorhebungen(anamnese, {})).toEqual([]);
  });

  it('verrechnet mehrere Treffer nicht: je Regel eine Zeile', () => {
    const treffer = hervorhebungen(anamnese, {
      tumor: { auswahl: 'ja' },
      symptome_allgemein: { auswahl: ['gewichtsverlust'] },
    });
    expect(treffer).toHaveLength(2);
    expect(Object.keys(treffer[0]!).sort()).toEqual(['angaben', 'item', 'regel']);
  });

  it('nennt zu jeder Regel eine Quelle und keine Bewertung', () => {
    expect(anamnese.hervorhebungen.length).toBeGreaterThan(0);
    for (const regel of anamnese.hervorhebungen) {
      expect(regel.quelle.length).toBeGreaterThan(10);
      expect(regel.regel).not.toMatch(BEWERTUNG);
    }
  });

  it('zeigt Angabe, Frage und Datum - und kein Wort der Bewertung', () => {
    const { container } = render(
      <Hervorhebungen
        definition={anamnese}
        antworten={{ tumor: { auswahl: 'ja' }, schmerzart: { auswahl: ['nachtschmerzen'] } }}
        datum="2026-09-20"
      />,
    );
    expect(screen.getByText('ja')).toBeInTheDocument();
    expect(
      screen.getByText('Frage 26, Angabe vom 20.09.2026:', { exact: false }),
    ).toBeInTheDocument();
    // Die Titel der Quellen sind Zitate („… Red Flags …") und bleiben, wie sie
    // veröffentlicht sind; geprüft wird alles, was die Anwendung selbst sagt.
    const eigenerText = anamnese.hervorhebungen.reduce(
      (text, regel) => text.split(regel.quelle).join(''),
      container.textContent ?? '',
    );
    expect(eigenerText).not.toMatch(BEWERTUNG);
  });

  it('sagt ohne Treffer nur, was angekreuzt ist, und nennt die offenen Regel-Fragen', () => {
    render(
      <Hervorhebungen
        definition={anamnese}
        antworten={{ tumor: { auswahl: 'nein' } }}
        datum="2026-09-20"
      />,
    );
    expect(
      screen.getByText(
        'Nach den Regeln unten ist nichts angekreuzt. Nicht beantwortet: Frage 4, 23, 24, 25, 28, 29, 30.',
      ),
    ).toBeInTheDocument();
  });

  it('weist eine Regel auf ein exklusives „nein" oder eine unbekannte Frage zurück', () => {
    const roh = JSON.parse(JSON.stringify(anamnese)) as Record<string, unknown>;
    const mitNein = {
      ...roh,
      hervorhebungen: [
        { id: 'x', item: 'schmerzart', optionen: ['nein'], regel: 'r', quelle: 'q' },
      ],
    };
    const unbekannt = {
      ...roh,
      hervorhebungen: [{ id: 'x', item: 'erfunden', optionen: ['ja'], regel: 'r', quelle: 'q' }],
    };
    expect(scoreDefinitionSchema.safeParse(mitNein).success).toBe(false);
    expect(scoreDefinitionSchema.safeParse(unbekannt).success).toBe(false);
  });
});
