import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as CheckinApi from './api';
import type { CheckinDaten } from './api';

/**
 * „Zwischen den Terminen" (TRK-002, DSN-001 Abschnitt 6): Takt mit „ändern",
 * Angaben mit Datum, unverändert und ohne Bewertung (ADR-006 Punkt 11).
 */

const fetchCheckins = vi.fn();
const saveCheckinTakt = vi.fn();
const endCheckinTakt = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof CheckinApi>()),
  fetchCheckins: (...a: unknown[]) => fetchCheckins(...a) as Promise<CheckinDaten | null>,
  saveCheckinTakt: (...a: unknown[]) => saveCheckinTakt(...a) as Promise<void>,
  endCheckinTakt: (...a: unknown[]) => endCheckinTakt(...a) as Promise<void>,
}));

const { ZwischenDenTerminen } = await import('./ZwischenDenTerminen');

const AKTE = '66666666-6666-4666-8666-000000000002';

function daten(teil: Partial<CheckinDaten> = {}): CheckinDaten {
  return {
    today: '2026-10-12',
    can_write: true,
    relationship_open: true,
    schedule: {
      interval_days: 7,
      parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'],
      starts_on: '2026-10-01',
      due_on: '2026-10-15',
      updated_at: '2026-10-01T08:00:00Z',
      updated_by_name: 'Anna Beispiel',
    },
    checkins: [
      {
        answered_on: '2026-10-08',
        recorded_at: '2026-10-08T07:00:00Z',
        recorded_by_kind: 'self',
        values: { pain_rest: 8, pain_load: 9 },
      },
      {
        answered_on: '2026-10-01',
        recorded_at: '2026-10-01T07:00:00Z',
        recorded_by_kind: 'legal_representative',
        values: { morning_stiffness_minutes: 30 },
      },
    ],
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchCheckins.mockResolvedValue(daten());
  saveCheckinTakt.mockResolvedValue(undefined);
  endCheckinTakt.mockResolvedValue(undefined);
});

describe('Zwischen den Terminen (TRK-002)', () => {
  it('zeigt Takt, Fragen und die Angaben mit Datum, ohne Einordnung', async () => {
    const { container } = renderWithProviders(
      <ZwischenDenTerminen art="treatment" verhaeltnisId={AKTE} />,
    );
    expect(await screen.findByText('Check-in: alle 7 Tage')).toBeInTheDocument();
    expect(screen.getByText(/nächster ab 15\.10\.2026/)).toBeInTheDocument();
    expect(
      screen.getByText('Fragen: Schmerz in Ruhe, Schmerz bei Belastung, Einschränkung im Alltag'),
    ).toBeInTheDocument();
    const liste = screen.getByRole('list', { name: 'Beantwortete Check-ins' });
    const zeilen = within(liste).getAllByRole('listitem');
    expect(zeilen[0]).toHaveTextContent('08.10.2026');
    expect(zeilen[0]).toHaveTextContent('Schmerz in Ruhe 8 · Schmerz bei Belastung 9');
    expect(zeilen[1]).toHaveTextContent('01.10.2026 · von der Vertretung');
    expect(zeilen[1]).toHaveTextContent('Morgensteifigkeit 30 Minuten');
    // Hohe Werte bekommen weder Wort noch Farbe (ADR-006 Punkt 11).
    expect(screen.queryByText(/hoch|Verschlechter|auffällig|Warnung/i)).not.toBeInTheDocument();
    expect(container.querySelector('[class*="danger"], [class*="warn"]')).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('stellt einen Check-in ein: Voreinstellung drei Fragen, höchstens fünf (ANN-349)', async () => {
    fetchCheckins.mockResolvedValue(daten({ schedule: null, checkins: [] }));
    const nutzer = userEvent.setup();
    renderWithProviders(<ZwischenDenTerminen art="training" verhaeltnisId={AKTE} />);
    expect(await screen.findByText('Kein Check-in eingestellt.')).toBeInTheDocument();
    expect(screen.getByText('Noch kein Check-in beantwortet.')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Check-in einstellen' }));
    expect(screen.getByRole('checkbox', { name: /Schmerz in Ruhe/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Schlaf/ })).not.toBeChecked();
    await nutzer.selectOptions(screen.getByLabelText('Wie oft?'), 'alle 3 Tage');
    await nutzer.click(screen.getByRole('checkbox', { name: /Schlaf/ }));
    await nutzer.click(screen.getByRole('checkbox', { name: /Stress/ }));
    // Fünf gewählt: die sechste ist gesperrt.
    expect(screen.getByRole('checkbox', { name: /Morgensteifigkeit/ })).toBeDisabled();
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveCheckinTakt).toHaveBeenCalledWith('training', AKTE, 3, [
        'pain_rest',
        'pain_load',
        'daily_impairment',
        'sleep_quality',
        'stress',
      ]),
    );
  });

  it('verlangt mindestens eine Frage', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<ZwischenDenTerminen art="treatment" verhaeltnisId={AKTE} />);
    await nutzer.click(await screen.findByRole('button', { name: 'Check-in ändern' }));
    for (const name of [/Schmerz in Ruhe/, /Schmerz bei Belastung/, /Einschränkung im Alltag/]) {
      await nutzer.click(screen.getByRole('checkbox', { name }));
    }
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Bitte mindestens eine Frage wählen.')).toBeInTheDocument();
    expect(saveCheckinTakt).not.toHaveBeenCalled();
  });

  it('beendet nach Rückfrage; die Angaben bleiben', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<ZwischenDenTerminen art="treatment" verhaeltnisId={AKTE} />);
    await nutzer.click(await screen.findByRole('button', { name: 'Check-in beenden' }));
    expect(screen.getByText(/Was sie schon angegeben hat, bleibt/)).toBeInTheDocument();
    const knoepfe = screen.getAllByRole('button', { name: 'Check-in beenden' });
    await nutzer.click(knoepfe[knoepfe.length - 1]!);
    await waitFor(() => expect(endCheckinTakt).toHaveBeenCalledWith('treatment', AKTE));
  });

  it('ohne Schreibrecht nur lesen; ohne Leserecht nichts', async () => {
    fetchCheckins.mockResolvedValue(daten({ can_write: false }));
    const { unmount } = renderWithProviders(
      <ZwischenDenTerminen art="treatment" verhaeltnisId={AKTE} />,
    );
    expect(await screen.findByText('Check-in: alle 7 Tage')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check-in/ })).not.toBeInTheDocument();
    unmount();

    fetchCheckins.mockResolvedValue(null);
    renderWithProviders(<ZwischenDenTerminen art="treatment" verhaeltnisId={AKTE} />);
    await waitFor(() => expect(fetchCheckins).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText('Zwischen den Terminen')).not.toBeInTheDocument(),
    );
  });

  it('nach dem Ende des Verhältnisses nichts fällig, nur beenden (Zweitreview S5)', async () => {
    fetchCheckins.mockResolvedValue(
      daten({ relationship_open: false, schedule: { ...daten().schedule!, due_on: null } }),
    );
    renderWithProviders(<ZwischenDenTerminen art="treatment" verhaeltnisId={AKTE} />);
    expect(
      await screen.findByText(/beendet – die Person antwortet nicht mehr/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check-in ändern' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check-in beenden' })).toBeInTheDocument();
  });

  it('zeigt den Grund, wenn das Beenden scheitert', async () => {
    endCheckinTakt.mockRejectedValue(
      new Error('Den Check-in stellen die Rollen ein, die Übungspläne schreiben.'),
    );
    const nutzer = userEvent.setup();
    renderWithProviders(<ZwischenDenTerminen art="treatment" verhaeltnisId={AKTE} />);
    await nutzer.click(await screen.findByRole('button', { name: 'Check-in beenden' }));
    const knoepfe = screen.getAllByRole('button', { name: 'Check-in beenden' });
    await nutzer.click(knoepfe[knoepfe.length - 1]!);
    expect(
      await screen.findByText('Den Check-in stellen die Rollen ein, die Übungspläne schreiben.'),
    ).toBeInTheDocument();
  });

  it('nennt einen fälligen Check-in ohne Wertung', async () => {
    fetchCheckins.mockResolvedValue(
      daten({ schedule: { ...daten().schedule!, due_on: '2026-10-02' } }),
    );
    renderWithProviders(<ZwischenDenTerminen art="treatment" verhaeltnisId={AKTE} />);
    expect(await screen.findByText(/fällig seit 02\.10\.2026/)).toBeInTheDocument();
  });
});
