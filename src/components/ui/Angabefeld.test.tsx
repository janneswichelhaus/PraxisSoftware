import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { erfassungsgroesse } from '@/lib/erfassungsgroessen';
import { Angabefeld } from './Angabefeld';

/**
 * Eine Auswahl in Wörtern (TRK-004, ANN-354): gewählt wird ein Wort,
 * gespeichert die ganze Zahl; nichts ist vorausgewählt (ANN-349).
 */
describe('Angabefeld, Auswahl in Wörtern (TRK-004)', () => {
  const schmerzart = erfassungsgroesse('pain_quality')!;

  it('zeigt die Wörter, nichts gewählt, und gibt die Zahl zurück', async () => {
    const onChange = vi.fn();
    render(<Angabefeld groesse={schmerzart} wert={null} zuletzt={2} onChange={onChange} />);
    const gruppe = screen.getByRole('group', { name: 'Wie fühlt sich der Schmerz vor allem an?' });
    expect(gruppe).toBeInTheDocument();
    const optionen = screen.getAllByRole('radio');
    expect(optionen).toHaveLength(5);
    expect(optionen.every((o) => !(o as HTMLInputElement).checked)).toBe(true);
    // Der letzte Wert nur als Hinweis, in Worten.
    expect(screen.getByText('Ihre letzte Angabe: stechend')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('brennend'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('nennt die Wahl in Worten', () => {
    render(<Angabefeld groesse={schmerzart} wert={5} onChange={() => {}} />);
    expect(screen.getByText('gewählt: ziehend')).toBeInTheDocument();
    expect(screen.getByLabelText('ziehend')).toBeChecked();
  });
});
