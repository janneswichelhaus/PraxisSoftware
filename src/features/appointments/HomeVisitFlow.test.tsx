import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type * as AppointmentsApi from './api';
import type * as TodayApi from '@/features/today/api';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders, testAppointment } from '@/test-utils';
import { TIPPSPERRE_MS } from '@/components/ui/GefuehrterAblauf';
import { HomeVisitFlow } from './HomeVisitFlow';

const recordNoShow = vi.fn();
const fetchAppointment = vi.fn();
const fetchDayPlan = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  recordNoShow: (...args: unknown[]) => recordNoShow(...args) as Promise<void>,
  fetchAppointment: (id: string) =>
    fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
}));
vi.mock('@/features/today/api', async (importOriginal) => ({
  ...(await importOriginal<typeof TodayApi>()),
  fetchDayPlan: (...args: unknown[]) => fetchDayPlan(...args) as Promise<TodayApi.DayPlanEntry[]>,
}));

const termin = testAppointment({ appointment_type: 'home_visit' });
/** So kennt die Übersicht den Termin: ohne Bearbeitungsstand. */
const ausDerUebersicht = {
  id: termin.id,
  patient_id: termin.patient_id,
  staff_member_id: termin.staff_member_id,
  starts_at: termin.starts_at,
  organization_time_zone: termin.organization_time_zone,
};

/** Das Fenster des Ablaufs; sein Name ist die Frage der Seite. */
function fenster(name: string) {
  return screen.getByRole('dialog', { name });
}

/** Nach jedem Seitenwechsel nimmt die Fläche kurz keinen Tipp an (ANN-572). */
async function tippsperreAbwarten() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(TIPPSPERRE_MS + 50);
  });
}

/** Geklingelt und angerufen - danach steht die Wartezeit offen. */
async function bisZurWartezeit() {
  fireEvent.click(
    within(fenster('An der Tür geklingelt?')).getByRole('button', { name: 'Ja, geklingelt' }),
  );
  await tippsperreAbwarten();
  fireEvent.click(
    within(fenster('Angerufen?')).getByRole('button', { name: 'Angerufen, niemand erreicht' }),
  );
  await tippsperreAbwarten();
  return fenster('15 Minuten gewartet?');
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  recordNoShow.mockReset();
  recordNoShow.mockResolvedValue(undefined);
  fetchAppointment.mockReset();
  fetchAppointment.mockResolvedValue(termin);
  fetchDayPlan.mockReset();
  fetchDayPlan.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Niemand öffnet - geführt (G1, ANN-573)', () => {
  it('führt eine Frage je Seite: geklingelt, angerufen, gewartet', async () => {
    renderWithProviders(<HomeVisitFlow appointment={ausDerUebersicht} melden={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    const erste = fenster('An der Tür geklingelt?');
    expect(within(erste).getByText('Schritt 1 von 3')).toBeInTheDocument();
    expect(within(erste).queryByRole('button', { name: '← Zurück' })).toBeNull();
    await pruefeBarrierefreiheit(document.body);

    const wartezeit = await bisZurWartezeit();
    expect(within(wartezeit).getByText('Schritt 3 von 3')).toBeInTheDocument();
    expect(within(wartezeit).getByRole('timer')).toHaveTextContent(/^Gewartet 0:0\d von 15:00$/);
    await pruefeBarrierefreiheit(document.body);
  });

  it('vermerkt erst nach 15 Minuten - die Uhr läuft ab dem ersten Tipp (ANN-479)', async () => {
    renderWithProviders(<HomeVisitFlow appointment={ausDerUebersicht} melden={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    const wartezeit = await bisZurWartezeit();
    const vermerken = within(wartezeit).getByRole('button', { name: /nicht angetroffen/ });
    expect(vermerken).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(within(wartezeit).getByRole('timer')).toHaveTextContent(/^Gewartet 5:0\d von 15:00$/);
    expect(vermerken).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(within(wartezeit).getByRole('timer')).toHaveTextContent('15 Minuten um');
    expect(within(wartezeit).getByRole('button', { name: /nicht angetroffen/ })).toBeEnabled();
  });

  it('vermerkt vorher nur mit „schon vorher gewartet“ und liest den Stand unmittelbar davor', async () => {
    const melden = vi.fn();
    renderWithProviders(<HomeVisitFlow appointment={ausDerUebersicht} melden={melden} />);
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    const wartezeit = await bisZurWartezeit();
    fireEvent.click(
      within(wartezeit).getByRole('checkbox', { name: 'Schon vorher 15 Minuten gewartet' }),
    );
    fireEvent.click(within(wartezeit).getByRole('button', { name: /nicht angetroffen/ }));
    await vi.waitFor(() => expect(recordNoShow).toHaveBeenCalledTimes(1));
    expect(fetchAppointment).toHaveBeenCalledWith(termin.id);
    expect(recordNoShow).toHaveBeenCalledWith(termin.id, termin.updated_at, true);
    await vi.waitFor(() =>
      expect(melden).toHaveBeenCalledWith(
        'Als „nicht angetroffen“ vermerkt – das Ausfallhonorar ist vorgemerkt.',
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lässt die Uhr weiterlaufen, wenn das Fenster zwischendurch zugeht', async () => {
    renderWithProviders(<HomeVisitFlow appointment={ausDerUebersicht} melden={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    fireEvent.click(
      within(fenster('An der Tür geklingelt?')).getByRole('button', { name: 'Abbrechen' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16 * 60 * 1000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    const wartezeit = await bisZurWartezeit();
    expect(within(wartezeit).getByRole('timer')).toHaveTextContent('15 Minuten um');
  });

  it('bietet die Rufnummer als Knopf und „erreicht“ schließt ohne Vermerk', async () => {
    fetchDayPlan.mockResolvedValue([
      {
        id: termin.id,
        patient_phone_mobile: '+49 160 0000005',
        patient_phone: null,
      },
    ]);
    renderWithProviders(<HomeVisitFlow appointment={ausDerUebersicht} melden={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    fireEvent.click(
      within(fenster('An der Tür geklingelt?')).getByRole('button', { name: 'Ja, geklingelt' }),
    );
    await tippsperreAbwarten();
    const anruf = within(fenster('Angerufen?'));
    expect(await anruf.findByRole('link', { name: /Mobil anrufen/ })).toHaveAttribute(
      'href',
      'tel:+491600000005',
    );
    fireEvent.click(anruf.getByRole('button', { name: 'Erreicht – Besuch findet statt' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(recordNoShow).not.toHaveBeenCalled();
  });

  it('führt mit „← Zurück“ einen Schritt zurück', async () => {
    renderWithProviders(<HomeVisitFlow appointment={ausDerUebersicht} melden={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    fireEvent.click(
      within(fenster('An der Tür geklingelt?')).getByRole('button', { name: 'Ja, geklingelt' }),
    );
    await tippsperreAbwarten();
    fireEvent.click(within(fenster('Angerufen?')).getByRole('button', { name: '← Zurück' }));
    expect(fenster('An der Tür geklingelt?')).toBeInTheDocument();
  });

  it('führt in der Übersicht über Wege zu den beiden anderen Fällen (ADR-018 Punkt 9.3)', () => {
    renderWithProviders(
      <HomeVisitFlow
        appointment={ausDerUebersicht}
        melden={() => undefined}
        wege={{ ohneBehandlung: '/ohne', absagen: '/absagen' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Niemand öffnet?' }));
    const erste = within(fenster('An der Tür geklingelt?'));
    expect(erste.getByRole('link', { name: 'Ohne Behandlung festhalten' })).toHaveAttribute(
      'href',
      '/ohne',
    );
    expect(erste.getByRole('link', { name: '„Termin absagen“' })).toHaveAttribute(
      'href',
      '/absagen',
    );
  });
});

describe('„Ausfall“ in der Übersicht (B12)', () => {
  it('heißt am Hausbesuch „Ausfall“, leise an der Zeile, und öffnet denselben Ablauf', () => {
    renderWithProviders(
      <HomeVisitFlow
        appointment={ausDerUebersicht}
        melden={() => undefined}
        ausloeser="Ausfall"
        ausloeserVariante="quiet"
      />,
    );
    const knopf = screen.getByRole('button', { name: 'Ausfall' });
    expect(knopf.className).not.toContain('border-line-strong');
    expect(knopf).toHaveClass('min-h-11');
    fireEvent.click(knopf);
    expect(fenster('An der Tür geklingelt?')).toBeInTheDocument();
    expect(recordNoShow).not.toHaveBeenCalled();
  });

  it('nennt Vorlesesoftware am Knopf, wessen Termin es ist - das Wort zuerst', () => {
    renderWithProviders(
      <HomeVisitFlow
        appointment={ausDerUebersicht}
        melden={() => undefined}
        ausloeser="Ausfall"
        ausloeserZusatz="für Erika Beispiel um 10:00 Uhr"
      />,
    );
    screen.getByRole('button', { name: 'Ausfall für Erika Beispiel um 10:00 Uhr' });
    // Zu sehen ist nur das Wort; der Zusatz steht für Vorlesesoftware.
    expect(screen.getByText('für Erika Beispiel um 10:00 Uhr')).toHaveClass('sr-only');
  });
});
