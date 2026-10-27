import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AbmeldeschutzProvider } from '@/app/AbmeldeschutzProvider';
import { useAbmeldeanfrage } from '@/app/abmeldeschutz';
import { Fotoverlustschutz } from './Fotoverlustschutz';

/**
 * Ein Foto, das nur im Arbeitsspeicher liegt, geht nicht durch einen
 * versehentlichen Seitenwechsel oder ein Abmelden verloren (DOK-006, ADR-017
 * Punkt 33, §13; DAT-04).
 */

/** Der Knopf „Abmelden" der Kopfzeile, auf das Nötige verkürzt. */
function Abmelden({ onAbmelden }: { onAbmelden: () => void }) {
  const anfordern = useAbmeldeanfrage();
  return (
    <button type="button" onClick={anfordern ?? onAbmelden}>
      Abmelden
    </button>
  );
}

function aufbauen(onAbmelden: () => void = vi.fn()) {
  const router = createMemoryRouter(
    [
      {
        path: '/akte',
        element: (
          <>
            <Link to="/kalender">Zum Kalender</Link>
            <Abmelden onAbmelden={onAbmelden} />
            <Fotoverlustschutz />
          </>
        ),
      },
      { path: '/kalender', element: <p>Kalender</p> },
    ],
    { initialEntries: ['/akte'] },
  );
  render(
    <AbmeldeschutzProvider onAbmelden={onAbmelden}>
      <RouterProvider router={router} />
    </AbmeldeschutzProvider>,
  );
  return router;
}

describe('Fotoverlustschutz', () => {
  it('hält einen Seitenwechsel an und bleibt auf Wunsch', async () => {
    const router = aufbauen();
    await userEvent.click(screen.getByRole('link', { name: 'Zum Kalender' }));

    expect(
      screen.getByRole('dialog', { name: 'Das Foto ist noch nicht gespeichert' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Hier bleiben' }));
    expect(router.state.location.pathname).toBe('/akte');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('verwirft das Foto nur auf ausdrücklichen Wunsch', async () => {
    const router = aufbauen();
    await userEvent.click(screen.getByRole('link', { name: 'Zum Kalender' }));
    await userEvent.click(screen.getByRole('button', { name: 'Foto verwerfen und weitergehen' }));

    expect(router.state.location.pathname).toBe('/kalender');
  });

  it('fragt auch vor dem Abmelden und meldet erst auf Wunsch ab (DAT-04)', async () => {
    const onAbmelden = vi.fn();
    aufbauen(onAbmelden);

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(
      screen.getByRole('dialog', { name: 'Das Foto ist noch nicht gespeichert' }),
    ).toHaveTextContent('Wer sich abmeldet, verwirft es.');
    expect(onAbmelden).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Hier bleiben' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onAbmelden).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    await userEvent.click(screen.getByRole('button', { name: 'Foto verwerfen und abmelden' }));
    expect(onAbmelden).toHaveBeenCalledTimes(1);
  });

  it('warnt vor dem Neuladen und Schließen des Fensters', () => {
    aufbauen();
    const ereignis = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ereignis);
    expect(ereignis.defaultPrevented).toBe(true);
  });
});
