import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import { renderWithProviders, testPatient } from '@/test-utils';

const setTakeAlongItems = vi.fn();
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    setTakeAlongItems: (id: string, eintraege: string[]) =>
      setTakeAlongItems(id, eintraege) as Promise<string[]>,
  };
});

const { Mitnehmen } = await import('./Mitnehmen');

describe('Mitnehmen in der Akte (PRX-007)', () => {
  beforeEach(() => {
    setTakeAlongItems.mockReset();
    setTakeAlongItems.mockImplementation((_id: string, eintraege: string[]) =>
      Promise.resolve(eintraege),
    );
  });

  it('zeigt die Liste - und ohne Eintrag nur den Knopf (UX-005e)', () => {
    const { unmount } = renderWithProviders(
      <Mitnehmen patient={testPatient({ take_along_items: ['Theraband'] })} darfAendern />,
    );
    expect(screen.getByText('Theraband')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liste ändern' })).toBeInTheDocument();
    unmount();

    renderWithProviders(<Mitnehmen patient={testPatient({ take_along_items: [] })} darfAendern />);
    expect(screen.queryByText('Nichts eingetragen.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Material eintragen' })).toBeInTheDocument();
  });

  it('speichert eine Zeile je Eintrag, leere Zeilen fallen weg', async () => {
    const user = userEvent.setup();
    const patient = testPatient({ take_along_items: ['Theraband'] });
    renderWithProviders(<Mitnehmen patient={patient} darfAendern />);

    await user.click(screen.getByRole('button', { name: 'Liste ändern' }));
    const feld = screen.getByLabelText('Material zum Mitnehmen');
    await user.type(feld, '{Enter}{Enter}  Kinesiotape  ');
    await user.click(screen.getByRole('button', { name: 'Liste speichern' }));

    await waitFor(() =>
      expect(setTakeAlongItems).toHaveBeenCalledWith(patient.id, ['Theraband', 'Kinesiotape']),
    );
  });

  it('hält mehr als zehn Einträge am Feld an, ohne zu speichern', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Mitnehmen patient={testPatient({ take_along_items: [] })} darfAendern />);

    await user.click(screen.getByRole('button', { name: 'Material eintragen' }));
    const feld = screen.getByLabelText('Material zum Mitnehmen');
    await user.type(feld, Array.from({ length: 11 }, (_, i) => `M${i}`).join('{Enter}'));

    expect(screen.getByText('Höchstens 10 Einträge.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liste speichern' })).toBeDisabled();
    expect(setTakeAlongItems).not.toHaveBeenCalled();
  });

  it('bietet ohne Recht keinen Knopf an', () => {
    renderWithProviders(
      <Mitnehmen patient={testPatient({ take_along_items: ['Theraband'] })} darfAendern={false} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('meldet einen Speicherfehler am Ort', async () => {
    setTakeAlongItems.mockRejectedValue(new Error('Netz'));
    const user = userEvent.setup();
    renderWithProviders(<Mitnehmen patient={testPatient({ take_along_items: [] })} darfAendern />);

    await user.click(screen.getByRole('button', { name: 'Material eintragen' }));
    await user.type(screen.getByLabelText('Material zum Mitnehmen'), 'Theraband');
    await user.click(screen.getByRole('button', { name: 'Liste speichern' }));

    expect(
      await screen.findByText(/Die Liste zum Mitnehmen konnte nicht gespeichert werden/),
    ).toBeInTheDocument();
  });
});
