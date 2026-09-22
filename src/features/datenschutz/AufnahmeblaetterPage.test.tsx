import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { AufnahmeblaetterPage } from './AufnahmeblaetterPage';

/**
 * Die Blätter für die Aufnahme (PAT-006).
 *
 * Der Inhalt ist in `vermerke.test.ts` geprüft; hier nur, dass das Blatt ihn
 * zeigt, den Entwurfsvermerk trägt und ohne Patientenbezug auskommt.
 */
describe('Aufnahmeblätter', () => {
  it('trägt Entwurfsvermerk, Fassung und beide Blätter', () => {
    renderWithProviders(<AufnahmeblaetterPage user={testUser(['office'])} />);

    expect(screen.getByText(/^Entwurf — vor der Verwendung/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Datenschutzinformation' })).toBeInTheDocument();
    expect(screen.getByText(/Fassung 2026-09/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hausbesuche und Kartendienst' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Absagen und Ausfallhonorar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blätter drucken' })).toBeInTheDocument();
  });

  it('besteht die Barrierefreiheitspruefung', async () => {
    const { container } = renderWithProviders(<AufnahmeblaetterPage user={testUser(['office'])} />);
    await pruefeBarrierefreiheit(container);
  });
});
