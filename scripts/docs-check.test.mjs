import { describe, expect, it } from 'vitest';
import {
  aktuelleFassungen,
  prinzipienAbschnitte,
  prinzipienVersionen,
  pruefeEindeutigkeit,
  pruefeVerweise,
  vermerkZeilen,
} from './docs-check-regeln.mjs';
import {
  ANFANG,
  ENDE,
  ersetzeTabelle,
  fortschrittTabelle,
  tabelleAktuell,
} from './fortschritt-tabelle.mjs';

/**
 * Regeln des Dokumentationsgates fuer Querverweise (G19, BEF-028).
 *
 * Die Faelle unter „findet" sind die Belege aus BEF-028 in ihrer damaligen
 * Form. Die Faelle unter „laesst stehen" sind die Stellen, an denen ein zu
 * scharfes Gate die Vergangenheit falsch pruefen wuerde.
 */

const README = [
  '| ADR | Titel | Status |',
  '| --- | --- | --- |',
  '| [ADR-013](ADR-013.md) | CI | Angenommen, Fassung 2 (2026-09-13); **Fassung 3 (2026-09-15)** |',
  '| [ADR-019](ADR-019.md) | Karte | **Angenommen, Fassung 4** — Fassung 3 löst Punkt 6 ab |',
  '| [ADR-020](ADR-020.md) | Grundlage | Angenommen, Fassung 1.1 (2026-09-18) |',
  '| [ADR-012](ADR-012.md) | Backup | Angenommen |',
].join('\n');

const PRINZIPIEN = [
  '# PROJECT_PRINCIPLES.md',
  '',
  '| | |',
  '|---|---|',
  '| **Dokumentversion** | **0.15** |',
  '| Vorversion | 0.14 (2026-09-22); 0.11.2 (2026-09-17); 0.8 (2026-09-12) |',
  '',
  '## 4. Benutzerrollen',
  '### 4.8 Zugriff folgt dem Verhältnis',
  '## 8. Terminplanung',
  '### 8.1 Terminfenster',
  '## 21. Governance',
  '## Änderungsvermerke',
  '### Änderungsvermerk 0.13',
].join('\n');

const kontext = {
  fassungen: aktuelleFassungen(README),
  versionen: prinzipienVersionen(PRINZIPIEN),
  abschnitte: prinzipienAbschnitte(PRINZIPIEN),
};

const pruefe = (text) => pruefeVerweise('x.md', text, kontext);

describe('Stand aus den Quellen', () => {
  it('liest die aktuelle Fassung aus der Statusspalte des Index', () => {
    expect(Object.fromEntries(kontext.fassungen)).toEqual({
      '013': 3,
      '019': 4,
      '020': 1.1,
      '012': 1,
    });
  });

  it('kennt aktuelle, fruehere und nur im Vermerk genannte Versionen', () => {
    expect(kontext.versionen.aktuell).toBe('0.15');
    expect([...kontext.versionen.alle].sort()).toEqual(['0.11.2', '0.13', '0.14', '0.15', '0.8']);
  });

  it('kennt Haupt- und Unterabschnitte', () => {
    expect([...kontext.abschnitte]).toEqual(['4', '4.8', '8', '8.1', '21']);
  });
});

describe('findet', () => {
  it('eine aeltere Fassung als Grundlage (BEF-028, MAP-LOOPS.md)', () => {
    expect(pruefe('Grundlage sind ADR-019 Fassung 3 (angenommen 2026-09-22).')).toEqual([
      'x.md:1: nennt ADR-019 Fassung 3 als Grundlage, geltend ist Fassung 4.',
    ]);
  });

  it('dieselbe Form mit Doppelpunkt, fettem Wort und Zeilenumbruch', () => {
    expect(pruefe('**Grundlage.** ADR-019 Fassung 3, Abschnitt F.')).toHaveLength(1);
    expect(pruefe('Prüfschritte. Grundlage: ADR-019\nFassung 2, Punkt 1.')).toHaveLength(1);
  });

  it('eine aeltere Prinzipienversion als Grundlage, auch hinter einem Dateinamen mit Punkt', () => {
    expect(pruefe('Grundlage: `PROJECT_PRINCIPLES.md` 0.8 §8, ADR-013 Fassung 2 Punkt 9.')).toEqual(
      [
        'x.md:1: nennt ADR-013 Fassung 2 als Grundlage, geltend ist Fassung 3.',
        'x.md:1: nennt PROJECT_PRINCIPLES.md 0.8 als Grundlage, geltend ist 0.15.',
      ],
    );
  });

  it('eine Fassung, die es nicht gibt, auch in einem Aenderungsvermerk', () => {
    expect(pruefe('## Änderungsvermerk\n\nADR-019 Fassung 5 ergänzt.')).toEqual([
      'x.md:3: ADR-019 Fassung 5 gibt es nicht (aktuell 4).',
    ]);
    expect(pruefe('ADR-012 Fassung 2')).toEqual([
      'x.md:1: ADR-012 Fassung 2 gibt es nicht (aktuell 1).',
    ]);
  });

  it('einen ADR, der nicht im Index steht', () => {
    expect(pruefe('ADR-099 Fassung 1')).toEqual([
      'x.md:1: ADR-099 steht nicht im Index docs/adr/README.md.',
    ]);
  });

  it('eine Prinzipienversion, die es nie gab', () => {
    expect(pruefe('seit `PROJECT_PRINCIPLES.md` 0.12')).toEqual([
      'x.md:1: PROJECT_PRINCIPLES.md 0.12 gibt es nicht.',
    ]);
  });

  it('einen Abschnitt, den es nicht gibt', () => {
    expect(pruefe('siehe §8.2 und §22')).toEqual([
      'x.md:1: §8.2 ist kein Abschnitt von PROJECT_PRINCIPLES.md.',
      'x.md:1: §22 ist kein Abschnitt von PROJECT_PRINCIPLES.md.',
    ]);
  });
});

describe('laesst stehen', () => {
  it('die geltende Fassung als Grundlage', () => {
    expect(
      pruefe('Grundlage sind ADR-019 Fassung 4 und `PROJECT_PRINCIPLES.md` 0.15 §4.8.'),
    ).toEqual([]);
  });

  it('eine aeltere Fassung als Herkunft eines Punkts, ohne „Grundlage"', () => {
    expect(pruefe('ein Auslöser aus ADR-013 Fassung 2, Punkt 9 (Liste nur dort)')).toEqual([]);
  });

  it('„Grundlage" in einem frueheren Satz oder Absatz', () => {
    expect(pruefe('Grundlage ist der Vertrag. Später kam ADR-019 Fassung 3.')).toEqual([]);
    expect(pruefe('Grundlage ist der Vertrag\n\nADR-019 Fassung 3 kam später')).toEqual([]);
  });

  it('„Behandlungsgrundlage" ist nicht „Grundlage"', () => {
    expect(pruefe('die Behandlungsgrundlage aus ADR-019 Fassung 3')).toEqual([]);
  });

  it('die damalige Fassung in einem Aenderungsvermerk, bis zur naechsten gleichrangigen Ueberschrift', () => {
    const text = [
      '## Änderungsvermerk',
      '### 5.1',
      'Grundlage war ADR-019 Fassung 2 und §9.9.',
      '## Weiter',
      'Grundlage ist ADR-019 Fassung 2.',
    ].join('\n');
    expect(pruefe(text)).toEqual([
      'x.md:5: nennt ADR-019 Fassung 2 als Grundlage, geltend ist Fassung 4.',
    ]);
    expect([...vermerkZeilen(text)]).toEqual([1, 2, 3]);
  });

  it('Gesetzesparagrafen', () => {
    expect(
      pruefe(
        '§203 StGB, § 14c UStG, §14 UStG, § 22 Abs. 1 Nr. 1 lit. b BDSG, §§ 630a ff. BGB, §630f',
      ),
    ).toEqual([]);
  });

  it('eine Fassung mit Nachkommastelle bis zur aktuellen', () => {
    expect(pruefe('ADR-020 Fassung 1 und ADR-020 Fassung 1.1')).toEqual([]);
  });
});

describe('eindeutige Nummern', () => {
  it('findet eine doppelt vergebene Kennung mit beiden Fundorten (BEF-026)', () => {
    expect(
      pruefeEindeutigkeit([
        { pfad: 'a.md', text: '### BEF-026 — Mailversand\n\n### ANN-001 — Frist' },
        { pfad: 'b.md', text: 'Text\n### BEF-026 — Karte' },
      ]),
    ).toEqual(['BEF-026 ist mehrfach vergeben: a.md:1, b.md:2.']);
  });

  it('zaehlt nur Ueberschriften, die mit der Kennung beginnen', () => {
    expect(
      pruefeEindeutigkeit([
        { pfad: 'a.md', text: '### IDEA-PRX-004 — Anrufliste\nsiehe IDEA-PRX-004' },
        { pfad: 'b.md', text: '### E-20 — Rückfrage zu IDEA-PRX-004' },
      ]),
    ).toEqual([]);
  });
});

describe('Fortschrittstabelle aus fortschritt.json (Umbau U3)', () => {
  const modell = {
    bloecke: [
      {
        id: 'A',
        posten: [
          { id: 'a', name: 'Loop A', status: 'fertig', fertig_am: '2026-09-01', nachweis: 'PR #1' },
          { id: 'b', name: 'Loop B', status: 'offen' },
          { id: 'c', name: 'Pipe | im Namen', status: 'gesichtet', gesichtet_am: '2026-09-02' },
        ],
      },
    ],
  };
  const roadmap = (tabelle) => `# Roadmap\n\n${ANFANG}\n${tabelle}\n${ENDE}\n\nRest\n`;

  it('nennt jeden Posten, der nicht offen ist, und maskiert senkrechte Striche', () => {
    const tabelle = fortschrittTabelle(modell);
    expect(tabelle).toContain('| A | Loop A | fertig | 2026-09-01 | PR #1 | — | — |');
    expect(tabelle).not.toContain('Loop B');
    expect(tabelle).toContain('Pipe \\| im Namen');
  });

  it('erkennt eine aktuelle Tabelle und meldet jede Abweichung', () => {
    const aktuell = roadmap(fortschrittTabelle(modell));
    expect(tabelleAktuell(aktuell, modell)).toBe(true);
    expect(tabelleAktuell(aktuell.replace('PR #1', 'PR #2'), modell)).toBe(false);
    expect(tabelleAktuell('# Roadmap ohne Marken\n', modell)).toBe(false);
  });

  it('ersetzt nur den Bereich zwischen den Marken', () => {
    const neu = ersetzeTabelle(roadmap('alt'), 'neu');
    expect(neu).toBe(roadmap('neu'));
  });
});
