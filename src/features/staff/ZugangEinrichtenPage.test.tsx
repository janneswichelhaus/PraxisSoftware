import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as KontoApi from './konto-api';
import { renderWithProviders } from '@/test-utils';

const nimmZugangAn = vi.fn();

vi.mock('./konto-api', async (importOriginal) => {
  const actual = await importOriginal<typeof KontoApi>();
  return { ...actual, nimmZugangAn: () => nimmZugangAn() as Promise<void> };
});

const { ZugangEinrichtenPage } = await import('./ZugangEinrichtenPage');
const { KeineEinladungError } = await import('./konto-api');

describe('ZugangEinrichtenPage', () => {
  beforeEach(() => {
    nimmZugangAn.mockReset();
    nimmZugangAn.mockResolvedValue(undefined);
  });

  it('nimmt die Einladung erst auf ausdrückliche Handlung an', async () => {
    const user = userEvent.setup();
    const eingerichtet = vi.fn();
    renderWithProviders(
      <ZugangEinrichtenPage onEingerichtet={eingerichtet} onAbmelden={vi.fn()} />,
    );

    // Beim Laden passiert nichts: der Beitritt zu einer Praxis mit Zugriff auf
    // Gesundheitsdaten ist eine bewusste Handlung (ADR-010).
    expect(nimmZugangAn).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Einladung annehmen' }));

    await waitFor(() => expect(eingerichtet).toHaveBeenCalledTimes(1));
  });

  it('steht in der Huelle der Seiten ausserhalb des Rahmens (AUTH-12)', () => {
    renderWithProviders(<ZugangEinrichtenPage onEingerichtet={vi.fn()} onAbmelden={vi.fn()} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Zugang einrichten' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('sagt vorher, dass danach ein eigenes Kennwort festzulegen ist (AUTH-08)', () => {
    renderWithProviders(<ZugangEinrichtenPage onEingerichtet={vi.fn()} onAbmelden={vi.fn()} />);
    expect(
      screen.getByText(/Legen Sie danach unter „Mein Konto“ ein eigenes Kennwort fest/),
    ).toBeInTheDocument();
  });

  it('bleibt bis zum Wechsel in die Anwendung beim Laufzustand (AUTH-08)', async () => {
    const user = userEvent.setup();
    let fertig: () => void = () => undefined;
    const eingerichtet = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          fertig = resolve;
        }),
    );
    renderWithProviders(
      <ZugangEinrichtenPage onEingerichtet={eingerichtet} onAbmelden={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Einladung annehmen' }));

    await waitFor(() => expect(eingerichtet).toHaveBeenCalledTimes(1));
    // Solange das Profil nachlaedt, springt der Knopf nicht zurueck.
    expect(screen.getByRole('button', { name: 'Zugang wird eingerichtet …' })).toBeDisabled();
    fertig();
    expect(await screen.findByRole('button', { name: 'Einladung annehmen' })).toBeEnabled();
  });

  it('nennt bei fehlender Einladung keinen Grund, der Auskunft über die Praxis gäbe', async () => {
    const user = userEvent.setup();
    nimmZugangAn.mockRejectedValue(new KeineEinladungError());
    renderWithProviders(<ZugangEinrichtenPage onEingerichtet={vi.fn()} onAbmelden={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Einladung annehmen' }));

    const meldung = await screen.findByText('Für diesen Zugang liegt keine offene Einladung vor.');
    expect(meldung).toBeInTheDocument();
    // Weder "abgelaufen" noch "zurückgenommen" noch "nie eingeladen".
    for (const wort of ['abgelaufen', 'zurückgenommen', 'unbekannt']) {
      expect(document.body.textContent).not.toContain(wort);
    }
    expect(screen.queryByRole('button', { name: 'Einladung annehmen' })).not.toBeInTheDocument();
  });

  it('nimmt nach dem Fehlen der Einladung den Fokus auf den Hinweis (AUTH-06)', async () => {
    const user = userEvent.setup();
    nimmZugangAn.mockRejectedValue(new KeineEinladungError());
    renderWithProviders(<ZugangEinrichtenPage onEingerichtet={vi.fn()} onAbmelden={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Einladung annehmen' }));

    const meldung = await screen.findByText('Für diesen Zugang liegt keine offene Einladung vor.');
    await waitFor(() => expect(meldung.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('laesst die Einladung erneut pruefen, sobald sie angelegt ist (AUTH-08)', async () => {
    const user = userEvent.setup();
    const eingerichtet = vi.fn();
    nimmZugangAn.mockRejectedValueOnce(new KeineEinladungError()).mockResolvedValue(undefined);
    renderWithProviders(
      <ZugangEinrichtenPage onEingerichtet={eingerichtet} onAbmelden={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Einladung annehmen' }));
    await user.click(await screen.findByRole('button', { name: 'Erneut prüfen' }));

    await waitFor(() => expect(eingerichtet).toHaveBeenCalledTimes(1));
    expect(nimmZugangAn).toHaveBeenCalledTimes(2);
  });

  it('meldet einen technischen Fehler getrennt und lässt den zweiten Versuch zu', async () => {
    const user = userEvent.setup();
    nimmZugangAn.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<ZugangEinrichtenPage onEingerichtet={vi.fn()} onAbmelden={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Einladung annehmen' }));

    expect(
      await screen.findByText(/Der Zugang konnte nicht eingerichtet werden/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bitte die Verbindung prüfen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Einladung annehmen' })).toBeInTheDocument();
  });

  it('bietet immer das Abmelden an', async () => {
    const user = userEvent.setup();
    const abmelden = vi.fn();
    renderWithProviders(<ZugangEinrichtenPage onEingerichtet={vi.fn()} onAbmelden={abmelden} />);

    await user.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(abmelden).toHaveBeenCalledTimes(1);
  });
});
