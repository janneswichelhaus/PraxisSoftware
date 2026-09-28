import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderMitVorschau, testUser } from '@/test-utils';
import { BikeEditPage } from '@/features/fleet/BikeEditPage';
import { CheckupPage } from '@/features/fleet/CheckupPage';
import { FleetPage } from '@/features/fleet/FleetPage';
import { KeyPage } from '@/features/fleet/KeyPage';
import { TeamChatPage } from '@/features/teamchat/TeamChatPage';
import { VorschauProvider } from './VorschauProvider';

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

  it('verlangt fuer den zweiten Check-Up eine neue Bestaetigung (VOR-03)', async () => {
    // Bis VOR-03 gingen Bewertungen und Bestätigung des ersten Rads in den
    // Check-Up des nächsten über: „Bestätigung liegt vor." bei leerem Feld.
    // Abfragen über Beschriftung und Text statt Rolle: Das Formular hat 27
    // Auswahlfelder, und die Rollenabfrage läuft in jsdom über jedes davon.
    const nutzer = userEvent.setup({ delay: null });
    renderMitVorschau(
      <CheckupPage user={testUser([...nutzerRolle])} />,
      '/betrieb/flotte/checkup?rad=r1',
    );
    const uebernehmen = () => screen.getByText(/Check-Up in die Vorschau/).closest('button');

    await nutzer.click(screen.getAllByLabelText('Problem')[0]!);
    await nutzer.type(screen.getByLabelText(/Namen tippen/), 'Anna');
    await nutzer.click(uebernehmen()!);

    await nutzer.selectOptions(screen.getByLabelText('Rad'), 'r2');
    await nutzer.click(screen.getByText('Weiter'));

    expect(uebernehmen()).toBeDisabled();
    expect(screen.getByText(/Noch keine Bestätigung/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Namen tippen/)).toHaveValue('');
    // Der erste Prüfpunkt steht wieder auf „In Ordnung", ohne Notizfeld.
    expect(screen.getAllByLabelText(/In Ordnung/)[0]).toBeChecked();
    expect(screen.queryByLabelText('Notiz zu Reifen und Luftdruck')).toBeNull();
    // Die Meldung zum ersten Rad steht nicht über dem Check-Up des zweiten.
    expect(document.querySelector('[role="status"]')).toBeNull();
  });
});

describe('Rad speichern und entfernen', () => {
  /**
   * Beide Aktionen wechseln zurück in die Radflotte. Die Zustandsmeldung muss
   * dort ankommen (VOR-01) - bis dahin stand keine, und das geänderte oder
   * verschwundene Rad sah aus wie ein echter Vorgang.
   *
   * Eigener Router statt `renderMitVorschau`: Der Seitenwechsel ist hier der
   * Gegenstand der Prüfung, und beide Seiten brauchen ihre Route.
   */
  function oeffneRad(radId: string) {
    const user = testUser([...nutzerRolle]);
    return render(
      <MemoryRouter initialEntries={[`/betrieb/flotte/rad/${radId}`]}>
        <VorschauProvider>
          <Routes>
            <Route path="/betrieb/flotte" element={<FleetPage user={user} />} />
            <Route path="/betrieb/flotte/rad/:radId" element={<BikeEditPage user={user} />} />
          </Routes>
        </VorschauProvider>
      </MemoryRouter>,
    );
  }

  /**
   * Die Zustandsmeldung der Radflotte - gesucht über ihren Text und dann an
   * ihrer Rolle geprüft. Eine Rollenabfrage liefe in jsdom über die ganze,
   * große Seite.
   */
  function meldungMit(text: RegExp): HTMLElement {
    const meldung = screen.getByText(text).closest<HTMLElement>('[role="status"]');
    expect(meldung).not.toBeNull();
    return meldung!;
  }

  it('meldet nach dem Speichern in der Radflotte, was nicht passiert ist', async () => {
    const nutzer = userEvent.setup({ delay: null });
    oeffneRad('r1');

    await nutzer.click(screen.getByText('In die Vorschau übernehmen'));

    expect(screen.getByText('Radflotte', { selector: 'h1' })).toBeInTheDocument();
    const meldung = meldungMit(/Rad geändert: Lastenrad 1/);
    expect(within(meldung).getByText(/Nicht passiert/)).toBeInTheDocument();
    expect(within(meldung).getByText(/Nichts gespeichert/)).toBeInTheDocument();
  });

  it('entfernt ein Rad erst nach Rueckfrage und meldet, dass nichts geloescht wurde', async () => {
    const nutzer = userEvent.setup({ delay: null });
    oeffneRad('r1');

    await nutzer.click(screen.getByText('Rad entfernen'));
    // Noch auf der Seite: Der Knopf allein entfernt nichts (VOR-10).
    expect(screen.getByText('Rad bearbeiten', { selector: 'h1' })).toBeInTheDocument();

    await nutzer.click(screen.getByText('Ja, Rad entfernen'));

    const meldung = meldungMit(/Rad entfernt: Lastenrad 1/);
    expect(within(meldung).getByText(/Nichts gelöscht/)).toBeInTheDocument();
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
