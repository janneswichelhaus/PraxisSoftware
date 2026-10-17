import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { useMeldungAusVerlauf } from './meldung';

function Seite() {
  const { meldung, verwerfen } = useMeldungAusVerlauf();
  return (
    <>
      <p>{meldung ? `Meldung: ${meldung.text}` : 'Keine Meldung'}</p>
      <button type="button" onClick={verwerfen}>
        Zurücknehmen
      </button>
    </>
  );
}

function router(eintrag: { pathname: string; search?: string; state?: unknown }) {
  return createMemoryRouter([{ path: '/ziel', element: <Seite /> }], {
    initialEntries: [eintrag],
  });
}

describe('useMeldungAusVerlauf (Design- und Praxis-Review Überholung 9)', () => {
  it('zeigt die Bestätigung einmal und nimmt sie aus dem Verlaufseintrag', async () => {
    const mit = router({ pathname: '/ziel', state: { meldung: 'Eingetragen.' } });
    render(<RouterProvider router={mit} />);
    expect(screen.getByText('Meldung: Eingetragen.')).toBeInTheDocument();
    // Der Eintrag ist ersetzt und trägt nichts mehr - die Seite behält sie.
    await waitFor(() => expect(mit.state.location.state).toBeNull());
    expect(screen.getByText('Meldung: Eingetragen.')).toBeInTheDocument();
  });

  it('zeigt nach einem Neuladen des Eintrags nichts mehr', () => {
    render(<RouterProvider router={router({ pathname: '/ziel', state: null })} />);
    expect(screen.getByText('Keine Meldung')).toBeInTheDocument();
  });

  it('übergeht leere und fremde Angaben', () => {
    render(<RouterProvider router={router({ pathname: '/ziel', state: { meldung: ' ' } })} />);
    expect(screen.getByText('Keine Meldung')).toBeInTheDocument();
  });

  it('gehört zu ihrer Seite: beim Wechsel auf ein anderes Konto weg, auch beim Zurückwechseln (Runde 2)', async () => {
    const mit = router({ pathname: '/ziel', state: { meldung: 'Eingetragen.' } });
    render(<RouterProvider router={mit} />);
    await waitFor(() => expect(mit.state.location.state).toBeNull());
    await act(() => mit.navigate('/ziel?person=tim'));
    expect(screen.getByText('Keine Meldung')).toBeInTheDocument();
    await act(() => mit.navigate('/ziel'));
    expect(screen.getByText('Keine Meldung')).toBeInTheDocument();
  });

  it('lässt sich verwerfen, wenn ein weiterer Vorgang sie überholt (Runde 2)', async () => {
    const mit = router({ pathname: '/ziel', state: { meldung: 'Eingetragen.' } });
    render(<RouterProvider router={mit} />);
    await waitFor(() => expect(mit.state.location.state).toBeNull());
    act(() => screen.getByRole('button', { name: 'Zurücknehmen' }).click());
    expect(screen.getByText('Keine Meldung')).toBeInTheDocument();
  });
});
