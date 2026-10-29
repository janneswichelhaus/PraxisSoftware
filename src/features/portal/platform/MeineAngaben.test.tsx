import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { EigeneCheckins, Plattformzugang } from './api';

/** „Meine Angaben“ auf der Plattform: je Frage eine Zeile, die Seite der Frage, alle Antworten. */

const ladeCheckins = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeCheckins: (...a: unknown[]) => ladeCheckins(...a) as Promise<EigeneCheckins | null>,
}));

const { AlleAntworten, AngabeSeite, MeineAngaben } = await import('./MeineAngaben');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};

function daten(teil: Partial<EigeneCheckins> = {}): EigeneCheckins {
  return {
    today: '2026-10-29',
    schedule: { interval_days: 7, parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'] },
    due_on: '2026-11-02',
    due: false,
    can_answer: false,
    consent_needed: false,
    last_values: { pain_rest: 3 },
    history: [
      {
        answered_on: '2026-10-21',
        recorded_by_kind: 'self',
        values: { pain_rest: 3, pain_load: 6, pain_quality: 2, painkiller_24h: 0 },
      },
      {
        answered_on: '2026-10-14',
        recorded_by_kind: 'legal_representative',
        values: { pain_rest: 5, pain_recovery_hours: 24, painkiller_24h: 1 },
      },
    ],
    session_history: [
      {
        performed_on: '2026-10-26',
        plan_title: 'Kräftigung Knie',
        recorded_by_kind: 'self',
        values: { session_exertion: 6, session_confidence: 7 },
      },
    ],
    ...teil,
  };
}

/** Keine Deutung der eigenen Werte, kein Linienbild - nur der Pfeil einer Zeile ist gezeichnet. */
function ohneDeutungUndLinie(container: HTMLElement) {
  expect(container).not.toHaveTextContent(
    /besser|schlechter|Trend|Fortschritt|gut gemacht|Rückschritt/i,
  );
  const linien = [...container.querySelectorAll('polyline, path')].filter(
    (linie) => !linie.closest('[data-pfeil]'),
  );
  expect(linien).toEqual([]);
}

function seiteDerFrage(schluessel: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/p/angaben/:schluessel" element={<AngabeSeite zugang={ZUGANG} />} />
    </Routes>,
    `/p/angaben/${schluessel}?bereich=treatment`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeCheckins.mockResolvedValue(daten());
});

describe('Meine Angaben: Übersicht', () => {
  it('zeigt je Frage mit Zahl eine Zeile mit Kurzname, letztem Wert und Tag, ohne Deutung', async () => {
    const { container } = renderWithProviders(
      <MeineAngaben zugang={ZUGANG} />,
      '/p/angaben?bereich=treatment',
    );
    // Der Titel steht schon beim Laden; die Abschnitte kommen mit den Angaben.
    await screen.findByRole('heading', { level: 2, name: 'Aus dem Check-in' });
    expect(screen.getByRole('heading', { level: 1, name: 'Meine Angaben' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Ich' })).toHaveAttribute(
      'href',
      '/p/ich?bereich=treatment',
    );
    expect(screen.getByText(/^Werte schwanken von Tag zu Tag\./)).toBeInTheDocument();

    const checkin = screen.getByRole('heading', { level: 2, name: 'Aus dem Check-in' })
      .parentElement!.parentElement!;
    const zeilen = within(checkin).getAllByRole('link');
    // Folge des Katalogs; Schmerzart und Schmerzmittel sind Wortwahlen und stehen nur in der Tabelle.
    expect(zeilen.map((z) => z.getAttribute('href'))).toEqual([
      '/p/angaben/pain_rest?bereich=treatment',
      '/p/angaben/pain_load?bereich=treatment',
      '/p/angaben/pain_recovery_hours?bereich=treatment',
    ]);
    expect(zeilen[0]).toHaveAccessibleName(/^Schmerz in Ruhe, 3 von 10, zuletzt am 21\.\sOktober$/);
    expect(zeilen[2]).toHaveAccessibleName(
      /^Schmerz wieder wie vorher nach, 24 Stunden, zuletzt am 14\.\sOktober$/,
    );
    // Der Wert steht sichtbar groß daneben; Vorlesesoftware hört ihn einmal, an seiner Stelle.
    const wert = within(zeilen[0]!).getByText('3');
    expect(wert).toHaveClass('font-bold', 'text-[1.625rem]');
    expect(wert.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: /Schmerzart|Schmerzmittel/ })).toBeNull();

    const uebungen = screen.getByRole('heading', { level: 2, name: 'Nach den Übungen' })
      .parentElement!.parentElement!;
    expect(
      within(uebungen)
        .getAllByRole('link')
        .map((z) => z.textContent),
    ).toEqual([
      'Anstrengung, 6 von 10, zuletzt am 26. Oktober6 von 10',
      'Bewegungssicherheit, 7 von 10, zuletzt am 26. Oktober7 von 10',
    ]);
    expect(screen.getByRole('link', { name: 'Alle Antworten als Tabelle' })).toHaveAttribute(
      'href',
      '/p/angaben/tabelle?bereich=treatment',
    );
    // Keine Punktbilder mehr - der Satz dazu entfällt mit ihnen.
    expect(screen.queryByRole('figure')).toBeNull();
    expect(screen.queryByText(/Jeder Punkt ist eine Antwort/)).toBeNull();
    ohneDeutungUndLinie(container);
    await pruefeBarrierefreiheit(container);
  });

  it('nennt das Jahr der letzten Angabe nur, wenn es nicht das laufende ist', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        today: '2027-01-05',
        history: [
          { answered_on: '2026-12-20', recorded_by_kind: 'self', values: { pain_rest: 4 } },
        ],
        session_history: [],
      }),
    );
    renderWithProviders(<MeineAngaben zugang={ZUGANG} />, '/p/angaben');
    expect(
      await screen.findByRole('link', {
        name: /^Schmerz in Ruhe, 4 von 10, zuletzt am 20\.\sDezember 2026$/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nach den Übungen' })).toBeNull();
  });

  it('führt zurück, woher man kam', async () => {
    renderWithProviders(
      <MeineAngaben zugang={ZUGANG} />,
      `/p/angaben?bereich=treatment&zurueck=${encodeURIComponent('/p?bereich=treatment')}`,
    );
    expect(await screen.findByRole('link', { name: '← Übersicht' })).toHaveAttribute(
      'href',
      '/p?bereich=treatment',
    );
  });

  it('leer: der Leerzustand sagt, wann hier etwas steht', async () => {
    ladeCheckins.mockResolvedValue(daten({ history: [], session_history: [] }));
    const { container, unmount } = renderWithProviders(
      <MeineAngaben zugang={ZUGANG} />,
      '/p/angaben',
    );
    expect(await screen.findByText('Noch keine Angaben')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ihre Antworten aus dem Check-in und nach den Übungen stehen hier, sobald Sie welche gesendet haben.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Werte schwanken/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Alle Antworten als Tabelle' })).toBeNull();
    await pruefeBarrierefreiheit(container);
    unmount();

    // Ohne Recht liefert der Server nichts - dieselbe Seite.
    ladeCheckins.mockResolvedValue(null);
    renderWithProviders(<MeineAngaben zugang={ZUGANG} />, '/p/angaben');
    expect(await screen.findByText('Noch keine Angaben')).toBeInTheDocument();
  });

  it('lädt mit stehendem Titel und vier Zeilen als Skelett; ein Fehler bietet „Erneut versuchen“', async () => {
    ladeCheckins.mockReturnValue(new Promise(() => undefined));
    const { container, unmount } = renderWithProviders(
      <MeineAngaben zugang={ZUGANG} />,
      '/p/angaben',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Meine Angaben' })).toBeInTheDocument();
    const bereich = container.querySelector('[aria-busy="true"]')!;
    expect(bereich).toHaveTextContent('Ihre Angaben werden geladen');
    expect(bereich.querySelectorAll('.min-h-18')).toHaveLength(4);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    ladeCheckins.mockRejectedValue(new Error('Ihr Check-in konnte nicht geladen werden.'));
    renderWithProviders(<MeineAngaben zugang={ZUGANG} />, '/p/angaben');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ihre Angaben konnten nicht geladen werden.',
    );
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});

describe('Meine Angaben: Seite einer Frage', () => {
  it('zeigt Frage, Enden und jede Antwort mit Balken und Zahl, die jüngste oben', async () => {
    const { container } = seiteDerFrage('pain_rest');
    await screen.findByRole('heading', { level: 2, name: 'Ihre Angaben' });
    // Ein langer Kurzname trennt unter 23rem an der Silbe, statt mitten im Wort zu brechen.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Schmerz in Ruhe' }).firstElementChild,
    ).toHaveClass('trennen-schmal');
    expect(screen.getByRole('link', { name: '← Meine Angaben' })).toHaveAttribute(
      'href',
      '/p/angaben?bereich=treatment',
    );
    // Die Frage in Tinte, der Satz der Enden leise darunter.
    expect(screen.getByText('Wie stark sind Ihre Schmerzen in Ruhe?')).toHaveClass('text-ink');
    const anker = screen.getByText('0 heißt „keine“, 10 heißt „stärkste vorstellbare“.');
    expect(anker).not.toHaveClass('text-ink');
    expect(anker.closest('.text-ink-muted')).not.toBeNull();
    const zeilen = within(
      screen.getByRole('list', { name: 'Ihre Angaben zu Schmerz in Ruhe' }),
    ).getAllByRole('listitem');
    expect(zeilen.map((z) => z.textContent)).toEqual([
      '21.10.2026: 3',
      '14.10.2026 · Vertretung: 5',
    ]);
    const balken = zeilen[0]!.querySelector<HTMLElement>('[data-fortschritt]')!;
    expect(balken.style.width).toBe('30%');
    expect(screen.getByText(/^Werte schwanken von Tag zu Tag\./)).toBeInTheDocument();
    ohneDeutungUndLinie(container);
    await pruefeBarrierefreiheit(container);
  });

  it('nach den Übungen mit dem Plan als Vermerk; eine Zahl mit Einheit ohne Enden', async () => {
    const { unmount } = seiteDerFrage('session_exertion');
    const liste = await screen.findByRole('list', { name: 'Ihre Angaben zu Anstrengung' });
    expect(within(liste).getByRole('listitem')).toHaveTextContent(
      '26.10.2026 · Kräftigung Knie: 6',
    );
    expect(screen.getByText('0 heißt „gar nicht“, 10 heißt „maximal“.')).toBeInTheDocument();
    unmount();

    seiteDerFrage('pain_recovery_hours');
    const stunden = await screen.findByRole('list', {
      name: 'Ihre Angaben zu Schmerz wieder wie vorher nach',
    });
    expect(within(stunden).getByRole('listitem')).toHaveTextContent(
      '14.10.2026 · Vertretung: 24 Stunden',
    );
    expect(screen.queryByText(/ heißt „/)).toBeNull();
  });

  it('einen unbekannten Schlüssel, eine Wortwahl oder eine Frage ohne Antwort gibt es hier nicht', async () => {
    for (const schluessel of ['gibt-es-nicht', 'pain_quality', 'pain_night']) {
      const { container, unmount } = seiteDerFrage(schluessel);
      expect(await screen.findByText('Diese Angabe gibt es hier nicht.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Meine Angaben' })).toHaveAttribute(
        'href',
        '/p/angaben?bereich=treatment',
      );
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      await pruefeBarrierefreiheit(container);
      unmount();
    }
  });
});

describe('Meine Angaben: alle Antworten', () => {
  it('zeigt beide Tabellen, darunter je der Satz zum Strich', async () => {
    const { container } = renderWithProviders(
      <AlleAntworten zugang={ZUGANG} />,
      '/p/angaben/tabelle?bereich=treatment',
    );
    const tabelle = await screen.findByRole('table', { name: /Meine Angaben aus dem Check-in/ });
    expect(screen.getByRole('heading', { level: 1, name: 'Alle Antworten' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Meine Angaben' })).toHaveAttribute(
      'href',
      '/p/angaben?bereich=treatment',
    );
    expect(within(tabelle).getByRole('columnheader', { name: /^14\.10\.2026/ })).toHaveTextContent(
      'Vertretung',
    );
    expect(
      within(within(tabelle).getByRole('row', { name: /Schmerzart/ })).getAllByRole('cell')[0],
    ).toHaveTextContent('stechend');
    // Der Strich ist ausgeblendet, vorgelesen wird „nicht angegeben“.
    const fehlt = within(
      within(tabelle).getByRole('row', { name: /Schmerz bei Belastung/ }),
    ).getAllByRole('cell')[1]!;
    expect(fehlt).toHaveTextContent('–nicht angegeben');
    expect(within(fehlt).getByText('–')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('table', { name: /Meine Angaben nach den Übungen/ })).toBeVisible();
    expect(screen.getAllByText('Ein Strich heißt: nicht angegeben.')).toHaveLength(2);
    ohneDeutungUndLinie(container);
    await pruefeBarrierefreiheit(container);
  });
});
