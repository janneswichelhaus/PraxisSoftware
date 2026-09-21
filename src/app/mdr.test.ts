import { describe, expect, it } from 'vitest';
import { MDR_REVIEW_REQUIRED, REGULATORISCHE_PRUEFUNG, mdrSperre } from './mdr';
import { arbeitsbereiche } from './navigation';
import { funktionskatalog } from './funktionen';
import { roleKeySchema, type RoleKey } from '@/features/session/types';
import { testUser } from '@/test-utils';

/**
 * Die Prüfung zu ANN-089: `MDR_REVIEW_REQUIRED` ist geführt, vollzählig, ohne
 * Schalter — und für alles mit Adresse nicht erreichbar (ADR-006 Punkt 6 und
 * 13, `PROJECT_PRINCIPLES.md` §17).
 *
 * Sie ist ein Gate im Sinne der harten Regeln: Wer einen Eintrag entfernt oder
 * einen Schalter ergänzt, macht sie rot. Abschwächen, um einen Build grün zu
 * bekommen, ist ausgeschlossen.
 */

/** Was ADR-006 und die Roadmap heute klassifizieren. */
const GEFUEHRT = [
  'verbot-uebungsauswahl',
  'verbot-verlaufsbewertung',
  'verbot-screening-freigabe',
  'cutoff-anzeige',
  'ki-analyse',
  'uebungsanalyse',
  'progression-regelwerk',
];

/**
 * Die Felder eines Eintrags — abschließend.
 *
 * Der eigentliche Gegenstand dieser Liste ist, was **nicht** darin steht: kein
 * `aktiv`, kein `flag`, kein `ab`. Punkt 13 verlangt, dass ein klassifiziertes
 * Feature auch hinter einem Schalter nicht erreichbar ist; ein Schalter fiele
 * hier auf, bevor jemand ihn benutzt.
 */
const FELDER = ['id', 'bezeichnung', 'grundlage', 'keineAusgabe', 'pfade'];

const ROLLEN: RoleKey[] = [...roleKeySchema.options];

/** Alle reservierten Adressen, über alle Einträge. */
const reserviert = MDR_REVIEW_REQUIRED.flatMap((eintrag) => eintrag.pfade);

function liegtUnterSperre(ziel: string): boolean {
  return reserviert.some((pfad) => ziel === pfad || ziel.startsWith(`${pfad}/`));
}

describe('MDR_REVIEW_REQUIRED wird an genau einer Stelle gefuehrt', () => {
  it('fuehrt jeden Fall, den ADR-006 und die Roadmap klassifizieren', () => {
    expect(MDR_REVIEW_REQUIRED.map((eintrag) => eintrag.id).sort()).toEqual([...GEFUEHRT].sort());
  });

  it('nennt zu jedem Eintrag Fundstelle und die Ausgabe, die nicht entsteht', () => {
    for (const eintrag of MDR_REVIEW_REQUIRED) {
      expect(eintrag.bezeichnung.length, eintrag.id).toBeGreaterThan(0);
      expect(eintrag.grundlage.length, eintrag.id).toBeGreaterThan(0);
      expect(eintrag.keineAusgabe.length, eintrag.id).toBeGreaterThan(0);
    }
  });

  it('vergibt jede Kennung nur einmal', () => {
    const kennungen = MDR_REVIEW_REQUIRED.map((eintrag) => eintrag.id);
    expect(new Set(kennungen).size).toBe(kennungen.length);
  });

  it('reserviert nur anwendungsinterne Pfadanfaenge ohne Schrägstrich am Ende', () => {
    for (const pfad of reserviert) {
      expect(pfad.startsWith('/'), pfad).toBe(true);
      expect(pfad.endsWith('/'), pfad).toBe(false);
    }
  });
});

describe('Es gibt keinen Schalter (ADR-006 Punkt 13)', () => {
  it('traegt an keinem Eintrag ein Feld, das etwas aktivieren koennte', () => {
    for (const eintrag of MDR_REVIEW_REQUIRED) {
      expect(Object.keys(eintrag).sort(), eintrag.id).toEqual([...FELDER].sort());
    }
  });

  it('hat keine dokumentierte regulatorische Pruefung', () => {
    // Solange das `null` ist, bleibt jeder Eintrag gesperrt. Ein anderer Wert
    // waere eine Typaenderung an `mdr.ts` und stuende im Diff - nicht in einer
    // Konfiguration (ADR-006 Punkt 6 und 7).
    expect(REGULATORISCHE_PRUEFUNG).toBeNull();
  });
});

describe('mdrSperre trifft die reservierte Adresse und nur sie', () => {
  it('sperrt jede reservierte Adresse selbst', () => {
    for (const pfad of reserviert) {
      expect(mdrSperre(pfad)?.pfade, pfad).toContain(pfad);
    }
  });

  it('sperrt auch alles unterhalb', () => {
    expect(mdrSperre('/training/ki-analyse/verlauf')?.id).toBe('ki-analyse');
  });

  it('sperrt keinen Pfad, der nur so anfaengt', () => {
    expect(mdrSperre('/training/ki-analysen')).toBeUndefined();
  });

  it('laesst jede andere Adresse durch', () => {
    for (const pfad of ['/', '/kalender', '/patienten', '/abrechnung', '/training']) {
      expect(mdrSperre(pfad), pfad).toBeUndefined();
    }
  });

  it('gibt ein Ausgabeverbot ohne Adresse nie zurueck', () => {
    const ohnePfad = MDR_REVIEW_REQUIRED.filter((eintrag) => eintrag.pfade.length === 0);
    // Die drei Verbote und die Cutoff-Anzeige stehen hier zum Fuehren und
    // Benennen. Ihre Grenze wirkt im Zuschnitt und im Zweitreview, nicht als
    // Riegel - ADR-006 nimmt eine technische Durchsetzung ausdruecklich aus.
    expect(ohnePfad.length).toBeGreaterThan(0);
    const gesperrte = reserviert.map((pfad) => mdrSperre(pfad)?.id);
    for (const eintrag of ohnePfad) {
      expect(gesperrte, eintrag.id).not.toContain(eintrag.id);
    }
  });
});

describe('Nichts Klassifiziertes ist erreichbar', () => {
  it.each(ROLLEN)('bietet %s keinen Arbeitsbereich unter einer Sperre an', (rolle) => {
    for (const bereich of arbeitsbereiche(testUser([rolle]))) {
      expect(liegtUnterSperre(bereich.to), `${bereich.id} → ${bereich.to}`).toBe(false);
      for (const punkt of bereich.unterpunkte) {
        expect(liegtUnterSperre(punkt.to), `${punkt.label} → ${punkt.to}`).toBe(false);
      }
    }
  });

  it.each(ROLLEN)('findet %s in der Funktionssuche nichts Gesperrtes', (rolle) => {
    for (const eintrag of funktionskatalog(testUser([rolle]))) {
      expect(liegtUnterSperre(eintrag.ziel), `${eintrag.id} → ${eintrag.ziel}`).toBe(false);
    }
  });
});
