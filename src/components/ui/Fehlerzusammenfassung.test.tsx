import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fehlerzusammenfassung } from './Fehlerzusammenfassung';
import { Field } from './Field';

/**
 * Die Zusammenfassung soll zwei Dinge leisten (UX-012): Sie muss ohne Blick auf
 * den Bildschirm auffindbar sein, und jeder Eintrag muss ans Feld führen -
 * nicht nur dorthin scrollen, sondern den Fokus setzen. Beides wird hier
 * geprüft, weil beides in der Bedienung sofort auffiele und im Code leise
 * verloren gehen kann.
 */
describe('Fehlerzusammenfassung', () => {
  const fehler = [
    { feldId: 'feld-nachname', feld: 'Nachname', meldung: 'Bitte ausfüllen.' },
    { feldId: 'feld-plz', feld: 'PLZ', meldung: 'Fünf Ziffern.' },
  ];

  it('bleibt ohne Fehler unsichtbar', () => {
    render(<Fehlerzusammenfassung fehler={[]} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('meldet sich als Hinweis und nimmt den Fokus auf', () => {
    render(<Fehlerzusammenfassung fehler={fehler} />);

    const kasten = screen.getByRole('alert');
    expect(kasten).toHaveTextContent('Bitte prüfen Sie diese Angaben');
    expect(kasten).toHaveFocus();
  });

  it('nennt bei einem einzelnen Fehler die Einzahl', () => {
    render(<Fehlerzusammenfassung fehler={[fehler[0]!]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte prüfen Sie diese Angabe');
  });

  it('nennt Feld und Meldung je Eintrag', () => {
    render(<Fehlerzusammenfassung fehler={fehler} />);

    expect(screen.getByRole('link', { name: 'Nachname: Bitte ausfüllen.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PLZ: Fünf Ziffern.' })).toBeInTheDocument();
  });

  it('setzt den Fokus ins Feld, auf das ein Eintrag zeigt', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Fehlerzusammenfassung fehler={fehler} />
        <Field label="Nachname" feldId="feld-nachname" error="Bitte ausfüllen." />
        <Field label="PLZ" feldId="feld-plz" error="Fünf Ziffern." />
      </>,
    );

    await user.click(screen.getByRole('link', { name: 'PLZ: Fünf Ziffern.' }));
    expect(screen.getByLabelText('PLZ')).toHaveFocus();
  });

  it('ist mit der Tastatur bedienbar', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Fehlerzusammenfassung fehler={fehler} />
        <Field label="Nachname" feldId="feld-nachname" error="Bitte ausfüllen." />
      </>,
    );

    // Der Kasten hat den Fokus; der erste Tabulator erreicht den ersten Eintrag.
    await user.tab();
    expect(screen.getByRole('link', { name: 'Nachname: Bitte ausfüllen.' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Nachname')).toHaveFocus();
  });
});
