import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithPassword, resetPasswordForEmail } }),
}));

const { LoginPage } = await import('./LoginPage');

describe('LoginPage', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    resetPasswordForEmail.mockReset();
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });

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

  // ---------------------------------------------------------------------------
  // Kennwort vergessen (STAFF-004a)
  // ---------------------------------------------------------------------------
  it('fordert eine Mail an und uebernimmt die schon getippte Adresse', async () => {
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'anna@praxis.invalid');
    await user.click(screen.getByRole('button', { name: 'Kennwort vergessen?' }));

    expect(screen.getByLabelText('E-Mail-Adresse des Zugangs')).toHaveValue('anna@praxis.invalid');

    await user.click(screen.getByRole('button', { name: 'Link anfordern' }));

    expect(
      await screen.findByText(/Falls für diese Adresse ein Zugang besteht/),
    ).toBeInTheDocument();
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(resetPasswordForEmail.mock.calls[0]?.[0]).toBe('anna@praxis.invalid');
  });

  it('sagt, wenn der Anmeldedienst nicht erreichbar war (R3-008)', async () => {
    // Ein Netzfehler ist keine Auskunft ueber ein Konto - aber auch kein
    // Erfolg. Bisher stand hier "Falls fuer diese Adresse ein Zugang
    // besteht ...", und die Person wartete auf eine Mail, die nie kam.
    resetPasswordForEmail.mockResolvedValue({
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' },
    });
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Kennwort vergessen?' }));
    await user.type(screen.getByLabelText('E-Mail-Adresse des Zugangs'), 'anna@praxis.invalid');
    await user.click(screen.getByRole('button', { name: 'Link anfordern' }));

    expect(await screen.findByText(/nicht erreichbar/)).toBeInTheDocument();
    expect(screen.queryByText(/Falls für diese Adresse ein Zugang besteht/)).toBeNull();
    // Und weiterhin kein Wort darueber, ob es das Konto gibt.
    expect(document.body.textContent).not.toMatch(/Failed to fetch/);
    expect(document.body.textContent).not.toMatch(/unbekannt|existiert/i);
  });

  it('bestaetigt gleich, ob es die Adresse gibt oder nicht (kein Konto-Orakel)', async () => {
    // Auch ein Fehler des Anmeldedienstes darf nichts verraten.
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } });
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Kennwort vergessen?' }));
    await user.type(screen.getByLabelText('E-Mail-Adresse des Zugangs'), 'niemand@praxis.invalid');
    await user.click(screen.getByRole('button', { name: 'Link anfordern' }));

    expect(
      await screen.findByText(/Falls für diese Adresse ein Zugang besteht/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/User not found/);
    expect(document.body.textContent).not.toMatch(/unbekannt/i);
  });
});
