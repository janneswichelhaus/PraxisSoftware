import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from './Field';

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
});
