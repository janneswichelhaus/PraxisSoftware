import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signInWithPassword = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithPassword } }),
}));

const { LoginPage } = await import('./LoginPage');

describe('LoginPage', () => {
  it('stellt beschriftete Felder mit passenden Autocomplete-Werten bereit', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('E-Mail-Adresse')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Kennwort')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
  });

  it('zeigt die Marke statt des Worts Praxisplattform', () => {
    render(<LoginPage />);
    expect(screen.getByRole('img', { name: 'Own Motion' })).toBeInTheDocument();
    expect(screen.queryByText('Praxisplattform')).toBeNull();
  });

  it('nennt bei falschen Zugangsdaten keinen Grund (kein Konto-Orakel)', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'wer@praxis.invalid');
    await user.type(screen.getByLabelText('Kennwort'), 'falsch');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Anmeldung nicht möglich');
    expect(meldung.textContent).not.toMatch(/Invalid login credentials/);
    expect(meldung.textContent).not.toMatch(/existiert/i);
  });
});
