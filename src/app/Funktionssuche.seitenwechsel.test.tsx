import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { testUser } from '@/test-utils';
import { Funktionssuche } from './Funktionssuche';

/**
 * Die Kopfsuche beim Seitenwechsel (NAV-08).
 *
 * Eigene Datei, weil `Funktionssuche.test.tsx` `useNavigate` ersetzt: Hier
 * soll sich die Adresse wirklich ändern, während der Fokus im Feld bleibt -
 * etwa wenn eine Seite nach dem Speichern selbst weiterführt. Ein
 * `MemoryRouter` genügt dafür; die Suche braucht keinen Data Router.
 */

let navigieren: NavigateFunction | undefined;

function Weg() {
  navigieren = useNavigate();
  return null;
}

function rendern() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/kalender']}>
        <Weg />
        <Funktionssuche user={testUser(['owner'])} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Funktionssuche beim Seitenwechsel', () => {
  it('schließt die Liste, wenn sich die Seite ändert, auch mit dem Fokus im Feld', async () => {
    const user = userEvent.setup();
    rendern();
    const feld = screen.getByRole('combobox', { name: 'Funktion, Bereich oder Name suchen' });

    await user.click(feld);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    act(() => {
      void navigieren?.('/patienten');
    });

    expect(feld).toHaveFocus();
    expect(screen.queryByRole('option')).toBeNull();
    expect(feld).toHaveAttribute('aria-expanded', 'false');
  });

  it('lässt die Liste offen, solange die Seite bleibt', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(screen.getByRole('combobox', { name: 'Funktion, Bereich oder Name suchen' }));
    // Ein Wechsel der Suchparameter ist kein Seitenwechsel.
    act(() => {
      void navigieren?.('/kalender?ansicht=woche');
    });

    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});
