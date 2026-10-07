import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ZugangApi from './api';
import type * as FilesApi from '@/features/files/api';
import type { Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Der Abschnitt „Plattform" an Akte und Trainingsverhältnis (POR-002).
 *
 * Die Grenze sitzt im Server (`supabase/tests/platform-accesses.test.ts`).
 * Geprüft wird hier, dass nur der passende Knopf steht, dass die Mail eine
 * bestätigte Adresse verlangt und dass der Code nur bis „Fertig" zu sehen ist.
 */

const MAX = '66666666-6666-4666-8666-000000000001';
const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000009';

const getPlatformAccess = vi.fn();
const invitePlatformAccess = vi.fn();
const sendPlatformInvitation = vi.fn();
const setPlatformAccessLocked = vi.fn();
const revokePlatformAccess = vi.fn();
const listPlatformRepresentations = vi.fn();
const getPlatformOnboarding = vi.fn();
const skipPlatformOnboarding = vi.fn();

// POR-014: die Zeile „Freigegeben" zählt die Dateien der Akte.
const fetchPatientFiles = vi.fn().mockResolvedValue([]);
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  fetchPatientFiles: (...args: unknown[]) => fetchPatientFiles(...args) as Promise<unknown>,
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ZugangApi>();
  return {
    ...actual,
    getPlatformAccess: (...args: unknown[]) => getPlatformAccess(...args) as Promise<unknown>,
    invitePlatformAccess: (...args: unknown[]) => invitePlatformAccess(...args) as Promise<unknown>,
    sendPlatformInvitation: (...args: unknown[]) =>
      sendPlatformInvitation(...args) as Promise<void>,
    setPlatformAccessLocked: (...args: unknown[]) =>
      setPlatformAccessLocked(...args) as Promise<void>,
    revokePlatformAccess: (...args: unknown[]) => revokePlatformAccess(...args) as Promise<void>,
    listPlatformRepresentations: (...args: unknown[]) =>
      listPlatformRepresentations(...args) as Promise<unknown>,
    getPlatformOnboarding: (...args: unknown[]) =>
      getPlatformOnboarding(...args) as Promise<unknown>,
    skipPlatformOnboarding: (...args: unknown[]) =>
      skipPlatformOnboarding(...args) as Promise<void>,
  };
});

const { PlattformAbschnitt } = await import('./PlattformAbschnitt');

const LEER: Plattformzugang = {
  id: null,
  status: null,
  created_at: null,
  activated_at: null,
  locked_at: null,
  revoked_at: null,
  revoked_reason: null,
  invitation_id: null,
  invitation_purpose: null,
  invitation_channel: null,
  invitation_expires_at: null,
  invitation_sent_at: null,
  relationship_email: 'max.mustermann@patient.invalid',
  ended_at: null,
};

const AKTIV: Plattformzugang = {
  ...LEER,
  id: ZUGANG,
  status: 'active',
  created_at: '2026-10-01T08:00:00+00:00',
  activated_at: '2026-10-02T08:00:00+00:00',
};

const EINLADUNG = {
  access_id: ZUGANG,
  invitation_id: '99999999-9999-4999-8999-0000000000e1',
  purpose: 'activate',
  code: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
  expires_at: '2026-10-15T08:00:00+00:00',
};

function zeige(darfVerwalten = true) {
  return renderWithProviders(
    <PlattformAbschnitt
      art="treatment"
      verhaeltnisId={MAX}
      darfVerwalten={darfVerwalten}
      zeitzone="Europe/Berlin"
      praxis="Test Praxis Tuebingen"
    />,
  );
}

describe('Abschnitt Plattform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPlatformRepresentations.mockResolvedValue([]);
    invitePlatformAccess.mockResolvedValue(EINLADUNG);
    sendPlatformInvitation.mockResolvedValue(undefined);
    setPlatformAccessLocked.mockResolvedValue(undefined);
    revokePlatformAccess.mockResolvedValue(undefined);
    getPlatformOnboarding.mockResolvedValue({
      finished_at: '2026-10-02T09:00:00+00:00',
      skipped_at: null,
      skipped_by_name: null,
    });
    skipPlatformOnboarding.mockResolvedValue(undefined);
  });

  it('bietet ohne Zugang nur das Einladen an', async () => {
    getPlatformAccess.mockResolvedValue(LEER);
    zeige();
    expect(await screen.findByText('Kein Zugang')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vor Ort einladen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Per Mail einladen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sperren' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entziehen' })).not.toBeInTheDocument();
  });

  it('zeigt vor Ort den Code, bis die Praxis "Fertig" tippt', async () => {
    getPlatformAccess.mockResolvedValue(LEER);
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Vor Ort einladen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Code anzeigen' }));

    const code = await screen.findByRole('img', { name: 'Code zum Einlösen der Einladung' });
    expect(code).toBeInTheDocument();
    expect(invitePlatformAccess).toHaveBeenCalledWith('treatment', MAX, 'on_site', false);

    await nutzer.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(
      screen.queryByRole('img', { name: 'Code zum Einlösen der Einladung' }),
    ).not.toBeInTheDocument();
    // Der Code steht nirgends mehr auf der Seite.
    expect(document.body.innerHTML).not.toContain(EINLADUNG.code);
  });

  it('schickt per Mail nur mit bestaetigter Adresse und meldet den Versand', async () => {
    getPlatformAccess.mockResolvedValue(LEER);
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Per Mail einladen' }));
    expect(screen.getByText('max.mustermann@patient.invalid')).toBeInTheDocument();
    await nutzer.click(
      screen.getByRole('checkbox', { name: 'Die Person hat mir diese Adresse selbst bestätigt.' }),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Einladung senden' }));

    await waitFor(() => expect(sendPlatformInvitation).toHaveBeenCalled());
    expect(invitePlatformAccess).toHaveBeenCalledWith('treatment', MAX, 'email', true);
    expect(sendPlatformInvitation).toHaveBeenCalledWith(EINLADUNG.invitation_id, EINLADUNG.code);
    expect(
      await screen.findByText(/ist an max.mustermann@patient.invalid unterwegs/),
    ).toBeVisible();
  });

  it('sagt, wenn der Mailversand fehlt, und laesst die Einladung stehen', async () => {
    getPlatformAccess.mockResolvedValue(LEER);
    sendPlatformInvitation.mockRejectedValue(
      new Error(
        'Der Mailversand ist noch nicht eingerichtet. Bitte die Einladung vor Ort übergeben.',
      ),
    );
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Per Mail einladen' }));
    await nutzer.click(screen.getByRole('checkbox'));
    await nutzer.click(screen.getByRole('button', { name: 'Einladung senden' }));
    expect(await screen.findByText(/noch nicht eingerichtet/)).toBeVisible();
  });

  it('bietet fuer einen aktiven Zugang Sperren, Entziehen und ein neues Kennwort an', async () => {
    getPlatformAccess.mockResolvedValue(AKTIV);
    const nutzer = userEvent.setup();
    zeige();
    expect(await screen.findByText('Aktiv')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vor Ort einladen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neues Kennwort (vor Ort)' })).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Sperren' }));
    const kasten = screen.getByText(/sieht ab sofort nichts mehr/).closest('div')!;
    await nutzer.click(within(kasten.parentElement!).getByRole('button', { name: 'Sperren' }));
    await waitFor(() => expect(setPlatformAccessLocked).toHaveBeenCalledWith(ZUGANG, true));
  });

  it('bietet fuer einen gesperrten Zugang Entsperren statt Sperren an', async () => {
    getPlatformAccess.mockResolvedValue({
      ...AKTIV,
      status: 'locked',
      locked_at: '2026-10-03T08:00:00+00:00',
    });
    zeige();
    expect(await screen.findByText('Gesperrt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entsperren' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sperren' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Neues Kennwort (vor Ort)' }),
    ).not.toBeInTheDocument();
  });

  it('zeigt eine abgelaufene Einladung als solche und bietet neu einzuladen an', async () => {
    getPlatformAccess.mockResolvedValue({ ...LEER, id: ZUGANG, status: 'invited' });
    zeige();
    expect(await screen.findByText('Einladung abgelaufen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vor Ort einladen' })).toBeInTheDocument();
  });

  it('zeigt Rollen ohne Schreibrecht nur den Zustand', async () => {
    getPlatformAccess.mockResolvedValue(AKTIV);
    zeige(false);
    expect(await screen.findByText('Aktiv')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // POR-019 (IDEA-LZK-005, DSN-001 Abschnitt 6): Einstieg und Überspringen.
  it('zeigt den Einstieg und lässt ihn überspringen, solange er aussteht', async () => {
    const nutzer = userEvent.setup();
    getPlatformAccess.mockResolvedValue(AKTIV);
    getPlatformOnboarding.mockResolvedValue({
      finished_at: null,
      skipped_at: null,
      skipped_by_name: null,
    });
    zeige();
    expect(await screen.findByText('steht noch aus')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Einstieg überspringen' }));
    expect(screen.getByText(/Einwilligungen bleiben offen/)).toBeInTheDocument();
    const knoepfe = screen.getAllByRole('button', { name: 'Einstieg überspringen' });
    await nutzer.click(knoepfe.at(-1)!);
    await waitFor(() => expect(skipPlatformOnboarding).toHaveBeenCalledWith(ZUGANG));
  });

  it('nennt, wer den Einstieg übersprungen hat, und bietet ihn nicht mehr an', async () => {
    getPlatformAccess.mockResolvedValue(AKTIV);
    getPlatformOnboarding.mockResolvedValue({
      finished_at: null,
      skipped_at: '2026-10-03T09:00:00+00:00',
      skipped_by_name: 'Olivia Office',
    });
    zeige();
    expect(await screen.findByText(/übersprungen am .* \(Olivia Office\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einstieg überspringen' })).toBeNull();
  });
});
