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

  it('meldet einen technischen Fehler getrennt und lässt den zweiten Versuch zu', async () => {
    const user = userEvent.setup();
    nimmZugangAn.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<ZugangEinrichtenPage onEingerichtet={vi.fn()} onAbmelden={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Einladung annehmen' }));

    expect(
      await screen.findByText(/Der Zugang konnte nicht eingerichtet werden/),
    ).toBeInTheDocument();
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
