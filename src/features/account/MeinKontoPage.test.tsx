import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AccountApi from './api';
import type * as PasskeyModul from '@/features/auth/passkey';
import type * as PinModul from '@/features/auth/appPin';
import { renderWithProviders, testUser } from '@/test-utils';

const ladePasskeys = vi.fn<() => Promise<PasskeyModul.Passkey[]>>();
const passkeyEinrichten = vi.fn<() => Promise<void>>();
const entfernePasskey = vi.fn<(id: string) => Promise<void>>();
vi.mock('@/features/auth/passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof PasskeyModul>()),
  ladePasskeys: () => ladePasskeys(),
  passkeyEinrichten: () => passkeyEinrichten(),
  entfernePasskey: (id: string) => entfernePasskey(id),
  passkeyMoeglich: () => true,
}));

const hatPin = vi.fn<() => Promise<boolean>>();
const setzePin = vi.fn<(pin: string) => Promise<void>>();
vi.mock('@/features/auth/appPin', async (importOriginal) => ({
  ...(await importOriginal<typeof PinModul>()),
  hatPin: () => hatPin(),
  setzePin: (pin: string) => setzePin(pin),
}));

const EIN_PASSKEY: PasskeyModul.Passkey = {
  id: 'p1',
  name: 'iPhone',
  angelegtAm: '2026-10-10T08:00:00Z',
  zuletztAm: null,
};
const beendeAlleSitzungen = vi.fn();
const ladeMfaFaktoren = vi.fn();
const starteMfaEinrichtung = vi.fn();
const bestaetigeMfa = vi.fn();
const entferneMfa = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AccountApi>();
  return {
    ...actual,
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
      beendeAlleSitzungen,
      ladeMfaFaktoren,
      starteMfaEinrichtung,
      bestaetigeMfa,
      entferneMfa,
    ]) {
      mock.mockReset();
    }
    beendeAlleSitzungen.mockResolvedValue(undefined);
    ladePasskeys.mockReset().mockResolvedValue([EIN_PASSKEY]);
    passkeyEinrichten.mockReset().mockResolvedValue(undefined);
    entfernePasskey.mockReset().mockResolvedValue(undefined);
    hatPin.mockReset().mockResolvedValue(true);
    setzePin.mockReset().mockResolvedValue(undefined);
    ladeMfaFaktoren.mockResolvedValue([]);
    starteMfaEinrichtung.mockResolvedValue(einrichtung);
    bestaetigeMfa.mockResolvedValue(undefined);
    entferneMfa.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // Passkeys und PIN (SEC-EPIC-002, ADR-025 Fassung 2)
  // ---------------------------------------------------------------------------
  it('bietet kein Kennwort mehr an', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByText('iPhone');
    expect(screen.queryByLabelText(/Kennwort/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Kennwort/ })).toBeNull();
  });

  it('listet die Passkeys und rät bei nur einem zum zweiten', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);
    expect(await screen.findByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText(/Eingerichtet am 10\.10\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/Nur ein Passkey: Richten Sie einen zweiten ein/)).toBeInTheDocument();
    // Der letzte Passkey lässt sich nicht entfernen (ANN-327).
    expect(screen.queryByRole('button', { name: 'Entfernen' })).toBeNull();
  });

  it('richtet einen Passkey auf diesem Gerät ein und lädt die Liste neu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByText('iPhone');
    await user.click(screen.getByRole('button', { name: 'Passkey auf diesem Gerät einrichten' }));
    expect(passkeyEinrichten).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Der Passkey ist eingerichtet.')).toBeInTheDocument();
    await waitFor(() => expect(ladePasskeys).toHaveBeenCalledTimes(2));
  });

  it('entfernt einen von zwei Passkeys erst nach der Rückfrage', async () => {
    ladePasskeys.mockResolvedValue([
      EIN_PASSKEY,
      { id: 'p2', name: null, angelegtAm: '2026-10-09T08:00:00Z', zuletztAm: null },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByText('iPhone');
    const knoepfe = screen.getAllByRole('button', { name: 'Entfernen' });
    expect(knoepfe).toHaveLength(2);
    await user.click(knoepfe[0]!);
    expect(entfernePasskey).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Passkey entfernen' }));
    await waitFor(() => expect(entfernePasskey).toHaveBeenCalledWith('p1'));
  });

  it('verlangt mit zweitem Faktor dessen Bestätigung, bevor ein Passkey entsteht', async () => {
    const { PasskeyFehler, PASSKEY_SAETZE } = await import('@/features/auth/passkey');
    passkeyEinrichten.mockRejectedValueOnce(new PasskeyFehler(PASSKEY_SAETZE.zweiterFaktor));
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByText('iPhone');
    await user.click(screen.getByRole('button', { name: 'Passkey auf diesem Gerät einrichten' }));
    expect(await screen.findByLabelText('Code aus der App')).toBeInTheDocument();
  });

  it('legt eine neue PIN fest und sagt es', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    expect(await screen.findByText('Eine PIN ist festgelegt.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Neue PIN/), '483920');
    await user.type(screen.getByLabelText('PIN wiederholen'), '483920');
    await user.click(screen.getByRole('button', { name: 'PIN ändern' }));
    await waitFor(() => expect(setzePin).toHaveBeenCalledWith('483920'));
    expect(await screen.findByText('Die neue PIN gilt ab sofort.')).toBeInTheDocument();
  });

  it('weist eine triviale PIN am Feld ab, ohne den Server zu fragen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByText('Eine PIN ist festgelegt.');
    await user.type(screen.getByLabelText(/^Neue PIN/), '123456');
    await user.type(screen.getByLabelText('PIN wiederholen'), '123456');
    await user.click(screen.getByRole('button', { name: 'PIN ändern' }));
    expect(screen.getByLabelText(/^Neue PIN/)).toHaveFocus();
    expect(screen.getByText(/zu leicht zu erraten/)).toBeInTheDocument();
    expect(setzePin).not.toHaveBeenCalled();
  });

  it('verlangt nach zehn Minuten die Bestätigung mit dem Passkey (ANN-325)', async () => {
    const { ErneutAnmeldenError } = await import('@/features/auth/appPin');
    setzePin.mockRejectedValueOnce(new ErneutAnmeldenError());
    const user = userEvent.setup();
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByText('Eine PIN ist festgelegt.');
    await user.type(screen.getByLabelText(/^Neue PIN/), '483920');
    await user.type(screen.getByLabelText('PIN wiederholen'), '483920');
    await user.click(screen.getByRole('button', { name: 'PIN ändern' }));
    expect(
      await screen.findByRole('button', { name: 'Mit Passkey bestätigen' }),
    ).toBeInTheDocument();
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
  it('sagt vor der Einrichtung, dass die Anmeldung den Faktor nicht abfragt', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    const hinweis = await screen.findByText(/derzeit nicht ab/);
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
      await screen.findByText('Für dieses Konto ist ein zweiter Faktor eingerichtet.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/derzeit nicht ab/)).toBeInTheDocument();
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
      await screen.findByText('Für dieses Konto ist kein zweiter Faktor eingerichtet.'),
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
      await screen.findByText('Für dieses Konto ist ein zweiter Faktor eingerichtet.'),
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
    for (const mock of [ladeMfaFaktoren, starteMfaEinrichtung]) {
      mock.mockReset();
    }
    ladeMfaFaktoren.mockResolvedValue([]);
    ladePasskeys.mockReset().mockResolvedValue([EIN_PASSKEY]);
    hatPin.mockReset().mockResolvedValue(true);
    starteMfaEinrichtung.mockResolvedValue(einrichtung);
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
      await screen.findByText('Für dieses Konto ist kein zweiter Faktor eingerichtet.'),
    ).toBeInTheDocument();
    expect(ladeMfaFaktoren).toHaveBeenCalledTimes(2);
  });

  it('lässt die PIN den einen Hauptknopf sein (NAV-20)', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);

    const einrichten = await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' });
    expect(einrichten).not.toHaveClass('bg-accent');
    expect(einrichten).toHaveClass('border-line-strong');
    expect(
      screen.getByRole('button', { name: 'Passkey auf diesem Gerät einrichten' }),
    ).not.toHaveClass('bg-accent');
    expect(await screen.findByRole('button', { name: 'PIN ändern' })).toHaveClass('bg-accent');
  });

  it('fasst die ganze Seite in die Formularbreite (NAV-20)', async () => {
    renderWithProviders(<MeinKontoPage user={testUser(['therapist'])} />);
    await screen.findByText('Für dieses Konto ist kein zweiter Faktor eingerichtet.');

    const breite = screen.getByRole('heading', { name: 'Zugang' }).closest('.max-w-xl');
    expect(breite).not.toBeNull();
    for (const titel of ['Passkeys', 'PIN', 'Zweiter Faktor', 'Sitzungen']) {
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
