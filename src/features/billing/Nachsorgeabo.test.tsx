import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as NachsorgeApi from './nachsorge-api';
import { renderWithProviders } from '@/test-utils';

const fetchNachsorge = vi.fn();
const createNachsorge = vi.fn();
const deleteNachsorge = vi.fn();

vi.mock('./nachsorge-api', async (importOriginal) => {
  const actual = await importOriginal<typeof NachsorgeApi>();
  return {
    ...actual,
    fetchNachsorge: (id: string) =>
      fetchNachsorge(id) as Promise<NachsorgeApi.Nachsorgesicht | null>,
    createNachsorge: (...args: unknown[]) => createNachsorge(...args) as Promise<void>,
    deleteNachsorge: (id: string) => deleteNachsorge(id) as Promise<void>,
  };
});

const { Nachsorgeabo } = await import('./Nachsorgeabo');

const LAUFEND: NachsorgeApi.Nachsorgeabo = {
  id: 'a1',
  starts_on: '2026-10-01',
  ends_on: null,
  created_at: '2026-09-30T10:00:00Z',
  created_by_name: 'Olivia Office',
  cancelled_on: null,
  cancelled_via: null,
  cancelled_access_kind: null,
  cancelled_representative_name: null,
  current_month_end: '2026-10-31',
  next_month_start: '2026-11-01',
};

function sicht(teil: Partial<NachsorgeApi.Nachsorgesicht> = {}): NachsorgeApi.Nachsorgesicht {
  return { today: '2026-10-07', earliest_start: '2026-09-30', subscriptions: [], ...teil };
}

describe('Nachsorge-Abo in der Akte (ANG-001)', () => {
  beforeEach(() => {
    fetchNachsorge.mockReset();
    createNachsorge.mockReset();
    deleteNachsorge.mockReset();
  });

  it('sagt vor dem Abschluss der Versorgung, was zu tun ist (ANN-268)', async () => {
    fetchNachsorge.mockResolvedValue(sicht({ earliest_start: null }));
    renderWithProviders(<Nachsorgeabo patientId="p1" />);
    expect(await screen.findByText(/erst die Versorgung abschließen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abo anlegen' })).not.toBeInTheDocument();
  });

  it('legt ein Abo ab dem gewählten Tag an', async () => {
    fetchNachsorge.mockResolvedValue(sicht());
    createNachsorge.mockResolvedValue(undefined);
    renderWithProviders(<Nachsorgeabo patientId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abo anlegen' }));
    const feld = screen.getByLabelText('Beginn');
    expect(feld).toHaveValue('2026-10-07');
    await userEvent.clear(feld);
    await userEvent.type(feld, '2026-10-15');
    await userEvent.click(screen.getAllByRole('button', { name: 'Abo anlegen' }).at(-1)!);
    expect(createNachsorge).toHaveBeenCalledWith('p1', '2026-10-15');
    expect(await screen.findByText('Abo angelegt.')).toBeInTheDocument();
  });

  it('weist einen Beginn vor dem Abschluss schon im Formular ab', async () => {
    fetchNachsorge.mockResolvedValue(sicht());
    renderWithProviders(<Nachsorgeabo patientId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abo anlegen' }));
    const feld = screen.getByLabelText('Beginn');
    await userEvent.clear(feld);
    await userEvent.type(feld, '2026-09-01');
    await userEvent.click(screen.getAllByRole('button', { name: 'Abo anlegen' }).at(-1)!);
    expect(await screen.findByText(/Frühestens ab 30.09.2026/)).toBeInTheDocument();
    expect(createNachsorge).not.toHaveBeenCalled();
  });

  it('zeigt das laufende Abo und bietet kein zweites an', async () => {
    fetchNachsorge.mockResolvedValue(sicht({ subscriptions: [LAUFEND] }));
    renderWithProviders(<Nachsorgeabo patientId="p1" />);
    expect(await screen.findByText(/Läuft seit 01.10.2026/)).toBeInTheDocument();
    expect(screen.getByText(/Nächster Abo-Monat ab 01.11.2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abo anlegen' })).not.toBeInTheDocument();
  });

  it('nennt eine Kündigung über die Plattform mit ihrer Herkunft', async () => {
    fetchNachsorge.mockResolvedValue(
      sicht({
        subscriptions: [
          {
            ...LAUFEND,
            ends_on: '2026-10-31',
            cancelled_on: '2026-10-07',
            cancelled_via: 'platform',
            cancelled_access_kind: 'legal_representative',
            cancelled_representative_name: 'Paul Betreuer',
            current_month_end: null,
            next_month_start: null,
          },
        ],
      }),
    );
    renderWithProviders(<Nachsorgeabo patientId="p1" />);
    expect(await screen.findByText(/01.10.2026 bis 31.10.2026/)).toBeInTheDocument();
    expect(
      screen.getByText(/über die Plattform von Paul Betreuer \(rechtliche Vertretung\)/),
    ).toBeInTheDocument();
    // Nach dem Ende darf ein neues angelegt werden.
    expect(screen.getByRole('button', { name: 'Abo anlegen' })).toBeInTheDocument();
  });

  it('zeigt nichts, wenn der Server nichts liefert', async () => {
    fetchNachsorge.mockResolvedValue(null);
    const { container } = renderWithProviders(<Nachsorgeabo patientId="p1" />);
    await vi.waitFor(() => expect(fetchNachsorge).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
