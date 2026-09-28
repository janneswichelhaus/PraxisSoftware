import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { InstrumentePage } from './InstrumentePage';
import { bibliothek } from './bibliothek';
import { scoreDefinitionSchema, type ScoreDefinition } from './schema';

/**
 * Leseseite der Instrumentenbibliothek (FRB-010).
 *
 * Geprüft wird vor allem, was **nicht** erscheint: Cut-off, MCID und MDC
 * stehen in der Definition, auf dem Bildschirm nicht (ADR-006 Punkt 11).
 */

function mitSchwellenwerten(): ScoreDefinition {
  return scoreDefinitionSchema.parse({
    meta: {
      id: 'synthetisch',
      version: '1.2.0',
      name_de: 'Synthetischer Bogen',
      region: 'uebergreifend',
      konstrukt: 'Testkonstrukt',
      ausgefuellt_von: 'patient',
      sprache: 'de',
      prioritaet: 'a',
      quelle: { datei: 'synthetisch.pdf', validierung: 'keine' },
      lizenzstatus: { status: 'freigegeben', begruendung: 'Test', stand: '2026-09-25' },
      aktiv: true,
    },
    items: [{ id: 'frage', text: 'Synthetische Frage', typ: 'skala', skala: { min: 0, max: 4 } }],
    scoring: {
      regel_wortlaut: 'Summe',
      gesamt: { formel: { art: 'summe' }, wertebereich: { min: 0, max: 4 } },
      subskalen: [],
      richtung: 'hoch_ist_besser',
      missing_value_regel: 'keine',
    },
    interpretation: {
      cutoffs: 'CUTOFF-SICHTBAR',
      mcid: 'MCID-SICHTBAR',
      mdc: 'MDC-SICHTBAR',
    },
    referenzfaelle: [{ bezeichnung: 'x', antworten: { frage: 1 }, erwartet: { gesamt: 1 } }],
  });
}

describe('Instrumente', () => {
  it('zeigt jedes Instrument der Bibliothek mit Version und Lizenz', () => {
    render(<InstrumentePage />);
    for (const score of bibliothek.scores) {
      const karte = screen.getByRole('heading', { name: score.meta.name_de }).closest('div')
        ?.parentElement as HTMLElement;
      expect(within(karte).getByText(score.meta.version)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/frei verwendbar, Stand \d{2}\.\d{2}\.\d{4}/)).toHaveLength(
      bibliothek.scores.length,
    );
  });

  it('kennzeichnet ein Instrument ohne Vorlage als inaktiv mit vorlaeufigem Wortlaut', () => {
    render(<InstrumentePage />);
    expect(screen.getAllByText('Inaktiv · Wortlaut vorläufig')).toHaveLength(3);
  });

  it('spricht von Fragen und Fassung und nennt keinen Dateinamen (BEF-15, BEF-16)', () => {
    const { container } = render(<InstrumentePage />);
    const anamnese = screen
      .getByRole('heading', { name: 'Anamnesebogen Version 8 (DIGOTOR)' })
      .closest('div')?.parentElement as HTMLElement;

    expect(within(anamnese).getByText('Fassung')).toBeInTheDocument();
    expect(within(anamnese).getByText('46, keine geht in eine Rechnung ein')).toBeInTheDocument();
    expect(within(anamnese).getByText('DIGOTOR GbR, Version 8, 07/2026')).toBeInTheDocument();
    expect(within(anamnese).getByText('Wortlaut (46 Fragen)')).toBeInTheDocument();
    // Was aus dem Inventar stammt, bleibt wörtlich - als Zitat gekennzeichnet.
    expect(
      within(anamnese).getByText('Laut Inventar: „Kein Scoring - reine Informationserfassung“'),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Items|\.pdf|gewertet/);
  });

  it('zeigt den Wortlaut samt Ankern der Skala', () => {
    render(<InstrumentePage />);
    expect(screen.getByText('Wie stark sind Ihre Schmerzen im Moment?')).toBeInTheDocument();
    expect(screen.getByText(/0 = „keine Schmerzen“/)).toBeInTheDocument();
  });

  it('zeigt weder Cut-off noch MCID noch MDC (ADR-006 Punkt 11)', () => {
    const { container } = render(<InstrumentePage scores={[mitSchwellenwerten()]} />);
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/SICHTBAR/);
  });

  it('sagt es, wenn kein Instrument vorliegt', () => {
    render(<InstrumentePage scores={[]} />);
    // Ein Leerzustand der Seite, keine Meldung neben einer Aktion (BEF-18).
    expect(screen.getByText('Noch liegt kein Instrument vor.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
