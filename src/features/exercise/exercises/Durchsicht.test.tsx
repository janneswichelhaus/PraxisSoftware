import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { naechster, offeneDurchsicht } from './durchsicht';
import { OHNE_KATALOG } from './testdaten';

const fetchBibliothek = vi.fn();
const setzePruefvermerk = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchBibliothek: () => fetchBibliothek() as Promise<Api.Bibliothek>,
    setzePruefvermerk: (...a: unknown[]) => setzePruefvermerk(...a) as Promise<void>,
  };
});

const { DurchsichtPage } = await import('./DurchsichtPage');

/**
 * Durchsicht des Katalogs am Stück (UEB-015, ANN-386, ANN-561).
 */

function variante(id: string, zusatz: Partial<Api.Variante> = {}): Api.Variante {
  return {
    id,
    name: `Variante ${id}`,
    lay_name: `Alltag ${id}`,
    instruction: 'Hinsetzen.\nAufstehen.',
    equipment: [],
    common_faults: null,
    practice_notes: null,
    archived: false,
    ...OHNE_KATALOG,
    catalog_key: `KN-${id}`,
    catalog_version: '1.0.0',
    ...zusatz,
  };
}

function uebung(
  id: string,
  name: string,
  region: Api.Uebung['body_region'],
  varianten: Api.Variante[],
  archived = false,
): Api.Uebung {
  return {
    id,
    name,
    lay_name: `${name} im Alltag`,
    body_region: region,
    archived,
    variants: varianten,
  };
}

const BIBLIOTHEK: Api.Bibliothek = {
  can_manage: true,
  links: [],
  exercises: [
    uebung('u1', 'Wadenheben', 'fuss', [variante('1')]),
    uebung('u2', 'Kniestreckung', 'knie', [variante('2', { name: 'Kniestreckung' })]),
    uebung('u3', 'Beinpendel', 'knie', [variante('3', { name: 'Beinpendel' })]),
    // Durchgesehen, eigen, archiviert: nicht in der Durchsicht.
    uebung('u4', 'Brücke', 'huefte', [
      variante('4', { reviewed_at: '2026-10-15T08:00:00Z' }),
      variante('5', { catalog_key: null }),
      variante('6', { archived: true }),
    ]),
    uebung('u5', 'Archiviert', 'hws', [variante('7')], true),
  ],
};

beforeEach(() => {
  fetchBibliothek.mockReset();
  setzePruefvermerk.mockReset();
  fetchBibliothek.mockResolvedValue(BIBLIOTHEK);
  setzePruefvermerk.mockResolvedValue(undefined);
});

describe('Durchsicht: Reihenfolge (UEB-015)', () => {
  it('nimmt nur Ungeprüftes, nach Region und Bezeichnung', () => {
    expect(offeneDurchsicht(BIBLIOTHEK).map((p) => p.variante.id)).toEqual(['3', '2', '1']);
  });

  it('stellt Übersprungenes hinten an und nimmt Vermerktes heraus', () => {
    const offen = offeneDurchsicht(BIBLIOTHEK);
    expect(naechster(offen, new Set(), ['3'])?.variante.id).toBe('2');
    expect(naechster(offen, new Set(['2', '1']), ['3'])?.variante.id).toBe('3');
    expect(naechster(offen, new Set(['1', '2', '3']), [])).toBeNull();
  });
});

describe('DurchsichtPage (UEB-015)', () => {
  it('vermerkt mit einem Tipp und zeigt die nächste Übung', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DurchsichtPage user={testUser(['owner'])} />);
    expect(await screen.findByRole('heading', { name: 'Beinpendel' })).toBeInTheDocument();
    expect(screen.getByText('Durchsicht · noch 3')).toBeInTheDocument();
    expect(screen.getAllByText('Aufstehen.').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Durchgesehen' }));
    await waitFor(() => expect(setzePruefvermerk).toHaveBeenCalledWith('3', true));
    expect(await screen.findByRole('heading', { name: 'Kniestreckung' })).toBeInTheDocument();
    expect(screen.getByText('„Beinpendel“ als durchgesehen vermerkt.')).toBeInTheDocument();
  });

  it('nimmt ein versehentliches Durchgesehen zurück; die Übung kommt wieder', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DurchsichtPage user={testUser(['owner'])} />);
    await screen.findByRole('heading', { name: 'Beinpendel' });
    await user.click(screen.getByRole('button', { name: 'Durchgesehen' }));
    await screen.findByRole('heading', { name: 'Kniestreckung' });
    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    await waitFor(() => expect(setzePruefvermerk).toHaveBeenLastCalledWith('3', false));
    expect(await screen.findByRole('heading', { name: 'Beinpendel' })).toBeInTheDocument();
  });

  it('überspringt, ohne zu vermerken, und grenzt auf eine Region ein', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DurchsichtPage user={testUser(['owner'])} />);
    await screen.findByRole('heading', { name: 'Beinpendel' });
    await user.click(screen.getByRole('button', { name: 'Überspringen' }));
    expect(await screen.findByRole('heading', { name: 'Kniestreckung' })).toBeInTheDocument();
    // Die Region steht auf Abruf.
    await user.click(screen.getByText('Nach Region'));
    await user.click(screen.getByRole('button', { name: /^Fuß/ }));
    expect(await screen.findByRole('heading', { name: 'Wadenheben' })).toBeInTheDocument();
    // Nur eine in der Region: nichts zu überspringen.
    expect(screen.getByRole('button', { name: 'Überspringen' })).toBeDisabled();
    expect(setzePruefvermerk).not.toHaveBeenCalled();
  });

  it('sagt, wenn alles durchgesehen ist', async () => {
    fetchBibliothek.mockResolvedValue({ ...BIBLIOTHEK, exercises: [BIBLIOTHEK.exercises[3]!] });
    renderWithProviders(<DurchsichtPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Alles durchgesehen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Durchgesehen' })).toBeNull();
  });

  it('ist nur für die Praxisinhaber:in', async () => {
    fetchBibliothek.mockResolvedValue({ ...BIBLIOTHEK, can_manage: false });
    renderWithProviders(<DurchsichtPage user={testUser(['therapist'])} />);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Durchgesehen' })).toBeNull();
  });
});
