import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders } from '@/test-utils';

const fetchHonorar = vi.fn();
const createVereinbarung = vi.fn();
const deleteVereinbarung = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchHonorar: (id: string) => fetchHonorar(id) as Promise<BillingApi.Honorarstand | null>,
    createVereinbarung: (...args: unknown[]) => createVereinbarung(...args) as Promise<void>,
    deleteVereinbarung: (id: string) => deleteVereinbarung(id) as Promise<void>,
  };
});

const { Honorarvereinbarung } = await import('./Honorarvereinbarung');
const { VereinbarungAmSelbenTag } = await import('./api');

const TARIF: BillingApi.Honorarstand = {
  current_cents: 14000,
  current_source: 'tariff',
  current_valid_from: '2026-01-01',
  agreements: [],
};

const VEREINBART: BillingApi.Honorarstand = {
  current_cents: 12000,
  current_source: 'agreement',
  current_valid_from: '2026-05-01',
  agreements: [
    {
      id: 'v1',
      valid_from: '2026-05-01',
      session_fee_cents: 12000,
      created_at: '2026-04-20T10:00:00Z',
      created_by_name: 'Jannes Test',
    },
  ],
};

describe('Honorarvereinbarung (ABR-030)', () => {
  beforeEach(() => {
    fetchHonorar.mockReset();
    createVereinbarung.mockReset();
    deleteVereinbarung.mockReset();
  });

  it('nennt den allgemeinen Tarif, wenn nichts vereinbart ist', async () => {
    fetchHonorar.mockResolvedValue(TARIF);
    renderWithProviders(
      <Honorarvereinbarung patientId="p1" darfFestlegen={false} heute="2026-10-05" />,
    );
    expect(await screen.findByText('140,00 €')).toBeInTheDocument();
    expect(screen.getByText(/allgemeiner Tarif/)).toBeInTheDocument();
    // Ohne Recht kein Knopf - verbindlich prueft der Server.
    expect(screen.queryByRole('button', { name: 'Honorar vereinbaren' })).not.toBeInTheDocument();
  });

  it('nennt die geltende Vereinbarung und wer sie festgelegt hat', async () => {
    fetchHonorar.mockResolvedValue(VEREINBART);
    renderWithProviders(
      <Honorarvereinbarung patientId="p1" darfFestlegen={false} heute="2026-10-05" />,
    );
    expect(await screen.findByText(/vereinbart ab 01.05.2026/)).toBeInTheDocument();
    expect(screen.getByText(/festgelegt von Jannes Test/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entfernen' })).not.toBeInTheDocument();
  });

  it('zeigt nichts, wenn der Server nichts liefert', async () => {
    fetchHonorar.mockResolvedValue(null);
    const { container } = renderWithProviders(
      <Honorarvereinbarung patientId="p1" darfFestlegen heute="2026-10-05" />,
    );
    await vi.waitFor(() => expect(fetchHonorar).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('legt als owner eine Vereinbarung ab einem Tag an', async () => {
    const nutzer = userEvent.setup();
    fetchHonorar.mockResolvedValue(TARIF);
    createVereinbarung.mockResolvedValue(undefined);
    renderWithProviders(<Honorarvereinbarung patientId="p1" darfFestlegen heute="2026-10-05" />);

    await nutzer.click(await screen.findByRole('button', { name: 'Honorar vereinbaren' }));
    expect(screen.getByText(/Schon bestätigte Termine behalten ihr Honorar/)).toBeInTheDocument();
    await nutzer.type(screen.getByLabelText(/Terminhonorar/), '120');
    await nutzer.click(screen.getByRole('button', { name: 'Vereinbarung speichern' }));

    expect(createVereinbarung).toHaveBeenCalledWith('p1', '2026-10-05', 12000);
    expect(await screen.findByText('Vereinbarung gespeichert.')).toBeInTheDocument();
  });

  it('verlangt einen Betrag', async () => {
    const nutzer = userEvent.setup();
    fetchHonorar.mockResolvedValue(TARIF);
    renderWithProviders(<Honorarvereinbarung patientId="p1" darfFestlegen heute="2026-10-05" />);

    await nutzer.click(await screen.findByRole('button', { name: 'Honorar vereinbaren' }));
    await nutzer.click(screen.getByRole('button', { name: 'Vereinbarung speichern' }));

    expect(screen.getByText('Bitte einen Betrag in Euro eingeben.')).toBeInTheDocument();
    expect(createVereinbarung).not.toHaveBeenCalled();
  });

  it('sagt, wenn ab dem Tag schon eine Vereinbarung besteht', async () => {
    const nutzer = userEvent.setup();
    fetchHonorar.mockResolvedValue(VEREINBART);
    createVereinbarung.mockRejectedValue(new VereinbarungAmSelbenTag());
    renderWithProviders(<Honorarvereinbarung patientId="p1" darfFestlegen heute="2026-05-01" />);

    await nutzer.click(await screen.findByRole('button', { name: 'Honorar vereinbaren' }));
    await nutzer.type(screen.getByLabelText(/Terminhonorar/), '130');
    await nutzer.click(screen.getByRole('button', { name: 'Vereinbarung speichern' }));

    expect(await screen.findByText(/gibt es schon eine Vereinbarung/)).toBeInTheDocument();
  });

  it('entfernt eine Vereinbarung erst nach Rueckfrage', async () => {
    const nutzer = userEvent.setup();
    fetchHonorar.mockResolvedValue(VEREINBART);
    deleteVereinbarung.mockResolvedValue(undefined);
    renderWithProviders(<Honorarvereinbarung patientId="p1" darfFestlegen heute="2026-10-05" />);

    await nutzer.click(await screen.findByRole('button', { name: 'Entfernen' }));
    expect(screen.getByText(/an keinem Termin angewandt/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, entfernen' }));

    expect(deleteVereinbarung).toHaveBeenCalledWith('v1');
  });
});
