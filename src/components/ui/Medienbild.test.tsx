import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Medienbild } from './Medienbild';

/** Die Klassen eines Elements als Liste - für Zusicherungen ohne Teiltreffer. */
function klassenVon(element: Element | null | undefined): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('Medienbild (Design-Fundament, Lücke 9.10)', () => {
  it('hält 4:3, Radius 16 und eine Linie und zeigt das Bild ganz, träge geladen', async () => {
    const { container } = renderWithProviders(
      <Medienbild src="/uebungen/wandsitz.svg" alt="Wandsitz: Rücken an der Wand, Knie gebeugt" />,
    );
    const bild = screen.getByRole('img', { name: 'Wandsitz: Rücken an der Wand, Knie gebeugt' });
    expect(bild.tagName).toBe('IMG');
    expect(bild).toHaveAttribute('loading', 'lazy');
    expect(klassenVon(bild)).toEqual(expect.arrayContaining(['object-contain', 'size-full']));
    const rahmen = bild.parentElement!;
    expect(klassenVon(rahmen)).toEqual(
      expect.arrayContaining([
        'aspect-[4/3]',
        'rounded-image',
        'border',
        'border-line',
        'overflow-hidden',
        'bg-surface',
      ]),
    );
    expect(rahmen.className).not.toMatch(/shadow|ring/);
    await pruefeBarrierefreiheit(container);
  });

  it('füllt bei Fotos den Rahmen und kennt 1:1', () => {
    renderWithProviders(
      <Medienbild src="/foto.jpg" alt="Foto" einpassen="fuellen" verhaeltnis="1:1" />,
    );
    const bild = screen.getByRole('img', { name: 'Foto' });
    expect(bild).toHaveClass('object-cover');
    expect(bild.parentElement).toHaveClass('aspect-square');
  });

  it('zeigt ohne Bild einen Platzhalter mit Wort, kein zerbrochenes Symbol', () => {
    renderWithProviders(<Medienbild alt="Seitstütz" />);
    const platzhalter = screen.getByRole('img', { name: 'Seitstütz - Noch kein Bild' });
    expect(platzhalter.tagName).toBe('SPAN');
    expect(platzhalter).toHaveClass('bg-surface-sunken');
    expect(screen.getByText('Noch kein Bild')).toBeInTheDocument();
  });

  it('fällt auf den Platzhalter zurück, wenn das Bild nicht lädt', () => {
    renderWithProviders(<Medienbild src="/fehlt.png" alt="Brücke" />);
    fireEvent.error(screen.getByRole('img', { name: 'Brücke' }));
    expect(screen.getByRole('img', { name: 'Brücke - Noch kein Bild' })).toBeInTheDocument();
  });

  it('nimmt eine gezeichnete Figur als Bild und benennt sie', () => {
    renderWithProviders(
      <Medienbild alt="Kniebeuge">
        <svg viewBox="0 0 40 30">
          <circle cx="20" cy="8" r="4" />
        </svg>
      </Medienbild>,
    );
    const figur = screen.getByRole('img', { name: 'Kniebeuge' });
    expect(figur.querySelector('svg')).not.toBeNull();
    expect(figur).toHaveClass('[&>svg]:size-full');
  });

  it('ist als Vorschau 56 × 56 mit kleinerem Radius und ohne Wort im Platzhalter', () => {
    renderWithProviders(<Medienbild vorschau alt="Wandsitz" />);
    const platzhalter = screen.getByRole('img', { name: 'Wandsitz - Noch kein Bild' });
    expect(klassenVon(platzhalter.parentElement)).toEqual(
      expect.arrayContaining(['size-14', 'rounded-button']),
    );
    expect(platzhalter.parentElement).not.toHaveClass('aspect-[4/3]');
    expect(screen.queryByText('Noch kein Bild')).toBeNull();
  });

  it('zeigt im Platzhalter ein eigenes Zeichen, wo der Platz kein Bild meint (TEAM-003)', () => {
    renderWithProviders(
      <Medienbild
        vorschau
        alt=""
        platzhalter="PDF"
        zeichen={
          <svg viewBox="0 0 24 24" data-testid="dokument">
            <path d="M6 3h8l4 4v14H6z" />
          </svg>
        }
      />,
    );
    const platzhalter = screen.getByRole('img', { name: 'PDF' });
    expect(platzhalter).toHaveClass('bg-surface-sunken');
    expect(platzhalter.parentElement).toHaveClass('border-line');
    const zeichen = screen.getByTestId('dokument');
    expect(zeichen.parentElement).toHaveClass('[&>svg]:size-full');
    expect(zeichen.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(platzhalter.querySelectorAll('svg')).toHaveLength(1);
  });

  it('setzt eine Bildunterschrift als figcaption', () => {
    renderWithProviders(
      <Medienbild src="/a.svg" alt="Ausgangsstellung" beschriftung="1 · Ausgangsstellung" />,
    );
    const unterschrift = screen.getByText('1 · Ausgangsstellung');
    expect(unterschrift.tagName).toBe('FIGCAPTION');
    expect(unterschrift).toHaveClass('text-sm', 'text-ink-muted');
  });
});
