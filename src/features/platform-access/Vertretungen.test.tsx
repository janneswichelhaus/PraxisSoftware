import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ZugangApi from './api';
import type { Plattformzugang, Vertretung } from './api';
import { EINWILLIGUNG_BEGLEITUNG_FASSUNG } from '@/lib/vertretung';
import { renderWithProviders } from '@/test-utils';

/**
 * Vertretungen im Abschnitt „Plattform" (POR-005, ADR-023 Punkt 13).
 *
 * Die Grenzen sitzen im Server (`supabase/tests/platform-representation.test.ts`).
 * Geprüft wird hier, dass die Oberfläche durch Art, Nachweis und Einwilligung
 * führt, nur Vermerke schickt und den Code der vertretenden Person zeigt.
 */

const MAX = '66666666-6666-4666-8666-000000000001';

const getPlatformAccess = vi.fn();
const listPlatformRepresentations = vi.fn();
const invitePlatformRepresentation = vi.fn();
const noteCompanionCapacityDoubt = vi.fn();
const renewPlatformRepresentationCode = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ZugangApi>();
  return {
    ...actual,
    getPlatformAccess: (...args: unknown[]) => getPlatformAccess(...args) as Promise<unknown>,
    listPlatformRepresentations: (...args: unknown[]) =>
      listPlatformRepresentations(...args) as Promise<unknown>,
    invitePlatformRepresentation: (...args: unknown[]) =>
      invitePlatformRepresentation(...args) as Promise<unknown>,
    noteCompanionCapacityDoubt: (...args: unknown[]) =>
      noteCompanionCapacityDoubt(...args) as Promise<void>,
    renewPlatformRepresentationCode: (...args: unknown[]) =>
      renewPlatformRepresentationCode(...args) as Promise<unknown>,
  };
});

const { PlattformAbschnitt } = await import('./PlattformAbschnitt');
const { vertretungsfehler } = await import('./api');

const OHNE_ZUGANG: Plattformzugang = {
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
  relationship_email: null,
  ended_at: null,
};

const PAULA: Vertretung = {
  id: 'cafecafe-cafe-4afe-8afe-000000000004',
  access_kind: 'companion',
  legal_basis: null,
  representative_name: 'Paula Mustermann',
  status: 'active',
  created_at: '2026-10-01T08:00:00+00:00',
  activated_at: '2026-10-01T08:05:00+00:00',
  locked_at: null,
  revoked_at: null,
  revoked_reason: null,
  proof_documents: ['identity_document'],
  guardianship_health_scope: null,
  proof_recorded_at: '2026-10-01T08:00:00+00:00',
  proof_recorded_by_name: 'Olivia Office',
  consent_recorded_at: '2026-10-01T08:00:00+00:00',
  consent_earlier_messages: false,
  invitation_purpose: null,
  invitation_expires_at: null,
  ended_at: null,
};

const EINLADUNG = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000005',
  invitation_id: '99999999-9999-4999-8999-0000000000e1',
  purpose: 'activate' as const,
  code: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
  expires_at: '2026-10-16T08:00:00+00:00',
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

describe('Vertretungen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlatformAccess.mockResolvedValue(OHNE_ZUGANG);
    listPlatformRepresentations.mockResolvedValue([]);
    invitePlatformRepresentation.mockResolvedValue(EINLADUNG);
    noteCompanionCapacityDoubt.mockResolvedValue(undefined);
  });

  it('zeigt eine Begleitung mit Nachweis und Einwilligung', async () => {
    listPlatformRepresentations.mockResolvedValue([PAULA]);
    zeige();
    const eintrag = (await screen.findByText('Paula Mustermann')).closest('li')!;
    expect(eintrag).toHaveTextContent('Begleitung');
    expect(eintrag).toHaveTextContent('Gesehen: Ausweis der vertretenden Person · Olivia Office');
    expect(eintrag).toHaveTextContent('Einwilligung der Person am');
    expect(eintrag).toHaveTextContent('ohne frühere Nachrichten');
    expect(within(eintrag).getByRole('button', { name: 'Sperren' })).toBeInTheDocument();
  });

  it('zeigt ohne Schreibrecht keinen Knopf', async () => {
    listPlatformRepresentations.mockResolvedValue([PAULA]);
    zeige(false);
    await screen.findByText('Paula Mustermann');
    expect(screen.queryByRole('button', { name: 'Vertretung einrichten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sperren' })).toBeNull();
  });

  it('richtet eine Begleitung erst mit Ausweis und Einwilligung der Person ein', async () => {
    const user = userEvent.setup();
    zeige();
    await user.click(await screen.findByRole('button', { name: 'Vertretung einrichten' }));
    const formular = screen.getByRole('form', { name: 'Vertretung einrichten' });
    const senden = within(formular).getByRole('button', { name: 'Code anzeigen' });

    await user.type(
      within(formular).getByLabelText('Name der vertretenden Person'),
      'Paula Platzhalter',
    );
    // Der Wortlaut nennt die begleitende Person (ADR-023 Punkt 13, „konkret").
    expect(formular).toHaveTextContent(
      'Ich möchte, dass Paula Platzhalter mich auf der Plattform von Test Praxis Tuebingen begleitet',
    );
    expect(formular).toHaveTextContent('nur Nachrichten ab heute');
    await user.click(within(formular).getByLabelText('Ausweis der vertretenden Person'));
    expect(senden).toBeDisabled();
    await user.click(
      within(formular).getByLabelText(
        'Die Person hat den Text auf diesem Gerät gelesen und willigt ein.',
      ),
    );
    expect(senden).toBeEnabled();
    await user.click(senden);

    await waitFor(() =>
      expect(invitePlatformRepresentation).toHaveBeenCalledWith('treatment', MAX, {
        zugangsart: 'companion',
        grundlage: null,
        name: 'Paula Platzhalter',
        dokumente: ['identity_document'],
        aufgabenkreis: null,
        fassung: EINWILLIGUNG_BEGLEITUNG_FASSUNG,
        fruehereNachrichten: false,
      }),
    );
    // Der Code ist für die vertretende Person, mit eigenem Konto.
    expect(
      await screen.findByText(/Bitte Paula Platzhalter diesen Code .* nie das der Person\./),
    ).toBeInTheDocument();
  });

  it('nimmt eine geänderte Sichtbarkeit nur mit neuer Einwilligung', async () => {
    const user = userEvent.setup();
    zeige();
    await user.click(await screen.findByRole('button', { name: 'Vertretung einrichten' }));
    const formular = screen.getByRole('form', { name: 'Vertretung einrichten' });
    const zustimmung = within(formular).getByLabelText(
      'Die Person hat den Text auf diesem Gerät gelesen und willigt ein.',
    );
    await user.click(zustimmung);
    await user.click(
      within(formular).getByLabelText(
        'Frühere Nachrichten mit den Antworten der Praxis sind sichtbar',
      ),
    );
    expect(zustimmung).not.toBeChecked();
    expect(formular).toHaveTextContent('sieht auch meine früheren Nachrichten');
  });

  it('richtet eine Betreuung nur mit Betreuerausweis und Gesundheitssorge ein', async () => {
    const user = userEvent.setup();
    zeige();
    await user.click(await screen.findByRole('button', { name: 'Vertretung einrichten' }));
    const formular = screen.getByRole('form', { name: 'Vertretung einrichten' });
    await user.click(within(formular).getByRole('radio', { name: /Rechtliche Vertretung/ }));
    await user.type(
      within(formular).getByLabelText('Name der vertretenden Person'),
      'Bernd Betreuer',
    );
    await user.click(within(formular).getByLabelText('Ausweis der vertretenden Person'));
    await user.click(within(formular).getByLabelText('Betreuerausweis'));
    const senden = within(formular).getByRole('button', { name: 'Code anzeigen' });
    expect(senden).toBeDisabled();
    // Keine Einwilligung der Person bei einer rechtlichen Vertretung.
    expect(
      within(formular).queryByLabelText(
        'Die Person hat den Text auf diesem Gerät gelesen und willigt ein.',
      ),
    ).toBeNull();
    await user.click(
      within(formular).getByLabelText('Der Aufgabenkreis umfasst die Gesundheitssorge'),
    );
    await user.click(senden);
    await waitFor(() =>
      expect(invitePlatformRepresentation).toHaveBeenCalledWith('treatment', MAX, {
        zugangsart: 'legal_representative',
        grundlage: 'guardianship',
        name: 'Bernd Betreuer',
        dokumente: ['identity_document', 'guardianship_certificate'],
        aufgabenkreis: true,
        fassung: null,
        fruehereNachrichten: null,
      }),
    );
  });

  it('vermerkt einen Zweifel und laesst dann nur die rechtliche Vertretung zu', async () => {
    const user = userEvent.setup();
    zeige();
    await user.click(await screen.findByRole('button', { name: 'Vertretung einrichten' }));
    const formular = screen.getByRole('form', { name: 'Vertretung einrichten' });
    await user.click(
      within(formular).getByRole('button', { name: 'Zweifel an der Einwilligungsfähigkeit' }),
    );
    await user.click(within(formular).getByRole('button', { name: 'Vermerken' }));
    await waitFor(() => expect(noteCompanionCapacityDoubt).toHaveBeenCalledWith('treatment', MAX));
    expect(within(formular).getByRole('radio', { name: /Begleitung/ })).toBeDisabled();
    expect(within(formular).getByRole('radio', { name: /Rechtliche Vertretung/ })).toBeChecked();
    expect(formular).toHaveTextContent('Vermerkt ist nur der Zweifel, ohne Grund.');
  });

  it('nennt die Gründe des Servers in der Sprache der Praxis', () => {
    expect(vertretungsfehler('minor needs custody')).toMatch(/unter 18/);
    expect(vertretungsfehler('custody ends at majority')).toMatch(/volljährig/);
    expect(vertretungsfehler('date of birth required')).toMatch(/Geburtsdatum/);
    expect(vertretungsfehler('irgendwas')).toBe('Die Vertretung konnte nicht eingerichtet werden.');
  });
});
