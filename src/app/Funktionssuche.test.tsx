import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from '@/features/patients/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

const navigate = vi.fn();
const searchPatients = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    searchPatients: (begriff: string, limit?: number) =>
      searchPatients(begriff, limit) as Promise<PatientsApi.PatientSearchHit[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { Funktionssuche } = await import('./Funktionssuche');

const MAX = {
  id: '66666666-6666-4666-8666-000000000001',
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1957-04-30',
  status: 'active' as const,
};

const FELD = 'Funktion, Bereich oder Name suchen';

/**
 * Die Kopfleistensuche (UX-013).
 *
 * Geprüft wird der ganze Tastaturweg — öffnen, tippen, wählen, ausführen —,
 * die feste Reihenfolge der beiden Gruppen und die Grenze, an der die Suche
 * aufhört: Ein Patientenkonto bekommt keine Namen zu sehen und stellt dafür
 * auch keine Anfrage.
 */
describe('Funktionssuche', () => {
  beforeEach(() => {
    navigate.mockReset();
    searchPatients.mockReset();
    searchPatients.mockResolvedValue([MAX]);
  });

  it('zeigt beim Öffnen die Bereiche und wählt nichts vor', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />);

    await user.click(screen.getByRole('combobox', { name: FELD }));

    expect(screen.getByRole('option', { name: /Kalender/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Abrechnung/ })).toBeTruthy();
    // Nichts vorgewählt: Wer nur öffnet, landet mit der Eingabetaste nirgends.
    for (const eintrag of screen.getAllByRole('option')) {
      expect(eintrag.getAttribute('aria-selected')).toBe('false');
    }
    await user.keyboard('{Enter}');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('öffnet sich ohne Zeigegerät mit Strg + K', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />);
    const feld = screen.getByRole('combobox', { name: FELD });

    expect(document.activeElement).not.toBe(feld);
    await user.keyboard('{Control>}k{/Control}');

    expect(document.activeElement).toBe(feld);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('führt mit der Eingabetaste in den getippten Bereich', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />);

    await user.type(screen.getByRole('combobox', { name: FELD }), 'kal');
    // Getippt heißt vorgewählt: der beste Treffer ist hervorgehoben.
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Enter}');

    expect(navigate).toHaveBeenCalledWith('/kalender');
  });

  it('wandert mit den Pfeiltasten durch die Treffer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />);

    await user.type(screen.getByRole('combobox', { name: FELD }), 'fehlzeit');
    await user.keyboard('{ArrowDown}');
    const gewaehlt = screen.getAllByRole('option')[1];
    expect(gewaehlt?.getAttribute('aria-selected')).toBe('true');
    expect(gewaehlt?.textContent).toContain('Dauerfehlzeit eintragen');
  });

  it('nimmt in einen Vorgang den Rückweg mit, in einen Bereich nicht', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Funktionssuche user={testUser(['owner'])} />,
      '/kalender?ansicht=tag&datum=2027-05-12',
    );

    await user.type(screen.getByRole('combobox', { name: FELD }), 'fehlzeit ein');
    await user.keyboard('{Enter}');

    // Wer mitten im Kalender eine Fehlzeit einträgt, will danach dorthin
    // zurück - samt Ansicht und Datum (UX-012b).
    expect(navigate).toHaveBeenCalledWith(
      '/termine/ereignis?zurueck=%2Fkalender%3Fansicht%3Dtag%26datum%3D2027-05-12',
    );
  });

  it('sucht Namen erst ab drei Zeichen und sagt das dazwischen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />);

    await user.type(screen.getByRole('combobox', { name: FELD }), 'mu');

    expect(await screen.findByText('Namen ab 3 Zeichen.')).toBeTruthy();
    expect(searchPatients).not.toHaveBeenCalled();
  });

  it('führt Namen in einer zweiten Gruppe und öffnet die Akte über die Kennung', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />, '/kalender');

    await user.type(screen.getByRole('combobox', { name: FELD }), 'mus');

    const treffer = await screen.findByRole('option', { name: /Max Mustermann/ });
    expect(screen.getByRole('group', { name: 'Patient:innen' })).toContainElement(treffer);
    await user.click(treffer);

    // In der Adresszeile steht die Kennung, nie ein Name (ADR-011).
    expect(navigate).toHaveBeenCalledWith(
      `/patienten/${MAX.id}?zurueck=${encodeURIComponent('/kalender')}`,
    );
  });

  it('lässt die getroffene Auswahl stehen, wenn die Namen nachrücken', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />);

    await user.type(screen.getByRole('combobox', { name: FELD }), 'ter');
    await user.keyboard('{ArrowDown}');
    const vorher = screen.getAllByRole('option')[1]?.textContent;

    // Die Antwort des Servers trifft eine Tipppause später ein - und hängt
    // sich unten an, statt die Liste neu zu mischen.
    await screen.findByRole('option', { name: /Max Mustermann/ });

    const jetzt = screen.getAllByRole('option').find((zeile) => zeile.ariaSelected === 'true');
    expect(jetzt?.textContent).toBe(vorher);
  });

  it('schließt mit Escape, ohne die Eingabe zu verwerfen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />);
    const feld = screen.getByRole('combobox', { name: FELD });

    await user.type(feld, 'kal');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('option')).toBeNull();
    expect(feld).toHaveValue('kal');
  });

  it('bietet einem Patientenkonto keine Namen an und fragt auch nicht danach', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['patient'], 'Max Mustermann')} />);

    await user.type(screen.getByRole('combobox', { name: FELD }), 'mus');

    await waitFor(() => expect(screen.queryByText('Wird gesucht …')).toBeNull());
    expect(screen.queryByRole('group', { name: 'Patient:innen' })).toBeNull();
    expect(searchPatients).not.toHaveBeenCalled();
    // Die eigene Übersicht bleibt erreichbar - gefiltert wird auf Relevanz,
    // nicht auf Zugriff (§4.7, ADR-004).
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('unterscheidet den Fehlschlag der Namenssuche vom leeren Ergebnis', async () => {
    searchPatients.mockRejectedValue(new Error('Netz weg'));
    const user = userEvent.setup();
    renderWithProviders(<Funktionssuche user={testUser(['owner'])} />);

    await user.type(screen.getByRole('combobox', { name: FELD }), 'mus');

    expect(await screen.findByText(/fehlgeschlagen/)).toBeTruthy();
  });
});
