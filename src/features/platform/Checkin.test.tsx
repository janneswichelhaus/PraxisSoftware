import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { EigeneCheckins, Plattformzugang } from './api';

/**
 * Der Check-in auf der Plattform (TRK-003, DSN-001 4.1): freiwillige Fragen,
 * nichts vorausgewählt, die letzte Angabe als Hinweis (ANN-349); „Meine
 * Angaben" als Liste mit Datum.
 */

const ladeCheckins = vi.fn();
const checkinAbsenden = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeCheckins: (...a: unknown[]) => ladeCheckins(...a) as Promise<EigeneCheckins | null>,
  checkinAbsenden: (...a: unknown[]) => checkinAbsenden(...a) as Promise<void>,
}));

const { Checkin, MeineAngaben } = await import('./Checkin');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

function daten(teil: Partial<EigeneCheckins> = {}): EigeneCheckins {
  return {
    today: '2026-10-12',
    schedule: { interval_days: 7, parameter_keys: ['pain_rest', 'morning_stiffness_minutes'] },
    due_on: '2026-10-12',
    due: true,
    can_answer: true,
    consent_needed: false,
    last_values: { pain_rest: 4 },
    history: [
      {
        answered_on: '2026-10-05',
        recorded_by_kind: 'self',
        values: { pain_rest: 4, morning_stiffness_minutes: 15 },
      },
    ],
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeCheckins.mockResolvedValue(daten());
  checkinAbsenden.mockResolvedValue(undefined);
});

describe('Check-in (TRK-003)', () => {
  it('fragt nur die eingestellten Fragen, nichts vorausgewählt, die letzte Angabe als Hinweis', async () => {
    const nutzer = userEvent.setup();
    const { container } = renderWithProviders(<Checkin zugang={ZUGANG} />, '/p/checkin');
    const ruhe = await screen.findByRole('group', {
      name: 'Wie stark sind Ihre Schmerzen in Ruhe?',
    });
    expect(within(ruhe).getByText('Ihre letzte Angabe: 4')).toBeInTheDocument();
    expect(
      within(ruhe)
        .getAllByRole('radio')
        .some((r) => (r as HTMLInputElement).checked),
    ).toBe(false);
    expect(screen.queryByRole('group', { name: /Belastung/ })).not.toBeInTheDocument();
    const minuten = screen.getByLabelText('Wie viele Minuten waren Sie heute Morgen steif?');
    expect(minuten).toHaveValue(null);
    expect(screen.getByText(/sieht Ihre Angaben beim nächsten Termin/)).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);

    await nutzer.click(within(ruhe).getByLabelText('2'));
    await nutzer.type(minuten, '30');
    await nutzer.click(screen.getByRole('button', { name: 'Absenden' }));
    await waitFor(() =>
      expect(checkinAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, {
        pain_rest: 2,
        morning_stiffness_minutes: 30,
      }),
    );
  });

  it('verlangt mindestens eine Antwort und prüft die Minuten', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Checkin zugang={ZUGANG} />, '/p/checkin');
    await nutzer.click(await screen.findByRole('button', { name: 'Absenden' }));
    expect(screen.getByText('Bitte beantworten Sie mindestens eine Frage.')).toBeInTheDocument();
    await nutzer.type(
      screen.getByLabelText('Wie viele Minuten waren Sie heute Morgen steif?'),
      '300',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Absenden' }));
    expect(screen.getByText(/bitte eine ganze Zahl von 0 bis 240/)).toBeInTheDocument();
    expect(checkinAbsenden).not.toHaveBeenCalled();
  });

  it('fragt den Zusammenhang getrennt; er allein reicht nicht (TRK-005, ANN-355)', async () => {
    ladeCheckins.mockResolvedValue(
      daten({
        schedule: { interval_days: 7, parameter_keys: ['pain_quality', 'painkiller_24h'] },
        last_values: { pain_quality: 2 },
      }),
    );
    const nutzer = userEvent.setup();
    const { container } = renderWithProviders(<Checkin zugang={ZUGANG} />, '/p/checkin');
    expect(await screen.findByText('Eine kurze Frage', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Zum Zusammenhang' })).toBeInTheDocument();
    expect(screen.getByText('Ihre letzte Angabe: stechend')).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
    const mittel = screen.getByRole('group', {
      name: 'Haben Sie in den letzten 24 Stunden Schmerzmittel genommen?',
    });
    await nutzer.click(within(mittel).getByLabelText('ja'));
    await nutzer.click(screen.getByRole('button', { name: 'Absenden' }));
    expect(screen.getByText('Bitte beantworten Sie mindestens eine Frage.')).toBeInTheDocument();
    expect(checkinAbsenden).not.toHaveBeenCalled();
    await nutzer.click(screen.getByLabelText('dumpf'));
    await nutzer.click(screen.getByRole('button', { name: 'Absenden' }));
    await waitFor(() =>
      expect(checkinAbsenden).toHaveBeenCalledWith(ZUGANG.access_id, {
        painkiller_24h: 1,
        pain_quality: 1,
      }),
    );
  });

  it('sagt ohne Fälligkeit, wann der nächste dran ist, ohne Formular', async () => {
    ladeCheckins.mockResolvedValue(daten({ due: false, can_answer: false, due_on: '2026-10-19' }));
    renderWithProviders(<Checkin zugang={ZUGANG} />, '/p/checkin');
    expect(
      await screen.findByText('Ihr nächster Check-in ist ab 19.10.2026 dran.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Absenden' })).not.toBeInTheDocument();
  });

  it('eine Begleitung antwortet nicht; im Training fehlt ggf. die Einwilligung', async () => {
    ladeCheckins.mockResolvedValue(daten({ can_answer: false }));
    const { unmount } = renderWithProviders(
      <Checkin zugang={{ ...ZUGANG, access_kind: 'companion', represented_name: 'Max' }} />,
      '/p/checkin',
    );
    expect(await screen.findByText(/beantwortet die Person selbst/)).toBeInTheDocument();
    unmount();
    ladeCheckins.mockResolvedValue(daten({ can_answer: false, consent_needed: true }));
    renderWithProviders(
      <Checkin zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      '/p/checkin',
    );
    expect(await screen.findByText(/braucht es Ihre Einwilligung/)).toBeInTheDocument();
  });

  it('„Meine Angaben" zeigt die Antworten mit Datum, ohne Deutung', async () => {
    const { container } = renderWithProviders(<MeineAngaben zugang={ZUGANG} />, '/p/angaben');
    expect(await screen.findByText('05.10.2026')).toBeInTheDocument();
    expect(
      screen.getByText('Schmerz in Ruhe 4 · Morgensteifigkeit 15 Minuten'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/besser|schlechter|Trend/i)).not.toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });
});
