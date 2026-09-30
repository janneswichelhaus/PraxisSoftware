import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Das Gerüst der Plattform (POR-004, DSN-001 Abschnitt 3 und D6).
 *
 * Was die Person sieht, entscheidet der Server (`platform-context.test.ts`).
 * Hier: der Schalter nur bei zwei lesbaren Bereichen, keine Praxisbegriffe,
 * ein gesperrter Zugang sagt es, „Ich" meldet ab.
 */

const ueberallAbmelden = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ueberallAbmelden: () => ueberallAbmelden() as Promise<void>,
}));

const { PlattformApp } = await import('./PlattformApp');

const TRAINING: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000003',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'training',
  status: 'active',
  readable: true,
  read_until: null,
};
const BEHANDLUNG: Plattformzugang = {
  ...TRAINING,
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  relationship_kind: 'treatment',
};

const abmelden = vi.fn();

function zeige(zugaenge: Plattformzugang[], pfad = '/p') {
  return renderWithProviders(
    <PlattformApp
      zugaenge={zugaenge}
      email="tina.plattform@patient.invalid"
      onAbmelden={abmelden}
    />,
    pfad,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ueberallAbmelden.mockResolvedValue(undefined);
});

describe('PlattformApp', () => {
  it('zeigt die Uebersicht ohne Bereichsschalter bei einem Verhaeltnis', () => {
    zeige([TRAINING]);
    expect(screen.getByRole('heading', { name: 'Guten Tag' })).toBeInTheDocument();
    expect(screen.getByText(/Test Praxis Tuebingen angemeldet/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Bereich' })).not.toBeInTheDocument();
    // Ein Reiter erscheint erst mit dem Loop, der ihn füllt (ANN-112).
    expect(screen.getByRole('link', { name: 'Übersicht' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Termine' })).not.toBeInTheDocument();
  });

  it('schaltet bei zwei Verhaeltnissen zwischen Behandlung und Training (D6)', async () => {
    const nutzer = userEvent.setup();
    zeige([BEHANDLUNG, TRAINING]);
    const schalter = screen.getByRole('navigation', { name: 'Bereich' });
    expect(schalter).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Behandlung' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await nutzer.click(screen.getByRole('link', { name: 'Training' }));
    expect(screen.getByRole('link', { name: 'Training' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/Bereich Training/)).toBeInTheDocument();
  });

  it('zeigt einen gesperrten Bereich nicht im Schalter', () => {
    zeige([BEHANDLUNG, { ...TRAINING, status: 'locked', readable: false }]);
    expect(screen.queryByRole('navigation', { name: 'Bereich' })).not.toBeInTheDocument();
  });

  it('sagt, dass der Zugang gesperrt ist, wenn nichts lesbar ist', () => {
    zeige([{ ...TRAINING, status: 'locked', readable: false }]);
    expect(screen.getByRole('heading', { name: 'Ihr Zugang ist gesperrt' })).toBeInTheDocument();
  });

  it('sagt nach der Lesefrist, dass der Zugang beendet ist (D2)', () => {
    zeige([{ ...TRAINING, readable: false, read_until: '2026-09-01T00:00:00Z' }]);
    expect(screen.getByRole('heading', { name: 'Ihr Zugang ist beendet' })).toBeInTheDocument();
  });

  it('nennt in der Lesefrist, bis wann gelesen werden kann', () => {
    zeige([{ ...TRAINING, read_until: '2026-10-30T22:00:00Z' }]);
    expect(screen.getByText(/noch bis/)).toBeInTheDocument();
  });

  it('meldet unter "Ich" ab, auf Wunsch ueberall', async () => {
    const nutzer = userEvent.setup();
    zeige([TRAINING], '/p/ich');
    expect(screen.getByText('tina.plattform@patient.invalid')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(abmelden).toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Überall abmelden' }));
    const knoepfe = screen.getAllByRole('button', { name: 'Überall abmelden' });
    await nutzer.click(knoepfe[knoepfe.length - 1]!);
    await waitFor(() => expect(ueberallAbmelden).toHaveBeenCalled());
  });

  it('fuehrt jeden anderen Pfad auf die Uebersicht', () => {
    zeige([TRAINING], '/patienten/66666666-6666-4666-8666-000000000001');
    expect(screen.getByRole('heading', { name: 'Guten Tag' })).toBeInTheDocument();
  });

  it('kennt keine Praxisbegriffe', () => {
    const { container } = zeige([BEHANDLUNG, TRAINING]);
    for (const wort of ['Patient', 'Akte', 'Kalender', 'Dokumentation', 'Befund']) {
      expect(container.textContent).not.toContain(wort);
    }
  });
});
