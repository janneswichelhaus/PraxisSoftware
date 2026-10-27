import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OHNE_KATALOG } from './testdaten';
// Statisch geladen, damit der Knopf den Katalog ohne Wartezeit nachlädt.
import { KATALOG, katalogeintrag } from './katalog';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import type { CurrentUser } from '@/features/core/session/types';

const fetchBibliothek = vi.fn();
const saveUebung = vi.fn();
const saveVariante = vi.fn();
const archiviereUebung = vi.fn();
const archiviereVariante = vi.fn();
const verbinde = vi.fn();
const loeseVerbindung = vi.fn();
const loescheUebung = vi.fn();
const loescheVariante = vi.fn();
const importiereKatalog = vi.fn();
const setzePruefvermerk = vi.fn();

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
    importiereKatalog: (...args: unknown[]) =>
      importiereKatalog(...args) as Promise<Api.Uebernahme>,
    setzePruefvermerk: (...args: unknown[]) => setzePruefvermerk(...args) as Promise<void>,
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
  ...OHNE_KATALOG,
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
  ...OHNE_KATALOG,
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
  ...OHNE_KATALOG,
};

const AUSFALLSCHRITT: Api.Uebung = {
  id: 'u3',
  name: 'Ausfallschritt',
  lay_name: 'Großer Schritt',
  body_region: 'knie',
  archived: false,
  variants: [VORWAERTS],
};

/** UEB-012: eine übernommene Katalogübung mit Bild, Ordnungen und Standarddosierung. */
const KN01 = katalogeintrag('KN-01')!;
const STRECKUNG: Api.Uebung = {
  id: 'u5',
  name: KN01.name,
  lay_name: KN01.alltagsname,
  body_region: 'knie',
  archived: false,
  variants: [
    {
      id: 'v5',
      name: KN01.name,
      lay_name: KN01.alltagsname,
      instruction: KN01.anleitung.join('\n'),
      equipment: ['Stuhl', 'Gewichtsmanschette (nach Bedarf)'],
      common_faults: KN01.fehler.join('\n'),
      practice_notes: KN01.hinweise_praxis ?? null,
      archived: false,
      ...OHNE_KATALOG,
      catalog_key: 'KN-01',
      catalog_version: '1.0.0',
      goal: 'kraft',
      starting_position: 'sitz',
      level: 1,
      default_dosage: {
        sets: 3,
        reps_min: 10,
        reps_max: 10,
        duration_seconds: null,
        hold_seconds: 3,
        per_side: true,
        times_per_day: 1,
      },
    },
  ],
};

/** UEB-002: Am Geländer → Ausfallschritt vorwärts, schwerer in der Komplexität. */
const VERBINDUNG: Api.Verbindung = {
  id: 'l1',
  easier_variant_id: 'v1',
  harder_variant_id: 'v3',
  axis: 'komplexitaet',
};

function bibliothek(canManage: boolean, mitKatalog = false): Api.Bibliothek {
  return {
    can_manage: canManage,
    exercises: mitKatalog
      ? [AUSFALLSCHRITT, BRUECKE, KNIEBEUGE, STRECKUNG]
      : [AUSFALLSCHRITT, BRUECKE, KNIEBEUGE],
    links: [VERBINDUNG],
  };
}

/** Bibliothek und Übung mit beiden Routen - für Wege von einer zur anderen. */
function mitRouten(user: CurrentUser, start: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/uebungen', element: <UebungenPage user={user} /> },
      { path: '/uebungen/:uebungId', element: <UebungPage user={user} /> },
    ],
    { initialEntries: [start] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
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
    importiereKatalog,
    setzePruefvermerk,
  ]) {
    f.mockReset();
  }
  fetchBibliothek.mockResolvedValue(bibliothek(true));
  saveUebung.mockResolvedValue('neu');
  saveVariante.mockResolvedValue('neue-variante');
  archiviereUebung.mockResolvedValue(undefined);
  archiviereVariante.mockResolvedValue(undefined);
  loescheUebung.mockResolvedValue(undefined);
  loescheVariante.mockResolvedValue(undefined);
  verbinde.mockResolvedValue(undefined);
  loeseVerbindung.mockResolvedValue(undefined);
  setzePruefvermerk.mockResolvedValue(undefined);
});

describe('UebungenPage (UEB-001, Welle B: Liste)', () => {
  it('zeigt die Übungen mit Region, Ziel und Niveau', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false, true));
    renderWithProviders(<UebungenPage user={testUser(['therapist'])} />);
    const link = await screen.findByRole('link', { name: /^Kniebeuge/ });
    expect(link).toHaveAttribute('href', '/uebungen/u1');
    expect(link).toHaveTextContent('Knie');
    const katalog = screen.getByRole('link', { name: (name) => name.startsWith(KN01.name) });
    // ANN-386: leise in der Zeile, kein Abzeichen.
    expect(katalog).toHaveTextContent('Knie · Kraft · Leicht, mit Halt · ungeprüft');
    // Keine Zeichnung in der Zeile (ANN-539).
    expect(katalog.querySelector('svg')).toBeNull();
  });

  it('legt archivierte Übungen in einen eigenen, zugeklappten Bereich', async () => {
    renderWithProviders(<UebungenPage user={testUser(['therapist'])} />);
    await screen.findByRole('link', { name: /^Kniebeuge/ });
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
    await screen.findByRole('link', { name: /^Kniebeuge/ });
    expect(screen.queryByRole('button', { name: 'Übung anlegen' })).not.toBeInTheDocument();
  });

  it('bietet owner die Standardbibliothek prominent an und meldet, was übernommen wurde (ANN-385, ANN-388)', async () => {
    const user = userEvent.setup();
    importiereKatalog.mockResolvedValue({
      imported: ['KN-01', 'KN-02'],
      skipped: ['KN-03'],
      conflicts: [{ catalog_key: 'KN-07', name: 'Mini-Kniebeuge mit Halt' }],
    });
    renderWithProviders(<UebungenPage user={testUser(['owner'])} />);
    expect(await screen.findByRole('heading', { name: 'Standardbibliothek' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Standardbibliothek übernehmen' }));
    const meldung = await screen.findByText(
      /2 Übungen übernommen, 1 schon vorhanden und unverändert/,
    );
    expect(meldung).toHaveTextContent('ausgelassen: Mini-Kniebeuge mit Halt');
    expect(meldung).toHaveTextContent(
      'Die Übungen sind KI-erstellt und gelten bis zur Durchsicht durch die Praxis als ungeprüft.',
    );
    // Der ganze Katalog geht an den Server - der prüft und überspringt.
    expect(importiereKatalog).toHaveBeenCalledWith(KATALOG);
  });

  it('nennt nach der ersten Übernahme nur noch leise, was der Katalog Neues hat', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(true, true));
    renderWithProviders(<UebungenPage user={testUser(['owner'])} />);
    await screen.findByRole('link', { name: /^Kniebeuge/ });
    expect(screen.queryByRole('heading', { name: 'Standardbibliothek' })).not.toBeInTheDocument();
    const neu = KATALOG.length - 1;
    expect(
      await screen.findByText(
        neu === 1 ? '1 neuer Eintrag im Katalog' : `${neu} neue Einträge im Katalog`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeInTheDocument();
  });

  it('bietet die Standardbibliothek ohne Pflegerecht nicht an (ANN-293)', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false));
    renderWithProviders(<UebungenPage user={testUser(['therapist'])} />);
    await screen.findByRole('link', { name: /^Kniebeuge/ });
    expect(
      screen.queryByRole('button', { name: 'Standardbibliothek übernehmen' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/neue Einträge im Katalog/)).not.toBeInTheDocument();
  });

  it('legt Übung und erste Variante in einem Formular an und öffnet die Übung', async () => {
    const user = userEvent.setup();
    fetchBibliothek.mockResolvedValue(bibliothek(true, true));
    const router = mitRouten(testUser(['owner']), '/uebungen');
    await user.click(await screen.findByRole('button', { name: 'Übung anlegen' }));

    await user.click(screen.getByRole('button', { name: 'Übung anlegen' }));
    expect(screen.getByText('Bitte die fachliche Bezeichnung angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte eine Körperregion wählen.')).toBeInTheDocument();
    expect(saveUebung).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Bezeichnung *'), 'Ausfallschritt seitlich');
    await user.type(screen.getByLabelText('Bezeichnung in Alltagssprache *'), 'Schritt zur Seite');
    await user.selectOptions(screen.getByLabelText('Körperregion *'), 'huefte');
    await user.type(screen.getByLabelText('Anleitung in Alltagssprache'), 'Seitlich treten.');
    await user.type(screen.getByLabelText('Ausrüstung'), 'Stuhl');
    await user.click(screen.getByRole('button', { name: 'Übung anlegen' }));

    await waitFor(() =>
      expect(saveVariante).toHaveBeenCalledWith({
        uebungId: 'neu',
        name: 'Ausfallschritt seitlich',
        laie: 'Schritt zur Seite',
        anleitung: 'Seitlich treten.',
        ausruestung: ['Stuhl'],
        ausweichbewegungen: '',
        hinweise: '',
      }),
    );
    expect(saveUebung).toHaveBeenCalledWith({
      name: 'Ausfallschritt seitlich',
      laie: 'Schritt zur Seite',
      region: 'huefte',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/uebungen/neu'));
  });

  it('sagt ehrlich, wenn nur die Übung entstand, und legt beim zweiten Versuch nur die Variante an', async () => {
    const user = userEvent.setup();
    saveVariante.mockRejectedValueOnce(new Error('Die Variante konnte nicht gespeichert werden.'));
    renderWithProviders(<UebungenPage user={testUser(['owner'])} />);
    await user.click(await screen.findByRole('button', { name: 'Übung anlegen' }));
    await user.type(screen.getByLabelText('Bezeichnung *'), 'Seitstütz');
    await user.type(screen.getByLabelText('Bezeichnung in Alltagssprache *'), 'Seitlich stützen');
    await user.selectOptions(screen.getByLabelText('Körperregion *'), 'rumpf');
    await user.click(screen.getByRole('button', { name: 'Übung anlegen' }));
    expect(
      await screen.findByText(/Die Übung ist angelegt, ihre erste Variante nicht/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Übung anlegen' }));
    await waitFor(() => expect(saveVariante).toHaveBeenCalledTimes(2));
    expect(saveUebung).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});

describe('UebungAnsicht (UEB-001, Welle B: Objektseite)', () => {
  it('zeigt Standarddosierung, Anleitung in Schritten, Fehler und Hinweise - ohne Zeichnung', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false, true));
    renderWithProviders(<UebungAnsicht user={testUser(['trainer'])} uebungId="u5" />);
    expect(await screen.findByRole('heading', { level: 1, name: KN01.name })).toBeInTheDocument();
    expect(screen.getByText(`${KN01.alltagsname} · Knie`)).toBeInTheDocument();
    // Keine Zeichnung (ANN-539): Bilder und Videos dreht die Praxis selbst.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/Text KI-erstellt\./)).toBeInTheDocument();
    // Standarddosierung als Kacheln (ANN-384).
    const kacheln = screen.getByRole('heading', { name: 'Standarddosierung' }).closest('section')!;
    expect(within(kacheln).getByText('Sätze').nextSibling).toHaveTextContent('3');
    expect(kacheln).toHaveTextContent('je Seite, 3 s halten');
    expect(kacheln).toHaveTextContent('1-mal');
    // Anleitung als nummerierte Schritte.
    const schritte = within(screen.getByRole('heading', { name: 'Anleitung' }).closest('section')!)
      .getAllByRole('listitem')
      .slice(0, KN01.anleitung.length);
    expect(schritte[0]).toHaveTextContent(`Schritt 1: ${KN01.anleitung[0]}`);
    expect(screen.getByRole('heading', { name: 'Typische Fehler' })).toBeInTheDocument();
    expect(screen.getByText(KN01.fehler[0]!)).toBeInTheDocument();
    expect(screen.getByText('Stuhl, Gewichtsmanschette (nach Bedarf)')).toBeInTheDocument();
    // ANN-386: ungeprüft - ohne Pflegerecht ohne Knopf.
    expect(
      screen.getByText('Aus dem Übungskatalog, noch nicht von der Praxis durchgesehen'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Als durchgesehen markieren' }),
    ).not.toBeInTheDocument();
  });

  it('lässt owner die Übung als durchgesehen markieren und bestätigt es (ANN-386)', async () => {
    const user = userEvent.setup();
    fetchBibliothek.mockResolvedValue(bibliothek(true, true));
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u5" />);
    await user.click(await screen.findByRole('button', { name: 'Als durchgesehen markieren' }));
    await waitFor(() => expect(setzePruefvermerk).toHaveBeenCalledWith('v5', true));
    expect(await screen.findByText('Als durchgesehen vermerkt.')).toBeInTheDocument();
  });

  it('zeigt eine eigene Variante mit beiden Sprachebenen und ihren Angaben', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['trainer'])} uebungId="u1" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' })).toBeInTheDocument();
    expect(screen.getByText('In die Hocke gehen · Knie')).toBeInTheDocument();
    expect(
      screen.getByText('Alltagssprache: Am Geländer halb in die Hocke gehen'),
    ).toBeInTheDocument();
    const anleitung = screen.getByRole('heading', { name: 'Anleitung' }).closest('section')!;
    expect(within(anleitung).getByText('Mit beiden Händen festhalten.')).toBeInTheDocument();
    expect(within(anleitung).getByText('Geländer')).toBeInTheDocument();
    expect(within(anleitung).getByText('Knie fallen nach innen.')).toBeInTheDocument();
    expect(within(anleitung).getByText('Nicht unter Schmerz über 5.')).toBeInTheDocument();
    // Eigene Übung: keine Standarddosierung, kein Prüfhinweis.
    expect(screen.queryByRole('heading', { name: 'Standarddosierung' })).not.toBeInTheDocument();
    expect(screen.queryByText(/noch nicht von der Praxis durchgesehen/)).not.toBeInTheDocument();
  });

  it('bietet ohne Pflegerecht keine Änderung an (ANN-293)', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false));
    renderWithProviders(<UebungAnsicht user={testUser(['therapist'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Variante anlegen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Pflege')).not.toBeInTheDocument();
  });

  it('bietet „Zu einem Plan" nur, wer Übungspläne schreibt (ANN-503)', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false));
    const { unmount } = renderWithProviders(
      <UebungAnsicht user={testUser(['therapist'])} uebungId="u1" />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    expect(screen.getByRole('button', { name: 'Zu einem Plan' })).toBeEnabled();
    unmount();

    for (const rolle of ['office', 'trainer'] as const) {
      const { unmount: weg } = renderWithProviders(
        <UebungAnsicht user={testUser([rolle])} uebungId="u1" />,
      );
      await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
      expect(screen.queryByRole('button', { name: 'Zu einem Plan' })).toBeNull();
      weg();
    }
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
    expect(await screen.findByText('Variante „Kniebeuge mit Band“ angelegt.')).toBeInTheDocument();
  });

  it('bearbeitet die gezeigte Variante im Formular mit Formularfuß', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    const formular = screen.getByRole('form', { name: 'Variante bearbeiten' });
    expect(within(formular).getByLabelText('Bezeichnung *')).toHaveValue(
      'Kniebeuge am Geländer, halbe Tiefe',
    );
    await user.click(within(formular).getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveVariante).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' })),
    );
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
  });

  it('archiviert eine Variante und löscht eine nach Rückfrage - leise unter „Pflege“', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    const pflege = screen.getByText('Pflege').closest('details')!;
    expect(pflege).not.toHaveAttribute('open');

    await user.click(within(pflege).getByRole('button', { name: 'Variante archivieren' }));
    await waitFor(() => expect(archiviereVariante).toHaveBeenCalledWith('v1', true));

    await user.click(within(pflege).getByRole('button', { name: 'Variante löschen' }));
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
    await user.click(screen.getByRole('button', { name: 'Variante löschen' }));
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

  it('zeigt die Variante, auf die ein Sprung zielt, und die übrigen als Zeilen', async () => {
    fetchBibliothek.mockResolvedValue({
      ...bibliothek(false),
      exercises: [
        AUSFALLSCHRITT,
        { ...KNIEBEUGE, variants: [GELAENDER, { ...VORWAERTS, id: 'v9', name: 'Kniebeuge frei' }] },
      ],
    });
    mitRouten(testUser(['therapist']), '/uebungen/u1#variante-v9');
    expect(await screen.findByText('Alltagssprache: Großer Schritt nach vorn')).toBeInTheDocument();
    const weitere = screen
      .getByRole('heading', { name: 'Weitere Varianten (1)' })
      .closest('section')!;
    expect(
      within(weitere).getByRole('link', { name: /Kniebeuge am Geländer, halbe Tiefe/ }),
    ).toHaveAttribute('href', '/uebungen/u1#variante-v1');
  });
});

describe('Leichter und schwerer (UEB-002)', () => {
  it('zeigt die Nachbarn mit Richtung, Achse und Weg dorthin', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(false));
    renderWithProviders(<UebungAnsicht user={testUser(['trainer'])} uebungId="u1" />);
    const ziel = await screen.findByRole('link', {
      name: /Ausfallschritt: Ausfallschritt vorwärts/,
    });
    expect(ziel).toHaveAttribute('href', '/uebungen/u3#variante-v3');
    expect(ziel).toHaveTextContent('Schwerer · Achse: Komplexität');
    // Ohne Pflegerecht kein Lösen und kein Verbinden.
    expect(screen.queryByRole('button', { name: /lösen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verbinden' })).not.toBeInTheDocument();
  });

  it('zeigt dieselbe Verbindung von der anderen Seite als leichter', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u3" />);
    const ziel = await screen.findByRole('link', {
      name: /Kniebeuge: Kniebeuge am Geländer, halbe Tiefe/,
    });
    expect(ziel).toHaveTextContent('Leichter · Achse: Komplexität');
  });

  it('schlägt nichts vor - keine Empfehlung, kein nächster Schritt (ADR-006 Punkt 10)', async () => {
    fetchBibliothek.mockResolvedValue(bibliothek(true, true));
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u5" />);
    await screen.findByRole('heading', { level: 1, name: KN01.name });
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
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    await user.click(screen.getByRole('button', { name: 'Verbinden' }));
    const formular = screen.getByRole('form', { name: 'Variante verbinden' });

    await user.click(within(formular).getByRole('button', { name: 'Verbinden' }));
    expect(within(formular).getByText('Bitte eine Variante wählen.')).toBeInTheDocument();
    expect(within(formular).getByText('Bitte eine Achse wählen.')).toBeInTheDocument();

    const andere = within(formular).getByLabelText('Andere Variante *');
    // Schon verbunden (v3), archiviert (v2) und sie selbst stehen nicht zur Wahl.
    expect(
      within(andere)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Bitte wählen', 'Aufstehen vom Stuhl']);

    await user.selectOptions(
      within(formular).getByLabelText('Die andere Variante ist'),
      'leichter',
    );
    await user.selectOptions(andere, 'v4');
    await user.selectOptions(within(formular).getByLabelText('Achse *'), 'hebel');
    await user.click(within(formular).getByRole('button', { name: 'Verbinden' }));
    await waitFor(() => expect(verbinde).toHaveBeenCalledWith('v4', 'v1', 'hebel'));
  });

  it('löst eine Verbindung nach Rückfrage im Fenster', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungAnsicht user={testUser(['owner'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    await user.click(
      screen.getByRole('button', {
        name: 'Verbindung zu „Ausfallschritt: Ausfallschritt vorwärts“ lösen',
      }),
    );
    expect(loeseVerbindung).not.toHaveBeenCalled();
    const frage = screen.getByRole('dialog', {
      name: 'Verbindung zu „Ausfallschritt: Ausfallschritt vorwärts“ lösen',
    });
    await user.click(within(frage).getByRole('button', { name: 'Ja, Verbindung lösen' }));
    await waitFor(() => expect(loeseVerbindung).toHaveBeenCalledWith('l1'));
  });
});

describe('Katalog und Suche (UEB-003, Welle B: Filterchips)', () => {
  it('sucht in der Alltagssprache, auch ohne Umlaute, und nennt die Variante', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UebungenPage user={testUser(['therapist'])} />);
    await screen.findByRole('link', { name: /^Kniebeuge/ });

    await user.type(screen.getByRole('searchbox', { name: 'Suche' }), 'halb in die hocke');
    expect(screen.getByRole('status')).toHaveTextContent('1 von 2 Übungen');
    const treffer = screen.getByRole('link', { name: /^Kniebeuge/ });
    expect(treffer).toHaveTextContent('Gefunden in: Kniebeuge am Geländer, halbe Tiefe');
    expect(screen.queryByRole('link', { name: /Ausfallschritt/ })).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Suche' }));
    await user.type(screen.getByRole('searchbox', { name: 'Suche' }), 'gelaender');
    expect(screen.getByRole('status')).toHaveTextContent('1 von 2 Übungen');
  });

  it('filtert mit Chips nach Region, Hilfsmittel und Ziel und setzt zurück', async () => {
    const user = userEvent.setup();
    fetchBibliothek.mockResolvedValue(bibliothek(false, true));
    renderWithProviders(<UebungenPage user={testUser(['trainer'])} />);
    await screen.findByRole('link', { name: /^Kniebeuge/ });

    const hilfsmittel = screen.getByRole('group', { name: 'Hilfsmittel' });
    await user.click(within(hilfsmittel).getByRole('button', { name: 'Geländer' }));
    expect(within(hilfsmittel).getByRole('button', { name: /Geländer/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 von 3 Übungen');

    await user.click(within(hilfsmittel).getByRole('button', { name: /Geländer/ }));
    await user.click(
      within(screen.getByRole('group', { name: 'Ziel' })).getByRole('button', { name: 'Kraft' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 von 3 Übungen');
    expect(
      screen.getByRole('link', { name: (name) => name.startsWith(KN01.name) }),
    ).toBeInTheDocument();

    await user.click(within(hilfsmittel).getByRole('button', { name: 'Ohne Hilfsmittel' }));
    expect(screen.getByText('Keine Übung passt zu Suche und Filter.')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Filter zurücksetzen' })[0]!);
    expect(
      screen.getAllByRole('link', { name: /Kniebeuge|Ausfallschritt|Kniestreckung/ }),
    ).toHaveLength(3);
  });

  it('zeigt eine Variante so, wie Patient:innen sie lesen - ohne fachliche Angaben', async () => {
    renderWithProviders(<UebungAnsicht user={testUser(['therapist'])} uebungId="u1" />);
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    const ansicht = screen.getByText('Ansicht in Alltagssprache').closest('details')!;
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
    const router = mitRouten(testUser(['owner']), '/uebungen/u1');
    await screen.findByRole('heading', { level: 1, name: 'Kniebeuge' });
    await user.click(screen.getByRole('button', { name: 'Bezeichnung und Region' }));
    expect(screen.getByRole('form', { name: 'Übung bearbeiten' })).toBeInTheDocument();

    await router.navigate('/uebungen/u3');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ausfallschritt' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Übung bearbeiten' })).not.toBeInTheDocument();
  });
});
