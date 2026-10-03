import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { AufnahmeblaetterPage } from './AufnahmeblaetterPage';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

/** Die Seite hinter ihrer Adresse, damit sie die Kennung der Akte kennt. */
function blaetterRendern() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/patienten/:patientId/aufnahmeblaetter"
        element={<AufnahmeblaetterPage user={testUser(['office'])} />}
      />
    </Routes>,
    `/patienten/${PATIENT_ID}/aufnahmeblaetter`,
  );
}

/**
 * Die Blätter für die Aufnahme (PAT-006).
 *
 * Der Inhalt ist in `vermerke.test.ts` geprüft; hier nur, dass das Blatt ihn
 * zeigt, den Entwurfsvermerk trägt und ohne Patientenbezug auskommt.
 */
describe('Aufnahmeblätter', () => {
  it('trägt Entwurfsvermerk, Fassung und beide Blätter', () => {
    renderWithProviders(<AufnahmeblaetterPage user={testUser(['office'])} />);

    expect(screen.getByText(/^Entwurf – vor der Verwendung/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Datenschutzinformation' })).toBeInTheDocument();
    expect(screen.getByText(/Fassung 2026-09/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hausbesuche und Kartendienst' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Absagen und Ausfallhonorar' })).toBeInTheDocument();
  });

  // UEB-15: Drucken steht auch oben - am Telefon lag der Knopf sonst hinter
  // mehreren Bildschirmhöhen Rechtstext.
  it('bietet das Drucken oben und unten an', async () => {
    const drucken = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    try {
      blaetterRendern();

      const knoepfe = screen.getAllByRole('button', { name: 'Blätter drucken' });
      expect(knoepfe).toHaveLength(2);
      // Der obere steht vor dem Blatt.
      const blatt = screen.getByRole('heading', { name: 'Datenschutzinformation' });
      expect(
        knoepfe[0]!.compareDocumentPosition(blatt) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await userEvent.click(knoepfe[0]!);
      expect(drucken).toHaveBeenCalledTimes(1);
    } finally {
      drucken.mockRestore();
    }
  });

  it('führt vom Hinweis dorthin, wo vermerkt wird (UEB-15)', () => {
    blaetterRendern();

    expect(screen.getByRole('link', { name: 'in der Akte vermerken' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/stammdaten#anmeldebogen`,
    );
  });

  it('besteht die Barrierefreiheitspruefung', async () => {
    const { container } = blaetterRendern();
    await pruefeBarrierefreiheit(container);
  });
});
