import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BereichePage } from './BereichePage';
import { renderWithProviders, testUser } from '@/test-utils';
import type * as TeamchatApi from '@/features/teamchat/api';

const zaehler = vi.hoisted(() => ({ badge: 0 }));
vi.mock('@/features/teamchat/api', async (importOriginal) => ({
  ...(await importOriginal<typeof TeamchatApi>()),
  fetchZaehler: vi.fn(() =>
    Promise.resolve({
      badge: zaehler.badge,
      unread_conversations: 0,
      threads_new: 0,
      activity_unread: 0,
      saved_open: 0,
      reminders_due: 0,
      scheduled: 0,
    }),
  ),
}));

/**
 * Die Bereichsübersicht hinter „Mehr" (BEF-049, Option 2, RAH-004).
 *
 * Bis zum Handoff vom 2026-10-05 versprach der Satz darunter eine
 * Kennzeichnung, die die Liste nicht trug („… sind als Vorschau
 * gekennzeichnet"). Jetzt sagt er den Stand: Vorschauen stehen in den
 * Untermenüs, die Kommunikation ist als Ganzes eine, und der Weg zum
 * Protokoll steht jeder Rolle offen.
 */
describe('BereichePage', () => {
  it('zeigt alle Bereiche der Rolle in Seitenleisten-Reihenfolge, die Nachrichten eingeschlossen', () => {
    renderWithProviders(<BereichePage user={testUser(['therapist'])} />, '/bereiche');
    const liste = screen.getByRole('list', { name: 'Bereiche' });
    const namen = Array.from(liste.querySelectorAll(':scope > li .text-liste')).map(
      (name) => name.textContent,
    );
    expect(namen).toEqual([
      'Übersicht',
      'Kalender',
      'Patient:innen',
      'Nachrichten',
      'Organisation',
    ]);
    // Ohne Reiter führt der Bereich direkt hin.
    expect(screen.getByRole('link', { name: 'Kalender' })).toHaveAttribute('href', '/kalender');
  });

  it('zeigt Bereiche mit Reitern eingeklappt und öffnet sie auf Tipp (Jannes 2026-11-17)', async () => {
    renderWithProviders(<BereichePage user={testUser(['owner'])} />, '/bereiche');
    const patienten = screen.getByText('Patient:innen', { selector: '.text-liste' });
    const ordner = patienten.closest('details')!;
    expect(ordner.open).toBe(false);
    await userEvent.click(patienten);
    expect(ordner.open).toBe(true);
    const seiten = within(ordner).getByRole('list', { name: 'Patient:innen: Seiten' });
    expect(within(seiten).getByRole('link', { name: 'Verordner:innen' })).toHaveAttribute(
      'href',
      '/verordner',
    );
    const organisation = screen.getByText('Organisation', { selector: '.text-liste' });
    expect(organisation.closest('details')!.open).toBe(false);
    const reiter = within(organisation.closest('details')!).getByRole('list', {
      name: 'Organisation: Seiten',
    });
    expect(within(reiter).getByRole('link', { name: 'Team' })).toHaveAttribute(
      'href',
      '/praxis/team',
    );
  });

  it('zeigt die Zahl neuer Nachrichten am Bereich und am Teamchat', async () => {
    zaehler.badge = 7;
    renderWithProviders(<BereichePage user={testUser(['owner'])} />, '/bereiche');
    const nachrichten = screen.getByText('Nachrichten', { selector: '.text-liste' });
    const ordner = nachrichten.closest('details')!;
    expect(await within(ordner.querySelector('summary')!).findByText('7')).toBeInTheDocument();
    expect(within(ordner).getByRole('link', { name: /Teamchat.*7 neu/ })).toHaveAttribute(
      'href',
      '/team',
    );
    expect(within(ordner).getByRole('link', { name: 'Für dich' })).toBeInTheDocument();
    zaehler.badge = 0;
  });

  it('sagt, was Vorschauen tun, und führt jede Rolle zum Vorschau-Protokoll', () => {
    renderWithProviders(
      <BereichePage user={testUser(['patient'], 'Max Mustermann')} />,
      '/bereiche',
    );
    // Kurz und als Kleingedrucktes (Design-Review T7); die Kommunikation ist
    // seit KOM-002 keine Vorschau mehr und steht deshalb nicht mehr darin.
    const satz = screen.getByText(/Vorschauen speichern nichts/);
    expect(satz).toHaveTextContent(
      'Vorschauen speichern nichts; was dort simuliert wurde, steht im Vorschau-Protokoll.',
    );
    expect(satz).toHaveClass('text-kleingedruckt');
    expect(satz).not.toHaveTextContent(/Kommunikation/);
    expect(screen.queryByText(/als Vorschau gekennzeichnet/)).toBeNull();
    const link = screen.getByRole('link', { name: 'Vorschau-Protokoll' });
    expect(link).toHaveAttribute('href', '/vorschau/protokoll');
    // Der Textlink des Systems: Hauptfarbe mit Unterstreichung (UIK-15).
    expect(link.className).toContain('underline');
  });
});
