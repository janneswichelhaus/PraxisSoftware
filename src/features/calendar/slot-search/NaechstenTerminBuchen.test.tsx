import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BuchungsApi from './auto-booking-api';
import type * as TerminApi from '@/features/calendar/appointments/api';
import type * as FolgeterminApi from '@/features/calendar/appointments/folgetermin-api';
import { renderWithProviders } from '@/test-utils';

const bucheNaechstenTermin = vi.fn();
const fetchAppointment = vi.fn();
const cancelAppointment = vi.fn();
const undoAppointmentCreation = vi.fn();

vi.mock('./auto-booking-api', async (importOriginal) => ({
  ...(await importOriginal<typeof BuchungsApi>()),
  bucheNaechstenTermin: (a: BuchungsApi.Buchungsauftrag) =>
    bucheNaechstenTermin(a) as Promise<BuchungsApi.Buchungsergebnis>,
}));
vi.mock('@/features/calendar/appointments/api', async (importOriginal) => ({
  ...(await importOriginal<typeof TerminApi>()),
  fetchAppointment: (id: string) => fetchAppointment(id) as Promise<TerminApi.Appointment | null>,
  cancelAppointment: (id: string, stand: string, grund: string) =>
    cancelAppointment(id, stand, grund) as Promise<void>,
}));
vi.mock('@/features/calendar/appointments/folgetermin-api', async (importOriginal) => ({
  ...(await importOriginal<typeof FolgeterminApi>()),
  undoAppointmentCreation: (id: string, stand: string) =>
    undoAppointmentCreation(id, stand) as Promise<void>,
}));

const { NaechstenTerminBuchen } = await import('./NaechstenTerminBuchen');
const { AufDerPlattformSichtbar } =
  await import('@/features/calendar/appointments/folgetermin-api');

const AUFTRAG: BuchungsApi.Buchungsauftrag = {
  patientId: '66666666-6666-4666-8666-000000000001',
  staffMemberId: null,
  duration: 60,
  from: '2099-10-05',
  to: '2099-10-18',
  windows: [],
  basisId: null,
  waitlistId: null,
};
const TERMIN: BuchungsApi.GebuchterTermin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  person: 's1',
  name: 'Anna Beispiel',
  datum: '2099-10-05',
  beginn: '08:15',
  ende: '09:15',
  gebiet: 'none',
};
const KNOPF = 'Nächsten passenden Termin buchen';

function zeige(auftrag: BuchungsApi.Buchungsauftrag = AUFTRAG) {
  return renderWithProviders(<NaechstenTerminBuchen auftrag={auftrag} />);
}

describe('NaechstenTerminBuchen (ANN-865)', () => {
  beforeEach(() => {
    bucheNaechstenTermin.mockReset();
    fetchAppointment.mockReset();
    cancelAppointment.mockReset();
    undoAppointmentCreation.mockReset();
  });

  it('bucht mit einem Tipp und zeigt Tag, Zeit und Person mit dem Weg in den Kalender', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Gebucht: Mo 05.10.2099, 08:15–09:15 Uhr · Anna Beispiel',
    );
    expect(bucheNaechstenTermin).toHaveBeenCalledWith(AUFTRAG);
    expect(screen.getByRole('link', { name: 'Im Kalender ansehen' })).toHaveAttribute(
      'href',
      `/kalender?termin=${TERMIN.id}`,
    );
    // Der Hauptknopf weicht dem Ergebnis: Ein zweiter Tipp an derselben Stelle bucht nicht noch einmal.
    expect(screen.queryByRole('button', { name: KNOPF })).toBeNull();
    expect(screen.queryByText('Außerhalb des Gebietstags')).toBeNull();
  });

  it('sperrt den Knopf, solange gebucht wird', async () => {
    let fertig: (wert: BuchungsApi.Buchungsergebnis) => void = () => undefined;
    bucheNaechstenTermin.mockReturnValue(
      new Promise<BuchungsApi.Buchungsergebnis>((r) => {
        fertig = r;
      }),
    );
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    const wartend = screen.getByRole('button', { name: 'Wird gebucht …' });
    expect(wartend).toBeDisabled();
    await userEvent.click(wartend);
    expect(bucheNaechstenTermin).toHaveBeenCalledTimes(1);
    fertig({ art: 'kein_platz', ungeprueft: 0 });
    expect(await screen.findByText('Kein passender Platz')).toBeInTheDocument();
  });

  it('kennzeichnet einen Termin außerhalb des Gebietstags', async () => {
    bucheNaechstenTermin.mockResolvedValue({
      art: 'gebucht',
      termin: { ...TERMIN, gebiet: 'outside' },
    });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    expect(await screen.findByText('Außerhalb des Gebietstags')).toBeInTheDocument();
  });

  it('nimmt den Termin zurück und bietet danach wieder den Knopf', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    fetchAppointment.mockResolvedValue({ id: TERMIN.id, updated_at: '2099-10-01T10:00:00Z' });
    undoAppointmentCreation.mockResolvedValue(undefined);
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));

    expect(await screen.findByText('Termin zurückgenommen.')).toBeInTheDocument();
    expect(undoAppointmentCreation).toHaveBeenCalledWith(TERMIN.id, '2099-10-01T10:00:00Z');
    expect(screen.getByRole('button', { name: KNOPF })).toBeEnabled();
    expect(screen.queryByText(/Gebucht:/)).toBeNull();
  });

  it('fragt vor dem Absagen, wenn die Person den Termin schon auf der Plattform sieht (ANN-534)', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    fetchAppointment.mockResolvedValue({ id: TERMIN.id, updated_at: '2099-10-01T10:00:00Z' });
    undoAppointmentCreation.mockRejectedValue(new AufDerPlattformSichtbar());
    cancelAppointment.mockResolvedValue(undefined);
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));

    const frage = await screen.findByRole('group', { name: 'Termin absagen' });
    expect(frage).toHaveTextContent('Die Person sieht Termin und Absage');
    expect(cancelAppointment).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Termin absagen' }));
    expect(await screen.findByText('Termin abgesagt.')).toBeInTheDocument();
    expect(cancelAppointment).toHaveBeenCalledWith(
      TERMIN.id,
      '2099-10-01T10:00:00Z',
      'practice_request',
    );
    expect(screen.getByRole('button', { name: KNOPF })).toBeEnabled();
  });

  it('lässt den Termin stehen, wenn „Behalten“ gewählt wird', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    fetchAppointment.mockResolvedValue({ id: TERMIN.id, updated_at: '2099-10-01T10:00:00Z' });
    undoAppointmentCreation.mockRejectedValue(new AufDerPlattformSichtbar());
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Behalten' }));

    expect(screen.queryByRole('group', { name: 'Termin absagen' })).toBeNull();
    expect(screen.getByText(/Gebucht:/)).toBeInTheDocument();
    expect(cancelAppointment).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeEnabled();
  });

  it('nennt den Grund, wenn sich der Termin nicht zurücknehmen lässt', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    fetchAppointment.mockResolvedValue({ id: TERMIN.id, updated_at: '2099-10-01T10:00:00Z' });
    undoAppointmentCreation.mockRejectedValue(
      new Error('Zurücknehmen kann nur, wer den Termin angelegt hat.'),
    );
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Zurücknehmen kann nur, wer den Termin angelegt hat.',
    );
    expect(screen.getByText(/Gebucht:/)).toBeInTheDocument();
  });

  it('bucht auf Wunsch einen weiteren Termin', async () => {
    bucheNaechstenTermin
      .mockResolvedValueOnce({ art: 'gebucht', termin: TERMIN })
      .mockResolvedValueOnce({
        art: 'gebucht',
        termin: { ...TERMIN, id: 't2', datum: '2099-10-06' },
      });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    await userEvent.click(await screen.findByRole('button', { name: 'Weiteren Termin buchen' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Gebucht: Di 06.10.2099'),
    );
    expect(bucheNaechstenTermin).toHaveBeenCalledTimes(2);
  });

  it('bietet beim Nachrücker der Warteliste nur den Weg in den Kalender', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    zeige({ ...AUFTRAG, waitlistId: 'w1' });
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    expect(await screen.findByRole('link', { name: 'Im Kalender ansehen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Weiteren Termin buchen' })).toBeNull();
  });

  it('sagt, wenn sich an manchen Stellen der Weg nicht prüfen ließ', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'kein_platz', ungeprueft: 2 });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    expect(
      await screen.findByText('Kein passender Platz · Wege teils nicht prüfbar'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: KNOPF })).toBeEnabled();
  });

  it('zeigt den Grund als Fehler, wenn nichts gebucht wurde, und einen offenen Ausgang als Warnung', async () => {
    bucheNaechstenTermin.mockResolvedValueOnce({
      art: 'nichts_gebucht',
      satz: 'Die Fahrzeiten lassen sich gerade nicht berechnen. Nichts gebucht.',
    });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Fahrzeiten lassen sich gerade nicht berechnen. Nichts gebucht.',
    );

    bucheNaechstenTermin.mockResolvedValueOnce({
      art: 'unklar',
      satz: 'Unklar, ob gebucht wurde. Bitte im Kalender nachsehen.',
    });
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Unklar, ob gebucht wurde. Bitte im Kalender nachsehen.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
