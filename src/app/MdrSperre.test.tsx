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

  it('nennt Kennung, Hinweis und Rückweg unverändert (NAV-23 bleibt bei Jannes)', () => {
    zeige();

    expect(screen.getByRole('heading', { level: 1, name: eintrag.bezeichnung })).toBeVisible();
    expect(screen.getByText(/MDR_REVIEW_REQUIRED/)).toBeInTheDocument();
    expect(
      screen.getByText(/Ein Feature-Flag ersetzt diese Prüfung nicht – deshalb/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toHaveAttribute('href', '/');
  });

  it('besteht die automatische Prüfung auf Barrieren', async () => {
    const { container } = zeige();
    await pruefeBarrierefreiheit(container);
  });
});
