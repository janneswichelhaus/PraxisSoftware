import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Benachrichtigungswahl, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * „Ich → Einstellungen → Benachrichtigungen" (KOM-011, ADR-024 Punkt 15):
 * von Anfang an aus, je Art und Weg wählbar, Ruhezeit, von der Praxis
 * Abgeschaltetes nicht wählbar, Push nur mit eingetragenem Gerät.
 */

const ladeBenachrichtigungen = vi.fn();
const speichereBenachrichtigungen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeBenachrichtigungen: (...args: unknown[]) =>
    ladeBenachrichtigungen(...args) as Promise<Benachrichtigungswahl | null>,
  speichereBenachrichtigungen: (...args: unknown[]) =>
    speichereBenachrichtigungen(...args) as Promise<void>,
}));

const { Benachrichtigungen } = await import('./Benachrichtigungen');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

const AUS: Benachrichtigungswahl = {
  email_kinds: [],
  push_kinds: [],
  quiet_from: 20,
  quiet_until: 8,
  chosen_at: null,
  disabled_kinds: [],
  device_registered: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  ladeBenachrichtigungen.mockResolvedValue(AUS);
  speichereBenachrichtigungen.mockResolvedValue(undefined);
});

describe('Benachrichtigungen (KOM-011)', () => {
  it('ist von Anfang an aus und sagt, dass die Übersicht reicht', async () => {
    const { container } = renderWithProviders(<Benachrichtigungen zugaenge={[ZUGANG]} />);
    const mails = await screen.findAllByRole('checkbox', { name: 'Per E-Mail' });
    expect(mails).toHaveLength(7);
    for (const kasten of mails) expect(kasten).not.toBeChecked();
    expect(screen.getByText(/auch ohne Benachrichtigung in Ihrer Übersicht/)).toBeInTheDocument();
    // Ohne eingetragenes Gerät kein Push zur Wahl; jsdom kann kein Push.
    expect(screen.queryByRole('checkbox', { name: 'Auf diesem Gerät' })).toBeNull();
    expect(
      screen.getByText(/Auf diesem Gerät sind Mitteilungen nicht möglich/),
    ).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('speichert die Wahl je Art mit Ruhezeit', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Benachrichtigungen zugaenge={[ZUGANG]} />);
    const erinnerung = await screen.findByRole('group', { name: 'Erinnerung an einen Termin' });
    await nutzer.click(within(erinnerung).getByRole('checkbox', { name: 'Per E-Mail' }));
    await nutzer.selectOptions(screen.getByLabelText('Ab'), '21');
    await nutzer.selectOptions(screen.getByLabelText('Bis'), '7');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(speichereBenachrichtigungen).toHaveBeenCalledWith(ZUGANG.access_id, {
        email_kinds: ['appointment_reminder'],
        push_kinds: [],
        quiet_from: 21,
        quiet_until: 7,
      }),
    );
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
  });

  it('zeigt von der Praxis Abgeschaltetes ohne Wahl und Push nur mit Gerät', async () => {
    ladeBenachrichtigungen.mockResolvedValue({
      ...AUS,
      disabled_kinds: ['plan_assigned'],
      device_registered: true,
      push_kinds: ['message_answered'],
    });
    renderWithProviders(<Benachrichtigungen zugaenge={[ZUGANG]} />);
    const plan = await screen.findByRole('group', { name: 'Neuer Übungsplan' });
    expect(within(plan).queryByRole('checkbox')).toBeNull();
    expect(within(plan).getByText(/für alle abgeschaltet/)).toBeInTheDocument();
    const antwort = screen.getByRole('group', { name: 'Antwort auf eine Rückfrage' });
    expect(within(antwort).getByRole('checkbox', { name: 'Auf diesem Gerät' })).toBeChecked();
  });

  it('zeigt einer Person mit zwei Zugängen je Zugang eine eigene Wahl', async () => {
    renderWithProviders(
      <Benachrichtigungen
        zugaenge={[
          ZUGANG,
          {
            ...ZUGANG,
            access_id: 'cafecafe-cafe-4afe-8afe-000000000003',
            relationship_kind: 'training',
          },
        ]}
      />,
    );
    // Je Zugang ein Aufklapper mit dem Namen im Kopf (ANN-468).
    expect((await screen.findByText('Für Ihre Behandlung')).closest('summary')).not.toBeNull();
    expect(screen.getByText('Für Ihr Training').closest('summary')).not.toBeNull();
    expect(ladeBenachrichtigungen).toHaveBeenCalledTimes(2);
  });
});
