import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AuditApi from './api';
import type { AuditEvent, AuditFilter } from './api';
import { renderWithProviders } from '@/test-utils';

const fetchAuditEvents = vi.fn();
const fetchOrganizationMembers = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AuditApi>();
  return {
    ...actual,
    fetchAuditEvents: (filter: AuditFilter) => fetchAuditEvents(filter) as Promise<unknown>,
    fetchOrganizationMembers: () => fetchOrganizationMembers() as Promise<unknown>,
  };
});

const { AuditLogPage } = await import('./AuditLogPage');

function event(id: string, action: string, actor: string, total: number): AuditEvent {
  return {
    id,
    occurred_at: '2026-08-28T09:15:00.000Z',
    actor_user_id: 'u-1',
    actor_kind: 'user',
    actor_display_name: actor,
    action,
    subject_type: 'patient',
    subject_id: '66666666-6666-4666-8666-000000000001',
    outcome: 'success',
    total_count: total,
  };
}

describe('AuditLogPage', () => {
  beforeEach(() => {
    fetchAuditEvents.mockReset();
    fetchOrganizationMembers.mockReset();
  });

  it('zeigt Zeitpunkt, Person, Aktion, Objekt und Ergebnis', async () => {
    fetchAuditEvents.mockResolvedValue({
      events: [event('1', 'patient_record.viewed', 'Anna Beispiel', 1)],
      totalCount: 1,
    });
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument();
    // Der Filter enthaelt dieselbe Beschriftung als <option>; hier ist die
    // Zeile im Ergebnis gemeint.
    const zeile = screen.getByRole('listitem');
    expect(zeile).toHaveTextContent('Patientenakte geöffnet');
    expect(screen.getByText('Erfolgreich')).toBeInTheDocument();
    // Objektreferenz gekuerzt, vollstaendige ID nur als Titel.
    expect(screen.getByTitle('66666666-6666-4666-8666-000000000001')).toHaveTextContent(
      '…000000000001',
    );
  });

  it('nennt bei einer Abweisung die Operation und wie oft binnen zehn Minuten (LOG-EPIC-001)', async () => {
    fetchAuditEvents.mockResolvedValue({
      events: [
        {
          ...event('1', 'access.denied', 'Anna Beispiel', 1),
          subject_type: 'organization',
          outcome: 'denied',
          denied_operation: 'appointments.read',
          denied_count: 3,
        },
      ],
      totalCount: 1,
    });
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);

    const zeile = await screen.findByRole('listitem');
    expect(zeile).toHaveTextContent('Zugriff abgewiesen: Termine gelesen · 3×');
    expect(within(zeile).getByText('Abgewiesen')).toBeInTheDocument();
  });

  it('traegt das Wort des Menuepunkts als Titel (ORG-07)', async () => {
    fetchAuditEvents.mockResolvedValue({ events: [], totalCount: 0 });
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Protokoll' })).toBeInTheDocument();
  });

  it('benennt jede Angabe der Zeile fuer Vorlesesoftware (UIK-24)', async () => {
    fetchAuditEvents.mockResolvedValue({
      events: [event('1', 'patient_record.viewed', 'Anna Beispiel', 1)],
      totalCount: 1,
    });
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);

    const zeile = await screen.findByRole('listitem');
    for (const spalte of ['Zeitpunkt:', 'Person:', 'Vorgang:', 'Ergebnis:']) {
      expect(within(zeile).getByText(spalte)).toHaveClass('sr-only');
    }
  });

  it('zeigt Systemereignisse mit dem Akteur "System" (DOK-004)', async () => {
    fetchAuditEvents.mockResolvedValue({
      events: [
        {
          ...event('1', 'treatment_note.auto_finalized', '', 1),
          actor_user_id: null,
          actor_kind: 'system',
          actor_display_name: null,
          subject_type: 'treatment_note',
        },
      ],
      totalCount: 1,
    });
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);

    const zeile = await screen.findByRole('listitem');
    expect(zeile).toHaveTextContent('System');
    expect(zeile).toHaveTextContent('Behandlungsdokumentation automatisch finalisiert');
    expect(zeile).not.toHaveTextContent('Unbekannt');
  });

  it('zeigt einen Zugriff ueber eine Vertretung unterscheidbar (ADR-023 Punkt 14, POR-006)', async () => {
    fetchAuditEvents.mockResolvedValue({
      events: [
        {
          ...event('1', 'platform_representation.read', '', 1),
          actor_kind: 'representative',
          actor_display_name: null,
        },
      ],
      totalCount: 1,
    });
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);

    const zeile = await screen.findByRole('listitem');
    expect(zeile).toHaveTextContent('Vertretung (Plattform)');
    expect(zeile).toHaveTextContent('Plattform über eine Vertretung geöffnet · Patient:in');
    expect(zeile).not.toHaveTextContent('Unbekannt');
  });

  it('nennt Kontoereignisse und Textbausteine in der Sprache der Oberflaeche (ORG-20)', async () => {
    fetchAuditEvents.mockResolvedValue({
      events: [
        {
          ...event('1', 'account.password_changed', 'Tim Teamleitung', 2),
          subject_type: 'user_account',
        },
        { ...event('2', 'text_snippet.updated', 'Anna Beispiel', 2), subject_type: 'text_snippet' },
      ],
      totalCount: 2,
    });
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);

    const [konto, baustein] = await screen.findAllByRole('listitem');
    expect(konto).toHaveTextContent('Eigenes Kennwort geändert · Zugang');
    expect(baustein).toHaveTextContent('Textbaustein geändert · Textbaustein');
    expect(document.body.textContent).not.toMatch(/user_account|text_snippet/);
  });

  it('reicht die Filter an den Server weiter statt clientseitig zu filtern', async () => {
    fetchAuditEvents.mockResolvedValue({ events: [], totalCount: 0 });
    fetchOrganizationMembers.mockResolvedValue([{ id: 'u-2', display_name: 'Olivia Office' }]);
    const user = userEvent.setup();

    renderWithProviders(<AuditLogPage />);
    await screen.findByText('Keine Einträge im gewählten Zeitraum');

    await user.selectOptions(await screen.findByLabelText('Person'), 'u-2');
    await user.selectOptions(screen.getByLabelText('Aktion'), 'access.denied');

    await waitFor(() => {
      expect(fetchAuditEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ actorUserId: 'u-2', action: 'access.denied', page: 0 }),
      );
    });
  });

  it('haelt die Filter in ihrer Spalte - auch am Telefon (RSP-01, UIK-19)', async () => {
    // Bis UXR-011 setzte die laengste Aktion die Breite der einzigen Spalte,
    // und die Seite lief bei 390 px 36 px ueber. jsdom misst keine Breiten;
    // geprueft wird, was den Ueberlauf verhindert: eine ausdrueckliche Spalte
    // und Felder in voller Breite und 48 px Hoehe.
    fetchAuditEvents.mockResolvedValue({ events: [], totalCount: 0 });
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);
    await screen.findByText('Keine Einträge im gewählten Zeitraum');

    const felder = ['Von', 'Bis', 'Person', 'Aktion'].map((name) => screen.getByLabelText(name));
    for (const feld of felder) {
      expect(feld).toHaveClass('w-full', 'h-12');
    }
    expect(felder[0]!.closest('form')).toHaveClass('grid-cols-1');
  });

  it('blaettert seitenweise und meldet die Gesamtzahl', async () => {
    fetchAuditEvents.mockResolvedValue({
      events: Array.from({ length: 25 }, (_, index) =>
        event(String(index), 'patient_record.viewed', 'Anna Beispiel', 60),
      ),
      totalCount: 60,
    });
    fetchOrganizationMembers.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText('1–25 von 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    await waitFor(() => {
      expect(fetchAuditEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    });
  });

  it('zeigt bei fehlender Berechtigung eine verstaendliche Meldung ohne Details', async () => {
    fetchAuditEvents.mockRejectedValue(new Error('audit log access denied'));
    fetchOrganizationMembers.mockResolvedValue([]);

    renderWithProviders(<AuditLogPage />);

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Die Auditeinträge konnten nicht geladen werden.');
    expect(meldung.textContent).not.toMatch(/denied/i);
  });

  it('sagt bei einem Ladefehler, was zu tun ist, und bietet einen neuen Versuch an (ORG-15)', async () => {
    // Die Seite sieht nur, wer sie sehen darf - „nur fuer die Praxisleitung
    // freigegeben" war fuer die Praxisinhaber:in die falsche Auskunft.
    fetchAuditEvents
      .mockRejectedValueOnce(new Error('Netz weg'))
      .mockResolvedValue({ events: [], totalCount: 0 });
    fetchOrganizationMembers.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<AuditLogPage />);

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(meldung).not.toHaveTextContent(/freigegeben|Praxisleitung/);

    await user.click(within(meldung).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByText('Keine Einträge im gewählten Zeitraum')).toBeInTheDocument();
  });

  it('sagt, wenn die Personenliste fuer den Filter fehlt (ORG-14)', async () => {
    fetchAuditEvents.mockResolvedValue({ events: [], totalCount: 0 });
    fetchOrganizationMembers.mockRejectedValue(new Error('kaputt'));

    renderWithProviders(<AuditLogPage />);

    expect(
      await screen.findByText('Die Liste der Personen konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});
