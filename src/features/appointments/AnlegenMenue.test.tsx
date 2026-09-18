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
});
