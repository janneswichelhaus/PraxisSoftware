import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import { renderWithProviders, testAppointment } from '@/test-utils';
import { NichtAngetroffenAktion } from './NichtAngetroffen';

const recordNoShow = vi.fn();
const fetchAppointment = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  recordNoShow: (...args: unknown[]) => recordNoShow(...args) as Promise<void>,
  fetchAppointment: (id: string) =>
    fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
}));

const termin = testAppointment({
  appointment_type: 'practice',
  patient_given_name: 'Erika',
  patient_family_name: 'Beispiel',
});
/** So kennt die Übersicht den Termin: ohne Bearbeitungsstand. */
const ausDerUebersicht = {
  id: termin.id,
  patient_id: termin.patient_id,
  staff_member_id: termin.staff_member_id,
  starts_at: termin.starts_at,
  organization_time_zone: termin.organization_time_zone,
  patient_given_name: 'Erika',
  patient_family_name: 'Beispiel',
};
const ZUSATZ = 'für Erika Beispiel um 10:00 Uhr';
const NAME = `Ausfall ${ZUSATZ}`;

/** „Ausfall“ wie an einer Zeile der Übersicht (B12, `AusfallKnopf`). */
function alsAusfall(melden: (text: string) => void = () => undefined, stand?: string) {
  renderWithProviders(
    <NichtAngetroffenAktion
      appointment={stand ? { ...ausDerUebersicht, updated_at: stand } : ausDerUebersicht}
      melden={melden}
      ausloeser="Ausfall"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      ausloeserZusatz={ZUSATZ}
      unterDerReihe
    />,
  );
}

describe('„Nicht angetroffen“ am Praxis- und Videotermin (CAL-014c, B12)', () => {
  beforeEach(() => {
    recordNoShow.mockReset();
    recordNoShow.mockResolvedValue(undefined);
    fetchAppointment.mockReset();
    fetchAppointment.mockResolvedValue(termin);
  });

  it('heißt im Terminfenster weiter „Nicht angetroffen“ - dieselbe Rückfrage wie bisher', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NichtAngetroffenAktion appointment={termin} melden={() => undefined} />);
    const knopf = screen.getByRole('button', { name: 'Nicht angetroffen' });
    expect(knopf).toHaveClass('h-12');
    await user.click(knopf);
    const kasten = screen.getByRole('group', { name: 'Nicht angetroffen' });
    expect(kasten).not.toHaveClass('order-last');
    await user.click(within(kasten).getByRole('button', { name: 'Ja, niemand angetroffen' }));
    // Der bekannte Stand wird genommen, ohne nachzulesen.
    await waitFor(() =>
      expect(recordNoShow).toHaveBeenCalledWith(termin.id, termin.updated_at, false),
    );
    expect(fetchAppointment).not.toHaveBeenCalled();
  });

  it('fragt in der Übersicht als „Ausfall“ nach - ohne Protokoll und Gebühr, unter den Knöpfen', async () => {
    const melden = vi.fn();
    const user = userEvent.setup();
    alsAusfall(melden);

    // Leise, 44 px, und für Vorlesesoftware mit dem Termin (UEB-10).
    const knopf = screen.getByRole('button', { name: NAME });
    expect(knopf).toHaveClass('min-h-11', 'text-accent');
    expect(knopf.className).not.toContain('border-line-strong');
    expect(screen.getByText(ZUSATZ)).toHaveClass('sr-only');
    await user.click(knopf);

    // Die Rückfrage der Anwendung: Fläche mit Linie links, kein Kasten - und
    // in der Knopfreihe der Übersicht unter den übrigen Knöpfen.
    const kasten = screen.getByRole('group', { name: NAME });
    expect(kasten).toHaveClass('border-l-4', 'bg-surface-sunken', 'w-full', 'order-last');
    expect(kasten).not.toHaveClass('rounded-card');
    expect(kasten).toHaveTextContent(
      /für Erika Beispiel wird als „nicht angetroffen“ geführt\. Der Zeitraum bleibt belegt\./,
    );
    // Kein Protokoll, keine Forderung (ANN-055).
    expect(within(kasten).queryByRole('checkbox')).toBeNull();
    expect(kasten).not.toHaveTextContent(/Ausfallhonorar/);
    const ja = within(kasten).getByRole('button', { name: 'Ja, niemand angetroffen' });
    expect(ja).toHaveFocus();

    await user.click(ja);
    // Den Stand liest die Aktion unmittelbar vorher - die Tagesliste kennt ihn nicht.
    await waitFor(() =>
      expect(recordNoShow).toHaveBeenCalledWith(termin.id, termin.updated_at, false),
    );
    expect(fetchAppointment).toHaveBeenCalledWith(termin.id);
    await waitFor(() => expect(melden).toHaveBeenCalledWith('Als „nicht angetroffen“ vermerkt.'));
    await waitFor(() => expect(screen.queryByRole('group', { name: NAME })).toBeNull());
  });

  it('nimmt einen schnellen Doppeltipp nur einmal an', async () => {
    let fertig: () => void = () => {};
    recordNoShow.mockReturnValue(
      new Promise<void>((aufloesen) => {
        fertig = aufloesen;
      }),
    );
    const user = userEvent.setup();
    alsAusfall(() => undefined, '2026-10-01T06:00:00Z');
    await user.click(screen.getByRole('button', { name: NAME }));

    const ja = screen.getByRole('button', { name: 'Ja, niemand angetroffen' });
    fireEvent.click(ja);
    fireEvent.click(ja);
    await waitFor(() => expect(recordNoShow).toHaveBeenCalledTimes(1));
    // Bis zur Antwort ist auch „Abbrechen“ gesperrt: Der Aufruf liefe weiter.
    expect(screen.getByRole('button', { name: 'Wird vermerkt …' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeDisabled();
    fertig();
    await waitFor(() => expect(screen.queryByRole('group', { name: NAME })).toBeNull());
    expect(recordNoShow).toHaveBeenCalledTimes(1);
  });

  it('zeigt einen abgewiesenen Vermerk in der Rückfrage und räumt ihn beim Abbrechen weg', async () => {
    recordNoShow.mockRejectedValue(new Error('Der Termin wurde inzwischen geändert.'));
    const user = userEvent.setup();
    alsAusfall(() => undefined, '2026-10-01T06:00:00Z');

    await user.click(screen.getByRole('button', { name: NAME }));
    await user.click(screen.getByRole('button', { name: 'Ja, niemand angetroffen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Der Termin wurde inzwischen geändert.',
    );
    expect(recordNoShow).toHaveBeenCalledWith(termin.id, '2026-10-01T06:00:00Z', false);
    expect(fetchAppointment).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: NAME })).toBeInTheDocument();

    // „Abbrechen“ schließt, gibt den Fokus zurück und vergisst den Fehler.
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    const knopf = screen.getByRole('button', { name: NAME });
    await waitFor(() => expect(knopf).toHaveFocus());
    await user.click(knopf);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
