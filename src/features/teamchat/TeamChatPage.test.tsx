import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { TeamChatPage } from './TeamChatPage';

/**
 * Kommunikation (Vorschau). Dass nichts versendet wird, prüft
 * `ehrlichkeit.test.tsx`; hier geht es um Bedienung und Wortlaut.
 */

function oeffne() {
  return renderMitVorschau(<TeamChatPage user={testUser(['therapist'])} />, '/team');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Kommunikation', () => {
  it('bietet „Als gelesen markieren“ nur bei Ungelesenem an (VOR-23)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    // # Allgemein hat nichts Ungelesenes.
    expect(screen.queryByRole('button', { name: 'Als gelesen markieren' })).toBeNull();

    await nutzer.click(screen.getByRole('button', { name: /Vertretungen/ }));
    await nutzer.click(screen.getByRole('button', { name: 'Als gelesen markieren' }));

    expect(screen.getByRole('status')).toHaveTextContent(/Kanal als gelesen markiert/);
    expect(screen.queryByRole('button', { name: 'Als gelesen markieren' })).toBeNull();
  });

  it('kuerzt die Ausgangsnachricht nur, wenn sie lang ist (VOR-23)', async () => {
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Antworten' }));
    expect(
      screen.getByText('Antwort auf: „Die Belege für den Monat bitte bis Freitag einreichen.“'),
    ).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: /Flotte/ }));
    await nutzer.click(screen.getAllByRole('button', { name: 'Antworten' })[0]!);
    expect(screen.getByText(/^Antwort auf: „Lastenrad 4 hat unterwegs .*…“$/)).toBeInTheDocument();
  });

  it('gibt „Antworten“ und „Abbrechen“ 44 px (VOR-11)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    const antworten = screen.getByRole('button', { name: 'Antworten' });
    expect(antworten).toHaveClass('min-h-11');

    await nutzer.click(antworten);
    const abbrechen = screen.getByRole('button', { name: 'Abbrechen' });
    expect(abbrechen).toHaveClass('min-h-11');

    await nutzer.click(abbrechen);
    expect(screen.queryByText(/^Antwort auf:/)).toBeNull();
  });

  it('sagt, unter welchem Namen die eigene Nachricht erscheint (VOR-07)', () => {
    oeffne();
    expect(
      screen.getByText('Sie schreiben in der Vorschau als Lena Hartmann (Demoperson zur Rolle).'),
    ).toBeInTheDocument();
  });

  it('stellt eine neue Nachricht hinter die aelteren von heute (VOR-06)', async () => {
    // 10:00 Uhr in Tübingen; die Vorlage schrieb in „# Vertretungen" um 08:05.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T08:00:00Z'));
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: /Vertretungen/ }));
    await nutzer.type(screen.getByRole('textbox', { name: 'Neue Nachricht' }), 'Übernehme ich');
    await nutzer.click(screen.getByRole('button', { name: 'In die Vorschau schreiben' }));

    const texte = screen
      .getAllByText(/Vertretung für zwei Hausbesuche|Übernehme ich/)
      .map((absatz) => absatz.textContent);
    expect(texte).toEqual([
      'Für den Nachmittag suche ich noch eine Vertretung für zwei Hausbesuche.',
      'Übernehme ich',
    ]);
    expect(screen.getByText(/27\.09\.2026, 10:00/)).toBeInTheDocument();
  });

  it('nennt die Regel der Suche ohne Projektverweis (WRT-03, VOR-25)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.type(screen.getByRole('searchbox', { name: 'Suche' }), 'Rad');

    const treffer = screen.getByRole('heading', { name: /Treffer/ }).closest('section')!;
    expect(
      within(treffer).getByText(/Eine echte Suche zeigt nur, was Sie sehen dürfen/),
    ).toBeInTheDocument();
    expect(treffer.textContent).not.toMatch(/PROJECT_PRINCIPLES/);
  });

  it('spricht von Antworten statt von Threads (VOR-25)', () => {
    oeffne();
    expect(
      screen.getByText('Kanäle, Direktnachrichten und Antworten für organisatorische Abstimmung.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Threads/)).toBeNull();
  });
});
