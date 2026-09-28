import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { ReimbursementsPage } from './ReimbursementsPage';

/**
 * Der wichtigste Unterschied zur Vorlage: Einreichen, Genehmigen und Auszahlen
 * sind drei Vorgänge und nicht ein gemeinsamer Status. Genau das wird hier
 * geprüft - eine Genehmigung darf nicht wie eine Auszahlung aussehen.
 */

function oeffne(rollen: Parameters<typeof testUser>[0] = ['owner']) {
  return renderMitVorschau(<ReimbursementsPage user={testUser(rollen)} />, '/betrieb/erstattungen');
}

describe('Erstattungen', () => {
  it('unterscheidet die vier Bearbeitungsstände', () => {
    oeffne();
    for (const stand of ['Eingereicht', 'Genehmigt', 'Abgelehnt', 'Ausgezahlt']) {
      expect(screen.getAllByText(stand).length).toBeGreaterThan(0);
    }
  });

  it('sagt am genehmigten Antrag ausdruecklich, dass noch nicht ausgezahlt wurde', () => {
    oeffne();
    expect(screen.getByText(/Noch nicht ausgezahlt/)).toBeInTheDocument();
  });

  it('macht aus einer Genehmigung keine Ueberweisung', async () => {
    const nutzer = userEvent.setup();
    oeffne(['owner']);

    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));

    const meldung = screen.getByRole('status');
    expect(
      within(meldung).getByText(/Auszahlung ist damit ausdrücklich noch nicht erfolgt/),
    ).toBeInTheDocument();
    expect(
      within(meldung).getByText(/Keine Überweisung ausgelöst und keine Buchhaltung informiert/),
    ).toBeInTheDocument();
  });

  it('bietet die Auszahlung erst nach der Genehmigung an', async () => {
    const nutzer = userEvent.setup();
    oeffne(['owner']);

    // Genau ein Antrag steht auf "Genehmigt" - der eingereichte noch nicht.
    expect(screen.getAllByRole('button', { name: 'Auszahlung vermerken' })).toHaveLength(1);

    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));
    expect(screen.getAllByRole('button', { name: 'Auszahlung vermerken' })).toHaveLength(2);
  });

  it('bietet einer behandelnden Rolle keine Entscheidung an', () => {
    oeffne(['therapist']);
    expect(screen.queryByRole('button', { name: 'Genehmigen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auszahlung vermerken' })).toBeNull();
  });

  it('rechnet die Stromerstattung nachvollziehbar aus Arbeitstagen', async () => {
    const nutzer = userEvent.setup();
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));

    await nutzer.type(screen.getByRole('textbox', { name: 'IBAN' }), 'DE02100100100000000001');
    await nutzer.type(screen.getByRole('spinbutton', { name: /Arbeitstage/ }), '20');

    // 20 Arbeitstage x 0,5 kWh x 0,37 EUR = 3,70 EUR
    expect(screen.getByText(/Ergibt 3,70/)).toBeInTheDocument();
  });

  it('meldet eine unplausible IBAN, ohne sie zu akzeptieren', async () => {
    const nutzer = userEvent.setup();
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));
    await nutzer.type(screen.getByRole('textbox', { name: 'IBAN' }), 'keine-iban');
    // Geprüft wird beim Verlassen des Felds (VOR-17).
    await nutzer.tab();

    // Die Meldung sagt, was zu tun ist.
    expect(screen.getByRole('textbox', { name: 'IBAN' })).toHaveAccessibleDescription(
      /Bitte prüfen Sie die IBAN: zwei Buchstaben, zwei Prüfziffern, dann die Kontonummer/,
    );
    expect(screen.getByRole('button', { name: /Einreichen/ })).toBeDisabled();
  });

  it('zeigt waehrend des Tippens noch keinen Fehler an der IBAN (VOR-17)', async () => {
    const nutzer = userEvent.setup();
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));
    const iban = screen.getByRole('textbox', { name: 'IBAN' });

    await nutzer.type(iban, 'DE');

    expect(iban).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/Bitte prüfen Sie die IBAN/)).toBeNull();
  });

  it('schaltet an der IBAN Großschreibung ein und Korrektur und Vorschläge aus (VOR-17)', async () => {
    const nutzer = userEvent.setup();
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));
    const iban = screen.getByRole('textbox', { name: 'IBAN' });
    expect(iban).toHaveAttribute('autocapitalize', 'characters');
    expect(iban).toHaveAttribute('autocorrect', 'off');
    expect(iban).toHaveAttribute('spellcheck', 'false');
    expect(iban).toHaveAttribute('autocomplete', 'off');
  });

  it('zeigt den Fokus an den Chips der Art und die Wahl mit Zeichen (VOR-02)', async () => {
    const nutzer = userEvent.setup();
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));
    const einkauf = screen.getByRole('radio', { name: 'Einkauf' });
    expect(einkauf.closest('label')).toHaveClass(
      'has-[:focus-visible]:outline-2',
      'has-[:focus-visible]:outline-accent',
    );

    await nutzer.click(einkauf);
    expect(einkauf.closest('label')).toHaveTextContent('✓Einkauf');
  });

  it('verlangt fuer die Stromerstattung die Erklaerung', async () => {
    const nutzer = userEvent.setup();
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));
    await nutzer.type(screen.getByRole('textbox', { name: 'IBAN' }), 'DE02100100100000000001');
    await nutzer.type(screen.getByRole('spinbutton', { name: /Arbeitstage/ }), '20');

    expect(screen.getByRole('button', { name: /Einreichen/ })).toBeDisabled();
    await nutzer.type(screen.getByRole('textbox', { name: /Namen tippen/ }), 'Anna Beispiel');
    expect(screen.getByRole('button', { name: /Einreichen/ })).toBeEnabled();
  });

  it('summiert die Positionen einer Einkaufserstattung', async () => {
    const nutzer = userEvent.setup();
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));
    await nutzer.click(screen.getByRole('radio', { name: 'Einkauf' }));
    await nutzer.click(screen.getByRole('button', { name: 'Position hinzufügen' }));

    const betrag = screen.getByRole('textbox', { name: 'Betrag in €' });
    await nutzer.clear(betrag);
    await nutzer.type(betrag, '12,50');

    expect(screen.getByText(/Gesamt:/).textContent).toContain('12,50');
  });

  it('rechnet Betraege wie der Rest der Anwendung (R3-018)', async () => {
    // Der Vorschaubereich hatte einen eigenen Geldparser mit abweichender
    // Semantik: '1e3' wurde als 1000 Euro gelesen und '1,005' auf 1,00
    // abgerundet statt auf 1,01. Gerechnet wird jetzt mit parseEuroZuCent -
    // derselben Funktion wie in der Abrechnung.
    const nutzer = userEvent.setup();
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));
    await nutzer.click(screen.getByRole('radio', { name: 'Einkauf' }));
    await nutzer.click(screen.getByRole('button', { name: 'Position hinzufügen' }));

    const betrag = screen.getByRole('textbox', { name: 'Betrag in €' });

    await nutzer.clear(betrag);
    await nutzer.type(betrag, '1e3');
    expect(screen.getByText(/Gesamt:/).textContent).not.toContain('1.000,00');

    await nutzer.clear(betrag);
    await nutzer.type(betrag, '1,005');
    expect(screen.getByText(/Gesamt:/).textContent).toContain('0,00');
  });

  it('behauptet beim Einreichen weder PDF noch Versand', async () => {
    // Ohne Pause zwischen den Tasten: rund 40 Anschläge liefen unter Last an
    // die Zeitgrenze von 5 s.
    const nutzer = userEvent.setup({ delay: null });
    oeffne(['therapist']);
    await nutzer.click(screen.getByRole('button', { name: 'Erstattung einreichen' }));
    await nutzer.type(screen.getByRole('textbox', { name: 'IBAN' }), 'DE02100100100000000001');
    await nutzer.type(screen.getByRole('spinbutton', { name: /Arbeitstage/ }), '20');
    await nutzer.type(screen.getByRole('textbox', { name: /Namen tippen/ }), 'Anna Beispiel');
    await nutzer.click(screen.getByRole('button', { name: /Einreichen/ }));

    const meldung = screen.getByRole('status');
    expect(
      within(meldung).getByText(/Kein PDF erzeugt und nichts an die Buchhaltung versendet/),
    ).toBeInTheDocument();
    expect(within(meldung).getByText(/Keine Auszahlung veranlasst/)).toBeInTheDocument();
    // Die Rollen mit ihren Anzeigenamen (VOR-25).
    expect(
      within(meldung).getByText(/Er erscheint bei Praxisinhaber und Teamleitung zur Entscheidung/),
    ).toBeInTheDocument();
  });

  it('nennt die Strompauschale als betriebliche Regel und nicht als Vorgabe', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(screen.getByText(/Berechnung der Stromerstattung/));
    expect(
      screen.getByText(/betriebliche Regel, kein allgemein gültiger Verbrauchswert/),
    ).toBeInTheDocument();
  });

  it('benennt, wessen Erstattungen „(Sie)“ traegt (VOR-07)', () => {
    oeffne(['therapist']);
    expect(
      screen.getByText(
        'Ihre Erstattungen in der Vorschau sind die von Lena Hartmann (Demoperson zur Rolle), markiert mit „(Sie)“.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Lena Hartmann (Sie)')).toBeInTheDocument();
    expect(screen.queryByText(/\(ich\)/)).toBeNull();
  });

  it('verspricht keine Markierung, wenn die Demoperson nichts eingereicht hat', () => {
    // Das Konto der Praxisinhaberin gehört in der Vorschau zu Miriam Falk -
    // ohne eigene Erstattung.
    oeffne(['owner']);
    expect(
      screen.getByText(
        'Ihre Erstattungen in der Vorschau sind die von Miriam Falk (Demoperson zur Rolle); bisher liegt keine vor.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\(Sie\)$/)).toBeNull();
  });

  it('schreibt den Zeitraum als Monat aus (VOR-24)', () => {
    oeffne();
    const zeitraeume = screen.getAllByText(/^[A-ZÄÖÜ][a-zäöü]+ \d{4}/);
    expect(zeitraeume.length).toBeGreaterThan(0);
    expect(screen.queryByText(/^\d{4}-\d{2}/)).toBeNull();
  });

  it('zeigt die Aktionszone nur an Antraegen mit Aktion (VOR-24)', () => {
    oeffne(['owner']);
    for (const stand of ['Ausgezahlt', 'Abgelehnt']) {
      // Das erste Abzeichen steht an der Karte; die Historie folgt darunter.
      const karte = screen.getAllByText(stand, { selector: 'span' })[0]!.closest('.rounded-card');
      expect(karte).not.toBeNull();
      expect(karte?.querySelector('.border-t.pt-3')).toBeNull();
    }
  });

  it('filtert ueber die Auswahl des Systems (TOK-13, UIK-19)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    const filter = screen.getByRole('combobox', { name: 'Bearbeitungsstand' });
    expect(filter).toHaveClass('h-12');

    await nutzer.selectOptions(filter, 'abgelehnt');
    // Namen der Karten; die Historie darunter nennt weiter alle.
    const karte = { selector: 'p.font-semibold' };
    expect(screen.queryByText('Tobias Krenz', karte)).toBeNull();
    expect(screen.getByText('Aylin Özdemir', karte)).toBeInTheDocument();
  });
});
