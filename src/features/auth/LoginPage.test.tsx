import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithPassword, resetPasswordForEmail } }),
}));

const { LoginPage } = await import('./LoginPage');
const { SessionContext } = await import('./sessionContext');

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
  // Die Maske nennt die Ursache (BEF-047)
  // ---------------------------------------------------------------------------
  async function anmelden() {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'wer@praxis.invalid');
    await user.type(screen.getByLabelText('Kennwort'), 'irgendeins');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    return screen.findByRole('alert');
  }

  it('sagt im Funkloch, dass die Angaben nicht geprüft wurden - nicht „Kennwort prüfen"', async () => {
    // So gibt der Anmeldedienst einen Netzfehler zurück, ohne zu werfen.
    signInWithPassword.mockResolvedValueOnce({
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
    });

    const meldung = await anmelden();
    expect(meldung).toHaveTextContent(
      'Keine Verbindung zum Anmeldedienst. Ihre Angaben wurden nicht geprüft.',
    );
    expect(meldung).not.toHaveTextContent('prüfen.');
  });

  it('sagt auch bei einer geworfenen Ausnahme „keine Verbindung"', async () => {
    signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await anmelden()).toHaveTextContent('Keine Verbindung zum Anmeldedienst.');
  });

  it('nennt zu viele Versuche', async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { name: 'AuthApiError', status: 429, code: 'over_request_rate_limit', message: 'x' },
    });
    expect(await anmelden()).toHaveTextContent(
      'Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.',
    );
  });

  it('nennt eine Störung des Dienstes', async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { name: 'AuthUnknownError', status: 502, message: 'Bad Gateway' },
    });
    expect(await anmelden()).toHaveTextContent(
      'Der Anmeldedienst ist gerade nicht erreichbar. Ihre Angaben wurden nicht geprüft.',
    );
  });

  it('unterscheidet falsches Kennwort, unbekanntes und unbestätigtes Konto nicht (kein Konto-Orakel)', async () => {
    const saetze: string[] = [];
    for (const code of ['invalid_credentials', 'user_not_found', 'email_not_confirmed']) {
      signInWithPassword.mockResolvedValueOnce({
        error: { name: 'AuthApiError', status: 400, code, message: code },
      });
      const meldung = await anmelden();
      saetze.push(meldung.textContent ?? '');
      cleanup();
    }
    expect(new Set(saetze).size).toBe(1);
    expect(saetze[0]).toContain('Bitte E-Mail-Adresse und Kennwort prüfen.');
  });

  it('fragt leere Felder nicht beim Dienst an', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bitte E-Mail-Adresse und Kennwort eingeben.',
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('sagt nach einem Sitzungsende von außen, dass Eingaben nicht erhalten sind', () => {
    render(
      <SessionContext.Provider
        value={{ session: null, initialising: false, endeVonAussen: true, signOut: vi.fn() }}
      >
        <LoginPage />
      </SessionContext.Provider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Ihre Sitzung wurde beendet. Nicht gespeicherte Eingaben sind nicht erhalten.',
    );
  });

  it('sagt beim gewöhnlichen Aufruf nichts über eine Sitzung', () => {
    render(
      <SessionContext.Provider
        value={{ session: null, initialising: false, endeVonAussen: false, signOut: vi.fn() }}
      >
        <LoginPage />
      </SessionContext.Provider>,
    );

    expect(screen.queryByText(/Sitzung wurde beendet/)).not.toBeInTheDocument();
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

  // ---------------------------------------------------------------------------
  // UXR-002
  // ---------------------------------------------------------------------------
  it('trägt Überschrift und Hauptbereich der Vollseite (AUTH-12, AUTH-13)', () => {
    render(<LoginPage />);

    const titel = screen.getByRole('heading', { level: 1, name: 'Anmelden' });
    expect(screen.getByRole('main')).toContainElement(titel);
    expect(titel.className).toContain('text-h3');
    // „Kennwort vergessen?" ist ein leiser Knopf in der Hauptfarbe, kein
    // grauer Unterstrich mehr (UIK-14).
    const knopf = screen.getByRole('button', { name: 'Kennwort vergessen?' });
    expect(knopf.className).toContain('text-accent');
    expect(knopf.className).not.toContain('underline');
  });

  it('führt den Fokus ins Feld und nach „Abbrechen" zurück (AUTH-06)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Kennwort vergessen?' }));
    expect(screen.getByLabelText('E-Mail-Adresse des Zugangs')).toHaveFocus();
    // Die Überschrift des Abschnitts kommt aus Section (TOK-05).
    expect(
      screen.getByRole('heading', { level: 2, name: 'Kennwort vergessen' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByRole('button', { name: 'Kennwort vergessen?' })).toHaveFocus();
  });

  it('setzt den Fokus auf den Fehler einer gescheiterten Anmeldung (AUTH-06)', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'wer@praxis.invalid');
    await user.type(screen.getByLabelText('Kennwort'), 'falsch');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    const meldung = await screen.findByRole('alert');
    expect(meldung.parentElement).toHaveFocus();
  });

  it('prüft das Format der Adresse, bevor es anfragt (AUTH-11)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Kennwort vergessen?' }));
    const feld = screen.getByLabelText('E-Mail-Adresse des Zugangs');
    await user.type(feld, 'anna@praxis,invalid');
    await user.click(screen.getByRole('button', { name: 'Link anfordern' }));

    expect(screen.getByText('Bitte eine gültige E-Mail-Adresse angeben.')).toBeInTheDocument();
    expect(feld).toHaveAttribute('aria-invalid', 'true');
    expect(feld).toHaveFocus();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(screen.queryByText(/Falls für diese Adresse/)).toBeNull();
  });

  it('nennt die Adresse in der Bestätigung und lässt sie korrigieren (AUTH-11)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Kennwort vergessen?' }));
    await user.type(screen.getByLabelText('E-Mail-Adresse des Zugangs'), 'anna@praxis.invalid');
    await user.click(screen.getByRole('button', { name: 'Link anfordern' }));

    const bestaetigung = await screen.findByText(/Falls für diese Adresse ein Zugang besteht/);
    expect(bestaetigung).toHaveTextContent('Angefordert für anna@praxis.invalid.');
    // Der Fokus steht auf der Bestätigung, die das Formular ersetzt (AUTH-06).
    expect(bestaetigung.parentElement).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Andere Adresse eingeben' }));
    const feld = screen.getByLabelText('E-Mail-Adresse des Zugangs');
    expect(feld).toHaveValue('anna@praxis.invalid');
    expect(feld).toHaveFocus();
  });

  it('ist mit offenem „Kennwort vergessen" für Vorlesesoftware sauber', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Kennwort vergessen?' }));

    await pruefeBarrierefreiheit(container);
  });
});
