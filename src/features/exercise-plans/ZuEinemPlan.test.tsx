import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlanApi from './api';
import type * as PatientenApi from '@/features/patients/api';
import type * as RouterModul from 'react-router-dom';
import type { Variante } from '@/features/exercises/api';
import { OHNE_KATALOG } from '@/features/exercises/testdaten';
import { renderWithProviders } from '@/test-utils';

const fetchPlanliste = vi.fn();
const createPlan = vi.fn();
const createVersion = vi.fn();
const savePosition = vi.fn();
const searchPatients = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlanApi>()),
  fetchPlanliste: (...args: unknown[]) => fetchPlanliste(...args) as Promise<PlanApi.Planliste>,
  createPlan: (...args: unknown[]) => createPlan(...args) as Promise<string>,
  createVersion: (...args: unknown[]) => createVersion(...args) as Promise<string>,
  savePosition: (...args: unknown[]) => savePosition(...args) as Promise<string>,
}));
vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientenApi>()),
  searchPatients: (begriff: string) =>
    searchPatients(begriff) as Promise<PatientenApi.PatientSearchHit[]>,
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { ZuEinemPlan } = await import('./ZuEinemPlan');
const { planFuerUebung } = await import('./zielplan');

const PATIENT = '66666666-6666-4666-8666-000000000001';

const VARIANTE: Variante = {
  id: 'v1',
  name: 'Kniebeuge am Geländer, halbe Tiefe',
  lay_name: 'Am Geländer halb in die Hocke gehen',
  instruction: null,
  equipment: [],
  common_faults: null,
  practice_notes: null,
  archived: false,
  ...OHNE_KATALOG,
};

function zeile(id: string, status: PlanApi.PlanZeile['status']): PlanApi.PlanZeile {
  return {
    id,
    title: 'Übungsplan',
    status,
    sessions_per_week: null,
    previous_plan_id: null,
    assigned_at: null,
    runs_from: null,
    runs_until: null,
    ended_at: null,
    created_at: '2026-10-01T08:00:00Z',
    item_count: 3,
    review_due: false,
  };
}

function liste(...plaene: PlanApi.PlanZeile[]): PlanApi.Planliste {
  return { can_write: true, today: '2026-10-14', plans: plaene };
}

describe('planFuerUebung (ANN-503)', () => {
  beforeEach(() => {
    fetchPlanliste.mockReset();
    createPlan.mockReset();
    createVersion.mockReset();
  });

  it('nimmt den Entwurf der Person', async () => {
    fetchPlanliste.mockResolvedValue(liste(zeile('alt', 'ended'), zeile('e1', 'draft')));
    expect(await planFuerUebung(PATIENT)).toBe('e1');
    expect(fetchPlanliste).toHaveBeenCalledWith('therapy', PATIENT);
    expect(createPlan).not.toHaveBeenCalled();
    expect(createVersion).not.toHaveBeenCalled();
  });

  it('legt zum laufenden Plan eine neue Fassung an - der zugewiesene bleibt eingefroren', async () => {
    fetchPlanliste.mockResolvedValue(liste(zeile('z1', 'assigned')));
    createVersion.mockResolvedValue('f2');
    expect(await planFuerUebung(PATIENT)).toBe('f2');
    expect(createVersion).toHaveBeenCalledWith('z1');
    expect(createPlan).not.toHaveBeenCalled();
  });

  it('legt ohne Entwurf und ohne laufenden Plan einen neuen an', async () => {
    fetchPlanliste.mockResolvedValue(liste(zeile('alt', 'ended')));
    createPlan.mockResolvedValue('n1');
    expect(await planFuerUebung(PATIENT)).toBe('n1');
    expect(createPlan).toHaveBeenCalledWith('therapy', PATIENT, 'Übungsplan');
  });

  it('bricht ab, wenn die Pläne nicht lesbar sind', async () => {
    fetchPlanliste.mockResolvedValue(null);
    await expect(planFuerUebung(PATIENT)).rejects.toThrow(
      'Die Pläne konnten nicht geladen werden.',
    );
  });
});

describe('ZuEinemPlan', () => {
  beforeEach(() => {
    fetchPlanliste.mockReset();
    createPlan.mockReset();
    savePosition.mockReset();
    searchPatients.mockReset();
    navigate.mockReset();
    searchPatients.mockResolvedValue([
      {
        id: PATIENT,
        given_name: 'Max',
        family_name: 'Mustermann',
        date_of_birth: '1960-02-01',
        status: 'active',
      },
    ]);
    fetchPlanliste.mockResolvedValue(liste());
    createPlan.mockResolvedValue('n1');
    savePosition.mockResolvedValue('p1');
  });

  it('legt die Übung mit zwei Tipps und dem Namen in den Plan und öffnet ihn', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ZuEinemPlan variante={VARIANTE} rueckweg="/uebungen/u1" />);

    await user.click(screen.getByRole('button', { name: 'Zu einem Plan' }));
    expect(screen.getByRole('dialog', { name: 'Zu einem Übungsplan' })).toBeVisible();
    await user.type(screen.getByLabelText('Für wen?'), 'Must');
    await user.click(await screen.findByRole('option', { name: /Max Mustermann/ }));

    await waitFor(() =>
      expect(savePosition).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'n1', variantId: 'v1', saetze: 3, wdhVon: 10 }),
      ),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `/patienten/${PATIENT}/plaene/n1?zurueck=${encodeURIComponent('/uebungen/u1')}`,
      ),
    );
  });

  it('sagt einen Fehler im Fenster und bleibt offen', async () => {
    const user = userEvent.setup();
    savePosition.mockRejectedValue(new Error('Ein Plan hat höchstens 30 Übungen.'));
    renderWithProviders(<ZuEinemPlan variante={VARIANTE} rueckweg="/uebungen/u1" />);

    await user.click(screen.getByRole('button', { name: 'Zu einem Plan' }));
    await user.type(screen.getByLabelText('Für wen?'), 'Must');
    await user.click(await screen.findByRole('option', { name: /Max Mustermann/ }));

    expect(await screen.findByText('Ein Plan hat höchstens 30 Übungen.')).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('bietet eine archivierte Variante nicht an', () => {
    renderWithProviders(
      <ZuEinemPlan variante={{ ...VARIANTE, archived: true }} rueckweg="/uebungen/u1" />,
    );
    expect(screen.getByRole('button', { name: 'Zu einem Plan' })).toBeDisabled();
  });
});
