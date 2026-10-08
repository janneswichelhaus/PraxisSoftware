import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
const ladeMeineVertretungen = vi.fn();
const begleitungBeenden = vi.fn();
// POR-EPIC-002: die Übersicht fragt Termine, Wünsche, Rechnungen und den
// Befundbogen ab - hier ohne Inhalt.
const ladeTermine = vi.fn();
const ladeWuensche = vi.fn();
const ladeRechnungen = vi.fn();
const ladeBefundbogen = vi.fn();
// POR-019: der Einstieg - hier ohne, außer im eigenen Test.
const ladeEinstieg = vi.fn();
const einstiegBeenden = vi.fn();
const ladeEinwilligungen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ueberallAbmelden: () => ueberallAbmelden() as Promise<void>,
  ladeMeineVertretungen: (...args: unknown[]) => ladeMeineVertretungen(...args) as Promise<unknown>,
  begleitungBeenden: (...args: unknown[]) => begleitungBeenden(...args) as Promise<void>,
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<unknown[]>,
  ladeWuensche: (...args: unknown[]) => ladeWuensche(...args) as Promise<unknown[]>,
  ladeRechnungen: (...args: unknown[]) => ladeRechnungen(...args) as Promise<unknown[]>,
  ladeBefundbogen: (...args: unknown[]) => ladeBefundbogen(...args) as Promise<unknown[]>,
  ladeEinstieg: (...args: unknown[]) => ladeEinstieg(...args) as Promise<unknown>,
  einstiegBeenden: (...args: unknown[]) => einstiegBeenden(...args) as Promise<void>,
  ladeEinwilligungen: (...args: unknown[]) => ladeEinwilligungen(...args) as Promise<unknown[]>,
}));

const { PlattformApp } = await import('./PlattformApp');

const TRAINING: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000003',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'training',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
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
  ladeMeineVertretungen.mockResolvedValue([]);
  begleitungBeenden.mockResolvedValue(undefined);
  ladeTermine.mockResolvedValue([]);
  ladeWuensche.mockResolvedValue([]);
  ladeRechnungen.mockResolvedValue([]);
  ladeBefundbogen.mockResolvedValue([]);
  ladeEinstieg.mockResolvedValue({ pending: false, finished_at: '2026-10-01', skipped_at: null });
  einstiegBeenden.mockResolvedValue(undefined);
  ladeEinwilligungen.mockResolvedValue([]);
});

describe('PlattformApp', () => {
  it('zeigt die Uebersicht ohne Bereichsschalter bei einem Verhaeltnis', async () => {
    zeige([TRAINING]);
    expect(await screen.findByRole('heading', { name: 'Guten Tag' })).toBeInTheDocument();
    expect(screen.getByText(/Test Praxis Tuebingen angemeldet/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Bereich' })).not.toBeInTheDocument();
    // Ein Reiter erscheint erst mit dem Loop, der ihn füllt (ANN-112): seit
    // POR-008 die Termine, noch keine Übungen und keine Nachrichten.
    expect(screen.getByRole('link', { name: 'Übersicht' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Termine' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Übungen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nachrichten' })).not.toBeInTheDocument();
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
    // UEB-009: Im Training heißt auch der Reiter unten „Training" (DSN-001
    // Abschnitt 5) - der Schalter ist der im Bereich-Menü.
    await nutzer.click(within(schalter).getByRole('link', { name: 'Training' }));
    expect(
      within(screen.getByRole('navigation', { name: 'Bereich' })).getByRole('link', {
        name: 'Training',
      }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/Bereich Training/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Plattform' })).getByRole('link', {
        name: 'Training',
      }),
    ).toBeInTheDocument();
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

  it('nennt in der Lesefrist, bis wann gelesen werden kann', async () => {
    zeige([{ ...TRAINING, read_until: '2026-10-30T22:00:00Z' }]);
    expect(await screen.findByText(/noch bis/)).toBeInTheDocument();
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

  it('fuehrt jeden anderen Pfad auf die Uebersicht', async () => {
    zeige([TRAINING], '/patienten/66666666-6666-4666-8666-000000000001');
    expect(await screen.findByRole('heading', { name: 'Guten Tag' })).toBeInTheDocument();
  });

  it('kennt keine Praxisbegriffe', async () => {
    const { container } = zeige([BEHANDLUNG, TRAINING]);
    await screen.findByRole('heading', { name: 'Guten Tag' });
    for (const wort of ['Patient', 'Akte', 'Kalender', 'Dokumentation', 'Befund']) {
      expect(container.textContent).not.toContain(wort);
    }
  });
});

/** Paula begleitet Max (POR-EPIC-001b). */
const BEGLEITUNG: Plattformzugang = {
  ...BEHANDLUNG,
  access_id: 'cafecafe-cafe-4afe-8afe-000000000004',
  access_kind: 'companion',
  represented_name: 'Max Mustermann',
};

describe('Vertretung auf der Plattform (POR-006, POR-007)', () => {
  it('sagt dauerhaft, fuer wen die Begleitung handelt (ADR-023 Punkt 14)', async () => {
    zeige([BEGLEITUNG]);
    expect(
      await screen.findByText(/Einwilligungen gibt nur Max Mustermann selbst/),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sie handeln für Max Mustermann · Begleitung',
    );
    expect(screen.getByText(/Einwilligungen gibt nur Max Mustermann selbst/)).toBeInTheDocument();
  });

  it('fuehrt eigene Bereiche und Vertretungen im Schalter getrennt', async () => {
    const user = userEvent.setup();
    zeige([BEHANDLUNG, BEGLEITUNG]);
    const schalter = screen.getByRole('navigation', { name: 'Bereich' });
    expect(schalter).toHaveTextContent('Behandlung');
    expect(schalter).toHaveTextContent('Für Max Mustermann');
    // Der eigene Bereich zuerst: kein Band.
    expect(screen.queryByText(/Sie handeln für/)).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Für Max Mustermann' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sie handeln für Max Mustermann');
    expect(screen.getByRole('link', { name: 'Für Max Mustermann' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('zeigt unter Ich kein Band und fragt fuer eine Begleitung keine Vertretungen ab', async () => {
    zeige([BEGLEITUNG], '/p/ich');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ich' })).toBeInTheDocument();
    expect(screen.queryByText(/Sie handeln für/)).toBeNull();
    expect(ladeMeineVertretungen).not.toHaveBeenCalled();
  });

  it('zeigt der Person, wer fuer sie Zugang hat, und laesst sie eine Begleitung beenden', async () => {
    ladeMeineVertretungen.mockResolvedValue([
      {
        access_id: 'cafecafe-cafe-4afe-8afe-0000000000d4',
        access_kind: 'companion',
        legal_basis: null,
        representative_name: 'Paula Mustermann',
        status: 'active',
        since: '2026-10-01T08:00:00Z',
        can_end: true,
      },
      {
        access_id: 'cafecafe-cafe-4afe-8afe-0000000000d5',
        access_kind: 'legal_representative',
        legal_basis: 'guardianship',
        representative_name: 'Bernd Betreuer',
        status: 'active',
        since: '2026-10-01T08:00:00Z',
        can_end: false,
      },
    ]);
    const user = userEvent.setup();
    zeige([BEHANDLUNG], '/p/ich');
    expect(
      await screen.findByRole('heading', { name: 'Wer für Sie Zugang hat' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Rechtliche Vertretung (Betreuung)')).toBeInTheDocument();
    expect(screen.getByText('Beenden kann diese Vertretung nur die Praxis.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Begleitung beenden' }));
    expect(screen.getByText(/Damit widerrufen Sie Ihre Einwilligung/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Begleitung beenden' }));
    await waitFor(() =>
      expect(begleitungBeenden).toHaveBeenCalledWith(
        BEHANDLUNG.access_id,
        'cafecafe-cafe-4afe-8afe-0000000000d4',
      ),
    );
  });

  it('zeigt ohne Vertretung keinen Abschnitt', async () => {
    zeige([BEHANDLUNG], '/p/ich');
    await waitFor(() => expect(ladeMeineVertretungen).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /Wer für Sie Zugang hat/ })).toBeNull();
  });

  // POR-016, POR-018 (ANN-261): Einwilligungen und Export unter „Ich".
  it('bietet unter Ich Einwilligungen und den Export an', () => {
    zeige([BEHANDLUNG], '/p/ich');
    expect(screen.getByRole('link', { name: 'Einwilligungen' })).toHaveAttribute(
      'href',
      '/p/einwilligungen?bereich=treatment',
    );
    expect(screen.getByRole('link', { name: 'Meine Daten herunterladen' })).toBeInTheDocument();
  });

  it('nach der Lesefrist: Einwilligungen ja, Export bei der Praxis', () => {
    zeige([{ ...BEHANDLUNG, readable: false, read_until: '2026-09-01T00:00:00Z' }], '/p/ich');
    expect(screen.getByRole('link', { name: 'Einwilligungen' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Meine Daten/ })).toBeNull();
    expect(screen.getByText(/bekommen Sie\s+jetzt bei der Praxis/)).toBeInTheDocument();
  });

  it('einer Begleitung weder Einwilligungen noch Export', () => {
    zeige(
      [{ ...BEHANDLUNG, access_kind: 'companion', represented_name: 'Max Mustermann' }],
      '/p/ich',
    );
    expect(screen.queryByRole('link', { name: /Einwilligungen/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Meine Daten/ })).toBeNull();
  });

  // POR-019 (IDEA-LZK-005): der Einstieg vor der Übersicht.
  it('zeigt den ausstehenden Einstieg vor der Übersicht; Später beendet ihn', async () => {
    const nutzer = userEvent.setup();
    ladeEinstieg.mockResolvedValue({ pending: true, finished_at: null, skipped_at: null });
    zeige([BEHANDLUNG]);
    expect(await screen.findByRole('heading', { name: 'Willkommen' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Guten Tag' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('heading', { name: 'Ihre Einwilligungen' })).toBeInTheDocument();
    expect(screen.getByText(/Sie müssen hier nichts entscheiden/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Später' }));
    await waitFor(() => expect(einstiegBeenden).toHaveBeenCalledWith(BEHANDLUNG.access_id));
  });

  it('einer Begleitung ohne den Schritt Einwilligungen', async () => {
    const nutzer = userEvent.setup();
    ladeEinstieg.mockResolvedValue({ pending: true, finished_at: null, skipped_at: null });
    zeige([{ ...BEHANDLUNG, access_kind: 'companion', represented_name: 'Max Mustermann' }]);
    expect(await screen.findByText('Schritt 1 von 2')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('heading', { name: 'Fertig' })).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Zur Übersicht' }));
    await waitFor(() => expect(einstiegBeenden).toHaveBeenCalled());
  });
});
