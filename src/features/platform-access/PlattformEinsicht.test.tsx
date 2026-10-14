import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { PlattformEinsicht } from './PlattformEinsicht';

/**
 * Die Seite der Praxis für die Einsicht in die Plattform (E-001, DSN-001 D7):
 * ein Zugang aus der Adresse, die Leiste „nur lesen“, der Rückweg in die
 * Akte - und jedes Lesen über `platform_preview`, nie über die Projektionen
 * der Person selbst.
 */

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';
const ERIKA = '66666666-6666-4666-8666-000000000002';

const KONTEXT = {
  access_id: ZUGANG,
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  relationship_id: ERIKA,
  person_name: 'Erika Beispiel',
};

/** Die Antworten des Verteilers je Projektion - synthetisch. */
const ANTWORTEN: Record<string, unknown> = {
  platform_context: [KONTEXT],
  platform_onboarding: [{ pending: false, finished_at: '2026-10-01T10:00:00Z', skipped_at: null }],
  platform_appointments: [],
  platform_appointment_requests: [],
  platform_questionnaire: [],
  platform_invoices: [],
  platform_exercise_plans: { today: '2026-10-14', plans: [] },
  platform_messages: { response_workdays: 2, can_write: true, health_topics: true, messages: [] },
};

function verteiler(_name: string, argumente: { p_function: string }) {
  return Promise.resolve({
    data: ANTWORTEN[argumente.p_function] ?? null,
    error: null,
    status: 200,
  });
}

function Ort() {
  const { pathname, search } = useLocation();
  return <output data-testid="ort">{`${pathname}${search}`}</output>;
}

function zeige(pfad: string) {
  return renderWithProviders(
    <>
      <PlattformEinsicht />
      <Ort />
    </>,
    pfad,
  );
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(verteiler);
});

describe('Einsicht der Praxis (E-001)', () => {
  it('geht ohne gültigen Zugang in der Adresse auf die Startseite', () => {
    zeige('/p');
    expect(screen.getByTestId('ort')).toHaveTextContent(/^\/$/);
    zeige('/p?zugang=nicht-eine-kennung');
    expect(screen.getAllByTestId('ort').at(-1)).toHaveTextContent(/^\/$/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('zeigt die Plattform mit der Leiste und liest nur über den Verteiler', async () => {
    zeige(`/p?zugang=${ZUGANG}`);
    const leiste = await screen.findByRole('region', { name: 'Einsicht der Praxis' });
    expect(leiste).toHaveTextContent(
      'Einsicht · So sieht Erika Beispiel die Plattform · nur lesen',
    );
    expect(within(leiste).getByRole('link', { name: 'Zurück zur Akte' })).toHaveAttribute(
      'href',
      `/patienten/${ERIKA}/stammdaten`,
    );
    // Die Plattform selbst - mit ihren Reitern, ohne Praxisrahmen.
    expect(await screen.findByRole('navigation', { name: 'Plattform' })).toBeInTheDocument();
    expect(await screen.findByText('Guten Tag')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalled();
    for (const [name, argumente] of rpc.mock.calls as [string, Record<string, unknown>][]) {
      expect(name).toBe('platform_preview');
      expect(argumente.p_access_id).toBe(ZUGANG);
    }
  });

  it('behält den Zugang in der Adresse, wenn die Plattform weiterführt', async () => {
    zeige(`/p?zugang=${ZUGANG}`);
    const reiter = await screen.findByRole('navigation', { name: 'Plattform' });
    await userEvent.click(within(reiter).getByRole('link', { name: 'Nachrichten' }));
    expect(await screen.findByRole('heading', { name: 'Nachrichten' })).toBeInTheDocument();
    expect(screen.getByTestId('ort')).toHaveTextContent(`/p/nachrichten?zugang=${ZUGANG}`);
  });

  it('führt im Training zurück zum Trainingsverhältnis', async () => {
    ANTWORTEN.platform_context = [{ ...KONTEXT, relationship_kind: 'training' }];
    try {
      zeige(`/p?zugang=${ZUGANG}`);
      expect(
        await screen.findByRole('link', { name: 'Zurück zum Trainingsverhältnis' }),
      ).toHaveAttribute('href', `/training/${ERIKA}`);
    } finally {
      ANTWORTEN.platform_context = [KONTEXT];
    }
  });

  it('sagt es, wenn der Server die Einsicht abweist - ohne Plattform', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 403 });
    zeige(`/p?zugang=${ZUGANG}`);
    expect(await screen.findByText('Diese Einsicht ist nicht möglich.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Plattform' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Einsicht der Praxis' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toHaveAttribute('href', '/');
  });

  it('unterscheidet einen Netzfehler und lädt erneut', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
    zeige(`/p?zugang=${ZUGANG}`);
    expect(
      await screen.findByText('Die Einsicht konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Erneut/ }));
    expect(await screen.findByRole('region', { name: 'Einsicht der Praxis' })).toBeInTheDocument();
  });
});
