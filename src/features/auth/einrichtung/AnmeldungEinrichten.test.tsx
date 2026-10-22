import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnmeldungEinrichten } from './AnmeldungEinrichten';

/**
 * Wo sich später ein zweiter Passkey einrichten lässt (DR-105): Die
 * Einrichtungspflicht weiß noch nicht, ob Praxis oder Plattform folgt - ohne
 * Angabe steht deshalb ein Ort, der für beide stimmt, nie „Mein Konto“.
 */
describe('AnmeldungEinrichten (DR-105)', () => {
  it('nennt ohne Angabe einen Ort, der in Praxis und Plattform stimmt', () => {
    render(
      <AnmeldungEinrichten
        stand={{ passkeys: 1, pin: true }}
        onFertig={vi.fn()}
        onAbmelden={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /Richten Sie später in den Einstellungen Ihres Kontos einen zweiten Passkey ein/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Mein Konto/)).toBeNull();
  });

  it('nennt den Ort in den Wörtern der Oberfläche, wenn sie ihn mitgibt', () => {
    render(
      <AnmeldungEinrichten
        stand={{ passkeys: 1, pin: true }}
        onFertig={vi.fn()}
        onAbmelden={vi.fn()}
        weitererPasskey="unter „Ich → Einstellungen → Passkey und PIN“"
      />,
    );
    expect(
      screen.getByText(/unter „Ich → Einstellungen → Passkey und PIN“ einen zweiten Passkey ein/),
    ).toBeInTheDocument();
  });
});
