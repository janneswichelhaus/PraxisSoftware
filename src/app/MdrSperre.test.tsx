import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { MDR_REVIEW_REQUIRED } from './mdr';
import { MdrSperre } from './MdrSperre';

/**
 * Die Sperrseite (ANN-089, ADR-006 Punkt 6), seit UXR-002 mit den Bausteinen
 * des Systems. Den Wortlaut der Kennung und des Hinweises hält zusätzlich
 * `tests/e2e/mdr-sperre.spec.ts` fest.
 */
const eintrag = MDR_REVIEW_REQUIRED.find((kandidat) => kandidat.pfade.length > 0)!;

function zeige() {
  return render(
    <MemoryRouter>
      <MdrSperre eintrag={eintrag} />
    </MemoryRouter>,
  );
}

describe('MdrSperre', () => {
  it('führt die Fundstellen als beschriftete Angabe wie jede Detailseite (NAV-24)', () => {
    zeige();

    const bezeichnung = screen.getByRole('term');
    expect(bezeichnung).toHaveTextContent('Grundlage');
    const angabe = screen.getByRole('definition');
    const fundstellen = within(angabe).getAllByRole('listitem');
    expect(fundstellen.map((fundstelle) => fundstelle.textContent)).toEqual(eintrag.grundlage);
    // `DetailList` statt einer eigenen `dl`: Trennlinie und Maße des Systems.
    expect(bezeichnung.closest('dl')).toHaveClass('divide-y', 'border-t');
  });

  // BEF-065 (Entscheidung und Freigabe Jannes 2026-10-09): Praxissprache im
  // Haupttext, die Kennung als Fußzeile - gleich streng geprüft.
  it('nennt Sperre, Kennung, Hinweis und Rückweg', () => {
    zeige();

    expect(screen.getByRole('heading', { level: 1, name: eintrag.bezeichnung })).toBeVisible();
    expect(
      screen.getByText(
        'Diese Funktion bleibt gesperrt, bis eine Prüfung nach dem Medizinprodukterecht dokumentiert ist.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Kennung: MDR_REVIEW_REQUIRED/)).toBeInTheDocument();
    expect(
      screen.getByText(/Einen Schalter, der sie vor der Prüfung freigibt, gibt es bewusst nicht/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Feature-Flag|klassifiziert/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toHaveAttribute('href', '/');
  });

  it('besteht die automatische Prüfung auf Barrieren', async () => {
    const { container } = zeige();
    await pruefeBarrierefreiheit(container);
  });
});
