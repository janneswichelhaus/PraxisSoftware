import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { erfassungsgroesse } from '@/lib/erfassungsgroessen';
import { Angabefeld } from './Angabefeld';

const gedrueckt = (gruppe: HTMLElement) =>
  within(gruppe)
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true');

describe('Angabefeld, Skala 0 bis 10', () => {
  const ruhe = erfassungsgroesse('pain_rest')!;

  it('nennt die Anker als Satz, wählt nichts vor und zeigt die letzte Angabe mit Tag', async () => {
    const onChange = vi.fn();
    render(
      <Angabefeld
        groesse={ruhe}
        wert={null}
        zuletzt={3}
        zuletztAm="21. Oktober"
        onChange={onChange}
      />,
    );
    const gruppe = screen.getByRole('group', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' });
    expect(within(gruppe).getAllByRole('button')).toHaveLength(11);
    expect(gedrueckt(gruppe)).toEqual([]);
    expect(
      screen.getByText('0 heißt „keine“, 10 heißt „stärkste vorstellbare“.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ihre letzte Angabe: 3 am 21. Oktober')).toBeInTheDocument();
    expect(within(gruppe).getByRole('button', { name: '0 – keine' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Angabe entfernen/ })).not.toBeInTheDocument();
    await userEvent.click(within(gruppe).getByRole('button', { name: '4' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('nimmt die Antwort mit einem zweiten Tipp zurück', async () => {
    const onChange = vi.fn();
    render(<Angabefeld groesse={ruhe} wert={4} onChange={onChange} />);
    const vier = screen.getByRole('button', { name: '4' });
    expect(vier).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('gewählt: 4')).toHaveClass('sr-only');
    await userEvent.click(vier);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('Angabefeld, Auswahl in Wörtern (ANN-354)', () => {
  const schmerzart = erfassungsgroesse('pain_quality')!;

  it('zeigt die Wörter als ganze Zeilen, nichts gewählt, und gibt die Zahl zurück', async () => {
    const onChange = vi.fn();
    render(<Angabefeld groesse={schmerzart} wert={null} zuletzt={2} onChange={onChange} />);
    const gruppe = screen.getByRole('group', { name: 'Wie fühlt sich der Schmerz vor allem an?' });
    expect(within(gruppe).getAllByRole('button')).toHaveLength(5);
    expect(gedrueckt(gruppe)).toEqual([]);
    // Der letzte Wert nur als Hinweis, in Worten.
    expect(screen.getByText('Ihre letzte Angabe: stechend')).toBeInTheDocument();
    await userEvent.click(within(gruppe).getByRole('button', { name: 'brennend' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('nennt die Wahl in Worten und nimmt sie mit einem zweiten Tipp zurück', async () => {
    const onChange = vi.fn();
    render(<Angabefeld groesse={schmerzart} wert={5} onChange={onChange} />);
    expect(screen.getByText('gewählt: ziehend')).toBeInTheDocument();
    const ziehend = screen.getByRole('button', { name: 'ziehend' });
    expect(ziehend).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(ziehend);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('Angabefeld, Zahl mit Einheit', () => {
  it('beschriftet das Feld mit der Frage und nennt die letzte Angabe darunter', () => {
    const steif = erfassungsgroesse('morning_stiffness_minutes')!;
    render(<Angabefeld groesse={steif} wert={null} zuletzt={20} onChange={() => {}} />);
    expect(screen.getByLabelText('Wie viele Minuten waren Sie heute Morgen steif?')).toHaveValue(
      null,
    );
    expect(screen.getByText('Ihre letzte Angabe: 20 Minuten')).toBeInTheDocument();
  });
});
