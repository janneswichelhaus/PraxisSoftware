import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Fotoverlustschutz } from './Fotoverlustschutz';

/**
 * Ein Foto, das nur im Arbeitsspeicher liegt, geht nicht durch einen
 * versehentlichen Seitenwechsel verloren (DOK-006, ADR-017 Punkt 33, §13).
 */

function aufbauen() {
  const router = createMemoryRouter(
    [
      {
        path: '/akte',
        element: (
          <>
            <Link to="/kalender">Zum Kalender</Link>
            <Fotoverlustschutz />
          </>
        ),
      },
      { path: '/kalender', element: <p>Kalender</p> },
    ],
    { initialEntries: ['/akte'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('Fotoverlustschutz', () => {
  it('hält einen Seitenwechsel an und bleibt auf Wunsch', async () => {
    const router = aufbauen();
    await userEvent.click(screen.getByRole('link', { name: 'Zum Kalender' }));

    expect(
      screen.getByRole('dialog', { name: 'Das Foto ist noch nicht in der Akte' }),
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

  it('warnt vor dem Neuladen und Schließen des Fensters', () => {
    aufbauen();
    const ereignis = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ereignis);
    expect(ereignis.defaultPrevented).toBe(true);
  });
});
