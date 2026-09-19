import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { CheckupPage } from '@/features/fleet/CheckupPage';
import { KeyPage } from '@/features/fleet/KeyPage';
import { TeamChatPage } from '@/features/teamchat/TeamChatPage';
import { ToursPage } from '@/features/tours/ToursPage';

/**
 * Eine Vorschau darf nie einen Erfolg zeigen, den es nicht gibt.
 *
 * Diese Datei prüft genau das an den Stellen, an denen eine vorgetäuschte
 * Erfolgsmeldung am meisten Schaden anrichten würde: Check-Up (Meldung an die
 * Werkstatt), Schlüssel (Zugang), Chat (Nachricht ans Team), Touren
 * (berechnete Fahrzeit). Die Abrechnung stand hier bis ABR-EPIC-001; seitdem
 * ist sie echt und wird am Server geprueft (siehe unten).
 */

const nutzerRolle = ['therapist'] as const;

describe('Check-Up', () => {
  it('behauptet keine Benachrichtigung, auch nicht bei einem Problem', async () => {
    const nutzer = userEvent.setup();
    renderMitVorschau(
      <CheckupPage user={testUser([...nutzerRolle])} />,
      '/betrieb/flotte/checkup?rad=r1',
    );

    await nutzer.click(screen.getAllByRole('radio', { name: 'Problem' })[0]!);
    await nutzer.type(screen.getByRole('textbox', { name: /Namen tippen/ }), 'Anna Beispiel');
    await nutzer.click(screen.getByRole('button', { name: /Check-Up in die Vorschau/ }));

    const meldung = screen.getByRole('status');
    expect(
      within(meldung).getByText(/Keine E-Mail an Werkstatt oder Praxis versendet/),
    ).toBeInTheDocument();
    expect(within(meldung).getByText(/wurde NICHT automatisch gesperrt/)).toBeInTheDocument();
  });

  it('verlangt eine Bestaetigung, bevor der Check-Up uebernommen wird', () => {
    renderMitVorschau(
      <CheckupPage user={testUser([...nutzerRolle])} />,
      '/betrieb/flotte/checkup?rad=r1',
    );
    expect(screen.getByRole('button', { name: /Check-Up in die Vorschau/ })).toBeDisabled();
  });

  it('sagt, dass Fotos und Unterschrift die Sitzung nicht verlassen', () => {
    renderMitVorschau(
      <CheckupPage user={testUser([...nutzerRolle])} />,
      '/betrieb/flotte/checkup?rad=r1',
    );
    expect(screen.getByText(/Es wird nichts hochgeladen/)).toBeInTheDocument();
    expect(screen.getByText(/keine rechtsverbindliche Signatur/)).toBeInTheDocument();
  });
});

describe('Schlüsselentnahme', () => {
  it('behauptet keinen Zugang zu einem echten Schlüsseltresor', async () => {
    const nutzer = userEvent.setup();
    renderMitVorschau(
      <KeyPage user={testUser([...nutzerRolle])} />,
      '/betrieb/flotte/schluessel?rad=r2',
    );

    await nutzer.click(screen.getByRole('button', { name: 'Entnahme bestätigen' }));

    const meldung = screen.getByRole('status');
    expect(
      within(meldung).getByText(/Kein Zugang zu einem echten Schlüsseltresor erteilt/),
    ).toBeInTheDocument();
  });

  it('verhindert eine zweite Entnahme desselben Schlüssels', () => {
    renderMitVorschau(
      <KeyPage user={testUser([...nutzerRolle])} />,
      '/betrieb/flotte/schluessel?rad=r1',
    );
    expect(screen.getByText(/Der Schlüssel ist bereits bei/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entnahme bestätigen' })).toBeDisabled();
  });

  it('belegt den Namen mit dem angemeldeten Konto vor', () => {
    renderMitVorschau(
      <KeyPage user={testUser([...nutzerRolle], 'Anna Beispiel')} />,
      '/betrieb/flotte/schluessel?rad=r2',
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Anna Beispiel');
  });
});

describe('Teamkommunikation', () => {
  it('versendet nichts und sagt das auch', async () => {
    const nutzer = userEvent.setup();
    renderMitVorschau(<TeamChatPage user={testUser([...nutzerRolle])} />, '/team');

    await nutzer.type(screen.getByRole('textbox', { name: 'Neue Nachricht' }), 'Kurze Frage');
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

describe('Touren', () => {
  it('kennzeichnet Wegzeiten als geschaetzt und nicht als berechnet', () => {
    renderMitVorschau(<ToursPage user={testUser([...nutzerRolle])} />, '/touren');
    expect(screen.getAllByText(/von Hand geschätzt/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/noch nicht geprüft/).length).toBeGreaterThan(0);
  });

  it('verspricht keine Routenberechnung und keine Ortung', () => {
    renderMitVorschau(<ToursPage user={testUser([...nutzerRolle])} />, '/touren');
    expect(
      screen.getByText(/keine Fahrzeitberechnung, keine Tourenoptimierung/),
    ).toBeInTheDocument();
    expect(screen.getByText(/keine dauerhafte Ortung/)).toBeInTheDocument();
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
