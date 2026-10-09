import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { EigenePlaene, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';
import { eigenerPlan } from './testdaten';

/**
 * Die Durchführungsansicht (UEB-010, IDEA-ORG-003, ANN-305): Übung für
 * Übung, jeder Haken sofort gespeichert, ohne Verbindung zurückgenommen.
 */

const ladePlaene = vi.fn();
const einheitBeginnen = vi.fn();
const durchgangSetzen = vi.fn();
const einheitBeenden = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladePlaene: (...a: unknown[]) => ladePlaene(...a) as Promise<EigenePlaene>,
  einheitBeginnen: (...a: unknown[]) => einheitBeginnen(...a) as Promise<string>,
  durchgangSetzen: (...a: unknown[]) => durchgangSetzen(...a) as Promise<void>,
  einheitBeenden: (...a: unknown[]) => einheitBeenden(...a) as Promise<void>,
}));

const { Durchfuehrung } = await import('./Durchfuehrung');
const { EinheitNichtOffen } = await import('./api');

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
const PLAN = eigenerPlan();
const ZWEI = eigenerPlan({
  items: [
    PLAN.items[0]!,
    {
      ...PLAN.items[0]!,
      id: 'bbbbbbbb-0000-4000-8000-000000000002',
      position: 2,
      variant_lay_name: 'Gelbes Band heranziehen',
      sets: 2,
      rest_seconds: null,
      note: null,
    },
  ],
});
const PFAD = `/p/uebungen/einheit/${PLAN.id}`;

beforeEach(() => {
  for (const f of [ladePlaene, einheitBeginnen, durchgangSetzen, einheitBeenden]) f.mockReset();
  ladePlaene.mockResolvedValue({ today: '2026-10-08', plans: [ZWEI] });
  einheitBeginnen.mockResolvedValue('cccccccc-0000-4000-8000-000000000001');
  durchgangSetzen.mockResolvedValue(undefined);
  einheitBeenden.mockResolvedValue(undefined);
});

describe('Durchführungsansicht (UEB-010)', () => {
  it('führt Übung für Übung, hakt ab und speichert sofort (ANN-305)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Durchfuehrung zugang={ZUGANG} />, PFAD);
    expect(
      await screen.findByRole('heading', { name: 'Am Geländer in die Hocke' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Übung 1 von 2')).toBeInTheDocument();
    const erster = screen.getByRole('button', { name: '1. Durchgang' });
    expect(erster).toHaveAttribute('aria-pressed', 'false');
    await user.click(erster);
    await waitFor(() =>
      expect(durchgangSetzen).toHaveBeenCalledWith(
        ZUGANG.access_id,
        'cccccccc-0000-4000-8000-000000000001',
        PLAN.items[0]!.id,
        1,
        true,
      ),
    );
    expect(erster).toHaveAttribute('aria-pressed', 'true');
    expect(einheitBeginnen).toHaveBeenCalledTimes(1);
    // Die Pause der Fachperson: 30 Sekunden.
    expect(screen.getByRole('status')).toHaveTextContent('Pause: 30 Sekunden.');

    await user.click(screen.getByRole('button', { name: '2. Durchgang' }));
    await waitFor(() => expect(durchgangSetzen).toHaveBeenCalledTimes(2));
    // Dieselbe Einheit, kein zweiter Beginn.
    expect(einheitBeginnen).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    expect(screen.getByRole('heading', { name: 'Gelbes Band heranziehen' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Durchgang/ })).toHaveLength(2);
  });

  it('nimmt einen Haken ohne Verbindung zurück und sagt es (ADR-001)', async () => {
    durchgangSetzen.mockRejectedValue(
      new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut tippen.'),
    );
    const user = userEvent.setup();
    renderWithProviders(<Durchfuehrung zugang={ZUGANG} />, PFAD);
    const erster = await screen.findByRole('button', { name: '1. Durchgang' });
    await user.click(erster);
    expect(
      await screen.findByText('Nicht gespeichert. Bitte die Verbindung prüfen und erneut tippen.'),
    ).toBeInTheDocument();
    expect(erster).toHaveAttribute('aria-pressed', 'false');
  });

  it('übernimmt die Haken einer heute begonnenen Einheit', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [
        {
          ...ZWEI,
          open_session: {
            id: 'cccccccc-0000-4000-8000-000000000009',
            sets: [{ item_id: PLAN.items[0]!.id, set_number: 2 }],
          },
        },
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<Durchfuehrung zugang={ZUGANG} />, PFAD);
    expect(await screen.findByRole('button', { name: '2. Durchgang' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: '1. Durchgang' }));
    await waitFor(() =>
      expect(durchgangSetzen).toHaveBeenCalledWith(
        ZUGANG.access_id,
        'cccccccc-0000-4000-8000-000000000009',
        PLAN.items[0]!.id,
        1,
        true,
      ),
    );
    expect(einheitBeginnen).not.toHaveBeenCalled();
  });

  it('beendet mit „schwierig, weil …" und ohne Lob', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Durchfuehrung zugang={ZUGANG} />, PFAD);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    await user.type(screen.getByLabelText('Das war schwierig, weil … (freiwillig)'), 'Knie zieht');
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    await waitFor(() =>
      expect(einheitBeenden).toHaveBeenCalledWith(
        ZUGANG.access_id,
        'cccccccc-0000-4000-8000-000000000001',
        'Knie zieht',
      ),
    );
    expect(screen.queryByText(/Super|Toll|Prima|Punkte/)).not.toBeInTheDocument();
  });

  it('fragt im Training ohne Einwilligung nicht nach dem Befinden (ADR-021 Punkt 4)', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [{ ...ZWEI, service_area: 'training', note_allowed: false }],
    });
    const user = userEvent.setup();
    renderWithProviders(
      <Durchfuehrung zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      PFAD,
    );
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(screen.queryByLabelText(/schwierig/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Einheit beenden' }));
    await waitFor(() =>
      expect(einheitBeenden).toHaveBeenCalledWith(
        ZUGANG.access_id,
        'cccccccc-0000-4000-8000-000000000001',
        '',
      ),
    );
  });

  it('lässt ohne Recht nicht üben', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [{ ...ZWEI, can_exercise: false }],
    });
    renderWithProviders(<Durchfuehrung zugang={ZUGANG} />, PFAD);
    expect(
      await screen.findByText('Mit diesem Plan können Sie hier gerade nicht üben.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Durchgang/ })).not.toBeInTheDocument();
  });
});

describe('Durchführung nach dem Zweitreview', () => {
  it('bietet ohne einen Haken kein Beenden an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Durchfuehrung zugang={ZUGANG} />, PFAD);
    await user.click(await screen.findByRole('button', { name: 'Nächste Übung' }));
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(screen.getByText(/noch keinen Durchgang abgehakt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einheit beenden' })).not.toBeInTheDocument();
  });

  it('beginnt neu, wenn die Einheit anderswo beendet wurde', async () => {
    ladePlaene.mockResolvedValue({
      today: '2026-10-08',
      plans: [
        {
          ...ZWEI,
          open_session: { id: 'cccccccc-0000-4000-8000-000000000009', sets: [] },
        },
      ],
    });
    durchgangSetzen.mockRejectedValueOnce(new EinheitNichtOffen());
    const user = userEvent.setup();
    renderWithProviders(<Durchfuehrung zugang={ZUGANG} />, PFAD);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await waitFor(() => expect(durchgangSetzen).toHaveBeenCalledTimes(2));
    expect(einheitBeginnen).toHaveBeenCalledTimes(1);
    expect(durchgangSetzen).toHaveBeenLastCalledWith(
      ZUGANG.access_id,
      'cccccccc-0000-4000-8000-000000000001',
      PLAN.items[0]!.id,
      1,
      true,
    );
    expect(screen.queryByText(/Nicht gespeichert/)).not.toBeInTheDocument();
  });

  it('startet die Pause beim nächsten Durchgang neu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Durchfuehrung zugang={ZUGANG} />, PFAD);
    await user.click(await screen.findByRole('button', { name: '1. Durchgang' }));
    await user.click(screen.getByRole('button', { name: 'Pause überspringen' }));
    expect(screen.queryByRole('button', { name: 'Pause überspringen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2. Durchgang' }));
    expect(screen.getByRole('button', { name: 'Pause überspringen' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Pause: 30 Sekunden.');
  });
});
