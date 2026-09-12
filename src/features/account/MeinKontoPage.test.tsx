import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AccountApi from './api';
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
      await screen.findByText(/darf Zugänge, Rollen und das Auditlog verwalten/),
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

    expect(await screen.findByText(/Der Code wurde nicht angenommen/)).toBeInTheDocument();
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
      await screen.findByText(/darf Zugänge, Rollen und das Auditlog verwalten/),
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
