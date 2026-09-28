import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignaturFeld } from './SignaturFeld';

/**
 * Das Unterschriftsfeld bestätigt nur, was in ihm selbst gezeichnet oder
 * getippt wurde (VOR-03), und sagt Vorlesesoftware, wann die Bestätigung
 * vorliegt (UEB-20). Gezeichnet wird in jsdom nicht - das Zeichenfeld hat dort
 * keinen Kontext; geprüft wird der gleichwertige Weg über den Namen.
 */

describe('SignaturFeld', () => {
  it('beginnt unbestaetigt', () => {
    render(<SignaturFeld beschriftung="Bestätigung" onChange={vi.fn()} />);
    expect(screen.getByText(/Noch keine Bestätigung/)).toBeInTheDocument();
  });

  it('bestaetigt mit einem getippten Namen und nimmt das mit dem Namen zurueck', async () => {
    const nutzer = userEvent.setup();
    const onChange = vi.fn();
    render(<SignaturFeld beschriftung="Bestätigung" onChange={onChange} />);

    const name = screen.getByRole('textbox', { name: 'Oder Namen tippen' });
    await nutzer.type(name, 'Anna');
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText(/Bestätigung liegt vor/)).toBeInTheDocument();

    await nutzer.clear(name);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/Noch keine Bestätigung/)).toBeInTheDocument();
  });

  it('loescht mit „Unterschrift löschen“ auch den getippten Namen', async () => {
    const nutzer = userEvent.setup();
    const onChange = vi.fn();
    render(<SignaturFeld beschriftung="Bestätigung" onChange={onChange} />);

    await nutzer.type(screen.getByRole('textbox', { name: 'Oder Namen tippen' }), 'Anna');
    await nutzer.click(screen.getByRole('button', { name: 'Unterschrift löschen' }));

    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('textbox', { name: 'Oder Namen tippen' })).toHaveValue('');
  });

  it('meldet den Wechsel ueber eine Live-Region, ohne eine zweite Statusrolle', () => {
    // Die Seite zeigt nach dem Übernehmen genau eine Zustandsmeldung
    // (role="status"); das Feld darf ihr keine zweite danebenstellen.
    render(<SignaturFeld beschriftung="Bestätigung" onChange={vi.fn()} />);
    expect(screen.getByText(/Noch keine Bestätigung/)).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('ist ein Feld des Systems: 48 px hoch wie der Knopf daneben', () => {
    render(<SignaturFeld beschriftung="Bestätigung" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Oder Namen tippen' })).toHaveClass('h-12');
  });
});
