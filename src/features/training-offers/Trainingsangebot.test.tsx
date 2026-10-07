import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AngebotApi from './api';
import { renderWithProviders } from '@/test-utils';

const fetchAngebote = vi.fn();
const fetchAngebotspakete = vi.fn();
const createAngebot = vi.fn();
const withdrawAngebot = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AngebotApi>();
  return {
    ...actual,
    fetchAngebote: (id: string) => fetchAngebote(id) as Promise<AngebotApi.Angebotssicht | null>,
    fetchAngebotspakete: (tag: string) =>
      fetchAngebotspakete(tag) as Promise<AngebotApi.Angebotspaket[]>,
    createAngebot: (angebot: AngebotApi.NeuesAngebot) => createAngebot(angebot) as Promise<void>,
    withdrawAngebot: (id: string) => withdrawAngebot(id) as Promise<void>,
  };
});

const { Trainingsangebot } = await import('./Trainingsangebot');

const OFFEN: AngebotApi.Trainingsangebot = {
  id: 'o1',
  state: 'open',
  label: 'Trainingspaket 3 Monate',
  package_months: 3,
  price_cents: 39000,
  currency: 'EUR',
  starts_on: '2026-10-20',
  valid_until: '2026-10-20',
  handover_items: [{ title: 'Belastungsgrenzen', body: 'Keine Sprünge.' }],
  offers_contact: true,
  created_at: '2026-10-07T10:00:00Z',
  created_by_name: 'Anna Beispiel',
  withdrawn_at: null,
  accepted_at: null,
};

function sicht(teil: Partial<AngebotApi.Angebotssicht> = {}): AngebotApi.Angebotssicht {
  return {
    today: '2026-10-07',
    care_concluded_on: null,
    has_own_access: true,
    offers: [],
    ...teil,
  };
}

describe('Training nach der Behandlung in der Akte (KND-002)', () => {
  beforeEach(() => {
    fetchAngebote.mockReset();
    fetchAngebotspakete.mockReset();
    createAngebot.mockReset();
    withdrawAngebot.mockReset();
    fetchAngebotspakete.mockResolvedValue([
      {
        catalog_item_id: 'tp3',
        label: 'Trainingspaket 3 Monate',
        package_months: 3,
        unit_price_cents: 39000,
        currency: 'EUR',
      },
    ]);
  });

  it('hält ein Angebot mit Paket, Beginn und Übergabeangabe fest', async () => {
    fetchAngebote.mockResolvedValue(sicht());
    createAngebot.mockResolvedValue(undefined);
    renderWithProviders(<Trainingsangebot patientId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Training anbieten' }));
    const beginn = screen.getByLabelText('Beginn');
    await userEvent.clear(beginn);
    await userEvent.type(beginn, '2026-10-20');
    await screen.findByRole('option', { name: /Trainingspaket 3 Monate/ });
    await userEvent.selectOptions(screen.getByLabelText('Paket'), 'tp3');
    await userEvent.click(screen.getByRole('button', { name: 'Angabe hinzufügen' }));
    await userEvent.type(screen.getByLabelText('Überschrift 1'), 'Belastungsgrenzen');
    await userEvent.type(screen.getByLabelText('Text 1'), 'Keine Sprünge.');
    await userEvent.click(screen.getByLabelText(/Kontaktdaten der Akte/));
    await userEvent.click(screen.getByRole('button', { name: 'Angebot festhalten' }));
    expect(createAngebot).toHaveBeenCalledWith({
      patientId: 'p1',
      paketId: 'tp3',
      beginn: '2026-10-20',
      uebergabe: [{ title: 'Belastungsgrenzen', body: 'Keine Sprünge.' }],
      kontakt: false,
    });
    expect(await screen.findByText(/Angebot festgehalten/)).toBeInTheDocument();
  });

  it('verlangt Paket und gefüllte Angaben, bevor es speichert', async () => {
    fetchAngebote.mockResolvedValue(sicht());
    renderWithProviders(<Trainingsangebot patientId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Training anbieten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Angabe hinzufügen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Angebot festhalten' }));
    expect(await screen.findByText('Bitte ein Paket wählen.')).toBeInTheDocument();
    expect(screen.getByText('Bitte eine Überschrift.')).toBeInTheDocument();
    expect(screen.getByText('Bitte einen Text.')).toBeInTheDocument();
    expect(createAngebot).not.toHaveBeenCalled();
  });

  it('bietet höchstens fünf Angaben an (ANN-283)', async () => {
    fetchAngebote.mockResolvedValue(sicht());
    renderWithProviders(<Trainingsangebot patientId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Training anbieten' }));
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Angabe hinzufügen' }));
    }
    expect(screen.queryByRole('button', { name: 'Angabe hinzufügen' })).not.toBeInTheDocument();
  });

  it('sagt, dass die Person ein eigenes Konto braucht', async () => {
    fetchAngebote.mockResolvedValue(sicht({ has_own_access: false }));
    renderWithProviders(<Trainingsangebot patientId="p1" />);
    expect(await screen.findByText(/zuerst unter „Plattform“ einladen/)).toBeInTheDocument();
  });

  it('zeigt das offene Angebot, bietet kein zweites an und zieht zurück', async () => {
    fetchAngebote.mockResolvedValue(sicht({ offers: [OFFEN] }));
    withdrawAngebot.mockResolvedValue(undefined);
    renderWithProviders(<Trainingsangebot patientId="p1" />);
    const gruppe = await screen.findByRole('group', { name: 'Training nach der Behandlung' });
    expect(within(gruppe).getByText(/Offen bis 20.10.2026/)).toBeInTheDocument();
    expect(
      within(gruppe).getByText(/Zur Übernahme angeboten: Belastungsgrenzen, Kontaktdaten/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Training anbieten' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zurückziehen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ja, zurückziehen' }));
    expect(withdrawAngebot).toHaveBeenCalledWith('o1');
  });

  it('nennt ein angenommenes Angebot mit Tag und nichts aus dem Training (ANN-285)', async () => {
    fetchAngebote.mockResolvedValue(
      sicht({ offers: [{ ...OFFEN, state: 'accepted', accepted_at: '2026-10-09T08:00:00Z' }] }),
    );
    renderWithProviders(<Trainingsangebot patientId="p1" />);
    expect(await screen.findByText(/Angenommen am 09.10.2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurückziehen' })).not.toBeInTheDocument();
  });

  it('zeigt nichts, wenn der Server nichts liefert', async () => {
    fetchAngebote.mockResolvedValue(null);
    const { container } = renderWithProviders(<Trainingsangebot patientId="p1" />);
    await vi.waitFor(() => expect(fetchAngebote).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
