import { describe, expect, it } from 'vitest';
import {
  OBERGRENZEN,
  OFFENE_BEFUNDE,
  REGISTER_GRENZEN,
  SKILL_GRENZE_BYTES,
  aktuelleFassungen,
  prinzipienAbschnitte,
  prinzipienVersionen,
  pruefeBefundkennungen,
  pruefeEindeutigkeit,
  pruefeObergrenzen,
  pruefeRegister,
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

describe('eindeutige Nummern im Register (Regel D mit Tabellenzeilen)', () => {
  it('zaehlt im Register auch die Tabellenzeile, anderswo nicht', () => {
    const register = 'docs/decisions/ASSUMPTIONS.md';
    expect(
      pruefeEindeutigkeit(
        [
          {
            pfad: register,
            text: '### ANN-001 — Frist\n\n| ANN-001 | Frist | Technik · offen | `x` |',
          },
          { pfad: 'TIEFENANALYSE.md', text: '| ANN-001 | Datenschutz | widerspricht ADR-010 |' },
        ],
        new Set([register]),
      ),
    ).toEqual([`ANN-001 ist mehrfach vergeben: ${register}:1, ${register}:3.`]);
  });
});

describe('Befundkennungen nach dem Archiv (Regel D)', () => {
  it('laesst nur offene Kennungen als Ueberschrift zu, nicht neue und nicht erledigte', () => {
    expect(
      pruefeBefundkennungen(
        [
          {
            pfad: 'a.md',
            text: '### BEF-010 — offen\n### BEF-171 — erledigt\n### BEF-231 — neu\nsiehe BEF-999',
          },
        ],
        new Set(['BEF-010']),
      ),
    ).toEqual([
      'a.md:2: BEF-171 ist keine offene Kennung - neue Befunde tragen keine Nummer.',
      'a.md:3: BEF-231 ist keine offene Kennung - neue Befunde tragen keine Nummer.',
    ]);
  });

  it('ein Befund ohne Nummer ist kein Verstoss', () => {
    expect(
      pruefeBefundkennungen([{ pfad: 'a.md', text: '### Kommentare — lange Bloecke' }]),
    ).toEqual([]);
  });

  it('die Liste waechst nicht: hoechstens die 24 vom 2026-10-27, keine ueber BEF-226', () => {
    expect(OFFENE_BEFUNDE.size).toBeLessThanOrEqual(24);
    for (const kennung of OFFENE_BEFUNDE) expect(Number(kennung.slice(4))).toBeLessThanOrEqual(226);
  });
});

describe('Annahmenregister nach der Verdichtung (Regel F)', () => {
  const STATUS_DS =
    'Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung';
  const STATUS_PP =
    'Praxisprozess · entschieden (Jannes) · 2026-09-08 · Jannes · erledigt · Wiedervorlage: —';
  const register = (pruefpaket, fachregeln, zeilen, vorspann = '# Register\n') =>
    [
      vorspann,
      '## Prüfpaket\n',
      ...pruefpaket,
      '## Fachregeln\n',
      ...fachregeln,
      '## Übrige Einträge\n',
      '| Kennung | Titel | Kategorie · Status | Anker |',
      '| --- | --- | --- | --- |',
      ...zeilen,
      '',
    ].join('\n');
  const eintrag = (kennung, status, absatz = '**Annahme.** Kurz.') =>
    `### ${kennung} — Titel\n\n${status}\\\n${absatz}\n`;
  const pruefe = (text) => pruefeRegister('r.md', text);

  it('laesst ein Register im Zielformat durch und liefert alle Kennungen', () => {
    const text = register(
      [eintrag('ANN-001', STATUS_DS)],
      [eintrag('ANN-002', STATUS_PP, '**Regel.** Kurz.')],
      ['| ANN-003 | Titel | Datenschutz · verworfen (→ ANN-001) | `app.x` |'],
    );
    expect(pruefe(text)).toEqual({ verstoesse: [], kennungen: ['ANN-001', 'ANN-002', 'ANN-003'] });
  });

  it('verlangt den Zusatz Prüfpaket genau bei Datenschutz oder Recht, die nicht verworfen sind', () => {
    const text = register(
      [eintrag('ANN-001', STATUS_DS.replace('Prüfpaket', 'erledigt'))],
      [eintrag('ANN-002', STATUS_PP.replace('erledigt', 'Prüfpaket'))],
      ['| ANN-003 | Titel | Recht · offen | `app.x` |'],
    );
    expect(pruefe(text).verstoesse).toEqual([
      'r.md:7: ANN-001: Zusatz „erledigt“, erwartet „Prüfpaket“.',
      'r.md:14: ANN-002: Zusatz „Prüfpaket“, erwartet „erledigt“.',
      'r.md:21: ANN-003 ist Recht und nicht verworfen: gehört ins Prüfpaket.',
    ]);
  });

  it('meldet einen Eintrag im falschen Abschnitt', () => {
    const text = register([], [eintrag('ANN-001', STATUS_DS)], []);
    expect(pruefe(text).verstoesse).toEqual(['r.md:7: ANN-001 gehört ins Prüfpaket.']);
  });

  it('kennt nur die Kategorien und Status des Lebenszyklus', () => {
    const text = register(
      [],
      [
        eintrag(
          'ANN-001',
          STATUS_PP.replace(
            'Praxisprozess · entschieden (Jannes)',
            'Oberfläche · entschieden (Claude)',
          ),
        ),
      ],
      [],
    );
    expect(pruefe(text).verstoesse).toEqual([
      'r.md:9: ANN-001: Kategorie „Oberfläche“ gibt es nicht.',
      'r.md:9: ANN-001: Status „entschieden (Claude)“ gibt es nicht.',
    ]);
  });

  it('verlangt sechs Felder: ein Mittelpunkt in der Instanz bricht die Statuszeile', () => {
    const text = register(
      [],
      [eintrag('ANN-001', STATUS_PP.replace('Jannes · erledigt', 'Jannes · Leinwand · erledigt'))],
      [],
    );
    expect(pruefe(text).verstoesse).toEqual([
      'r.md:9: ANN-001: Die Statuszeile braucht sechs Felder bis „Wiedervorlage: …“.',
    ]);
  });

  it('haelt die Grenzen je Eintrag, je Zeile und fuer den Vorspann', () => {
    const lang = 'x'.repeat(REGISTER_GRENZEN.bytes.Fachregeln);
    const text = register(
      [],
      [eintrag('ANN-001', STATUS_PP, `**Regel.** ${lang}\n\nNoch ein Absatz.`)],
      [
        `| ANN-002 | ${'y'.repeat(REGISTER_GRENZEN.bytes['Übrige Einträge'])} | Technik · offen | \`x\` |`,
      ],
      '# Register\n'.repeat(REGISTER_GRENZEN.vorspann),
    );
    expect(pruefe(text).verstoesse).toEqual([
      'r.md:46: ANN-001 hat 7 Zeilen, erlaubt sind 5.',
      'r.md:46: ANN-001 hat 749 Bytes, erlaubt sind 600.',
      'r.md:57: ANN-002 hat 279 Bytes, erlaubt sind 240.',
      'r.md: Vorspann 45 Zeilen, erlaubt sind 40.',
    ]);
  });

  it('die Grenzen werden nur gesenkt', () => {
    expect(REGISTER_GRENZEN).toEqual({
      vorspann: 40,
      zeilenJeEintrag: 5,
      bytes: { Prüfpaket: 800, Fachregeln: 600, 'Übrige Einträge': 240 },
    });
  });
});

describe('Obergrenzen in Bytes (Regel E, 2026-10-12)', () => {
  const dateien = (inhalte) => {
    const karte = new Map(Object.entries(inhalte));
    return (pfad) => karte.get(pfad) ?? null;
  };

  it('faengt die eine lange Zeile, an der die Zeilengrenze vorbeiging', () => {
    // STATUS hatte 60 Zeilen bei 47 KB; die laengste allein 26.879 Zeichen.
    const status = `# Status\n${'x'.repeat(26879)}\n`;
    expect(
      pruefeObergrenzen(
        [{ pfad: 'docs/STATUS.md', bytes: 4096 }],
        dateien({ 'docs/STATUS.md': status }),
      ),
    ).toEqual(['docs/STATUS.md: 26889 Bytes, erlaubt sind 4096.']);
  });

  it('zaehlt UTF-8-Bytes, nicht Zeichen: ein Umlaut sind zwei', () => {
    const grenze = [{ pfad: 'a.md', bytes: 5 }];
    expect(pruefeObergrenzen(grenze, dateien({ 'a.md': 'äää' }))).toEqual([
      'a.md: 6 Bytes, erlaubt sind 5.',
    ]);
    expect(pruefeObergrenzen(grenze, dateien({ 'a.md': 'aaaaa' }))).toEqual([]);
  });

  it('laesst die Zeilengrenze dort, wo sie steht', () => {
    const grenze = [{ pfad: 'o.md', zeilen: 2 }];
    expect(pruefeObergrenzen(grenze, dateien({ 'o.md': 'a\nb\n' }))).toEqual([]);
    expect(pruefeObergrenzen(grenze, dateien({ 'o.md': 'a\nb\nc\n' }))).toEqual([
      'o.md: 3 Zeilen, erlaubt sind 2.',
    ]);
  });

  it('meldet eine fehlende Pflichtdatei, uebergeht eine fehlende optionale', () => {
    expect(
      pruefeObergrenzen(
        [
          { pfad: 'CLAUDE.md', bytes: 10 },
          { pfad: 'docs/design/DESIGN.md', bytes: 10, optional: true },
        ],
        dateien({}),
      ),
    ).toEqual(['CLAUDE.md: fehlt, wird aber von docs:check erwartet.']);
  });

  it('prueft eine optionale Datei, sobald es sie gibt', () => {
    expect(
      pruefeObergrenzen(
        [{ pfad: 'docs/design/DESIGN.md', bytes: 3, optional: true }],
        dateien({ 'docs/design/DESIGN.md': 'abcd' }),
      ),
    ).toEqual(['docs/design/DESIGN.md: 4 Bytes, erlaubt sind 3.']);
  });

  it('haelt die Grenzen fest: gesenkt werden darf, gehoben nicht still', () => {
    expect(OBERGRENZEN).toEqual([
      { pfad: 'CLAUDE.md', bytes: 8192 },
      { pfad: 'docs/STATUS.md', bytes: 4096 },
      { pfad: 'docs/development/ARBEITSBEREICHE.md', bytes: 8192 },
      { pfad: 'docs/design/DESIGN.md', bytes: 12800, optional: true },
      { pfad: 'docs/design/PLATTFORM.md', bytes: 8192 },
      { pfad: 'docs/decisions/OPEN_DECISIONS.md', zeilen: 400 },
    ]);
    expect(SKILL_GRENZE_BYTES).toBe(8192);
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
