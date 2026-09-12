import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as Terminmail from './terminmail';
import { renderWithProviders, testPatient } from '@/test-utils';

const eintraege: AppointmentsApi.AppointmentSlipEntry[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    starts_at: '2027-05-12T07:00:00.000Z',
    ends_at: '2027-05-12T08:00:00.000Z',
    appointment_type: 'home_visit',
    location_name: null,
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
    starts_at: '2027-05-19T12:00:00.000Z',
    ends_at: '2027-05-19T13:00:00.000Z',
    appointment_type: 'practice',
    location_name: 'Hauptstandort Tuebingen',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
  },
];

const addAppointmentNotification = vi.fn();
const mailOeffnen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  addAppointmentNotification: (ids: readonly string[], kanal: string) =>
    addAppointmentNotification(ids, kanal) as Promise<number>,
}));

vi.mock('./terminmail', async (importOriginal) => ({
  ...(await importOriginal<typeof Terminmail>()),
  mailOeffnen: (url: string) => mailOeffnen(url) as void,
}));

const { TermineMailen } = await import('./TermineMailen');

const patient = testPatient({
  id: '66666666-6666-4666-8666-000000000001',
  given_name: 'Max',
  family_name: 'Mustermann',
  email: 'max@example.invalid',
});

function rendern(eigener = patient, liste = eintraege) {
  return renderWithProviders(<TermineMailen patient={eigener} eintraege={liste} />);
}

describe('TermineMailen', () => {
  beforeEach(() => {
    addAppointmentNotification.mockReset();
    mailOeffnen.mockReset();
    addAppointmentNotification.mockResolvedValue(2);
  });

  it('bietet den Weg an, oeffnet aber nichts von allein', () => {
    rendern();

    expect(screen.getByRole('button', { name: 'Termine per E-Mail senden' })).toBeInTheDocument();
    expect(mailOeffnen).not.toHaveBeenCalled();
    expect(addAppointmentNotification).not.toHaveBeenCalled();
  });

  it('zeigt den vollstaendigen Text vor der Uebergabe', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));

    expect(screen.getByText('max@example.invalid')).toBeInTheDocument();
    expect(screen.getByText('Ihre nächsten Termine')).toBeInTheDocument();
    const entwurf = screen.getByText(/Guten Tag Max Mustermann/);
    expect(entwurf).toHaveTextContent('Mittwoch, 12. Mai 2027');
    expect(entwurf).toHaveTextContent('09:00–10:00 Uhr · bei Ihnen zu Hause · Anna Beispiel');
    expect(entwurf).toHaveTextContent('Mittwoch, 19. Mai 2027');
    expect(mailOeffnen).not.toHaveBeenCalled();
  });

  it('nennt das Risiko an der Stelle der Entscheidung', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));

    expect(screen.getByText(/nicht verschlüsselt/)).toBeInTheDocument();
    expect(screen.getByText(/ausdrücklich wünscht/)).toBeInTheDocument();
  });

  it('vermerkt zuerst und uebergibt dann ans Mailprogramm', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));
    await user.click(screen.getByRole('button', { name: 'E-Mail öffnen' }));

    await waitFor(() =>
      expect(addAppointmentNotification).toHaveBeenCalledWith(
        eintraege.map((eintrag) => eintrag.id),
        'email',
      ),
    );
    await waitFor(() => expect(mailOeffnen).toHaveBeenCalledTimes(1));

    const url = mailOeffnen.mock.calls[0]?.[0] as string;
    expect(url.startsWith('mailto:max@example.invalid?')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Guten Tag Max Mustermann');
  });

  it('oeffnet nichts, wenn der Vermerk scheitert', async () => {
    addAppointmentNotification.mockRejectedValue(
      new Error('Der Vermerk konnte nicht gespeichert werden.'),
    );
    const user = userEvent.setup();
    rendern();

    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));
    await user.click(screen.getByRole('button', { name: 'E-Mail öffnen' }));

    expect(
      await screen.findByText(/Es wurde nichts geöffnet und nichts vermerkt/),
    ).toBeInTheDocument();
    expect(mailOeffnen).not.toHaveBeenCalled();
  });

  it('sagt nach der Uebergabe, was vermerkt ist und wie man es zuruecknimmt', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));
    await user.click(screen.getByRole('button', { name: 'E-Mail öffnen' }));

    expect(await screen.findByText(/im Mailprogramm geöffnet/)).toBeInTheDocument();
    expect(screen.getByText(/Vermerk am Termin zurück/)).toBeInTheDocument();
  });

  it('laesst den Entwurf abbrechen, ohne etwas zu vermerken', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(screen.queryByText(/Guten Tag Max Mustermann/)).not.toBeInTheDocument();
    expect(addAppointmentNotification).not.toHaveBeenCalled();
    expect(mailOeffnen).not.toHaveBeenCalled();
  });

  it('bietet ohne hinterlegte Adresse keinen Weg an', () => {
    rendern(testPatient({ given_name: 'Max', family_name: 'Mustermann', email: null }));

    expect(
      screen.queryByRole('button', { name: 'Termine per E-Mail senden' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/fehlt die Adresse/)).toBeInTheDocument();
  });

  it('benennt die wegen der Laenge ausgelassenen Termine', async () => {
    const viele = Array.from({ length: 20 }, (_, index) => ({
      ...eintraege[0]!,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000000${String(index + 10)}`,
    }));
    const user = userEvent.setup();
    rendern(patient, viele);

    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));

    expect(screen.getByText(/Es passen nur die nächsten/)).toBeInTheDocument();
    expect(screen.getByText(/stehen auf dem Ausdruck/)).toBeInTheDocument();
  });

  it('vermerkt nur die Termine, die tatsaechlich in der E-Mail stehen', async () => {
    const viele = Array.from({ length: 20 }, (_, index) => ({
      ...eintraege[0]!,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000000${String(index + 10)}`,
    }));
    const user = userEvent.setup();
    rendern(patient, viele);

    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));
    await user.click(screen.getByRole('button', { name: 'E-Mail öffnen' }));

    await waitFor(() => expect(addAppointmentNotification).toHaveBeenCalledTimes(1));
    const vermerkt = addAppointmentNotification.mock.calls[0]?.[0] as string[];
    expect(vermerkt.length).toBeLessThan(20);
    expect(vermerkt).toEqual(viele.slice(0, vermerkt.length).map((eintrag) => eintrag.id));
  });
});
