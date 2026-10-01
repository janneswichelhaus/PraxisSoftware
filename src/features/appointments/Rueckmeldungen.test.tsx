import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { Rueckmeldung } from './Rueckmeldungen';

describe('Rueckmeldung (Design-Handoff 2026-10-01, Abschnitt 3)', () => {
  it('steht auf der Akzentfläche mit Häkchen und nimmt den Fokus', () => {
    renderWithProviders(<Rueckmeldung>Termin abgesagt.</Rueckmeldung>);

    const meldung = screen.getByRole('status');
    expect(meldung).toHaveTextContent('Termin abgesagt.');
    expect(meldung).toHaveClass('bg-accent-soft', 'text-accent', 'rounded-card', 'font-semibold');
    // Das Häkchen ist Bild, der Satz trägt die Bedeutung.
    expect(meldung.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓');
    expect(meldung.parentElement).toHaveFocus();
  });
});
