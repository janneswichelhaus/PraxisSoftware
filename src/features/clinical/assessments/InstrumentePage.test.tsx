import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
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

/** Die Seite unter ihrer Adresse - mit `?instrument=` das Instrument im Einzelnen. */
function zeigen(scores?: ScoreDefinition[], instrument?: string) {
  return renderWithProviders(
    <InstrumentePage {...(scores ? { scores } : {})} />,
    instrument ? `/praxis/instrumente?instrument=${instrument}` : '/praxis/instrumente',
  );
}

describe('Instrumente', () => {
  it('listet jedes Instrument der Bibliothek als Zeile mit Weg ins Einzelne', () => {
    zeigen();
    const ziele = screen
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href')] as const);
    for (const score of bibliothek.scores) {
      expect(
        ziele.some(
          ([text, ziel]) =>
            text?.startsWith(score.meta.name_de) &&
            ziel === `/praxis/instrumente?instrument=${score.meta.id}`,
        ),
      ).toBe(true);
    }
  });

  it('zeigt im Einzelnen Fassung und Lizenz', () => {
    for (const score of bibliothek.scores) {
      const { unmount } = zeigen(undefined, score.meta.id);
      expect(
        screen.getByRole('heading', { level: 1, name: score.meta.name_de }),
      ).toBeInTheDocument();
      expect(screen.getByText(score.meta.version)).toBeInTheDocument();
      expect(screen.getByText(/frei verwendbar, Stand \d{2}\.\d{2}\.\d{4}/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Zurück zu den Instrumenten/ })).toHaveAttribute(
        'href',
        '/praxis/instrumente',
      );
      unmount();
    }
  });

  it('kennzeichnet ein Instrument ohne Vorlage als inaktiv mit vorlaeufigem Wortlaut', () => {
    const liste = zeigen();
    // In der Zeile kurz, im Einzelnen mit Grund.
    expect(screen.getAllByText('Inaktiv')).toHaveLength(3);
    liste.unmount();
    zeigen(undefined, 'psfs');
    expect(screen.getByText('Inaktiv · Wortlaut vorläufig')).toBeInTheDocument();
  });

  it('spricht von Fragen und Fassung und nennt keinen Dateinamen (BEF-15, BEF-16)', () => {
    const { container } = zeigen(undefined, 'anamnese_v8');

    expect(screen.getByText('Fassung')).toBeInTheDocument();
    expect(screen.getByText('46, keine geht in eine Rechnung ein')).toBeInTheDocument();
    expect(screen.getByText('DIGOTOR GbR, Version 8, 07/2026')).toBeInTheDocument();
    expect(screen.getByText('Wortlaut (46 Fragen)')).toBeInTheDocument();
    // Was aus dem Inventar stammt, bleibt wörtlich - als Zitat gekennzeichnet.
    expect(
      screen.getByText('Laut Inventar: „Kein Scoring - reine Informationserfassung“'),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Items|\.pdf|gewertet/);
  });

  it('nennt auch in der Liste keinen Dateinamen und spricht nicht von Items', () => {
    const { container } = zeigen();
    expect(container.textContent).not.toMatch(/Items|\.pdf|gewertet/);
  });

  it('zeigt den Wortlaut samt Ankern der Skala', () => {
    zeigen(undefined, 'nrs_schmerz');
    expect(screen.getByText('Wie stark sind Ihre Schmerzen im Moment?')).toBeInTheDocument();
    expect(screen.getByText(/0 = „keine Schmerzen“/)).toBeInTheDocument();
  });

  it('zeigt weder Cut-off noch MCID noch MDC (ADR-006 Punkt 11)', () => {
    const liste = zeigen([mitSchwellenwerten()]);
    expect(liste.container.textContent).not.toMatch(/SICHTBAR/);
    liste.unmount();

    const { container } = zeigen([mitSchwellenwerten()], 'synthetisch');
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/SICHTBAR/);
  });

  it('sagt es, wenn kein Instrument vorliegt', () => {
    zeigen([]);
    // Ein Leerzustand der Seite, keine Meldung neben einer Aktion (BEF-18).
    expect(screen.getByText('Noch liegt kein Instrument vor.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('zeigt bei einer unbekannten Kennung wieder die Liste', () => {
    zeigen(undefined, 'gibt-es-nicht');
    expect(screen.getByRole('heading', { level: 1, name: 'Instrumente' })).toBeInTheDocument();
  });
});
