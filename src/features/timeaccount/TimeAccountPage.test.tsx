import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { TimeAccountPage } from './TimeAccountPage';

function oeffne() {
  return renderMitVorschau(
    <TimeAccountPage user={testUser(['therapist'])} />,
    '/betrieb/zeitkonto',
  );
}

describe('Zeitkonto', () => {
  it('zeigt das eigene Konto einmal, vorn und als „(Sie)“ markiert (VOR-16)', () => {
    oeffne();
    expect(screen.queryByRole('heading', { name: 'Mein Zeitkonto' })).toBeNull();
    expect(screen.getAllByText(/^Lena Hartmann/)).toHaveLength(1);

    const karten = screen.getAllByText(/Buchung(en)?$/).map((zeile) => zeile.closest('div'));
    expect(karten[0]).toHaveTextContent('Lena Hartmann (Sie)');
  });

  it('benennt, wem das eigene Konto in der Vorschau gehoert (VOR-07)', () => {
    oeffne();
    expect(
      screen.getByText(
        'Ihr Zeitkonto in der Vorschau ist das von Lena Hartmann (Demoperson zur Rolle), markiert mit „(Sie)“.',
      ),
    ).toBeInTheDocument();
  });

  it('zeigt Salden als Zahl, ohne Zeichen fuer gut oder schlecht (VOR-13)', () => {
    oeffne();
    const salden = screen.getAllByText(/^[+-]?[\d,]+ h$/, { selector: 'span.rounded-pill' });
    expect(salden.length).toBeGreaterThan(0);
    for (const saldo of salden) {
      expect(saldo.textContent).not.toMatch(/[✓×]/);
      expect(saldo).toHaveClass('bg-surface-sunken');
    }
  });

  it('nennt das Feld fuer beide Buchungsarten „Grund“ (VOR-25)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(screen.getByRole('button', { name: 'Stunden eintragen' }));
    expect(screen.getByRole('textbox', { name: 'Grund' })).toBeInTheDocument();

    await nutzer.selectOptions(
      screen.getByRole('combobox', { name: 'Art der Buchung' }),
      'abgebaut',
    );
    expect(screen.getByRole('textbox', { name: 'Grund' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Notiz' })).toBeNull();
  });

  it('behauptet beim Eintragen keine Speicherung', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(screen.getByRole('button', { name: 'Stunden eintragen' }));
    await nutzer.type(screen.getByRole('textbox', { name: 'Stunden' }), '2');
    await nutzer.click(screen.getByRole('button', { name: 'Buchung in die Vorschau übernehmen' }));

    const meldung = screen.getByRole('status');
    expect(
      within(meldung).getByText(/Nichts gespeichert und keine Lohnabrechnung angestoßen/),
    ).toBeInTheDocument();
    expect(meldung).toHaveFocus();
  });
});
