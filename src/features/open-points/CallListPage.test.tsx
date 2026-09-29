import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as CallApi from './call-list-api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchCallList = vi.fn();
const recordCallOutcome = vi.fn();

vi.mock('./call-list-api', async (importOriginal) => ({
  ...(await importOriginal<typeof CallApi>()),
  fetchCallList: (datum: string) => fetchCallList(datum) as Promise<CallApi.CallEntry[]>,
  recordCallOutcome: (id: string, outcome: CallApi.CallOutcome) =>
    recordCallOutcome(id, outcome) as Promise<void>,
}));

const { CallListPage } = await import('./CallListPage');
const { CallsSummary } = await import('./CallsSummary');

function eintrag(rest: Partial<CallApi.CallEntry> = {}): CallApi.CallEntry {
  return {
    appointment_id: 'a1',
    starts_at: '2031-03-11T08:00:00.000Z',
    ends_at: '2031-03-11T08:45:00.000Z',
    appointment_type: 'home_visit',
    location_name: null,
    staff_name: 'Anna Beispiel',
    patient_id: '66666666-6666-4666-8666-000000000001',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    phone: '+49 7071 0000005',
    phone_mobile: null,
    notified_channels: [],
    call_outcome: null,
    call_attempts: null,
    call_recorded_at: null,
    call_recorded_by_name: null,
    organization_time_zone: 'Europe/Berlin',
    ...rest,
  };
}

describe('Anrufliste (PRX-014)', () => {
  beforeEach(() => {
    fetchCallList.mockReset();
    recordCallOutcome.mockReset().mockResolvedValue(undefined);
  });

  it('trennt Anzurufende von schon Mitgeteilten und bietet die Nummer als Anruf an', async () => {
    fetchCallList.mockResolvedValue([
      eintrag(),
      eintrag({
        appointment_id: 'a2',
        patient_given_name: 'Erika',
        patient_family_name: 'Beispiel',
        notified_channels: ['slip'],
      }),
    ]);
    renderWithProviders(
      <CallListPage user={testUser(['office'])} />,
      '/offen/anrufe?datum=2031-03-11',
    );

    const anrufen = await screen.findByRole('heading', { name: 'Anzurufen (1)' });
    const liste = anrufen.closest('section')!;
    expect(within(liste).getByRole('link', { name: 'Max Mustermann' })).toBeInTheDocument();
    expect(within(liste).getByRole('link', { name: /Tel\./ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^tel:/),
    );
    expect(screen.getByRole('heading', { name: 'Schon mitgeteilt (1)' })).toBeInTheDocument();
    expect(screen.getByText('Mitgeteilt: Zettel')).toBeInTheDocument();
    expect(fetchCallList).toHaveBeenCalledWith('2031-03-11');
  });

  it('vermerkt das Ergebnis eines Anrufs', async () => {
    fetchCallList.mockResolvedValue([eintrag()]);
    const user = userEvent.setup();
    renderWithProviders(
      <CallListPage user={testUser(['office'])} />,
      '/offen/anrufe?datum=2031-03-11',
    );

    const gruppe = await screen.findByRole('group', { name: 'Anruf bei Max Mustermann' });
    await user.click(within(gruppe).getByRole('button', { name: 'Nicht erreicht' }));
    await waitFor(() => expect(recordCallOutcome).toHaveBeenCalledWith('a1', 'not_reached'));
    await user.click(within(gruppe).getByRole('button', { name: 'Erreicht, bestätigt' }));
    await waitFor(() => expect(recordCallOutcome).toHaveBeenCalledWith('a1', 'reached'));
  });

  it('zeigt den gespeicherten Stand mit Zahl der Versuche und bietet das Zuruecksetzen an', async () => {
    fetchCallList.mockResolvedValue([
      eintrag({
        call_outcome: 'voicemail',
        call_attempts: 2,
        call_recorded_by_name: 'Olivia Office',
      }),
    ]);
    renderWithProviders(
      <CallListPage user={testUser(['office'])} />,
      '/offen/anrufe?datum=2031-03-11',
    );
    expect(await screen.findByText('Nachricht hinterlassen (2×)')).toBeInTheDocument();
    expect(screen.getByText(/zuletzt angerufen von Olivia Office/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zurücksetzen' })).toBeInTheDocument();
  });

  it('blaettert tageweise', async () => {
    fetchCallList.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(
      <CallListPage user={testUser(['office'])} />,
      '/offen/anrufe?datum=2031-03-11',
    );
    await screen.findByText('An diesem Tag stehen keine Behandlungstermine.');
    await user.click(screen.getByRole('button', { name: 'Nächster Tag' }));
    await waitFor(() => expect(fetchCallList).toHaveBeenCalledWith('2031-03-12'));
  });
});

describe('CallsSummary', () => {
  it('zaehlt, was morgen noch nicht mitgeteilt ist, und fuehrt zur Liste', async () => {
    fetchCallList
      .mockReset()
      .mockResolvedValue([
        eintrag(),
        eintrag({ appointment_id: 'a2', notified_channels: ['phone'] }),
      ]);
    renderWithProviders(<CallsSummary today="2031-03-10" />);
    expect(await screen.findByText('1 von 2 Terminen noch nicht mitgeteilt.')).toBeInTheDocument();
    expect(fetchCallList).toHaveBeenCalledWith('2031-03-11');
    expect(screen.getByRole('link', { name: 'Anrufliste öffnen' })).toHaveAttribute(
      'href',
      '/offen/anrufe?datum=2031-03-11',
    );
  });
});
