import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from './Field';
import { Select } from './Select';
import { TextArea } from './TextArea';

describe('Field', () => {
  it('rendert normale Felder ohne Sichtbar-Schalter', () => {
    render(<Field label="Suche" type="search" />);
    expect(screen.getByLabelText('Suche')).toHaveAttribute('type', 'search');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('blendet ein Passwort erst auf Klick ein und wieder aus', async () => {
    const user = userEvent.setup();
    render(<Field label="Kennwort" type="password" defaultValue="geheim123" />);

    const input = screen.getByLabelText('Kennwort');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Kennwort anzeigen' }));
    expect(input).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Kennwort verbergen' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('zeigt beim Kennwort-Schalter eine Wirkung beim Ueberfahren (UIK-22)', () => {
    // Bis UXR-001 wechselte er von einer Farbe zur gleichen.
    render(<Field label="Kennwort" type="password" />);
    const schalter = screen.getByRole('button', { name: 'Kennwort anzeigen' });
    expect(schalter).toHaveClass('text-ink-muted', 'hover:text-ink');
  });
});

/**
 * UIK-05, ABR-31: Ein abgeschaltetes Feld sah aus wie ein bedienbares - weiß,
 * Tinte, kräftiger Rand; nur der Mauszeiger wechselte. Abgeschaltet ist es
 * jetzt vertieft, mit eigener Fläche statt Deckkraft (DS-001).
 */
describe('Abgeschaltete Felder', () => {
  it('setzen Field, Select und TextArea sichtbar ab', () => {
    render(
      <>
        <Field label="Menge" disabled />
        <Select label="Heilmittel" disabled>
          <option>KG</option>
        </Select>
        <TextArea label="Bemerkung" disabled />
      </>,
    );
    for (const name of ['Menge', 'Heilmittel', 'Bemerkung']) {
      const feld = screen.getByLabelText(name);
      expect(feld).toBeDisabled();
      expect(feld).toHaveClass('disabled:bg-surface-sunken', 'disabled:cursor-not-allowed');
      expect(feld.className).not.toMatch(/\bopacity-/);
    }
  });
});
