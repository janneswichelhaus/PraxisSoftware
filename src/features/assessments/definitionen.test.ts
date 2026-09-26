import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bibliothek } from './bibliothek';
import { ladeDefinitionen } from './definitionen';

/**
 * Der Ladepfad ist die Stelle, an der eine Übertragung auffällt.
 *
 * Die Tests unten laufen heute über ein leeres Verzeichnis — und werden mit
 * jeder Definitionsdatei aus P2, P4 und P5 von allein schärfer. Das ist der
 * Zweck: Die Phasen danach sollen Datenlieferungen sein, keine Bauaufträge.
 */

const stamm = process.cwd();
const SCORE_PDFS = join(stamm, 'quellen/scores/pdf');
const SCORE_TEXTE = join(stamm, 'quellen/scores/pdf-text');

/** Zeilenumbrüche und Satzspiegel des Extrakts sind Layout, kein Wortlaut. */
function einzeilig(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Der Extrakt ohne die Antwortspalte am rechten Rand.
 *
 * pdftotext setzt die Kästchen „ja nein" ans Zeilenende — auch mitten in eine
 * Frage, die über zwei Zeilen läuft (Anamnesebogen, Frage 7). Für die Fragen
 * zählt der Text ohne diese Spalte; die Optionen selbst werden gegen den
 * unveränderten Extrakt gehalten.
 */
function ohneAntwortspalte(text: string): string {
  // Zwei Leerzeichen oder mehr trennen die Spalte vom Fragetext. Bewusst ohne
  // regulären Ausdruck mit verschachtelten Quantoren (security/detect-unsafe-regex).
  return text
    .split('\n')
    .map((zeile) => {
      let rest = zeile.trimEnd();
      for (const marke of ['nein', 'ja']) {
        const vorher = rest.slice(0, -marke.length);
        if (rest.endsWith(marke) && vorher.endsWith('  ')) rest = vorher.trimEnd();
      }
      return rest;
    })
    .join('\n');
}
const DEFINITIONEN = join(stamm, 'src/features/assessments/definitionen');

function region(abweichung: Record<string, unknown> = {}) {
  return {
    id: 'knie',
    label: 'Knie',
    version: '1.0.0',
    blocks: [
      {
        id: 'basisuntersuchung',
        label: 'Basisuntersuchung',
        art: 'basis',
        items: [
          {
            id: 'knie_lachmann_test',
            label: 'Lachmann-Test',
            type: 'test',
            bilateral: true,
            result_type: 'befund',
          },
        ],
      },
    ],
    ...abweichung,
  };
}

describe('Ladepfad der Definitionen', () => {
  it('nimmt ein leeres Verzeichnis an', () => {
    // Der Zustand von heute. Er darf kein Fehler sein, sonst steht der Weg
    // erst, wenn die erste Datei liegt.
    expect(ladeDefinitionen({})).toEqual({ bausteine: [], scores: [] });
  });

  it('ordnet Dateien nach ihrem Verzeichnis zu', () => {
    const geladen = ladeDefinitionen({ './definitionen/bausteine/knie.json': region() });
    expect(geladen.bausteine).toHaveLength(1);
    expect(geladen.bausteine[0]?.id).toBe('knie');
    expect(geladen.scores).toHaveLength(0);
  });

  it('weist eine Definition ausserhalb der beiden Verzeichnisse zurueck', () => {
    expect(() => ladeDefinitionen({ './definitionen/knie.json': region() })).toThrow(
      /bausteine\/.*scores\//s,
    );
  });

  it('nennt Datei und Feld, wenn die version fehlt', () => {
    const ohneVersion = { ...region() };
    delete (ohneVersion as Record<string, unknown>).version;
    expect(() => ladeDefinitionen({ './definitionen/bausteine/knie.json': ohneVersion })).toThrow(
      /knie\.json: version/,
    );
  });

  it('sammelt die Fehler aller Dateien in einer Meldung', () => {
    // Wer 18 Dateien uebertraegt, soll nicht 18-mal starten muessen.
    let meldung = '';
    try {
      ladeDefinitionen({
        './definitionen/bausteine/knie.json': region({ version: '1.0' }),
        './definitionen/bausteine/hws.json': region({ id: 'HWS' }),
      });
    } catch (fehler) {
      meldung = (fehler as Error).message;
    }
    expect(meldung).toContain('knie.json');
    expect(meldung).toContain('hws.json');
  });

  it('weist zwei Regionen mit derselben Kennung zurueck', () => {
    expect(() =>
      ladeDefinitionen({
        './definitionen/bausteine/knie.json': region(),
        './definitionen/bausteine/knie-2.json': region({ label: 'Knie (alt)' }),
      }),
    ).toThrow(/Region "knie" ist doppelt vergeben/);
  });

  it('weist denselben Test in zwei Regionen zurueck', () => {
    // Ein Ergebnis haelt die Kennung des Tests fest. Zweimal vergeben, zeigt
    // es auf zwei Dinge — und der Verlauf mischt zwei Gelenke.
    expect(() =>
      ladeDefinitionen({
        './definitionen/bausteine/knie.json': region(),
        './definitionen/bausteine/hws.json': region({ id: 'hws', label: 'HWS' }),
      }),
    ).toThrow(/Test- oder Technikkennung "knie_lachmann_test" ist doppelt vergeben/);
  });
});

describe('Bibliothek der Anwendung', () => {
  it('laedt beim Start ohne Fehler', () => {
    // Die eigentliche Zusicherung steht im Import: Eine fehlerhafte Datei
    // unter definitionen/ laesst `bibliothek` werfen, und dieser Test wird
    // rot, bevor irgendjemand einen Fragebogen oeffnet. Geprueft wird deshalb
    // die Form, nicht die Leere — sonst muesste P4 diese Zeile aendern.
    expect(Array.isArray(bibliothek.bausteine)).toBe(true);
    expect(Array.isArray(bibliothek.scores)).toBe(true);
  });

  it('hat ein Verzeichnis je Datenmodell', () => {
    expect(existsSync(join(DEFINITIONEN, 'bausteine'))).toBe(true);
    expect(existsSync(join(DEFINITIONEN, 'scores'))).toBe(true);
  });

  it('nennt zu jedem Score eine Quelle, die im Repository liegt', () => {
    // Heute leer, ab P4 scharf: Eine Definition, deren Quell-PDF es nicht
    // gibt, ist gegen nichts zu halten — und genau das verlangt Regel 1 in
    // quellen/README.md.
    // Ohne `datei` ist der Wortlaut vorlaeufig und das Instrument inaktiv -
    // das prueft das Schema (ANN-099). Eine genannte Datei muss aber liegen.
    const fehlend = bibliothek.scores
      .flatMap((score) => (score.meta.quelle.datei ? [score.meta.quelle.datei] : []))
      .filter((datei) => !existsSync(join(SCORE_PDFS, datei)));
    expect(fehlend).toEqual([]);
  });

  it('haelt jeden Text eines Scores mit Vorlage gegen den Extrakt der Vorlage', () => {
    // Regel 1 in quellen/README.md: Der Wortlaut ist unantastbar. Geprueft
    // wird jede Frage, jede Option und jeder Hinweis - nur Zeilenumbrueche
    // gleicht der Test aus, weil pdftotext sie aus dem Satzspiegel setzt.
    const abweichend = bibliothek.scores.flatMap((score) => {
      const datei = score.meta.quelle.datei;
      if (!datei) return [];
      const roh = readFileSync(join(SCORE_TEXTE, datei.replace(/\.pdf$/, '.txt')), 'utf8');
      const extrakt = einzeilig(roh);
      const fragen = einzeilig(ohneAntwortspalte(roh));
      return score.items.flatMap((item) => [
        ...[item.text, item.hinweis]
          .filter((text): text is string => text !== undefined)
          .filter((text) => !fragen.includes(einzeilig(text)))
          .map((text) => `${score.meta.id}.${item.id}: „${text}“`),
        ...(item.optionen ?? [])
          .map((option) => option.label)
          .filter((text) => !extrakt.includes(einzeilig(text)))
          .map((text) => `${score.meta.id}.${item.id}: Option „${text}“`),
      ]);
    });
    expect(abweichend).toEqual([]);
  });

  it('legt keine Definitionsdatei ausserhalb der beiden Verzeichnisse ab', () => {
    const fremd = readdirSync(DEFINITIONEN, { withFileTypes: true })
      .filter((eintrag) => eintrag.isFile() && eintrag.name.endsWith('.json'))
      .map((eintrag) => eintrag.name);
    expect(fremd).toEqual([]);
  });
});
