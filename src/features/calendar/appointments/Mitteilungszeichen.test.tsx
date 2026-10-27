import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Mitteilungszeichen } from './Mitteilungszeichen';

/**
 * Die Zeichenreihe hinter einem Termin (CAL-012).
 *
 * Geprüft wird vor allem die Zusage aus der Oberflächen-Checkliste Punkt 4:
 * Das Bild ergänzt, getragen wird die Bedeutung vom Wort.
 */
describe('Mitteilungszeichen', () => {
  it('zeigt je Weg ein Wort', () => {
    render(<Mitteilungszeichen kanaele={['phone', 'slip']} />);
    expect(screen.getByText('Telefon')).toBeInTheDocument();
    expect(screen.getByText('Zettel')).toBeInTheDocument();
  });

  it('nennt alle vier Wege bei ihrem Namen', () => {
    render(<Mitteilungszeichen kanaele={['in_person', 'phone', 'slip', 'email']} />);
    for (const wort of ['Persönlich', 'Telefon', 'Zettel', 'E-Mail']) {
      expect(screen.getByText(wort)).toBeInTheDocument();
    }
  });

  it('zeigt ohne Vermerk gar nichts - kein „noch nicht" als Rauschen', () => {
    const { container } = render(<Mitteilungszeichen kanaele={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('blendet das Bild für Vorlesesoftware aus', () => {
    const { container } = render(<Mitteilungszeichen kanaele={['email']} />);
    const bild = container.querySelector('svg');
    expect(bild).not.toBeNull();
    expect(bild).toHaveAttribute('aria-hidden', 'true');
    // Das Wort daneben trägt die Bedeutung.
    expect(screen.getByText('E-Mail')).toBeInTheDocument();
  });
});
