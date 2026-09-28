import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { testUser } from '@/test-utils';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import type { RoleKey } from '@/features/session/types';
import { BikeEditPage } from './BikeEditPage';

/**
 * Rad bearbeiten: Rückweg, Wortwahl und die Lage von „Rad entfernen". Was
 * nach Speichern und Entfernen gemeldet wird, prüft `ehrlichkeit.test.tsx`.
 */

function oeffne(radId: string, rollen: RoleKey[] = ['therapist']) {
  return render(
    <MemoryRouter initialEntries={[`/betrieb/flotte/rad/${radId}`]}>
      <VorschauProvider>
        <Routes>
          <Route
            path="/betrieb/flotte/rad/:radId"
            element={<BikeEditPage user={testUser(rollen)} />}
          />
        </Routes>
      </VorschauProvider>
    </MemoryRouter>,
  );
}

describe('Rad bearbeiten', () => {
  it('fuehrt oben zur Radflotte zurueck (VOR-21)', () => {
    oeffne('r1');
    expect(screen.getByRole('link', { name: '← Zurück zur Radflotte' })).toHaveAttribute(
      'href',
      '/betrieb/flotte',
    );
  });

  it('zeigt auch bei einem unbekannten Rad einen Weg zurueck', () => {
    oeffne('gibt-es-nicht');
    expect(screen.getByRole('alert')).toHaveTextContent(/Dieses Rad gibt es in der Vorschau nicht/);
    expect(screen.getByRole('link', { name: '← Zurück zur Radflotte' })).toBeInTheDocument();
  });

  it('stellt „Rad entfernen“ hinter die Knopfzeile (VOR-10)', () => {
    oeffne('r1');
    const uebernehmen = screen.getByRole('button', { name: 'In die Vorschau übernehmen' });
    const entfernen = screen.getByRole('button', { name: 'Rad entfernen' });
    // Nicht mehr in derselben Zeile wie das Übernehmen.
    expect(uebernehmen.parentElement).not.toContainElement(entfernen);
    expect(
      uebernehmen.compareDocumentPosition(entfernen) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('bietet das Entfernen beim Anlegen nicht an', () => {
    oeffne('neu');
    expect(screen.queryByRole('button', { name: 'Rad entfernen' })).toBeNull();
  });

  it('nennt Stammnutzer:in und Ersatzrad einheitlich (VOR-25)', () => {
    oeffne('r1');
    expect(screen.getByRole('combobox', { name: 'Stammnutzer:in' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '– keine Stammnutzer:in –' })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Dies ist das Ersatzrad (keine feste Stammnutzer:in)' }),
    ).toBeInTheDocument();
  });

  it('nutzt fuer das Ersatzrad das Kaestchen des Systems mit 44 px (VOR-12)', () => {
    oeffne('r1');
    const kaestchen = screen.getByRole('checkbox', {
      name: 'Dies ist das Ersatzrad (keine feste Stammnutzer:in)',
    });
    expect(kaestchen.closest('label')).toHaveClass('min-h-11');
  });

  it('nennt die Rolle beim Schluesselcode mit ihrem Anzeigenamen (VOR-25)', () => {
    oeffne('r1', ['owner']);
    expect(screen.getByText(/Nur für Praxisinhaber sichtbar/)).toBeInTheDocument();
  });
});
