import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchBibliothek = vi.fn();
const saveUebung = vi.fn();
const saveVariante = vi.fn();
const archiviereUebung = vi.fn();
const archiviereVariante = vi.fn();
const verbinde = vi.fn();
const loeseVerbindung = vi.fn();
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
    verbinde: (...args: unknown[]) => verbinde(...args) as Promise<void>,
    loeseVerbindung: (...args: unknown[]) => loeseVerbindung(...args) as Promise<void>,
    loescheUebung: (...args: unknown[]) => loescheUebung(...args) as Promise<void>,
    loescheVariante: (...args: unknown[]) => loescheVariante(...args) as Promise<void>,
  };
});

const { UebungenPage } = await import('./UebungenPage');
const { UebungAnsicht, UebungPage } = await import('./UebungPage');

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

const VORWAERTS: Api.Variante = {
  id: 'v3',
  name: 'Ausfallschritt vorwärts',
  lay_name: 'Großer Schritt nach vorn',
  instruction: null,
  equipment: [],
  common_faults: null,
  practice_notes: null,
  archived: false,
};

const AUSFALLSCHRITT: Api.Uebung = {
  id: 'u3',
  name: 'Ausfallschritt',
  lay_name: 'Großer Schritt',
  body_region: 'knie',
  archived: false,
  variants: [VORWAERTS],
};

/** UEB-002: Am Geländer → Ausfallschritt vorwärts, schwerer in der Komplexität. */
const VERBINDUNG: Api.Verbindung = {
  id: 'l1',
  easier_variant_id: 'v1',
  harder_variant_id: 'v3',
  axis: 'komplexitaet',
};

function bibliothek(canManage: boolean): Api.Bibliothek {
  return {
    can_manage: canManage,
    exercises: [AUSFALLSCHRITT, BRUECKE, KNIEBEUGE],
    links: [VERBINDUNG],
  };
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
    verbinde,
    loeseVerbindung,
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
  verbinde.mockResolvedValue(undefined);
  loeseVerbindung.mockResolvedValue(undefined);
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
    const archiv = [...document.querySelectorAll('details')].find((d) =>
      d.querySelector('summary')?.textContent?.startsWith('Archiviert'),
    )!;
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

  it('weist ein Konto ohne Praxisrolle ab, ohne zu laden (ANN-293)', () => {
    renderWithProviders(<UebungenPage user={testUser([])} />);
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
    const angaben = karte.querySelector('dl')!;
    expect(within(angaben).getByText('Mit beiden Händen festhalten.')).toBeInTheDocument();
    expect(within(angaben).getByText('Geländer')).toBeInTheDocument();
    expect(within(angaben).getByText('Knie fallen nach innen.')).toBeInTheDocument();
    expect(within(angaben).getByText('Nicht unter Schmerz über 5.')).toBeInTheDocument();
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

describe('Leichter und schwerer (UEB-002)', () => {
  it('zeigt die Nachbarn beider Richtungen mit Achse und Weg dorthin', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false));
    renderWithProviders(<UebungAnsicht user={testUser(['trainer'])} uebungId="u1" />);
    const ziel = await screen.findByRole('link', {
      name: 'Ausfallschritt: Ausfallschritt vorwärts',
    });
    expect(ziel).toHaveAttribute('href', '/uebungen/u3#variante-v3');
    expect(ziel.closest('li')).toHaveTextContent('Achse: Komplexität');
    expect(ziel.closest('div')).toHaveTextContent('Schwerer');
    // Ohne Pflegerecht kein Lösen und kein Verbinden.
    expect(screen.queryByRole('button', { name: /lösen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verbinden' })).not.toBeInTheDocument();
  });

  it('zeigt dieselbe Verbindung von der anderen Seite als leichter', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u3" />);
    const ziel = await screen.findByRole('link', {
      name: 'Kniebeuge: Kniebeuge am Geländer, halbe Tiefe',
    });
    expect(ziel.closest('div')).toHaveTextContent('Leichter');
  });

  it('schlägt nichts vor - keine Empfehlung, kein nächster Schritt (ADR-006 Punkt 10)', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    expect(document.body).not.toHaveTextContent(/empfohlen|Empfehlung|nächster Schritt|passend/i);
  });

  it('verbindet eine Variante als leichter, mit der richtigen Richtung zum Server', async () => {
    const STUHL: Api.Variante = { ...VORWAERTS, id: 'v4', name: 'Aufstehen vom Stuhl' };
    fetchBibliothek.mockResolvedValue({
      ...bibliothek(true),
      exercises: [
        ...bibliothek(true).exercises,
        { ...AUSFALLSCHRITT, id: 'u4', name: 'Aufstehen', variants: [STUHL] },
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    const karte = (
      await screen.findByRole('heading', { level: 3, name: 'Kniebeuge am Geländer, halbe Tiefe' })
    ).closest('div')!.parentElement!;
    await user.click(within(karte).getByRole('button', { name: 'Verbinden' }));

    await user.click(within(karte).getByRole('button', { name: 'Verbinden' }));
    expect(within(karte).getByText('Bitte eine Variante wählen.')).toBeInTheDocument();
    expect(within(karte).getByText('Bitte eine Achse wählen.')).toBeInTheDocument();

    const andere = within(karte).getByLabelText('Andere Variante *');
    // Schon verbunden (v3), archiviert (v2) und sie selbst stehen nicht zur Wahl.
    expect(
      within(andere)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Bitte wählen', 'Aufstehen vom Stuhl']);

    await user.selectOptions(within(karte).getByLabelText('Die andere Variante ist'), 'leichter');
    await user.selectOptions(andere, 'v4');
    await user.selectOptions(within(karte).getByLabelText('Achse *'), 'hebel');
    await user.click(within(karte).getByRole('button', { name: 'Verbinden' }));
    await waitFor(() => expect(verbinde).toHaveBeenCalledWith('v4', 'v1', 'hebel'));
  });

  it('löst eine Verbindung', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    await user.click(screen.getByRole('button', { name: 'Lösen' }));
    expect(loeseVerbindung).not.toHaveBeenCalled();
    const frage = screen.getByRole('group', {
      name: 'Verbindung zu „Ausfallschritt: Ausfallschritt vorwärts“ lösen',
    });
    await user.click(within(frage).getByRole('button', { name: 'Ja, Verbindung lösen' }));
    await waitFor(() => expect(loeseVerbindung).toHaveBeenCalledWith('l1'));
  });
});

describe('Katalog und Suche (UEB-003)', () => {
  it('sucht in der Alltagssprache und nennt die Variante, in der der Text stand', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungenPage user={testUser(['therapist'])} />);
    await screen.findByRole('link', { name: /Kniebeuge/ });

    await user.type(screen.getByRole('searchbox', { name: 'Suche' }), 'halb in die hocke');
    expect(screen.getByRole('status')).toHaveTextContent('1 von 2 Übungen');
    const treffer = screen.getByRole('link', { name: /Kniebeuge/ });
    expect(treffer).toHaveTextContent('Gefunden in: Kniebeuge am Geländer, halbe Tiefe');
    expect(screen.queryByRole('link', { name: /Ausfallschritt/ })).not.toBeInTheDocument();
  });

  it('filtert nach Körperregion und Ausrüstung hinter einem Aufklapper', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungenPage user={testUser(['trainer'])} />);
    await screen.findByRole('link', { name: /Kniebeuge/ });

    const filter = screen.getByText('Filter').closest('details')!;
    expect(filter).not.toHaveAttribute('open');

    await user.selectOptions(within(filter).getByLabelText('Ausrüstung'), 'Geländer');
    expect(screen.getByRole('status')).toHaveTextContent('1 von 2 Übungen');
    expect(screen.getByRole('link', { name: /Kniebeuge/ })).toBeInTheDocument();

    await user.selectOptions(within(filter).getByLabelText('Körperregion'), 'lws');
    expect(screen.getByText('Keine Übung passt zu Suche und Filter.')).toBeInTheDocument();

    await user.click(within(filter).getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(screen.getAllByRole('link', { name: /Kniebeuge|Ausfallschritt/ })).toHaveLength(2);
  });

  it('zeigt eine Variante so, wie Patient:innen sie lesen - ohne fachliche Angaben', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['therapist'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    const ansicht = screen.getAllByText('Ansicht in Alltagssprache')[0]!.closest('details')!;
    expect(ansicht).not.toHaveAttribute('open');
    expect(ansicht).toHaveTextContent('In die Hocke gehen');
    expect(ansicht).toHaveTextContent('Am Geländer halb in die Hocke gehen');
    expect(ansicht).toHaveTextContent('Mit beiden Händen festhalten.');
    expect(ansicht).toHaveTextContent('Ausrüstung: Geländer');
    expect(ansicht).not.toHaveTextContent('Knie fallen nach innen.');
    expect(ansicht).not.toHaveTextContent('Nicht unter Schmerz über 5.');
  });
});

describe('Sprung zwischen Übungen (Zweitreview H1)', () => {
  it('nimmt ein offenes Formular nicht in die nächste Übung mit', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: '/uebungen/:uebungId', element: <UebungPage user={testUser(['owner'])} /> }],
      { initialEntries: ['/uebungen/u1'] },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    await user.click(screen.getAllByRole('button', { name: 'Bearbeiten' })[0]!);
    expect(screen.getByRole('heading', { name: 'Übung bearbeiten' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Ausfallschritt: Ausfallschritt vorwärts' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ausfallschritt' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Übung bearbeiten' })).not.toBeInTheDocument();
  });
});
