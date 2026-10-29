import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { EigeneCheckins, Nachsorgeabo, Plattformzugang } from './api';

/**
 * Der Check-in auf der Plattform als geführter Ablauf (Handoff 5.1): je Hauptfrage eine Seite,
 * Zusammenhang und Belastung je auf einer; freiwillig, nichts vorausgewählt, die letzte Angabe mit
 * Tag als Hinweis (ANN-349).
 */

const ladeCheckins = vi.fn();
const checkinAbsenden = vi.fn();
const ladeAbo = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeCheckins: (...a: unknown[]) => ladeCheckins(...a) as Promise<EigeneCheckins | null>,
  checkinAbsenden: (...a: unknown[]) => checkinAbsenden(...a) as Promise<void>,
  ladeAbo: (...a: unknown[]) => ladeAbo(...a) as Promise<Nachsorgeabo | null>,
}));

const { Checkin } = await import('./Checkin');

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

const PFAD = '/p/checkin?bereich=treatment';

function daten(teil: Partial<EigeneCheckins> = {}): EigeneCheckins {
  return {
    today: '2026-10-12',
    schedule: { interval_days: 7, parameter_keys: ['pain_rest', 'morning_stiffness_minutes'] },
    due_on: '2026-10-12',
    due: true,
    can_answer: true,
    consent_needed: false,
    last_values: { pain_rest: 4, morning_stiffness_minutes: 15 },
    history: [
      {
        answered_on: '2026-10-05',
        recorded_by_kind: 'self',
        values: { pain_rest: 4, morning_stiffness_minutes: 15 },
      },
      {
        answered_on: '2026-09-28',
        recorded_by_kind: 'self',
        values: { pain_rest: 6 },
      },
    ],
    session_history: [],
    ...teil,
  };
}

const fenster = (name: string) => screen.getByRole('dialog', { name });
const gedrueckt = (gruppe: HTMLElement) =>
  within(gruppe)
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true');

/** Der Check-in mit der Übersicht und den Einwilligungen als Ziele, um Wege zu prüfen. */
function zeigeMitZielen(ui: ReactElement, pfad = PFAD) {
  function Ort() {
    const ort = useLocation();
    return <p>Ziel {`${ort.pathname}${ort.search}`}</p>;
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [
      { path: '/p/checkin', element: ui },
      { path: '*', element: <Ort /> },
    ],
    { initialEntries: [pfad] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeCheckins.mockResolvedValue(daten());
  checkinAbsenden.mockResolvedValue(undefined);
  ladeAbo.mockResolvedValue(null);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('Check-in als geführter Ablauf (Handoff 5.1)', () => {
  it('fragt je Seite eine Frage, nichts vorausgewählt, die letzte Angabe mit Tag', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    const erste = await screen.findByRole('dialog', {
      name: 'Wie stark sind Ihre Schmerzen in Ruhe?',
    });
    expect(within(erste).getByText('Check-in')).toBeInTheDocument();
    expect(within(erste).getByText('Frage 1 von 2')).toBeInTheDocument();
    expect(
      within(erste).getByText(
        'Jede Frage ist freiwillig. Lassen Sie offen, was Sie nicht sicher wissen.',
      ),
    ).toBeInTheDocument();
    const ruhe = within(erste).getByRole('group', {
      name: 'Wie stark sind Ihre Schmerzen in Ruhe?',
    });
    expect(gedrueckt(ruhe)).toEqual([]);
    expect(
      within(erste).getByText('0 heißt „keine“, 10 heißt „stärkste vorstellbare“.'),
    ).toBeInTheDocument();
    // Der Tag kommt aus dem jüngsten Eintrag des Verlaufs mit dieser Frage.
    expect(within(erste).getByText('Ihre letzte Angabe: 4 am 5. Oktober')).toBeInTheDocument();
    expect(within(erste).queryByRole('button', { name: '← Zurück' })).not.toBeInTheDocument();
    expect(within(erste).queryByRole('button', { name: 'Angaben senden' })).toBeNull();
    // Die Frage steht nur einmal da: als Titel des Fensters.
    expect(within(erste).getAllByText('Wie stark sind Ihre Schmerzen in Ruhe?')).toHaveLength(1);
    await pruefeBarrierefreiheit(document.body);

    await nutzer.click(within(ruhe).getByRole('button', { name: '2' }));
    expect(within(ruhe).getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true');
    await nutzer.click(within(erste).getByRole('button', { name: 'Weiter' }));

    const zweite = fenster('Wie viele Minuten waren Sie heute Morgen steif?');
    expect(within(zweite).getByText('Frage 2 von 2')).toBeInTheDocument();
    expect(within(zweite).queryByText(/Jede Frage ist freiwillig/)).not.toBeInTheDocument();
    const minuten = within(zweite).getByLabelText(
      'Wie viele Minuten waren Sie heute Morgen steif?',
    );
    expect(minuten).toHaveValue(null);
    expect(minuten).toHaveAttribute('inputmode', 'numeric');
    // Bei einer Zahl steht die letzte Angabe über dem Feld.
    const letzteAngabe = within(zweite).getByText('Ihre letzte Angabe: 15 Minuten am 5. Oktober');
    expect(
      letzteAngabe.compareDocumentPosition(minuten) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Die letzte Seite: wer liest, der Notfallhinweis und „Angaben senden“ statt „Weiter“.
    expect(
      within(zweite).getByText(
        'Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin; sie werden nicht laufend gelesen.',
      ),
    ).toBeInTheDocument();
    expect(within(zweite).getByText('Nicht für akute Beschwerden.')).toBeInTheDocument();
    expect(within(zweite).getByRole('link', { name: '112 anrufen' })).toHaveAttribute(
      'href',
      'tel:112',
    );
    expect(within(zweite).getByRole('link', { name: '116117 anrufen' })).toBeInTheDocument();
    expect(within(zweite).queryByRole('button', { name: 'Weiter' })).toBeNull();
    await pruefeBarrierefreiheit(document.body);

    await nutzer.type(minuten, '30');
    await nutzer.click(within(zweite).getByRole('button', { name: 'Angaben senden' }));
    await waitFor(() =>
      expect(checkinAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, {
        pain_rest: 2,
        morning_stiffness_minutes: 30,
      }),
    );
  });

  it('hat so viele Seiten wie Hauptfragen, Zusammenhang und Belastung; senden nur auf der letzten', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        schedule: {
          interval_days: 7,
          parameter_keys: [
            'pain_rest',
            'painkiller_24h',
            'activity_kind',
            'pain_side',
            'daily_impairment',
            'activity_minutes',
          ],
        },
      }),
    );
    const nutzer = userEvent.setup();
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    const titel = [
      'Wie stark sind Ihre Schmerzen in Ruhe?',
      'Wie stark schränken Ihre Beschwerden Sie im Alltag ein?',
      'Zum Zusammenhang',
      'Außerhalb der Übungen',
    ] as const;
    await screen.findByRole('dialog', { name: titel[0] });
    expect(document.querySelectorAll('[data-schritt]')).toHaveLength(4);
    for (const [i, name] of titel.entries()) {
      const seite = fenster(name);
      expect(within(seite).getByText(`Frage ${i + 1} von 4`)).toBeInTheDocument();
      if (i < 3) {
        expect(within(seite).queryByRole('button', { name: 'Angaben senden' })).toBeNull();
        // „Weiter“ geht immer, auch ohne Antwort.
        await nutzer.click(within(seite).getByRole('button', { name: 'Weiter' }));
      } else {
        expect(within(seite).getByRole('button', { name: 'Angaben senden' })).toBeInTheDocument();
        expect(within(seite).queryByRole('button', { name: 'Weiter' })).toBeNull();
      }
    }
    expect(document.querySelectorAll('[data-schritt="erreicht"]')).toHaveLength(4);
    // Zurück führt Seite für Seite zurück.
    await nutzer.click(screen.getByRole('button', { name: '← Zurück' }));
    expect(fenster('Zum Zusammenhang')).toBeInTheDocument();
    expect(checkinAbsenden).not.toHaveBeenCalled();
  });

  it('verlangt mindestens eine Hauptfrage und prüft Zahlen auf ihrer Seite', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        schedule: {
          interval_days: 7,
          parameter_keys: ['morning_stiffness_minutes', 'pain_rest'],
        },
      }),
    );
    const nutzer = userEvent.setup();
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    const steif = await screen.findByRole('dialog', {
      name: 'Wie viele Minuten waren Sie heute Morgen steif?',
    });
    await nutzer.type(
      within(steif).getByLabelText('Wie viele Minuten waren Sie heute Morgen steif?'),
      '300',
    );
    await nutzer.click(within(steif).getByRole('button', { name: 'Weiter' }));
    // Eine Zahl außerhalb ihres Bereichs hält auf ihrer Seite an.
    expect(
      within(fenster('Wie viele Minuten waren Sie heute Morgen steif?')).getByRole('alert'),
    ).toHaveTextContent('„Morgensteifigkeit“: bitte eine ganze Zahl von 0 bis 240.');
    await nutzer.clear(
      within(fenster('Wie viele Minuten waren Sie heute Morgen steif?')).getByLabelText(
        'Wie viele Minuten waren Sie heute Morgen steif?',
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    const ruhe = fenster('Wie stark sind Ihre Schmerzen in Ruhe?');
    await nutzer.click(within(ruhe).getByRole('button', { name: 'Angaben senden' }));
    expect(within(ruhe).getByRole('alert')).toHaveTextContent(
      'Bitte beantworten Sie mindestens eine Frage.',
    );
    expect(checkinAbsenden).not.toHaveBeenCalled();
  });

  it('fragt den Zusammenhang auf einer Seite; er allein reicht nicht (ANN-355)', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        schedule: { interval_days: 7, parameter_keys: ['pain_quality', 'painkiller_24h'] },
        last_values: { pain_quality: 2 },
        history: [
          { answered_on: '2026-10-05', recorded_by_kind: 'self', values: { pain_quality: 2 } },
        ],
      }),
    );
    const nutzer = userEvent.setup();
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    const art = await screen.findByRole('dialog', {
      name: 'Wie fühlt sich der Schmerz vor allem an?',
    });
    expect(within(art).getByText('Ihre letzte Angabe: stechend am 5. Oktober')).toBeInTheDocument();
    await nutzer.click(within(art).getByRole('button', { name: 'Weiter' }));
    const zusammenhang = fenster('Zum Zusammenhang');
    expect(within(zusammenhang).getByRole('heading', { name: 'Zum Zusammenhang' })).toBeVisible();
    await pruefeBarrierefreiheit(document.body);
    const mittel = within(zusammenhang).getByRole('group', {
      name: 'Haben Sie in den letzten 24 Stunden Schmerzmittel genommen?',
    });
    await nutzer.click(within(mittel).getByRole('button', { name: 'ja' }));
    await nutzer.click(within(zusammenhang).getByRole('button', { name: 'Angaben senden' }));
    expect(screen.getByText('Bitte beantworten Sie mindestens eine Frage.')).toBeInTheDocument();
    expect(checkinAbsenden).not.toHaveBeenCalled();

    await nutzer.click(within(zusammenhang).getByRole('button', { name: '← Zurück' }));
    await nutzer.click(screen.getByRole('button', { name: 'dumpf' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    // Die Wahl auf der Seite des Zusammenhangs steht noch.
    expect(screen.getByRole('button', { name: 'ja' })).toHaveAttribute('aria-pressed', 'true');
    await nutzer.click(screen.getByRole('button', { name: 'Angaben senden' }));
    await waitFor(() =>
      expect(checkinAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, {
        painkiller_24h: 1,
        pain_quality: 1,
      }),
    );
  });

  it('fragt nach der Belastung erst Dauer und Anstrengung, wenn es eine gab (ANN-369)', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        schedule: {
          interval_days: 7,
          parameter_keys: ['pain_load', 'activity_kind', 'activity_minutes', 'activity_intensity'],
        },
      }),
    );
    const nutzer = userEvent.setup();
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    await nutzer.click(
      within(
        await screen.findByRole('dialog', { name: 'Wie stark sind Ihre Schmerzen bei Belastung?' }),
      ).getByRole('button', { name: 'Weiter' }),
    );
    const belastung = fenster('Außerhalb der Übungen');
    expect(within(belastung).getByText(/^Grob genügt\./)).toBeInTheDocument();
    const dauer = 'Wie lange hat diese Belastung ungefähr gedauert?';
    expect(within(belastung).queryByLabelText(dauer)).not.toBeInTheDocument();
    await nutzer.click(within(belastung).getByRole('button', { name: 'nichts Besonderes' }));
    expect(within(belastung).queryByLabelText(dauer)).not.toBeInTheDocument();
    await nutzer.click(within(belastung).getByRole('button', { name: 'Sport' }));
    await nutzer.type(within(belastung).getByLabelText(dauer), '45');
    await nutzer.click(within(belastung).getByRole('button', { name: 'mittel' }));
    await pruefeBarrierefreiheit(document.body);
    // Zurück zu „nichts Besonderes“: Dauer und Anstrengung verschwinden und gehen nicht mit.
    await nutzer.click(within(belastung).getByRole('button', { name: 'nichts Besonderes' }));
    expect(within(belastung).queryByLabelText(dauer)).not.toBeInTheDocument();
    await nutzer.click(within(belastung).getByRole('button', { name: 'Angaben senden' }));
    expect(screen.getByText('Bitte beantworten Sie mindestens eine Frage.')).toBeInTheDocument();
    await nutzer.click(within(belastung).getByRole('button', { name: '← Zurück' }));
    await nutzer.click(screen.getByRole('button', { name: '5' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Angaben senden' }));
    await waitFor(() =>
      expect(checkinAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, {
        pain_load: 5,
        activity_kind: 1,
      }),
    );
  });

  it('sendet mit Belastung auch Dauer und Anstrengung', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        schedule: {
          interval_days: 7,
          parameter_keys: ['pain_load', 'activity_kind', 'activity_minutes', 'activity_intensity'],
        },
      }),
    );
    const nutzer = userEvent.setup();
    renderWithProviders(<Checkin zugang={{ ...ZUGANG, relationship_kind: 'training' }} />, PFAD);
    const erste = await screen.findByRole('dialog', {
      name: 'Wie stark sind Ihre Schmerzen bei Belastung?',
    });
    await nutzer.click(within(erste).getByRole('button', { name: '3' }));
    await nutzer.click(within(erste).getByRole('button', { name: 'Weiter' }));
    const belastung = fenster('Außerhalb der Übungen');
    // Im Training liest die Trainingsbetreuung.
    expect(
      within(belastung).getByText(/^Ihre Trainingsbetreuung sieht Ihre Angaben/),
    ).toBeVisible();
    await nutzer.click(
      within(belastung).getByRole('button', {
        name: 'schwere körperliche Arbeit (etwa Umzug, Heben)',
      }),
    );
    await nutzer.type(
      within(belastung).getByLabelText('Wie lange hat diese Belastung ungefähr gedauert?'),
      '120',
    );
    await nutzer.click(within(belastung).getByRole('button', { name: 'anstrengend' }));
    await nutzer.click(within(belastung).getByRole('button', { name: 'Angaben senden' }));
    await waitFor(() =>
      expect(checkinAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, {
        pain_load: 3,
        activity_kind: 6,
        activity_minutes: 120,
        activity_intensity: 3,
      }),
    );
  });

  it('nach dem Senden auf die Übersicht mit der Rückmeldung, ohne Rückfrage', async () => {
    const nutzer = userEvent.setup();
    const router = zeigeMitZielen(<Checkin zugang={ZUGANG} />);
    await nutzer.click(await screen.findByRole('button', { name: '7' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Angaben senden' }));
    expect(await screen.findByText('Ziel /p?bereich=treatment&checkin=1')).toBeInTheDocument();
    expect(checkinAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, { pain_rest: 7 });
    // Der Verlauf geht nicht zurück in den beantworteten Check-in.
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('„Später“ führt zur Übersicht; mit Antworten fragt es vorher (EINGABETEXTE)', async () => {
    const nutzer = userEvent.setup();
    zeigeMitZielen(<Checkin zugang={ZUGANG} />);
    await nutzer.click(await screen.findByRole('button', { name: 'Später' }));
    expect(await screen.findByText('Ziel /p?bereich=treatment')).toBeInTheDocument();
  });

  it('„Später“ mit Antworten: bleiben behält sie, verwerfen geht zur Übersicht', async () => {
    const nutzer = userEvent.setup();
    zeigeMitZielen(<Checkin zugang={ZUGANG} />);
    await nutzer.click(await screen.findByRole('button', { name: '3' }));
    await nutzer.click(screen.getByRole('button', { name: 'Später' }));
    const rueckfrage = await screen.findByRole('dialog', { name: 'Noch nicht gespeichert' });
    expect(
      within(rueckfrage).getByText(
        'Die Eingaben sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
      ),
    ).toBeInTheDocument();
    await nutzer.click(within(rueckfrage).getByRole('button', { name: 'Hier bleiben' }));
    expect(screen.queryByRole('dialog', { name: 'Noch nicht gespeichert' })).toBeNull();
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true');

    await nutzer.click(screen.getByRole('button', { name: 'Später' }));
    await nutzer.click(
      within(await screen.findByRole('dialog', { name: 'Noch nicht gespeichert' })).getByRole(
        'button',
        { name: 'Verwerfen und weitergehen' },
      ),
    );
    expect(await screen.findByText('Ziel /p?bereich=treatment')).toBeInTheDocument();
    expect(checkinAbsenden).not.toHaveBeenCalled();
  });

  it('Tipp-Budget: drei Fragen vom Öffnen bis „Angaben senden“ in 6 Tipps, mit der Aufgabe der Übersicht 7', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        schedule: {
          interval_days: 7,
          parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'],
        },
      }),
    );
    const nutzer = userEvent.setup();
    let tipps = 0;
    const tippe = async (ziel: HTMLElement) => {
      tipps += 1;
      await nutzer.click(ziel);
    };
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    // Gezählt wird jeder Tipp im Check-in: je Frage ein Wert, zweimal „Weiter“, einmal senden.
    for (const name of [
      'Wie stark sind Ihre Schmerzen in Ruhe?',
      'Wie stark sind Ihre Schmerzen bei Belastung?',
    ]) {
      const seite = await screen.findByRole('dialog', { name });
      await tippe(within(seite).getByRole('button', { name: '4' }));
      await tippe(within(seite).getByRole('button', { name: 'Weiter' }));
    }
    const letzte = fenster('Wie stark schränken Ihre Beschwerden Sie im Alltag ein?');
    await tippe(within(letzte).getByRole('button', { name: '4' }));
    await tippe(within(letzte).getByRole('button', { name: 'Angaben senden' }));
    await waitFor(() =>
      expect(checkinAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, {
        pain_rest: 4,
        pain_load: 4,
        daily_impairment: 4,
      }),
    );
    // Der Tipp auf die Aufgabe der Übersicht kommt dazu: höchstens 7 (Handoff 8, Variante A).
    expect(tipps + 1).toBeLessThanOrEqual(7);
  });

  it('ohne Netz: antworten geht, „Angaben senden“ ist gesperrt und sagt warum', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const nutzer = userEvent.setup();
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    const erste = await screen.findByRole('dialog', {
      name: 'Wie stark sind Ihre Schmerzen in Ruhe?',
    });
    expect(within(erste).getByText('Keine Verbindung.', { exact: false })).toBeInTheDocument();
    await nutzer.click(within(erste).getByRole('button', { name: '5' }));
    await nutzer.click(within(erste).getByRole('button', { name: 'Weiter' }));
    const letzte = fenster('Wie viele Minuten waren Sie heute Morgen steif?');
    const senden = within(letzte).getByRole('button', { name: 'Angaben senden' });
    expect(senden).toHaveAttribute('aria-disabled', 'true');
    expect(senden).toHaveAccessibleDescription(
      'Senden geht wieder mit Verbindung. Ihre Antworten bleiben stehen.',
    );
    // Gesperrt, aber erreichbar: der Satz wird mit dem Knopf vorgelesen.
    expect(senden).not.toBeDisabled();
    await nutzer.click(senden);
    expect(checkinAbsenden).not.toHaveBeenCalled();
    await pruefeBarrierefreiheit(document.body);
  });

  it('eine rechtliche Vertretung sieht im Ablauf, für wen sie antwortet', async () => {
    renderWithProviders(
      <Checkin
        zugang={{ ...ZUGANG, access_kind: 'legal_representative', represented_name: 'Max' }}
      />,
      PFAD,
    );
    const erste = await screen.findByRole('dialog', {
      name: 'Wie stark sind Ihre Schmerzen in Ruhe?',
    });
    expect(within(erste).getByText('Max')).toBeInTheDocument();
    expect(within(erste).getByText(/Sie handeln für/)).toBeInTheDocument();
  });
});

describe('Check-in: Zustände ohne Ablauf (Handoff 5.1)', () => {
  it('lädt als Skelett in der Form der ersten Frage, mit Rückweg und Titel', () => {
    ladeCheckins.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    expect(screen.getByRole('link', { name: '← Übersicht' })).toHaveAttribute(
      'href',
      '/p?bereich=treatment',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Check-in' })).toBeInTheDocument();
    const bereich = screen.getByText('Ihr Check-in wird geladen');
    expect(bereich).toHaveClass('sr-only');
    expect(bereich.closest('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-skelett="leiste"]')).toHaveLength(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sagt, wenn er nicht geladen werden konnte', async () => {
    ladeCheckins.mockRejectedValue(new Error('Ihr Check-in konnte nicht geladen werden.'));
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    expect(
      await screen.findByText('Ihr Check-in konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  it('keiner eingestellt: sagt, wo die Fragen erscheinen, ohne Weg', async () => {
    ladeCheckins.mockResolvedValue(daten({ schedule: null, due: false, can_answer: false }));
    const { container } = renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    expect(await screen.findByText('Zurzeit kein Check-in')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Stellt Ihre Praxis Ihnen Fragen zwischen den Terminen, finden Sie sie hier und auf der Übersicht.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Meine Angaben' })).not.toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('schon beantwortet: der nächste Tag in Worten und der Weg zu „Meine Angaben“', async () => {
    ladeCheckins.mockResolvedValue(daten({ due: false, can_answer: false, due_on: '2026-10-19' }));
    const { container } = renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    expect(await screen.findByText('Schon beantwortet')).toBeInTheDocument();
    expect(
      screen.getByText('Ihr nächster Check-in ist ab Montag, 19. Oktober dran.'),
    ).toBeInTheDocument();
    // „Meine Angaben“ führt mit dem Rückweg „Check-in“ zurück hierher.
    expect(screen.getByRole('link', { name: 'Meine Angaben' })).toHaveAttribute(
      'href',
      '/p/angaben?bereich=treatment&zurueck=%2Fp%2Fcheckin%3Fbereich%3Dtreatment',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('noch nicht dran: ohne frühere Antwort und ohne Weg', async () => {
    ladeCheckins.mockResolvedValue(
      daten({ due: false, can_answer: false, due_on: '2026-10-19', history: [], last_values: {} }),
    );
    renderWithProviders(<Checkin zugang={ZUGANG} />, PFAD);
    expect(await screen.findByText('Noch nicht dran')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Meine Angaben' })).not.toBeInTheDocument();
  });

  it('im Training ohne Einwilligung: der Weg zu den Einwilligungen', async () => {
    ladeCheckins.mockResolvedValue(daten({ can_answer: false, consent_needed: true }));
    renderWithProviders(
      <Checkin zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      '/p/checkin?bereich=training',
    );
    expect(await screen.findByText('Ihre Praxis bittet um einen Check-in')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Der Check-in fragt nach Ihrer Gesundheit. Dafür braucht es Ihre Einwilligung.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einwilligungen ansehen' })).toHaveAttribute(
      'href',
      '/p/einwilligungen?bereich=training',
    );
  });

  it('in der Lesefrist: kein Check-in mehr, der Satz der Lesefrist und „Meine Angaben“', async () => {
    ladeCheckins.mockResolvedValue(daten({ can_answer: false }));
    renderWithProviders(
      <Checkin zugang={{ ...ZUGANG, read_until: '2026-11-28T00:00:00+01:00' }} />,
      PFAD,
    );
    expect(await screen.findByText('Kein Check-in mehr')).toBeInTheDocument();
    expect(
      screen.getByText('Ihre Behandlung ist beendet. Sie können hier noch bis 27.11.2026 lesen.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meine Angaben' })).toBeInTheDocument();
    expect(screen.queryByText(/Ihr Zugang erlaubt das gerade nicht/)).not.toBeInTheDocument();
  });

  it('eine Begleitung antwortet nicht: der Check-in gehört der Person', async () => {
    ladeCheckins.mockResolvedValue(null);
    renderWithProviders(
      <Checkin zugang={{ ...ZUGANG, access_kind: 'companion', represented_name: 'Max' }} />,
      PFAD,
    );
    expect(await screen.findByText('Check-in für Max')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Den Check-in beantwortet die Person selbst oder ihre rechtliche Vertretung.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
