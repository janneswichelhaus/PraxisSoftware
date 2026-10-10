import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TreatmentBasesApi from './api';
import { renderWithProviders } from '@/test-utils';

const fetchPrescribers = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TreatmentBasesApi>();
  return {
    ...actual,
    fetchPrescribers: () => fetchPrescribers() as Promise<TreatmentBasesApi.Prescriber[]>,
  };
});

const { PrescribersListPage } = await import('./PrescribersListPage');

function verordner(
  id: string,
  rest: Partial<TreatmentBasesApi.Prescriber> = {},
): TreatmentBasesApi.Prescriber {
  return {
    id,
    title: null,
    given_name: null,
    family_name: 'Probst',
    practice_name: null,
    speciality: null,
    street: null,
    house_number: null,
    postal_code: null,
    city: null,
    phone: null,
    fax: null,
    email: null,
    ...rest,
  };
}

describe('PrescribersListPage', () => {
  beforeEach(() => {
    fetchPrescribers.mockReset();
  });

  it('listet Verordner:innen mit Praxis, Fachrichtung und Ort', async () => {
    fetchPrescribers.mockResolvedValue([
      verordner('1', {
        title: 'Dr. med.',
        given_name: 'Petra',
        family_name: 'Probst',
        practice_name: 'Praxis Fiktiv',
        speciality: 'Orthopaedie',
        city: 'Tuebingen',
      }),
    ]);
    renderWithProviders(<PrescribersListPage />);

    expect(await screen.findByText('Dr. med. Petra Probst')).toBeInTheDocument();
    expect(screen.getByText('Praxis Fiktiv · Orthopaedie · Tuebingen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dr\. med\. Petra Probst/ })).toHaveAttribute(
      'href',
      '/verordner/1/bearbeiten',
    );
  });

  it('zeigt Telefon und E-Mail als eigene Links neben der Zeile, das Fax als Text (BEF-060)', async () => {
    fetchPrescribers.mockResolvedValue([
      verordner('1', {
        family_name: 'Probst',
        phone: '+49 7071 123',
        fax: '07071 124',
        email: 'probst@example.invalid',
      }),
    ]);
    renderWithProviders(<PrescribersListPage />);

    expect(await screen.findByRole('link', { name: 'Tel. +49 7071 123' })).toHaveAttribute(
      'href',
      'tel:+497071123',
    );
    expect(screen.getByRole('link', { name: 'probst@example.invalid' })).toHaveAttribute(
      'href',
      'mailto:probst@example.invalid',
    );
    expect(screen.getByText('Fax 07071 124')).toBeInTheDocument();
    // Die Zeile selbst führt weiter zum Bearbeiten.
    expect(screen.getByRole('link', { name: /Probst/ })).toHaveAttribute(
      'href',
      '/verordner/1/bearbeiten',
    );
  });

  it('filtert ueber Name, Praxis und Ort', async () => {
    fetchPrescribers.mockResolvedValue([
      verordner('1', { family_name: 'Probst', city: 'Tuebingen' }),
      verordner('2', { family_name: 'Hausarzt', practice_name: 'Praxis Testdorf' }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<PrescribersListPage />);
    await screen.findByText('Probst');

    await user.type(screen.getByLabelText('Suche'), 'testdorf');

    expect(screen.getByText('Hausarzt')).toBeInTheDocument();
    expect(screen.queryByText('Probst')).not.toBeInTheDocument();
  });

  it('sagt bei leerer Kartei, wo die erste Verordner:in entsteht', async () => {
    fetchPrescribers.mockResolvedValue([]);
    renderWithProviders(<PrescribersListPage />);

    expect(await screen.findByText('Noch keine Verordner:innen')).toBeInTheDocument();
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchPrescribers.mockRejectedValue(new Error('egal'));
    renderWithProviders(<PrescribersListPage />);

    expect(
      await screen.findByText('Die Verordner:innen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/egal/)).not.toBeInTheDocument();
  });

  // WRT-01: ein Satz, was zu tun ist, und ein Weg aus dem Fehler - ohne
  // Ratefrage nach der Anmeldung.
  it('bietet nach einem Ladefehler einen neuen Versuch an', async () => {
    fetchPrescribers
      .mockRejectedValueOnce(new Error('egal'))
      .mockResolvedValue([verordner('1', { family_name: 'Probst' })]);
    const user = userEvent.setup();
    renderWithProviders(<PrescribersListPage />);

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(kasten).not.toHaveTextContent(/angemeldet/);
    await user.click(within(kasten).getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText('Probst')).toBeInTheDocument();
  });

  // VER-09: Gekürzt verschwand am Ende genau der Nachname.
  it('bricht lange Namen um, statt sie abzuschneiden', async () => {
    fetchPrescribers.mockResolvedValue([
      verordner('1', {
        title: 'Prof. Dr. med. habil.',
        given_name: 'Maria-Theresia',
        family_name: 'Müller-Lüdenscheidt-Freifrau-von-Beispiel',
      }),
    ]);
    renderWithProviders(<PrescribersListPage />);

    const name = await screen.findByText(
      'Prof. Dr. med. habil. Maria-Theresia Müller-Lüdenscheidt-Freifrau-von-Beispiel',
    );
    expect(name).not.toHaveClass('truncate');
    expect(name).toHaveClass('break-words');
  });
});
