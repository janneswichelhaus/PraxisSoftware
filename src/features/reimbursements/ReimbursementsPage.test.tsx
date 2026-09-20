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

    expect(screen.getByText(/sieht nicht plausibel aus/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Einreichen/ })).toBeDisabled();
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
    const nutzer = userEvent.setup();
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
  });

  it('nennt die Strompauschale als betriebliche Regel und nicht als Vorgabe', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(screen.getByText(/Berechnung der Stromerstattung/));
    expect(
      screen.getByText(/betriebliche Regel, kein allgemein gültiger Verbrauchswert/),
    ).toBeInTheDocument();
  });
});
