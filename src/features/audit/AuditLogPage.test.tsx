import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
  it('zeigt Zeitpunkt, Benutzer, Aktion, Objekt und Ergebnis', async () => {
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

  it('reicht die Filter an den Server weiter statt clientseitig zu filtern', async () => {
    fetchAuditEvents.mockResolvedValue({ events: [], totalCount: 0 });
    fetchOrganizationMembers.mockResolvedValue([{ id: 'u-2', display_name: 'Olivia Office' }]);
    const user = userEvent.setup();

    renderWithProviders(<AuditLogPage />);
    await screen.findByText('Keine Einträge im gewählten Zeitraum');

    await user.selectOptions(await screen.findByLabelText('Benutzer'), 'u-2');
    await user.selectOptions(screen.getByLabelText('Aktion'), 'audit_log.read');

    await waitFor(() => {
      expect(fetchAuditEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ actorUserId: 'u-2', action: 'audit_log.read', page: 0 }),
      );
    });
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
});
