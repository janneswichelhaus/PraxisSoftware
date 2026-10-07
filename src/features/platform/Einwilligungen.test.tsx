import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Einwilligung, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * „Ich → Einwilligungen" (POR-016; ADR-023 Punkt 13; DSN-001 D2): Stand in
 * Worten, eine Handlung je Zweck, beides mit Rückfrage; nach der Lesefrist
 * nur noch widerrufen.
 */

const ladeEinwilligungen = vi.fn();
const einwilligungSchreiben = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeEinwilligungen: (...args: unknown[]) =>
    ladeEinwilligungen(...args) as Promise<Einwilligung[]>,
  einwilligungSchreiben: (...args: unknown[]) => einwilligungSchreiben(...args) as Promise<void>,
}));

const { Einwilligungen } = await import('./Einwilligungen');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

function stand(
  purpose: Einwilligung['purpose'],
  state: Einwilligung['state'],
  extra: Partial<Einwilligung> = {},
): Einwilligung {
  return {
    purpose,
    state,
    occurred_on: state === 'open' ? null : '2026-10-06',
    source: state === 'open' ? null : 'platform',
    can_grant: true,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  einwilligungSchreiben.mockResolvedValue(undefined);
});

describe('Einwilligungen (POR-016)', () => {
  it('zeigt Text und Stand in Worten und willigt erst nach der Rückfrage ein', async () => {
    const nutzer = userEvent.setup();
    ladeEinwilligungen.mockResolvedValue([
      stand('email_contact', 'open'),
      stand('prescriber_report', 'granted', { source: 'practice' }),
      stand('patient_photos', 'refused', { source: 'practice' }),
    ]);
    renderWithProviders(<Einwilligungen zugang={ZUGANG} />);

    expect(await screen.findByText('Nachrichten per E-Mail')).toBeInTheDocument();
    expect(screen.getByText('Noch nicht entschieden')).toBeInTheDocument();
    expect(screen.getByText(/Erteilt am .* \(in der Praxis vermerkt\)/)).toBeInTheDocument();
    expect(screen.getByText(/Abgelehnt am/)).toBeInTheDocument();
    expect(screen.getByText(/Ihre Behandlung hängt nicht davon ab/)).toBeInTheDocument();

    const knoepfe = screen.getAllByRole('button', { name: 'Einwilligen' });
    expect(knoepfe).toHaveLength(2);
    await nutzer.click(knoepfe[0]!);
    expect(einwilligungSchreiben).not.toHaveBeenCalled();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, ich willige ein' }));
    await waitFor(() =>
      expect(einwilligungSchreiben).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        zweck: 'email_contact',
        erteilen: true,
        fassung: '2026-10',
      }),
    );
  });

  it('sagt beim Widerruf der Fotos, dass sie sofort gelöscht werden', async () => {
    const nutzer = userEvent.setup();
    ladeEinwilligungen.mockResolvedValue([stand('patient_photos', 'granted')]);
    renderWithProviders(<Einwilligungen zugang={ZUGANG} />);

    await nutzer.click(await screen.findByRole('button', { name: 'Widerrufen' }));
    expect(screen.getByText(/löscht dann sofort alle Fotos/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, widerrufen' }));
    await waitFor(() =>
      expect(einwilligungSchreiben).toHaveBeenCalledWith(
        expect.objectContaining({ zweck: 'patient_photos', erteilen: false }),
      ),
    );
  });

  it('zeigt eine Abweisung des Servers als Satz und bleibt offen', async () => {
    const nutzer = userEvent.setup();
    ladeEinwilligungen.mockResolvedValue([stand('email_contact', 'open')]);
    einwilligungSchreiben.mockRejectedValue(new Error('Der Text hat sich geändert.'));
    renderWithProviders(<Einwilligungen zugang={ZUGANG} />);

    await nutzer.click(await screen.findByRole('button', { name: 'Einwilligen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, ich willige ein' }));
    expect(await screen.findByText('Der Text hat sich geändert.')).toBeInTheDocument();
  });

  it('nach der Lesefrist: nur noch widerrufen (D2, ANN-261)', async () => {
    ladeEinwilligungen.mockResolvedValue([
      stand('email_contact', 'granted', { can_grant: false }),
      stand('prescriber_report', 'open', { can_grant: false }),
    ]);
    renderWithProviders(<Einwilligungen zugang={{ ...ZUGANG, readable: false }} />);

    expect(await screen.findByRole('button', { name: 'Widerrufen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einwilligen' })).not.toBeInTheDocument();
    expect(screen.getByText(/einwilligen nicht mehr/)).toBeInTheDocument();
  });

  it('rechtliche Vertretung: sagt, für wen entschieden wird', async () => {
    ladeEinwilligungen.mockResolvedValue([stand('email_contact', 'open')]);
    renderWithProviders(
      <Einwilligungen
        zugang={{
          ...ZUGANG,
          access_kind: 'legal_representative',
          represented_name: 'Max Mustermann',
        }}
      />,
    );
    expect(await screen.findByText(/Sie entscheiden hier für Max Mustermann/)).toBeInTheDocument();
  });

  it('ohne Recht (leere Antwort): sagt, wer entscheidet', async () => {
    ladeEinwilligungen.mockResolvedValue([]);
    renderWithProviders(<Einwilligungen zugang={ZUGANG} />);
    expect(
      await screen.findByText(/entscheiden die Person selbst oder ihre rechtliche Vertretung/),
    ).toBeInTheDocument();
  });
});
