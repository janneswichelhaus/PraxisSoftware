import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Schrittliste } from './Schrittliste';

describe('Schrittliste (ANN-539)', () => {
  it('nummeriert je Zeile einen Schritt und sagt ihn Vorlesesoftware an', () => {
    render(<Schrittliste text={'Setzen Sie sich.\n\n  Strecken Sie das Knie.  \n'} />);
    const schritte = screen.getAllByRole('listitem');
    expect(schritte).toHaveLength(2);
    expect(schritte[1]).toHaveTextContent('Schritt 2: Strecken Sie das Knie.');
  });

  it('lässt einen einzelnen Satz einen Absatz bleiben', () => {
    render(<Schrittliste text="Festhalten." />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('Festhalten.').tagName).toBe('P');
  });

  it('zeigt ohne Text nur den Leersatz, wenn es einen gibt', () => {
    const { container, rerender } = render(<Schrittliste text={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Schrittliste text="" leer="Noch keine Anleitung." />);
    expect(screen.getByText('Noch keine Anleitung.')).toBeInTheDocument();
  });
});
