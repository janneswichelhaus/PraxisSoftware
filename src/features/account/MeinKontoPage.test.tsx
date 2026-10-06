import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import type * as AccountApi from './api';
import { SessionContext } from '@/features/auth/sessionContext';
import { renderWithProviders, testUser } from '@/test-utils';

const aendereKennwort = vi.fn();
const beendeAlleSitzungen = vi.fn();
const ladeMfaFaktoren = vi.fn();
const starteMfaEinrichtung = vi.fn();
const bestaetigeMfa = vi.fn();
const entferneMfa = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AccountApi>();
  return {
    ...actual,
    aendereKennwort: (kennwort: string) => aendereKennwort(kennwort) as Promise<void>,
    beendeAlleSitzungen: () => beendeAlleSitzungen() as Promise<void>,
    ladeMfaFaktoren: () => ladeMfaFaktoren() as Promise<AccountApi.MfaFaktor[]>,
    starteMfaEinrichtung: () => starteMfaEinrichtung() as Promise<AccountApi.MfaEinrichtung>,
    bestaetigeMfa: (id: string, code: string) => bestaetigeMfa(id, code) as Promise<void>,
    entferneMfa: (id: string) => entferneMfa(id) as Promise<void>,
  };
});

const { MeinKontoPage } = await import('./MeinKontoPage');

const einrichtung: AccountApi.MfaEinrichtung = {
  factorId: 'factor-1',
  qrCode: 'data:image/svg+xml;base64,PHN2Zy8+',
  secret: 'ABCD EFGH IJKL MNOP',
};

describe('MeinKontoPage', () => {
  beforeEach(() => {
    for (const mock of [
      aendereKennwort,
      beendeAlleSitzungen,
      ladeMfaFaktoren,
      starteMfaEinrichtung,
      bestaetigeMfa,
      entferneMfa,
    ]) {
      mock.mockReset();
    }
    aendereKennwort.mockResolvedValue(undefined);
    beendeAlleSitzungen.mockResolvedValue(undefined);
    ladeMfaFaktoren.mockResolvedValue([]);
    starteMfaEinrichtung.mockResolvedValue(einrichtung);
    bestaetigeMfa.mockResolvedValue(undefined);
    entferneMfa.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // Kennwort (STAFF-004a)
  // ---------------------------------------------------------------------------
  it('verlangt die Mindestlänge', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    await user.type(screen.getByLabelText('Neues Kennwort'), 'kurz');
    await user.type(screen.getByLabelText('Neues Kennwort wiederholen'), 'kurz');
    await user.click(screen.getByRole('button', { name: 'Kennwort ändern' }));

    expect(await screen.findByText(/mindestens 12 Zeichen/)).toBeInTheDocument();
    expect(aendereKennwort).not.toHaveBeenCalled();
  });

  it('verlangt zwei gleiche Eingaben', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    await user.type(screen.getByLabelText('Neues Kennwort'), 'ein langer satz hier');
    await user.type(screen.getByLabelText('Neues Kennwort wiederholen'), 'ein anderer satz');
    await user.click(screen.getByRole('button', { name: 'Kennwort ändern' }));

    expect(
      await screen.findByText('Die beiden Eingaben stimmen nicht überein.'),
    ).toBeInTheDocument();
    expect(aendereKennwort).not.toHaveBeenCalled();
  });

  it('ändert das Kennwort und leert die Felder', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    await user.type(screen.getByLabelText('Neues Kennwort'), 'ein langer satz hier');
    await user.type(screen.getByLabelText('Neues Kennwort wiederholen'), 'ein langer satz hier');
    await user.click(screen.getByRole('button', { name: 'Kennwort ändern' }));

    await waitFor(() => expect(aendereKennwort).toHaveBeenCalledWith('ein langer satz hier'));
    expect(await screen.findByText(/Das Kennwort wurde geändert/)).toBeInTheDocument();
    expect(screen.getByLabelText('Neues Kennwort')).toHaveValue('');
  });

  // ---------------------------------------------------------------------------
  // Sitzungen (STAFF-004a, R10)
  // ---------------------------------------------------------------------------
  it('beendet alle Sitzungen erst nach der Rückfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    await user.click(screen.getByRole('button', { name: 'Alle Sitzungen beenden' }));
    expect(beendeAlleSitzungen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Überall abmelden' }));
    await waitFor(() => expect(beendeAlleSitzungen).toHaveBeenCalledTimes(1));
  });

  // ---------------------------------------------------------------------------
  // Zweiter Faktor (STAFF-004b)
  // ---------------------------------------------------------------------------
  // UI-002d, ANN-028: Die Anmeldung prueft den Faktor heute nicht. Wer ihn
  // einrichtet, soll das vorher wissen - sonst verspricht die Oberflaeche
  // einen Schutz, den es nicht gibt.
  it('sagt vor der Einrichtung, dass die Anmeldung den Faktor noch nicht abfragt', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    const hinweis = await screen.findByText(/derzeit noch nicht ab/);
    expect(hinweis).toBeInTheDocument();
    // Vor der Schaltflaeche, nicht dahinter: Die Reihenfolge im Dokument ist
    // die Reihenfolge des Lesens.
    const knopf = await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' });
    expect(hinweis.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('steht auch dann da, wenn bereits ein Faktor eingerichtet ist', async () => {
    ladeMfaFaktoren.mockResolvedValue([{ id: 'faktor-1', bestaetigt: true }]);
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    expect(
      await screen.findByText('Für diesen Zugang ist ein zweiter Faktor eingerichtet.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/derzeit noch nicht ab/)).toBeInTheDocument();
  });

  it('warnt owner deutlicher als andere Rollen, wenn der zweite Faktor fehlt', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);
    expect(
      await screen.findByText(/darf Zugänge, Rollen und das Protokoll verwalten/),
    ).toBeInTheDocument();
  });

  it('nennt therapist denselben Stand ohne Warnton', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    expect(
      await screen.findByText('Für diesen Zugang ist kein zweiter Faktor eingerichtet.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/darf Zugänge, Rollen/)).not.toBeInTheDocument();
  });

  it('zeigt den QR-Code des Anmeldedienstes und die Angabe zum Abtippen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' }));

    const bild = await screen.findByAltText('QR-Code zum Einrichten des zweiten Faktors');
    expect(bild).toHaveAttribute('src', einrichtung.qrCode);
    expect(screen.getByText('ABCD EFGH IJKL MNOP')).toBeInTheDocument();
  });

  it('setzt das Geheimnis zum Abtippen in 14 px Festbreite (SKN-008)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' }));
    const geheimnis = await screen.findByTestId('totp-geheimnis');
    expect(geheimnis).toHaveTextContent('ABCD EFGH IJKL MNOP');
    expect(geheimnis).toHaveClass('font-mono', 'text-sm', 'text-ink');
    expect(geheimnis).not.toHaveClass('text-xs');
  });

  it('schließt die Einrichtung erst mit einem Code ab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' }));
    // Ohne Code bleibt die Schaltfläche gesperrt: ein unbestätigter Faktor
    // täte beim Anmelden nichts, sähe aber nach Schutz aus.
    expect(screen.getByRole('button', { name: 'Einrichtung abschließen' })).toBeDisabled();

    await user.type(screen.getByLabelText('Einmalkennwort aus der App'), '123456');
    await user.click(screen.getByRole('button', { name: 'Einrichtung abschließen' }));

    await waitFor(() => expect(bestaetigeMfa).toHaveBeenCalledWith('factor-1', '123456'));
  });

  it('meldet einen abgelehnten Code am Feld', async () => {
    const user = userEvent.setup();
    bestaetigeMfa.mockRejectedValue(new Error('falsch'));
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' }));
    await user.type(screen.getByLabelText('Einmalkennwort aus der App'), '000000');
    await user.click(screen.getByRole('button', { name: 'Einrichtung abschließen' }));

    // Ein Wort für eine Sache (WRT-17): Der QR-Code wird gescannt, das
    // Einmalkennwort eingetragen - abgelehnt wird das Einmalkennwort.
    expect(
      await screen.findByText(
        'Das Einmalkennwort wurde nicht angenommen. Bitte das aktuelle aus der App eintragen.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Einmalkennwort aus der App')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('entfernt einen bestätigten Faktor erst nach der Rückfrage', async () => {
    const user = userEvent.setup();
    ladeMfaFaktoren.mockResolvedValue([{ id: 'factor-1', bestaetigt: true }]);
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    expect(
      await screen.findByText('Für diesen Zugang ist ein zweiter Faktor eingerichtet.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zweiten Faktor entfernen' }));
    expect(entferneMfa).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(entferneMfa).toHaveBeenCalledWith('factor-1'));
  });

  it('zählt einen unbestätigten Faktor nicht als eingerichtet', async () => {
    ladeMfaFaktoren.mockResolvedValue([{ id: 'factor-1', bestaetigt: false }]);
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    expect(
      await screen.findByText(/darf Zugänge, Rollen und das Protokoll verwalten/),
    ).toBeInTheDocument();
  });

  it('bietet keine Rollen- oder Sperrverwaltung an', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);
    await screen.findByRole('heading', { name: 'Mein Konto' });

    // Das eigene Konto ändert seine Berechtigungen nicht (ADR-004, E10).
    expect(screen.queryByRole('button', { name: 'Rollen speichern' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zugang sperren' })).not.toBeInTheDocument();
  });
});

/**
 * Die Befunde aus dem UX-Review (UXR-002).
 *
 * NAV-13/ORG-B01: Fehler am Feld, das sie verursacht, mit Fokus dorthin und
 * mit nächstem Schritt. AUTH-05: Das Konto reist für den Passwortmanager mit.
 * NAV-20: eine Breite, ein Hauptknopf. ZST-04: ein Ladefehler mit Ausweg.
 */
describe('MeinKontoPage — UXR-002', () => {
  beforeEach(() => {
    for (const mock of [aendereKennwort, ladeMfaFaktoren, starteMfaEinrichtung]) {
      mock.mockReset();
    }
    aendereKennwort.mockResolvedValue(undefined);
    ladeMfaFaktoren.mockResolvedValue([]);
    starteMfaEinrichtung.mockResolvedValue(einrichtung);
  });

  it('hängt die Mindestlänge an das erste Feld und setzt den Fokus dorthin (NAV-13, ORG-B01)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    const kennwort = screen.getByLabelText('Neues Kennwort');
    const wiederholung = screen.getByLabelText('Neues Kennwort wiederholen');

    await user.type(kennwort, 'kurz');
    await user.type(wiederholung, 'kurz');
    await user.click(screen.getByRole('button', { name: 'Kennwort ändern' }));

    expect(kennwort).toHaveAttribute('aria-invalid', 'true');
    expect(kennwort).toHaveAccessibleDescription(/braucht mindestens 12 Zeichen/);
    expect(wiederholung).not.toHaveAttribute('aria-invalid');
    expect(kennwort).toHaveFocus();
  });

  it('hängt die Abweichung an das Wiederholungsfeld und setzt den Fokus dorthin', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    const kennwort = screen.getByLabelText('Neues Kennwort');
    const wiederholung = screen.getByLabelText('Neues Kennwort wiederholen');

    await user.type(kennwort, 'ein langer satz hier');
    await user.type(wiederholung, 'ein anderer satz');
    await user.click(screen.getByRole('button', { name: 'Kennwort ändern' }));

    expect(wiederholung).toHaveAttribute('aria-invalid', 'true');
    expect(wiederholung).toHaveAccessibleDescription('Die beiden Eingaben stimmen nicht überein.');
    expect(kennwort).not.toHaveAttribute('aria-invalid');
    expect(wiederholung).toHaveFocus();
  });

  it('nennt die Mindestlänge am Feld selbst (NAV-13)', () => {
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    expect(screen.getByLabelText('Neues Kennwort')).toHaveAccessibleDescription(
      /Mindestens 12 Zeichen/,
    );
  });

  it('ändert das Kennwort mit der Eingabetaste (NAV-13)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    await user.type(screen.getByLabelText('Neues Kennwort'), 'ein langer satz hier');
    await user.type(
      screen.getByLabelText('Neues Kennwort wiederholen'),
      'ein langer satz hier{Enter}',
    );

    await waitFor(() => expect(aendereKennwort).toHaveBeenCalledWith('ein langer satz hier'));
    expect(screen.getByRole('form', { name: 'Kennwort ändern' })).toBeInTheDocument();
  });

  it('bestätigt die Änderung als Erfolg (UIK-21)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    await user.type(screen.getByLabelText('Neues Kennwort'), 'ein langer satz hier');
    await user.type(screen.getByLabelText('Neues Kennwort wiederholen'), 'ein langer satz hier');
    await user.click(screen.getByRole('button', { name: 'Kennwort ändern' }));

    const meldung = await screen.findByText(/Das Kennwort wurde geändert/);
    expect(meldung).toHaveAttribute('role', 'status');
    expect(meldung).toHaveClass('text-positiv');
    expect(meldung).toHaveTextContent('„Alle Sitzungen beenden“');
  });

  it('nennt bei einem Fehlschlag den nächsten Schritt (NAV-13, AUTH-10)', async () => {
    const user = userEvent.setup();
    aendereKennwort.mockRejectedValue(new Error('same_password'));
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    await user.type(screen.getByLabelText('Neues Kennwort'), 'ein langer satz hier');
    await user.type(screen.getByLabelText('Neues Kennwort wiederholen'), 'ein langer satz hier');
    await user.click(screen.getByRole('button', { name: 'Kennwort ändern' }));

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Das Kennwort konnte nicht geändert werden.');
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(meldung).toHaveTextContent('muss sich vom bisherigen unterscheiden');
  });

  it('gibt dem Passwortmanager das angemeldete Konto mit (AUTH-05)', () => {
    const sitzung = { user: { email: 'tara.therapie@praxis.invalid' } } as Session;
    renderWithProviders(
      <SessionContext.Provider
        value={{ session: sitzung, initialising: false, signOut: vi.fn(() => Promise.resolve()) }}
      >
        <MeinKontoPage user={testUser(['therapist'])} />
      </SessionContext.Provider>,
    );

    const formular = screen.getByRole('form', { name: 'Kennwort ändern' });
    const konto = formular.querySelector('input[autocomplete="username"]');
    expect(konto).toHaveValue('tara.therapie@praxis.invalid');
    expect(konto).not.toBeVisible();
  });

  it('kommt ohne Sitzung ohne das verborgene Kontofeld aus', () => {
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    const formular = screen.getByRole('form', { name: 'Kennwort ändern' });
    expect(formular.querySelector('input[autocomplete="username"]')).toBeNull();
  });

  it('bietet nach einem Ladefehler des zweiten Faktors einen neuen Versuch an (ZST-04)', async () => {
    const user = userEvent.setup();
    ladeMfaFaktoren.mockRejectedValueOnce(new Error('netz')).mockResolvedValue([]);
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);

    expect(
      await screen.findByText('Der Stand des zweiten Faktors ließ sich nicht laden.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(
      await screen.findByText('Für diesen Zugang ist kein zweiter Faktor eingerichtet.'),
    ).toBeInTheDocument();
    expect(ladeMfaFaktoren).toHaveBeenCalledTimes(2);
  });

  it('lässt „Kennwort ändern“ den einen Hauptknopf sein (NAV-20)', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    const einrichten = await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' });
    expect(einrichten).not.toHaveClass('bg-accent');
    expect(einrichten).toHaveClass('border-line-strong');
    expect(screen.getByRole('button', { name: 'Kennwort ändern' })).toHaveClass('bg-accent');
  });

  it('fasst die ganze Seite in die Formularbreite (NAV-20)', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByText('Für diesen Zugang ist kein zweiter Faktor eingerichtet.');

    const breite = screen.getByRole('heading', { name: 'Zugang' }).closest('.max-w-xl');
    expect(breite).not.toBeNull();
    for (const titel of ['Kennwort', 'Zweiter Faktor', 'Sitzungen']) {
      expect(breite).toContainElement(screen.getByRole('heading', { name: titel }));
    }
    expect(breite).toContainElement(screen.getByText(/werden protokolliert/));
  });

  it('nennt die Rolle, die Rollen und Sperre ändert (WRT-12, ORG-27)', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Mein Konto' });

    expect(
      screen.getByText(/Ihre Stammdaten pflegen Praxisinhaber:in und Praxismanagement/),
    ).toBeInTheDocument();
    // Der Satz über Rollen und Sperre in der Fußnote ist fort (UX-005i):
    // Wer Stammdaten pflegt, sagt der Kopf; die Fußnote nur noch das Protokoll.
    expect(screen.queryByText(/ausschließlich die Praxisinhaber:in/)).toBeNull();
    expect(screen.getByText(/werden protokolliert/)).toBeInTheDocument();
    expect(screen.queryByText(/Praxisleitung/)).toBeNull();
  });

  it('gibt dem QR-Code den Bildradius und die Fläche des Systems (TOK-08, TOK-16)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' }));

    const bild = await screen.findByAltText('QR-Code zum Einrichten des zweiten Faktors');
    expect(bild).toHaveClass('rounded-image', 'bg-surface');
    expect(bild).not.toHaveClass('bg-white');
    expect(screen.getByText(/Diesen QR-Code in einer Authenticator-App scannen/)).toBeVisible();
  });
});
