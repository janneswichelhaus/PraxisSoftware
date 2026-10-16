import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { TeamChatPage } from '@/features/teamchat/TeamChatPage';

/**
 * Eine Vorschau darf nie einen Erfolg zeigen, den es nicht gibt.
 *
 * Diese Datei prüft genau das an den Stellen, an denen eine vorgetäuschte
 * Erfolgsmeldung am meisten Schaden anrichten würde: Chat (Nachricht ans
 * Team), Touren (berechnete Fahrzeit). Die Abrechnung stand hier bis
 * ABR-EPIC-001, die Radflotte (Check-Up, Rad, Schlüssel) bis FLT-EPIC-001;
 * seitdem sind beide echt und werden am Server geprüft. Was hier für die
 * Radflotte stand - Bestätigung vor dem Check-Up, jeder Check-Up neu
 * bestätigt, kein vergebener Schlüssel ein zweites Mal, keine behauptete
 * Benachrichtigung -, prüfen die Tests unter `src/features/fleet/`.
 */

const nutzerRolle = ['therapist'] as const;

describe('Teamkommunikation', () => {
  it('versendet nichts und sagt das auch', async () => {
    const nutzer = userEvent.setup();
    renderMitVorschau(<TeamChatPage user={testUser([...nutzerRolle])} />, '/team');

    await nutzer.type(screen.getByRole('textbox', { name: /^Neue Nachricht/ }), 'Kurze Frage');
    await nutzer.click(screen.getByRole('button', { name: 'In die Vorschau schreiben' }));

    const meldung = screen.getByRole('status');
    expect(
      within(meldung).getByText(/Nichts versendet – niemand im Team bekommt diese Nachricht/),
    ).toBeInTheDocument();
    expect(
      within(meldung).getByText(
        /Keine Berechtigung erweitert, auch nicht durch einen verlinkten Vorgang/,
      ),
    ).toBeInTheDocument();
  });

  it('sagt am verlinkten Vorgang, dass der Verweis keine Berechtigung erweitert', async () => {
    const nutzer = userEvent.setup();
    renderMitVorschau(<TeamChatPage user={testUser([...nutzerRolle])} />, '/team');
    await nutzer.click(screen.getByRole('button', { name: /Flotte/ }));
    expect(screen.getAllByText(/Der Verweis erweitert keine Berechtigung/).length).toBeGreaterThan(
      0,
    );
  });

  it('weist im Eingabefeld darauf hin, dass klinische Freitexte nicht hierher gehoeren', () => {
    renderMitVorschau(<TeamChatPage user={testUser([...nutzerRolle])} />, '/team');
    expect(
      screen.getByText(/Keine Diagnosen und keine klinischen Freitexte im Teamkanal/),
    ).toBeInTheDocument();
  });
});

// Leistungen und Katalog waren hier als Vorschau vertreten. Beide sind mit
// ABR-EPIC-001 echt geworden: Die Abhaengigkeit von der Dokumentation ist
// nicht mehr ein Hinweis auf dem Bildschirm, sondern eine Bedingung im
// Schreibpfad - aus einem Termin ohne finalisierte Dokumentation entsteht
// keine Leistung, und einen Override gibt es nicht (PROJECT_PRINCIPLES.md 19).
// Geprueft wird das jetzt in `src/features/billing/*.test.tsx` und in
// `supabase/tests/billable-services.test.ts`, also am Server statt an einer
// Attrappe.

// Teamverzeichnis und Personalakte hatte dieser Umbau als Vorschau mitgebracht.
// Beide sind beim Zusammenfuehren mit main entfallen: STAFF-001 liefert die
// Mitarbeiterverwaltung echt, mit RLS und Audit, und liefert `office` die
// geschuetzten Privatdaten gar nicht erst aus. Die Pruefungen dafuer stehen in
// `src/features/staff/*.test.tsx` und in `pnpm test:db` - sie pruefen den
// Server, nicht eine Attrappe.
