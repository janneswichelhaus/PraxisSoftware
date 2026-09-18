import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
});
