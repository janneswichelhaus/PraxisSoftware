import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PasskeyModul from './passkey';

const signInWithPassword = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithPassword } }),
}));

const anmeldenMitPasskey = vi.fn<() => Promise<void>>();
const passkeyMoeglich = vi.fn(() => true);
vi.mock('./passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof PasskeyModul>()),
  anmeldenMitPasskey: () => anmeldenMitPasskey(),
  passkeyMoeglich: () => passkeyMoeglich(),
}));

const { LoginPage } = await import('./LoginPage');
const { SitzungsendeContext } = await import('./sitzungsende');
const { PasskeyFehler, PASSKEY_SAETZE } = await import('./passkey');

/** Der ungefragte Start beim Aufruf bricht ab, wie wenn die Person das Fenster schließt. */
function startBrichtAb() {
  anmeldenMitPasskey.mockRejectedValueOnce(new PasskeyFehler(PASSKEY_SAETZE.abgebrochen, true));
}

/** Rendert und wartet, bis der ungefragte Start vorbei ist und der Knopf wieder bereitsteht. */
async function nachDemStart(element: ReactElement) {
  render(element);
  return waitFor(() => {
    const knopf = screen.getByRole('button', { name: 'Mit Passkey anmelden' });
    expect(knopf).toBeEnabled();
    return knopf;
  });
}

describe('LoginPage: Anmeldung per Passkey (ADR-025 Fassung 2)', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    // Das Fenster bleibt offen, bis ein Test es anders will.
    anmeldenMitPasskey.mockReset().mockReturnValue(new Promise<void>(() => undefined));
    passkeyMoeglich.mockReset().mockReturnValue(true);
  });

  it('öffnet das Passkey-Fenster beim Aufruf von selbst, genau einmal', async () => {
    render(<LoginPage testzugang={false} />);
    await waitFor(() => expect(anmeldenMitPasskey).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('zeigt einen Fehlschlag des ungefragten Starts nicht als Fehler, der Knopf bleibt', async () => {
    anmeldenMitPasskey.mockRejectedValueOnce(new PasskeyFehler(PASSKEY_SAETZE.nichtAngenommen));
    await nachDemStart(<LoginPage testzugang={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('startet ohne Passkey-fähigen Browser nichts', () => {
    passkeyMoeglich.mockReturnValue(false);
    render(<LoginPage testzugang={false} />);
    expect(anmeldenMitPasskey).not.toHaveBeenCalled();
  });

  it('bietet in Produktion nur den Passkey an - kein Kennwort, kein „Kennwort vergessen“', async () => {
    startBrichtAb();
    await nachDemStart(<LoginPage testzugang={false} />);
    expect(screen.queryByText('Testkonten')).toBeNull();
    expect(screen.queryByLabelText('Kennwort')).toBeNull();
    expect(screen.queryByLabelText('E-Mail-Adresse')).toBeNull();
    expect(screen.queryByText(/Kennwort vergessen/)).toBeNull();
    expect(screen.getByText(/Die Praxis gibt Ihnen eine neue Einladung/)).toBeInTheDocument();
    // Die Hilfe am Rechner auf Abruf, nicht als dritter grauer Satz (L8).
    expect(screen.getByText('Am Rechner anmelden').closest('summary')).not.toBeNull();
    expect(screen.getByText(/„anderes Gerät“ wählen/)).not.toBeVisible();
  });

  it('meldet mit dem Passkey an', async () => {
    startBrichtAb();
    const user = userEvent.setup();
    await user.click(await nachDemStart(<LoginPage testzugang={false} />));
    expect(anmeldenMitPasskey).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sagt einen Fehlschlag des Passkeys und setzt den Fokus dorthin (AUTH-06)', async () => {
    anmeldenMitPasskey.mockRejectedValue(new PasskeyFehler(PASSKEY_SAETZE.nichtAngenommen));
    const user = userEvent.setup();
    await user.click(await nachDemStart(<LoginPage testzugang={false} />));
    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent(PASSKEY_SAETZE.nichtAngenommen);
    expect(meldung.parentElement).toHaveFocus();
  });

  it('sagt bei einer unerwarteten Ausnahme „keine Verbindung“', async () => {
    anmeldenMitPasskey.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    await user.click(await nachDemStart(<LoginPage testzugang={false} />));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Keine Verbindung zum Anmeldedienst.',
    );
  });

  it('sagt, wenn der Browser keine Passkeys kann', () => {
    passkeyMoeglich.mockReturnValue(false);
    render(<LoginPage testzugang={false} />);
    expect(screen.queryByRole('button', { name: 'Mit Passkey anmelden' })).toBeNull();
    expect(screen.getByText(PASSKEY_SAETZE.nichtUnterstuetzt)).toBeInTheDocument();
  });

  it('zeigt die Marke statt des Worts Praxisplattform', () => {
    render(<LoginPage testzugang={false} />);
    expect(screen.getByRole('img', { name: 'Own Motion' })).toBeInTheDocument();
    expect(screen.queryByText('Praxisplattform')).toBeNull();
  });

  it('trägt Überschrift und Hauptbereich der Vollseite (AUTH-12, AUTH-13)', () => {
    render(<LoginPage testzugang={false} />);
    const titel = screen.getByRole('heading', { level: 1, name: 'Anmelden' });
    expect(screen.getByRole('main')).toContainElement(titel);
    expect(titel.className).toContain('text-h3');
  });

  it('sagt nach einem Sitzungsende von außen, dass Eingaben nicht erhalten sind', () => {
    render(
      <SitzungsendeContext.Provider value={true}>
        <LoginPage testzugang={false} />
      </SitzungsendeContext.Provider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ihre Sitzung wurde beendet. Nicht gespeicherte Eingaben sind nicht erhalten.',
    );
  });

  it('sagt beim gewöhnlichen Aufruf nichts über eine Sitzung', () => {
    render(
      <SitzungsendeContext.Provider value={false}>
        <LoginPage testzugang={false} />
      </SitzungsendeContext.Provider>,
    );
    expect(screen.queryByText(/Sitzung wurde beendet/)).not.toBeInTheDocument();
  });

  it('ist für Vorlesesoftware sauber - mit und ohne Testzugang', async () => {
    const { container } = render(<LoginPage testzugang={false} />);
    await pruefeBarrierefreiheit(container);
    cleanup();
    const mit = render(<LoginPage testzugang />);
    await pruefeBarrierefreiheit(mit.container);
  });
});

describe('LoginPage: Testzugang mit Kennwort, nur außerhalb der Produktion (Punkt 15)', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    // Ohne Passkey-Browser startet nichts von selbst; hier geht es nur ums Kennwort.
    passkeyMoeglich.mockReset().mockReturnValue(false);
  });

  it('liegt zugeklappt hinter „Testkonten“', async () => {
    const user = userEvent.setup();
    render(<LoginPage testzugang />);
    const kopf = screen.getByText('Testkonten');
    expect(screen.getByLabelText('E-Mail-Adresse')).not.toBeVisible();
    await user.click(kopf);
    expect(screen.getByLabelText('E-Mail-Adresse')).toBeVisible();
  });

  it('stellt beschriftete Felder mit passenden Autocomplete-Werten bereit', () => {
    render(<LoginPage testzugang />);
    expect(screen.getByRole('form', { name: 'Testzugang' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-Mail-Adresse')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Kennwort')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
  });

  it('nennt bei falschen Zugangsdaten keinen Grund (kein Konto-Orakel)', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    const user = userEvent.setup();
    render(<LoginPage testzugang />);
    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'wer@praxis.invalid');
    await user.type(screen.getByLabelText('Kennwort'), 'falsch');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Anmeldung nicht möglich');
    expect(meldung.textContent).not.toMatch(/Invalid login credentials/);
    expect(meldung.parentElement).toHaveFocus();
  });

  async function anmelden() {
    const user = userEvent.setup();
    render(<LoginPage testzugang />);
    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'wer@praxis.invalid');
    await user.type(screen.getByLabelText('Kennwort'), 'irgendeins');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    return screen.findByRole('alert');
  }

  it('sagt im Funkloch, dass die Angaben nicht geprüft wurden (BEF-047)', async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
    });
    expect(await anmelden()).toHaveTextContent(
      'Keine Verbindung zum Anmeldedienst. Ihre Angaben wurden nicht geprüft.',
    );
  });

  it('nennt zu viele Versuche', async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: { name: 'AuthApiError', status: 429, code: 'over_request_rate_limit', message: 'x' },
    });
    expect(await anmelden()).toHaveTextContent('Zu viele Versuche.');
  });

  it('unterscheidet falsches Kennwort, unbekanntes und unbestätigtes Konto nicht', async () => {
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
  });

  it('fragt leere Felder nicht beim Dienst an', async () => {
    const user = userEvent.setup();
    render(<LoginPage testzugang />);
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bitte E-Mail-Adresse und Kennwort eingeben.',
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
