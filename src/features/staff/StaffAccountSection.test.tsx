import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as KontoApi from './konto-api';
import { renderWithProviders, testStaffMember } from '@/test-utils';

const anna = testStaffMember({
  work_phone: '+49 7071 0000102',
});

const fetchStaffAccount = vi.fn();
const fetchStaffInvitations = vi.fn();
const ladeZugangEin = vi.fn();
const widerrufeEinladung = vi.fn();
const sendeZugangsMail = vi.fn();
const setzeRollen = vi.fn();
const setzeZugangAktiv = vi.fn();
const stosseKennwortZuruecksetzenAn = vi.fn();

vi.mock('./konto-api', async (importOriginal) => {
  const actual = await importOriginal<typeof KontoApi>();
  return {
    ...actual,
    fetchStaffAccount: (id: string) => fetchStaffAccount(id) as Promise<KontoApi.StaffAccount>,
    fetchStaffInvitations: (id: string) =>
      fetchStaffInvitations(id) as Promise<KontoApi.StaffInvitation[]>,
    ladeZugangEin: (id: string, mail: string, rollen: readonly string[]) =>
      ladeZugangEin(id, mail, rollen) as Promise<void>,
    widerrufeEinladung: (id: string) => widerrufeEinladung(id) as Promise<void>,
    sendeZugangsMail: (mail: string) => sendeZugangsMail(mail) as Promise<void>,
    setzeRollen: (id: string, rollen: readonly string[]) =>
      setzeRollen(id, rollen) as Promise<void>,
    setzeZugangAktiv: (id: string, aktiv: boolean) => setzeZugangAktiv(id, aktiv) as Promise<void>,
    stosseKennwortZuruecksetzenAn: (id: string) =>
      stosseKennwortZuruecksetzenAn(id) as Promise<void>,
  };
});

const { StaffAccountSection } = await import('./StaffAccountSection');
const { EinladungsError, ZugangsError } = await import('./konto-api');

const offeneEinladung: KontoApi.StaffInvitation = {
  id: '99999999-9999-4999-8999-0000000000e1',
  staff_member_id: anna.id,
  email: 'nina.neu@praxis.invalid',
  role_keys: ['therapist'],
  status: 'pending',
  expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  created_at: new Date().toISOString(),
};

const mitZugang: KontoApi.StaffAccount = {
  staff_member_id: anna.id,
  user_id: '11111111-1111-4111-8111-000000000002',
  account_active: true,
  role_keys: ['therapist'],
};

const ohneZugang: KontoApi.StaffAccount = {
  staff_member_id: anna.id,
  user_id: null,
  account_active: null,
  role_keys: null,
};

describe('StaffAccountSection', () => {
  beforeEach(() => {
    for (const mock of [
      fetchStaffAccount,
      fetchStaffInvitations,
      ladeZugangEin,
      widerrufeEinladung,
      sendeZugangsMail,
      setzeRollen,
      setzeZugangAktiv,
      stosseKennwortZuruecksetzenAn,
    ]) {
      mock.mockReset();
    }
    setzeRollen.mockResolvedValue(undefined);
    setzeZugangAktiv.mockResolvedValue(undefined);
    stosseKennwortZuruecksetzenAn.mockResolvedValue(undefined);
    fetchStaffAccount.mockResolvedValue(ohneZugang);
    fetchStaffInvitations.mockResolvedValue([]);
    ladeZugangEin.mockResolvedValue('kein_konto');
    widerrufeEinladung.mockResolvedValue(undefined);
    sendeZugangsMail.mockResolvedValue('gesendet');
  });

  it('belegt die Adresse aus der dienstlichen E-Mail vor, die Rollen aber nicht', async () => {
    renderWithProviders(<StaffAccountSection staff={anna} />);

    expect(await screen.findByLabelText('E-Mail-Adresse für den Zugang')).toHaveValue(
      'anna.beispiel@praxis.invalid',
    );
    // Eine Rolle zu vergeben ist Berechtigungsvergabe - nichts davon ist
    // vorbelegt (ADR-004).
    for (const rolle of ['Therapeut:in', 'Teamleitung', 'Praxismanagement', 'Praxisinhaber']) {
      expect(screen.getByRole('checkbox', { name: rolle })).not.toBeChecked();
    }
  });

  it('verlangt mindestens eine Rolle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('button', { name: 'Zugang einladen' }));

    expect(await screen.findByText('Bitte mindestens eine Rolle wählen.')).toBeInTheDocument();
    expect(ladeZugangEin).not.toHaveBeenCalled();
  });

  it('verlangt eine brauchbare Adresse', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    const feld = await screen.findByLabelText('E-Mail-Adresse für den Zugang');
    await user.clear(feld);
    await user.type(feld, 'kein-at-zeichen');
    await user.click(screen.getByRole('button', { name: 'Zugang einladen' }));

    expect(
      await screen.findByText('Bitte eine gültige E-Mail-Adresse angeben.'),
    ).toBeInTheDocument();
    expect(ladeZugangEin).not.toHaveBeenCalled();
  });

  it('lädt mit den gewählten Rollen ein', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('checkbox', { name: 'Therapeut:in' }));
    await user.click(screen.getByRole('checkbox', { name: 'Teamleitung' }));
    await user.click(screen.getByRole('button', { name: 'Zugang einladen' }));

    await waitFor(() => expect(ladeZugangEin).toHaveBeenCalledTimes(1));
    expect(ladeZugangEin).toHaveBeenCalledWith(anna.id, 'anna.beispiel@praxis.invalid', [
      'therapist',
      'team_lead',
    ]);
  });

  it('erklärt eine abgewiesene Einladung, statt nur zu scheitern', async () => {
    const user = userEvent.setup();
    ladeZugangEin.mockRejectedValue(new EinladungsError('email_already_in_use'));
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('checkbox', { name: 'Praxismanagement' }));
    await user.click(screen.getByRole('button', { name: 'Zugang einladen' }));

    expect(
      await screen.findByText('Diese E-Mail-Adresse gehört bereits zu einem Zugang dieser Praxis.'),
    ).toBeInTheDocument();
  });

  it('zeigt eine offene Einladung mit Adresse, Rollen und Frist', async () => {
    fetchStaffInvitations.mockResolvedValue([offeneEinladung]);
    renderWithProviders(<StaffAccountSection staff={anna} />);

    expect(await screen.findByText('nina.neu@praxis.invalid')).toBeInTheDocument();
    expect(screen.getByText('Therapeut:in')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anmeldemail senden' })).toBeInTheDocument();
    // Kein zweites Formular, solange eine Einladung offen ist.
    expect(screen.queryByRole('button', { name: 'Zugang einladen' })).not.toBeInTheDocument();
  });

  it('nimmt eine Einladung erst nach der Rückfrage zurück', async () => {
    const user = userEvent.setup();
    fetchStaffInvitations.mockResolvedValue([offeneEinladung]);
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('button', { name: 'Einladung zurücknehmen' }));
    expect(widerrufeEinladung).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    await waitFor(() => expect(widerrufeEinladung).toHaveBeenCalledWith(offeneEinladung.id));
  });

  it('kennzeichnet eine abgelaufene Einladung und bietet kein erneutes Senden an', async () => {
    fetchStaffInvitations.mockResolvedValue([
      { ...offeneEinladung, expires_at: new Date(Date.now() - 86_400_000).toISOString() },
    ]);
    renderWithProviders(<StaffAccountSection staff={anna} />);

    expect(await screen.findByText(/Diese Einladung gilt nicht mehr/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anmeldemail senden' })).not.toBeInTheDocument();
  });

  it('zeigt bei bestehendem Zugang die Verwaltung statt eines Einladungsformulars', async () => {
    fetchStaffAccount.mockResolvedValue(mitZugang);
    renderWithProviders(<StaffAccountSection staff={anna} />);

    expect(await screen.findByText('Eingerichtet')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Therapeut:in' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Praxismanagement' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Zugang einladen' })).not.toBeInTheDocument();
  });

  it('lädt für eine ausgeschiedene Person niemanden ein', async () => {
    renderWithProviders(<StaffAccountSection staff={{ ...anna, employment_status: 'inactive' }} />);

    expect(
      await screen.findByText(/Für eine ausgeschiedene Person wird kein Zugang eingeladen/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zugang einladen' })).not.toBeInTheDocument();
  });

  it('meldet einen Ladefehler verständlich', async () => {
    fetchStaffInvitations.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<StaffAccountSection staff={anna} />);

    expect(
      await screen.findByText('Der Zugangsstand konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Bestehender Zugang: Rollen, Sperre, Kennwort (STAFF-002c, STAFF-003)
// ---------------------------------------------------------------------------
describe('StaffAccountSection - bestehender Zugang', () => {
  beforeEach(() => {
    for (const mock of [
      fetchStaffAccount,
      fetchStaffInvitations,
      setzeRollen,
      setzeZugangAktiv,
      stosseKennwortZuruecksetzenAn,
    ]) {
      mock.mockReset();
    }
    fetchStaffAccount.mockResolvedValue(mitZugang);
    fetchStaffInvitations.mockResolvedValue([]);
    setzeRollen.mockResolvedValue(undefined);
    setzeZugangAktiv.mockResolvedValue(undefined);
    stosseKennwortZuruecksetzenAn.mockResolvedValue(undefined);
  });

  it('speichert Rollen erst nach einer Änderung', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    // Unverändert: nichts zu speichern.
    expect(await screen.findByRole('button', { name: 'Rollen speichern' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Teamleitung' }));
    await user.click(screen.getByRole('button', { name: 'Rollen speichern' }));

    await waitFor(() => expect(setzeRollen).toHaveBeenCalledTimes(1));
    expect(setzeRollen).toHaveBeenCalledWith(anna.id, ['therapist', 'team_lead']);
  });

  it('lässt eine Änderung verwerfen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('checkbox', { name: 'Teamleitung' }));
    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));

    expect(screen.getByRole('checkbox', { name: 'Teamleitung' })).not.toBeChecked();
    expect(setzeRollen).not.toHaveBeenCalled();
  });

  it('speichert keine leere Rollenliste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('checkbox', { name: 'Therapeut:in' }));

    expect(screen.getByRole('button', { name: 'Rollen speichern' })).toBeDisabled();
    expect(screen.getByText(/Ein Zugang braucht mindestens eine Rolle/)).toBeInTheDocument();
  });

  it('erklärt den Aussperrschutz, statt nur zu scheitern', async () => {
    const user = userEvent.setup();
    setzeRollen.mockRejectedValue(new ZugangsError('last_owner_required'));
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('checkbox', { name: 'Praxisinhaber' }));
    await user.click(screen.getByRole('button', { name: 'Rollen speichern' }));

    expect(
      await screen.findByText(/Die letzte aktive Praxisinhaberin behält ihre Rolle/),
    ).toBeInTheDocument();
  });

  it('sperrt erst nach der Rückfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('button', { name: 'Zugang sperren' }));
    expect(setzeZugangAktiv).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Sperren' }));
    await waitFor(() => expect(setzeZugangAktiv).toHaveBeenCalledWith(anna.id, false));
  });

  it('bietet bei gesperrtem Zugang das Entsperren an und sagt, was gilt', async () => {
    fetchStaffAccount.mockResolvedValue({ ...mitZugang, account_active: false });
    renderWithProviders(<StaffAccountSection staff={anna} />);

    expect(await screen.findByText('Gesperrt')).toBeInTheDocument();
    expect(
      screen.getByText(/Die Person kann sich anmelden, sieht aber keine Daten der Praxis/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zugang entsperren' })).toBeInTheDocument();
  });

  it('nennt beim eigenen Zugang den Grund der Ablehnung', async () => {
    const user = userEvent.setup();
    setzeZugangAktiv.mockRejectedValue(new ZugangsError('cannot_lock_own_account'));
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('button', { name: 'Zugang sperren' }));
    await user.click(screen.getByRole('button', { name: 'Sperren' }));

    expect(
      await screen.findByText('Der eigene Zugang lässt sich nicht sperren.'),
    ).toBeInTheDocument();
  });

  it('stößt das Zurücksetzen des Kennworts erst nach der Rückfrage an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('button', { name: 'Kennwort zurücksetzen' }));
    expect(stosseKennwortZuruecksetzenAn).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Mail senden' }));
    await waitFor(() => expect(stosseKennwortZuruecksetzenAn).toHaveBeenCalledWith(anna.id));
    expect(
      await screen.findByText(/Die Mail zum Zurücksetzen wurde an die hinterlegte Adresse/),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Zustellung der Anmeldemail (ANN-025)
//
// Die Anwendung legt keine Authentifizierungskonten an - enable_signup ist
// bewusst aus (§4.2). Bei einer ersten Einladung gibt es also noch kein Konto,
// und das ist kein Fehler, sondern der Normalfall.
// ---------------------------------------------------------------------------
describe('StaffAccountSection - Zustellung der Anmeldemail', () => {
  beforeEach(() => {
    for (const mock of [fetchStaffAccount, fetchStaffInvitations, sendeZugangsMail]) {
      mock.mockReset();
    }
    fetchStaffAccount.mockResolvedValue(ohneZugang);
    fetchStaffInvitations.mockResolvedValue([offeneEinladung]);
    sendeZugangsMail.mockResolvedValue('gesendet');
  });

  it('nennt bei einer offenen Einladung den nächsten Schritt', async () => {
    renderWithProviders(<StaffAccountSection staff={anna} />);

    expect(await screen.findByText('Nächster Schritt')).toBeInTheDocument();
    expect(
      screen.getByText(/braucht sie einmalig ein\s+Konto beim Anmeldedienst/s),
    ).toBeInTheDocument();
  });

  it('bestätigt die zugestellte Anmeldemail', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('button', { name: 'Anmeldemail senden' }));

    expect(
      await screen.findByText(/Die Anmeldemail wurde an nina.neu@praxis.invalid geschickt/),
    ).toBeInTheDocument();
  });

  it('erklärt ein fehlendes Konto, statt einen Fehler zu melden', async () => {
    const user = userEvent.setup();
    sendeZugangsMail.mockResolvedValue('kein_konto');
    renderWithProviders(<StaffAccountSection staff={anna} />);

    await user.click(await screen.findByRole('button', { name: 'Anmeldemail senden' }));

    const meldung = await screen.findByText(/gibt es beim Anmeldedienst noch kein Konto/);
    expect(meldung).toBeInTheDocument();
    // Die Einladung bleibt gültig - es ist kein Fehlschlag.
    expect(screen.getByText(/die Einladung bleibt so lange offen/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/konnte nicht zugestellt werden/);
  });
});
