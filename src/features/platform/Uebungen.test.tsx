import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { EigenePlaene, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';
import { eigenerPlan } from './testdaten';

/**
 * Reiter „Übungen" bzw. „Training" (UEB-009, DSN-001 4.1 und 5) und der Plan
 * als Blatt auf der Plattform (ANN-303, D2).
 */

const ladePlaene = vi.fn();
const uebungstageSetzen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladePlaene: (...args: unknown[]) => ladePlaene(...args) as Promise<EigenePlaene>,
  uebungstageSetzen: (...args: unknown[]) => uebungstageSetzen(...args) as Promise<void>,
}));

const { Uebungen, PlanblattPlattform } = await import('./Uebungen');

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

beforeEach(() => {
  ladePlaene.mockReset();
  uebungstageSetzen.mockReset();
  uebungstageSetzen.mockResolvedValue(undefined);
  ladePlaene.mockResolvedValue({ today: '2026-10-08', plans: [eigenerPlan()] });
});

describe('Reiter Übungen (UEB-009)', () => {
  it('zeigt den Plan mit Dosierung in Worten, Anleitung und Hinweis', async () => {
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    expect(await screen.findByRole('heading', { name: 'Heimprogramm Knie' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Übungen' })).toBeInTheDocument();
    expect(screen.getByText('Bis 18.11.2026 · 3-mal pro Woche')).toBeInTheDocument();
    expect(
      screen.getByText(
        '3 Durchgänge mit je 10 bis 12 Wiederholungen. Pause dazwischen: 30 Sekunden.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Festhalten.')).toBeInTheDocument();
    expect(screen.getByText('Langsam ablassen.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan als PDF' })).toHaveAttribute(
      'href',
      `/p/uebungen/blatt/${eigenerPlan().id}`,
    );
    // Keine Punktzahl, keine Serie (DSN-001 4.1).
    expect(screen.queryByText(/Punkte|Serie|Super/)).not.toBeInTheDocument();
  });

  it('heißt im Training „Training" und sagt, wer den Plan macht', async () => {
    ladePlaene.mockResolvedValue({ today: '2026-10-08', plans: [] });
    renderWithProviders(
      <Uebungen zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      '/p/uebungen',
    );
    expect(
      await screen.findByText('Ihre Trainingsbetreuung stellt Ihnen hier Ihren Plan zusammen.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument();
  });

  it('sagt ohne Plan, dass die Therapeut:in ihn zusammenstellt', async () => {
    ladePlaene.mockResolvedValue({ today: '2026-10-08', plans: [] });
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    expect(
      await screen.findByText('Ihre Therapeut:in stellt Ihnen hier Übungen zusammen.'),
    ).toBeInTheDocument();
  });

  it('zeigt einen beendeten Plan zum Lesen und Mitnehmen (ANN-304)', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [eigenerPlan({ status: 'ended', ended_on: '2026-10-01' })],
    });
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    expect(await screen.findByText(/Beendet am 01\.10\.2026/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Dieser Plan ist beendet. Sie können ihn hier noch lesen und als PDF mitnehmen.',
      ),
    ).toBeInTheDocument();
  });

  it('meldet einen Ladefehler mit erneutem Versuch', async () => {
    ladePlaene.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    expect(
      await screen.findByText('Ihre Übungen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});

describe('Plan als Blatt auf der Plattform (ANN-303)', () => {
  it('druckt den eigenen Plan ohne Namen', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <PlanblattPlattform zugang={ZUGANG} praxis="Test Praxis Tuebingen" />,
      `/p/uebungen/blatt/${eigenerPlan().id}`,
    );
    const blatt = await screen.findByRole('article', { name: 'Planblatt' });
    expect(blatt).toHaveTextContent('Test Praxis Tuebingen');
    expect(blatt).toHaveTextContent('Ihr Übungsplan');
    expect(blatt).not.toHaveTextContent(' für ');
    expect(blatt).toHaveTextContent('Hinweis: Langsam ablassen.');
    await user.click(screen.getByRole('button', { name: 'Drucken oder als PDF sichern' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('kennt einen fremden Plan nicht', async () => {
    renderWithProviders(
      <PlanblattPlattform zugang={ZUGANG} praxis="Test Praxis Tuebingen" />,
      '/p/uebungen/blatt/ffffffff-0000-4000-8000-000000000009',
    );
    expect(await screen.findByText('Diesen Plan gibt es hier nicht.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Drucken oder als PDF sichern' }),
    ).not.toBeInTheDocument();
  });
});

describe('Einstieg in die Einheit (UEB-010)', () => {
  it('bietet „Jetzt üben" an und nennt den letzten Tag', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [eigenerPlan({ recent_sessions: [{ performed_on: '2026-10-06', finished: true }] })],
    });
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    expect(await screen.findByRole('link', { name: 'Jetzt üben' })).toHaveAttribute(
      'href',
      `/p/uebungen/einheit/${eigenerPlan().id}`,
    );
    expect(screen.getByText('Zuletzt geübt: 06.10.2026')).toBeInTheDocument();
  });

  it('sagt „Weiter üben", wenn heute eine Einheit offen ist', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [
        eigenerPlan({
          open_session: { id: 'cccccccc-0000-4000-8000-000000000001', sets: [] },
          recent_sessions: [{ performed_on: '2026-10-08', finished: false }],
        }),
      ],
    });
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    expect(await screen.findByRole('link', { name: 'Weiter üben' })).toBeInTheDocument();
    expect(screen.getByText('Zuletzt geübt: heute')).toBeInTheDocument();
  });

  it('bietet ohne Recht zum Üben keinen Knopf (Begleitung, Lesefrist)', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [eigenerPlan({ can_exercise: false })],
    });
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    await screen.findByRole('heading', { name: 'Heimprogramm Knie' });
    expect(screen.queryByRole('link', { name: 'Jetzt üben' })).not.toBeInTheDocument();
  });

  it('bestätigt eine gespeicherte Einheit ohne Lob', async () => {
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen?gespeichert=1');
    expect(await screen.findByText('Ihre Einheit ist gespeichert.')).toBeInTheDocument();
  });
});

describe('Meine Übungstage (UEB-011)', () => {
  it('wählt Tage und speichert sofort', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [eigenerPlan({ weekdays: [1] })],
    });
    const user = userEvent.setup();
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    const gruppe = await screen.findByRole('group', { name: /Meine Übungstage/ });
    expect(within(gruppe).getByRole('button', { name: 'Montag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(gruppe).getByRole('button', { name: 'Donnerstag' }));
    await waitFor(() =>
      expect(uebungstageSetzen).toHaveBeenCalledWith(ZUGANG.access_id, eigenerPlan().id, [1, 4]),
    );
    expect(within(gruppe).getByRole('button', { name: 'Donnerstag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('nimmt die Wahl ohne Verbindung zurück', async () => {
    uebungstageSetzen.mockRejectedValue(
      new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut tippen.'),
    );
    const user = userEvent.setup();
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    const gruppe = await screen.findByRole('group', { name: /Meine Übungstage/ });
    await user.click(within(gruppe).getByRole('button', { name: 'Freitag' }));
    expect(
      await screen.findByText('Nicht gespeichert. Bitte die Verbindung prüfen und erneut tippen.'),
    ).toBeInTheDocument();
    expect(within(gruppe).getByRole('button', { name: 'Freitag' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('zeigt ohne Recht zum Üben nur die gewählten Tage', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [eigenerPlan({ can_exercise: false, weekdays: [1, 3] })],
    });
    renderWithProviders(<Uebungen zugang={ZUGANG} />, '/p/uebungen');
    expect(await screen.findByText('Meine Übungstage: Mo, Mi')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Meine Übungstage/ })).not.toBeInTheDocument();
  });
});
