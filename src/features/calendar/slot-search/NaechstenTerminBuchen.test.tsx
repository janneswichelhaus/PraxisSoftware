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

const { BuchungUnklar, NaechstenTerminBuchen } = await import('./NaechstenTerminBuchen');
const { AufDerPlattformSichtbar } =
  await import('@/features/calendar/appointments/folgetermin-api');

const PATIENT = '66666666-6666-4666-8666-000000000001';
const AUFTRAG: BuchungsApi.Buchungsauftrag = {
  patientId: PATIENT,
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
const HIERHER = `/patienten/${PATIENT}/plaetze?verordnung=b1`;

const onUnklar = vi.fn();

function zeige(auftrag: BuchungsApi.Buchungsauftrag = AUFTRAG) {
  return renderWithProviders(
    <NaechstenTerminBuchen auftrag={auftrag} hierher={HIERHER} onUnklar={onUnklar} />,
  );
}

async function bucheUndNimmZurueck() {
  bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
  fetchAppointment.mockResolvedValue({ id: TERMIN.id, updated_at: '2099-10-01T10:00:00Z' });
  zeige();
  await userEvent.click(screen.getByRole('button', { name: KNOPF }));
  await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
}

describe('NaechstenTerminBuchen (ANN-865)', () => {
  beforeEach(() => {
    bucheNaechstenTermin.mockReset();
    fetchAppointment.mockReset();
    cancelAppointment.mockReset();
    undoAppointmentCreation.mockReset();
    onUnklar.mockReset();
  });

  it('bucht mit einem Tipp und zeigt Tag, Zeit und Person mit dem Weg in den Kalender', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));

    const meldung = await screen.findByRole('status');
    expect(meldung).toHaveTextContent('Gebucht: Mo 05.10.2099, 08:15–09:15 Uhr · Anna Beispiel');
    // Die Meldung steht dort, wo der Knopf war, und nimmt den Fokus.
    await waitFor(() => expect(meldung.parentElement).toHaveFocus());
    expect(bucheNaechstenTermin).toHaveBeenCalledWith(AUFTRAG);
    expect(screen.getByRole('link', { name: 'Im Kalender ansehen' })).toHaveAttribute(
      'href',
      `/kalender?termin=${TERMIN.id}`,
    );
    expect(screen.queryByText('Außerhalb des Gebietstags')).toBeNull();
  });

  it('lässt nach dem Buchen keinen Knopf stehen, der noch einmal bucht', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    await screen.findByText(/Gebucht:/);
    expect(screen.getAllByRole('button').map((k) => k.textContent)).toEqual(['Rückgängig']);
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
    expect(await screen.findByText('Kein Platz mit passendem Fahrweg')).toBeInTheDocument();
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
    undoAppointmentCreation.mockResolvedValue(undefined);
    await bucheUndNimmZurueck();

    const meldung = await screen.findByText('Termin zurückgenommen.');
    // Der Knopf „Rückgängig“ ist fort: Die Rückmeldung nimmt den Fokus.
    await waitFor(() => expect(meldung.parentElement).toHaveFocus());
    expect(undoAppointmentCreation).toHaveBeenCalledWith(TERMIN.id, '2099-10-01T10:00:00Z');
    expect(screen.getByRole('button', { name: KNOPF })).toBeEnabled();
    expect(screen.queryByText(/Gebucht:/)).toBeNull();
  });

  it('fragt vor dem Absagen, wenn die Person den Termin schon auf der Plattform sieht (ANN-534)', async () => {
    undoAppointmentCreation.mockRejectedValue(new AufDerPlattformSichtbar());
    cancelAppointment.mockResolvedValue(undefined);
    await bucheUndNimmZurueck();

    const frage = await screen.findByRole('group', { name: 'Termin absagen' });
    expect(frage).toHaveTextContent('Patient:in sieht Termin und Absage');
    expect(cancelAppointment).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
    // Der Baustein führt den Fokus auf die Bestätigung.
    const absagen = screen.getByRole('button', { name: 'Termin absagen' });
    await waitFor(() => expect(absagen).toHaveFocus());

    await userEvent.click(absagen);
    expect(await screen.findByText('Termin abgesagt.')).toBeInTheDocument();
    expect(cancelAppointment).toHaveBeenCalledWith(
      TERMIN.id,
      '2099-10-01T10:00:00Z',
      'practice_request',
    );
    expect(screen.getByRole('button', { name: KNOPF })).toBeEnabled();
  });

  it('lässt den Termin stehen, wenn „Behalten“ gewählt wird', async () => {
    undoAppointmentCreation.mockRejectedValue(new AufDerPlattformSichtbar());
    await bucheUndNimmZurueck();
    await userEvent.click(await screen.findByRole('button', { name: 'Behalten' }));

    expect(screen.queryByRole('group', { name: 'Termin absagen' })).toBeNull();
    expect(screen.getByText(/Gebucht:/)).toBeInTheDocument();
    expect(cancelAppointment).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rückgängig' })).toHaveFocus());
  });

  it('zeigt in der Rückfrage, warum die Absage scheiterte, und lässt sie offen', async () => {
    undoAppointmentCreation.mockRejectedValue(new AufDerPlattformSichtbar());
    cancelAppointment.mockRejectedValue(new Error('Der Termin wurde inzwischen geändert.'));
    await bucheUndNimmZurueck();
    await userEvent.click(await screen.findByRole('button', { name: 'Termin absagen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Der Termin wurde inzwischen geändert.',
    );
    expect(screen.getByRole('group', { name: 'Termin absagen' })).toBeInTheDocument();
  });

  it('nennt den Grund, wenn sich der Termin nicht zurücknehmen lässt', async () => {
    undoAppointmentCreation.mockRejectedValue(
      new Error('Zurücknehmen kann nur, wer den Termin angelegt hat.'),
    );
    await bucheUndNimmZurueck();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Zurücknehmen kann nur, wer den Termin angelegt hat.',
    );
    expect(screen.getByText(/Gebucht:/)).toBeInTheDocument();
  });

  it('bietet beim Nachrücker der Warteliste nur den Weg in den Kalender', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'gebucht', termin: TERMIN });
    zeige({ ...AUFTRAG, waitlistId: 'w1' });
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    expect(await screen.findByRole('link', { name: 'Im Kalender ansehen' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sagt, wenn sich an manchen Stellen der Weg nicht prüfen ließ', async () => {
    bucheNaechstenTermin.mockResolvedValue({ art: 'kein_platz', ungeprueft: 2 });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    expect(
      await screen.findByText('Kein Platz mit passendem Fahrweg, teils ungeprüft'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: KNOPF })).toBeEnabled();
  });

  it('zeigt den Grund als Fehler, wenn nichts gebucht wurde, und lässt den Knopf stehen', async () => {
    bucheNaechstenTermin.mockResolvedValue({
      art: 'nichts_gebucht',
      satz: 'Die Fahrzeiten lassen sich gerade nicht berechnen. Nichts gebucht.',
      adresse: false,
    });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Fahrzeiten lassen sich gerade nicht berechnen. Nichts gebucht.',
    );
    expect(screen.getByRole('button', { name: KNOPF })).toBeEnabled();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('führt zu den Stammdaten, wenn die Anschrift nicht verortet ist, mit dem Rückweg zur Suche', async () => {
    bucheNaechstenTermin.mockResolvedValue({
      art: 'nichts_gebucht',
      satz: 'Die Anschrift ist noch nicht auf der Karte verortet. Nichts gebucht.',
      adresse: true,
    });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    const link = await screen.findByRole('link', { name: 'Anschrift in den Stammdaten' });
    const [pfad, suche] = (link.getAttribute('href') ?? '').split('?');
    expect(pfad).toBe(`/patienten/${PATIENT}/stammdaten`);
    expect([...new URLSearchParams(suche).values()]).toContain(HIERHER);
  });

  it('meldet einen offenen Ausgang an die Seite', async () => {
    const satz = 'Unklar, ob gebucht wurde. Bitte bei den Terminen der Akte nachsehen.';
    bucheNaechstenTermin.mockResolvedValue({ art: 'unklar', satz });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: KNOPF }));
    await waitFor(() => expect(onUnklar).toHaveBeenCalledWith(satz));
  });

  it('zeigt bei offenem Ausgang keinen Knopf, nur den Weg zu den Terminen der Akte', () => {
    renderWithProviders(
      <BuchungUnklar
        patientId={PATIENT}
        satz="Unklar, ob gebucht wurde. Bitte bei den Terminen der Akte nachsehen."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Unklar, ob gebucht wurde. Bitte bei den Terminen der Akte nachsehen.',
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Termine der Akte ansehen' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/termine`,
    );
  });
});
