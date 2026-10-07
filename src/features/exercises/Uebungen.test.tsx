import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchBibliothek = vi.fn();
const saveUebung = vi.fn();
const saveVariante = vi.fn();
const archiviereUebung = vi.fn();
const archiviereVariante = vi.fn();
const loescheUebung = vi.fn();
const loescheVariante = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchBibliothek: () => fetchBibliothek() as Promise<Api.Bibliothek>,
    saveUebung: (...args: unknown[]) => saveUebung(...args) as Promise<string>,
    saveVariante: (...args: unknown[]) => saveVariante(...args) as Promise<string>,
    archiviereUebung: (...args: unknown[]) => archiviereUebung(...args) as Promise<void>,
    archiviereVariante: (...args: unknown[]) => archiviereVariante(...args) as Promise<void>,
    loescheUebung: (...args: unknown[]) => loescheUebung(...args) as Promise<void>,
    loescheVariante: (...args: unknown[]) => loescheVariante(...args) as Promise<void>,
  };
});

const { UebungenPage } = await import('./UebungenPage');
const { UebungAnsicht } = await import('./UebungPage');

const GELAENDER: Api.Variante = {
  id: 'v1',
  name: 'Kniebeuge am Geländer, halbe Tiefe',
  lay_name: 'Am Geländer halb in die Hocke gehen',
  instruction: 'Mit beiden Händen festhalten.',
  equipment: ['Geländer'],
  common_faults: 'Knie fallen nach innen.',
  practice_notes: 'Nicht unter Schmerz über 5.',
  archived: false,
};

const ALT: Api.Variante = {
  id: 'v2',
  name: 'Kniebeuge auf dem Wackelbrett',
  lay_name: 'Auf dem Wackelbrett in die Hocke',
  instruction: null,
  equipment: [],
  common_faults: null,
  practice_notes: null,
  archived: true,
};

const KNIEBEUGE: Api.Uebung = {
  id: 'u1',
  name: 'Kniebeuge',
  lay_name: 'In die Hocke gehen',
  body_region: 'knie',
  archived: false,
  variants: [GELAENDER, ALT],
};

const BRUECKE: Api.Uebung = {
  id: 'u2',
  name: 'Brücke',
  lay_name: 'Becken heben',
  body_region: 'lws',
  archived: true,
  variants: [],
};

function bibliothek(canManage: boolean): Api.Bibliothek {
  return { can_manage: canManage, exercises: [BRUECKE, KNIEBEUGE] };
}

beforeEach(() => {
  for (const f of [
    fetchBibliothek,
    saveUebung,
    saveVariante,
    archiviereUebung,
    archiviereVariante,
    loescheUebung,
    loescheVariante,
  ]) {
    f.mockReset();
  }
  fetchBibliothek.mockResolvedValue(bibliothek(true));
  saveUebung.mockResolvedValue('neu');
  saveVariante.mockResolvedValue('neu');
  archiviereUebung.mockResolvedValue(undefined);
  archiviereVariante.mockResolvedValue(undefined);
  loescheUebung.mockResolvedValue(undefined);
  loescheVariante.mockResolvedValue(undefined);
});

describe('UebungenPage (UEB-001)', () => {
  it('zeigt die Übungen mit Alltagssprache, Region und Zahl der Varianten', async () => {
    renderWithProviders(<UebungenPage user={testUser(['therapist'])} />);
    const link = await screen.findByRole('link', { name: /Kniebeuge/ });
    expect(link).toHaveAttribute('href', '/uebungen/u1');
    expect(link).toHaveTextContent('In die Hocke gehen · Knie · 1 Variante');
  });

  it('legt archivierte Übungen in einen eigenen, zugeklappten Bereich', async () => {
    renderWithProviders(<UebungenPage user={testUser(['therapist'])} />);
    await screen.findByRole('link', { name: /Kniebeuge/ });
    const archiv = document.querySelector('details')!;
    expect(archiv.querySelector('summary')).toHaveTextContent('Archiviert (1)');
    expect(archiv).not.toHaveAttribute('open');
    expect(within(archiv).getByRole('link', { name: /Brücke/ })).toBeInTheDocument();
  });

  it('bietet das Anlegen nur an, wenn der Server pflegen lässt (ANN-293)', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false));
    renderWithProviders(<UebungenPage user={testUser(['therapist'])} />);
    await screen.findByRole('link', { name: /Kniebeuge/ });
    expect(screen.queryByRole('button', { name: 'Übung anlegen' })).not.toBeInTheDocument();
  });

  it('legt eine Übung mit beiden Bezeichnungen und Region an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungenPage user={testUser(['owner'])} />);
    await user.click(await screen.findByRole('button', { name: 'Übung anlegen' }));

    await user.click(screen.getByRole('button', { name: 'Übung anlegen' }));
    expect(screen.getByText('Bitte die fachliche Bezeichnung angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte eine Körperregion wählen.')).toBeInTheDocument();
    expect(saveUebung).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Bezeichnung *'), 'Ausfallschritt');
    await user.type(screen.getByLabelText('Bezeichnung in Alltagssprache *'), 'Großer Schritt');
    await user.selectOptions(screen.getByLabelText('Körperregion *'), 'knie');
    await user.click(screen.getByRole('button', { name: 'Übung anlegen' }));

    await waitFor(() =>
      expect(saveUebung).toHaveBeenCalledWith({
        name: 'Ausfallschritt',
        laie: 'Großer Schritt',
        region: 'knie',
      }),
    );
    expect(await screen.findByText(/Übung „Ausfallschritt“ angelegt/)).toBeInTheDocument();
  });

  it('weist das Büro ab, ohne zu laden (ANN-293)', () => {
    renderWithProviders(<UebungenPage user={testUser(['office'])} />);
    expect(screen.getByText('Nicht freigegeben')).toBeInTheDocument();
    expect(fetchBibliothek).not.toHaveBeenCalled();
  });

  it('zeigt einen Fehler mit Weg zum erneuten Laden', async () => {
    fetchBibliothek.mockRejectedValue(new Error('x'));
    renderWithProviders(<UebungenPage user={testUser(['trainer'])} />);
    expect(
      await screen.findByText('Die Übungsbibliothek konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});

describe('UebungAnsicht (UEB-001)', () => {
  it('zeigt jede Variante mit beiden Sprachebenen und ihren Angaben', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['trainer'])} uebungId="u1" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' })).toBeInTheDocument();
    expect(screen.getByText('Alltagssprache: In die Hocke gehen')).toBeInTheDocument();
    expect(screen.getByText('Knie')).toBeInTheDocument();

    const karte = screen
      .getByRole('heading', { level: 3, name: 'Kniebeuge am Geländer, halbe Tiefe' })
      .closest('div')!.parentElement!;
    expect(
      within(karte).getByText('Alltagssprache: Am Geländer halb in die Hocke gehen'),
    ).toBeInTheDocument();
    expect(within(karte).getByText('Mit beiden Händen festhalten.')).toBeInTheDocument();
    expect(within(karte).getByText('Geländer')).toBeInTheDocument();
    expect(within(karte).getByText('Knie fallen nach innen.')).toBeInTheDocument();
    expect(within(karte).getByText('Nicht unter Schmerz über 5.')).toBeInTheDocument();
  });

  it('bietet ohne Pflegerecht keine Änderung an (ANN-293)', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false));
    renderWithProviders(<UebungAnsicht user={testUser(['therapist'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Variante anlegen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Übung archivieren oder löschen')).not.toBeInTheDocument();
  });

  it('legt eine Variante mit Ausrüstung als Schlagworten an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await user.click(await screen.findByRole('button', { name: 'Variante anlegen' }));

    await user.type(screen.getByLabelText('Bezeichnung *'), 'Kniebeuge mit Band');
    await user.type(screen.getByLabelText('Bezeichnung in Alltagssprache *'), 'Hocke mit Band');
    await user.type(screen.getByLabelText('Ausrüstung'), 'Theraband gelb, , Stuhl');
    await user.click(screen.getByRole('button', { name: 'Variante anlegen' }));

    await waitFor(() =>
      expect(saveVariante).toHaveBeenCalledWith({
        uebungId: 'u1',
        name: 'Kniebeuge mit Band',
        laie: 'Hocke mit Band',
        anleitung: '',
        ausruestung: ['Theraband gelb', 'Stuhl'],
        ausweichbewegungen: '',
        hinweise: '',
      }),
    );
  });

  it('archiviert eine Variante und löscht eine nach Rückfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });

    await user.click(screen.getAllByRole('button', { name: 'Archivieren' })[0]!);
    await waitFor(() => expect(archiviereVariante).toHaveBeenCalledWith('v1', true));

    await user.click(screen.getAllByRole('button', { name: 'Löschen' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Ja, Variante löschen' }));
    await waitFor(() => expect(loescheVariante).toHaveBeenCalledWith('v1'));
  });

  it('zeigt den Grund, wenn eine verbundene Variante nicht gelöscht werden kann', async () => {
    loescheVariante.mockRejectedValue(
      new Error(
        'Die Variante ist mit anderen verbunden. Bitte erst die Verbindungen lösen oder archivieren.',
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    await user.click(screen.getAllByRole('button', { name: 'Löschen' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Ja, Variante löschen' }));
    expect(await screen.findByText(/mit anderen verbunden/)).toBeInTheDocument();
  });

  it('bietet das Löschen der Übung nur ohne Varianten an', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    expect(screen.getByRole('button', { name: 'Übung archivieren' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übung löschen' })).not.toBeInTheDocument();
  });

  it('meldet eine unbekannte Übung', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="fehlt" />);
    expect(await screen.findByText('Übung nicht gefunden')).toBeInTheDocument();
  });
});
