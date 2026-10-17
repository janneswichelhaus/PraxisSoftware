import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { HinweisZwischendurch } from './HinweisZwischendurch';
import type { EigenerTermin, Hinweis } from './zwischendurch';

/** ORG-005 (ANN-603): das Fenster „Hinweise zwischendurch“ in der Übersicht. */

const BAROMETER: Hinweis = {
  schluessel: 'barometer-2026-10',
  titel: 'Barometer Oktober',
  text: 'Fünf kurze Fragen, wie es dir gerade geht – mit oder ohne Namen.',
  ziel: '/betrieb/barometer?zurueck=%2F',
};

function Ziel() {
  const ort = useLocation();
  return <p>Ziel {`${ort.pathname}${ort.search}`}</p>;
}

function rendern(termine: EigenerTermin[] | null, hinweise: Hinweis[] | null = [BAROMETER]) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <HinweisZwischendurch hinweise={hinweise} termine={termine} heute="2026-10-17" />,
      },
      { path: '*', element: <Ziel /> },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

const termin = (von: string, bis: string): EigenerTermin => ({
  starts_at: `2026-10-17T${von}:00Z`,
  ends_at: `2026-10-17T${bis}:00Z`,
  status: 'confirmed',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HinweisZwischendurch', () => {
  it('zeigt den Hinweis als Fenster mit „Jetzt“ und „Später“; „Jetzt“ führt hin', async () => {
    const nutzer = userEvent.setup();
    rendern([termin('11:00', '12:00')]);
    const fenster = screen.getByRole('dialog', { name: 'Barometer Oktober' });
    expect(within(fenster).getByText(/Fünf kurze Fragen/)).toBeInTheDocument();
    expect(within(fenster).getByRole('button', { name: 'Jetzt' })).toHaveFocus();
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(within(fenster).getByRole('button', { name: 'Jetzt' }));
    expect(await screen.findByText('Ziel /betrieb/barometer?zurueck=%2F')).toBeInTheDocument();
  });

  it('schließt mit „Später“ und erscheint heute nicht noch einmal', async () => {
    const nutzer = userEvent.setup();
    const erstes = rendern([]);
    await nutzer.click(screen.getByRole('button', { name: 'Später' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    erstes.unmount();
    rendern([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('wartet, bis die eigenen Termine geladen sind, und stört keinen Termin', () => {
    rendern(null);
    expect(screen.queryByRole('dialog')).toBeNull();
    rendern([termin('09:30', '10:30')]);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Der nächste Termin in zehn Minuten: man ist auf dem Weg.
    rendern([termin('10:10', '11:00')]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('zeigt nichts ohne Hinweis', () => {
    rendern([], []);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
