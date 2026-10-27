import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AnlegenMenue } from './AnlegenMenue';

/**
 * Das Anlegen-Menü an der Auswahl (CAL-019).
 *
 * Geprüft wird, was das Menü selbst zusichert: Der Fokus liegt beim Öffnen im
 * Menü, Escape schließt es, und ein nicht wählbarer Eintrag sagt, was fehlt.
 * Wohin die Einträge führen, prüft `CalendarPage.test.tsx` — das weiß das Menü
 * nicht.
 */
function rendern(overrides: Partial<Parameters<typeof AnlegenMenue>[0]['auswahl']> = {}) {
  const onSchliessen = vi.fn();
  const gewaehlt = vi.fn();
  render(
    <AnlegenMenue
      auswahl={{
        spalteId: 'a',
        vonMinute: 540,
        bisMinute: 600,
        onSchliessen,
        eintraege: [
          { schluessel: 'termin', beschriftung: 'Neuer Termin', onWaehlen: gewaehlt },
          {
            schluessel: 'dauertermin',
            beschriftung: 'Dauertermin',
            hinweis: 'Zuerst die Patient:in wählen.',
            deaktiviert: true,
            onWaehlen: () => undefined,
          },
        ],
        ...overrides,
      }}
    />,
  );
  return { onSchliessen, gewaehlt };
}

describe('AnlegenMenue', () => {
  it('legt den Fokus auf den ersten Eintrag', () => {
    rendern();
    expect(screen.getByRole('button', { name: 'Neuer Termin' })).toHaveFocus();
  });

  it('schliesst mit Escape', () => {
    const { onSchliessen } = rendern();
    fireEvent.keyDown(screen.getByRole('group', { name: 'Was soll hier entstehen?' }), {
      key: 'Escape',
    });
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('waehlt einen Eintrag mit der Tastatur', () => {
    const { gewaehlt } = rendern();
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Termin' }));
    expect(gewaehlt).toHaveBeenCalledTimes(1);
  });

  it('nennt am nicht waehlbaren Eintrag, was fehlt', () => {
    rendern();
    const dauertermin = screen.getByRole('button', { name: /Dauertermin/ });
    expect(dauertermin).toBeDisabled();
    expect(dauertermin).toHaveTextContent('Zuerst die Patient:in wählen.');
  });

  // KAL-10: Die Leiste steht fern der Auswahl - sie nennt deshalb Person und
  // Tag vor der Zeit, damit ein Tipp in die Nachbarspalte hier auffällt.
  it('nennt Person und Tag vor der Uhrzeit', () => {
    rendern({ kopf: 'Tim Teamleitung · Mo 28.09.' });
    expect(screen.getByRole('group', { name: 'Was soll hier entstehen?' })).toHaveTextContent(
      'Tim Teamleitung · Mo 28.09. · 09:00–10:00 Uhr',
    );
  });

  it('schliesst ueber „Abbrechen"', () => {
    const { onSchliessen } = rendern();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });
});

describe('AnlegenMenue am Handy (Runde 3, Handoff Kalender und Tour)', () => {
  it('blendet unter 640 px die Hinweiszeilen aus, nicht aber den Grund einer gesperrten Wahl', () => {
    render(
      <AnlegenMenue
        auswahl={{
          spalteId: 'a',
          vonMinute: 540,
          bisMinute: 600,
          onSchliessen: () => undefined,
          eintraege: [
            {
              schluessel: 'termin',
              beschriftung: 'Neuer Termin',
              hinweis: '09:00 Uhr, 60 Minuten',
              onWaehlen: () => undefined,
            },
            {
              schluessel: 'dauertermin',
              beschriftung: 'Dauertermin',
              hinweis: 'Zuerst die Patient:in wählen.',
              deaktiviert: true,
              onWaehlen: () => undefined,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('09:00 Uhr, 60 Minuten')).toHaveClass('max-sm:hidden');
    expect(screen.getByText('Zuerst die Patient:in wählen.')).not.toHaveClass('max-sm:hidden');
  });

  it('zeigt den Gesten-Hinweis nur, bis einmal eine Spanne aufgezogen wurde', () => {
    const eintraege = [{ schluessel: 't', beschriftung: 'Neuer Termin', onWaehlen: () => {} }];
    const auswahl = { spalteId: 'a', onSchliessen: () => undefined, eintraege };
    const { rerender, unmount } = render(
      <AnlegenMenue auswahl={{ ...auswahl, vonMinute: 540, bisMinute: 540 }} />,
    );
    expect(screen.getByText(/Zweites Feld antippen/)).toBeInTheDocument();
    // Zweiter Tipp: Die Spanne steht.
    rerender(<AnlegenMenue auswahl={{ ...auswahl, vonMinute: 540, bisMinute: 600 }} />);
    expect(screen.queryByText(/Zweites Feld antippen/)).toBeNull();
    unmount();

    // Die nächste Auswahl, wieder ein einzelnes Feld: Der Hinweis kommt nicht wieder.
    render(<AnlegenMenue auswahl={{ ...auswahl, vonMinute: 600, bisMinute: 600 }} />);
    expect(screen.queryByText(/Zweites Feld antippen/)).toBeNull();
    expect(window.localStorage.getItem('kalender-spanne-gelernt')).toBe('1');
  });
});
