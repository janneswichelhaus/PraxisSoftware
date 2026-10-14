import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import type { Nachricht, Plattformzugang } from './api';
import { EINSICHT_LESEN, TAGE_NUR_DIE_PERSON, type Einsichtsquelle } from './einsicht';
import { PlattformApp } from './PlattformApp';
import { eigenerPlan } from './testdaten';

/**
 * Die Plattform in der Einsicht der Praxis (E-001, DSN-001 D7): dasselbe
 * Gerüst, das die Person sieht, nur lesend. Gelesen wird über die
 * eingespeiste Quelle, kein Knopf schreibt, öffnet oder meldet ab, und
 * Seiten, die nur schreiben, sind nicht erreichbar. Der Server sperrt
 * dasselbe noch einmal (`supabase/tests/platform-preview.test.ts`).
 */

const netz = vi.hoisted(() => ({ aufgerufen: 0 }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    netz.aufgerufen += 1;
    throw new Error('Das Netz darf hier nicht angesprochen werden.');
  },
}));

const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';
const ERIKA: Plattformzugang = {
  access_id: ZUGANG,
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

const TERMIN = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  starts_at: '2030-10-21T08:00:00Z',
  ends_at: '2030-10-21T09:00:00Z',
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_name: 'Anna Beispiel',
  location_name: null,
  visit_street: 'Musterweg',
  visit_house_number: '1',
  visit_postal_code: '72070',
  visit_city: 'Tübingen',
  late_notice: false,
  open_request_kind: null,
};

const VIDEO = {
  id: 'aaaaaaaa-dddd-4ddd-8ddd-000000000001',
  media_kind: 'video' as const,
  mime_type: 'video/webm',
  duration_seconds: 12,
  created_at: '2026-10-09T09:00:00Z',
  delete_on: '2026-11-08',
  author: 'you' as const,
  author_label: null,
  server_verified: true,
  malware_scanned: true,
};

const NACHRICHT: Nachricht = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
  topic: 'exercise',
  reference_label: 'Kniebeuge am Geländer',
  status: 'answered',
  due_on: null,
  created_at: '2026-10-09T08:00:00Z',
  last_entry_at: '2026-10-09T12:00:00Z',
  closed_at: null,
  closed_by_side: null,
  attachment_count: 1,
  attachments: [VIDEO],
  entries: [
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000001',
      side: 'person',
      body: 'Wie tief soll ich gehen?',
      created_at: '2026-10-09T08:00:00Z',
      author: 'you',
      author_label: null,
    },
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000002',
      side: 'practice',
      body: 'Bei 0:07 kippt das Knie nach innen.',
      created_at: '2026-10-09T12:00:00Z',
      author: 'practice',
      author_label: null,
      attachment_id: VIDEO.id,
      attachment_mark_seconds: 7,
    },
  ],
};

/** Was die Projektionen in der Einsicht liefern - synthetisch, Erika Beispiel. */
const DATEN: Record<string, unknown> = {
  // Der Einstieg steht für Erika noch aus (supabase/seed.sql).
  platform_onboarding: [{ pending: true, finished_at: null, skipped_at: null }],
  platform_appointments: [TERMIN],
  platform_appointment_requests: [],
  platform_questionnaire: [],
  platform_invoices: [],
  platform_files: [
    {
      id: 'f1f1f1f1-f1f1-4f1f-8f1f-000000000001',
      document_type: 'arztbrief',
      display_name: 'Arztbrief Knie.pdf',
      mime_type: 'application/pdf',
      byte_size: 52_000,
      released_at: '2026-10-08T10:00:00Z',
    },
  ],
  platform_consents: [
    {
      purpose: 'email_contact',
      state: 'granted',
      occurred_on: '2026-10-01',
      source: 'platform',
      can_grant: true,
    },
  ],
  platform_representatives: [],
  platform_exercise_plans: { today: '2026-10-14', plans: [] },
  platform_messages: {
    response_workdays: 2,
    can_write: true,
    health_topics: true,
    can_attach: true,
    attachment_consent: 'granted',
    attachment_limit: 3,
    attachment_max_seconds: 30,
    messages: [NACHRICHT],
  },
};

const quelle = vi.fn<Einsichtsquelle>((funktion) =>
  Promise.resolve({ data: DATEN[funktion] ?? null, error: null }),
);

function Ort() {
  const { pathname } = useLocation();
  return <output data-testid="ort">{pathname}</output>;
}

function zeige(pfad: string, einsicht = true) {
  return renderWithProviders(
    <>
      <PlattformApp
        zugaenge={[ERIKA]}
        email={undefined}
        onAbmelden={() => undefined}
        {...(einsicht ? { einsicht: { zugangId: ZUGANG, quelle } } : {})}
      />
      <Ort />
    </>,
    pfad,
  );
}

beforeEach(() => {
  quelle.mockClear();
  netz.aufgerufen = 0;
});

describe('Plattform in der Einsicht (E-001)', () => {
  it('liest nur über die Quelle und zeigt die Übersicht statt des Einstiegs', async () => {
    zeige(`/p?zugang=${ZUGANG}`);
    expect(await screen.findByText(/Der Einstieg steht noch aus/)).toBeInTheDocument();
    expect(screen.queryByText(/Schritt 1 von/)).not.toBeInTheDocument();
    // Der Befundbogen steht da, wie die Person ihn sieht - ohne Weg hinein.
    expect(await screen.findByText('Befundbogen ausfüllen')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Befundbogen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Der Praxis schreiben/ })).not.toBeInTheDocument();
    expect(quelle).toHaveBeenCalled();
    for (const [funktion] of quelle.mock.calls) expect(EINSICHT_LESEN).toContain(funktion);
    expect(netz.aufgerufen).toBe(0);
  });

  it.each([
    '/p/termine/wunsch',
    `/p/termine/${TERMIN.id}`,
    '/p/nachrichten/neu',
    '/p/checkin',
    '/p/befundbogen',
    '/p/uebungen/einheit/aeaeaeae-aeae-4eae-8eae-000000000001',
    '/p/daten',
    '/p/einstellungen',
  ])('erreicht %s nicht - die Seite schreibt nur', async (pfad) => {
    zeige(pfad);
    expect(await screen.findByText(/Der Einstieg steht noch aus/)).toBeInTheDocument();
    expect(screen.getByTestId('ort')).toHaveTextContent(/^\/p$/);
    expect(netz.aufgerufen).toBe(0);
  });

  it('Termine: lesen ja, wünschen und ändern nein', async () => {
    zeige('/p/termine');
    expect(await screen.findByText(/Anna Beispiel/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Termin wünschen' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Musterweg|Hausbesuch|Anna Beispiel/ }),
    ).not.toBeInTheDocument();
  });

  it('Nachrichten: lesen ja, schreiben, öffnen und erledigen nein', async () => {
    const liste = zeige('/p/nachrichten');
    expect(await screen.findByText(/Kniebeuge am Geländer/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neue Nachricht' })).not.toBeInTheDocument();
    liste.unmount();

    zeige(`/p/nachrichten/${NACHRICHT.id}`);
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    expect(within(verlauf).getByText('Bei 0:07 kippt das Knie nach innen.')).toBeInTheDocument();
    expect(within(verlauf).getByText('Bezieht sich auf das Video bei 0:07.')).toBeInTheDocument();
    expect(screen.getByText('In den Rückfragen öffnen.')).toBeInTheDocument();
    for (const name of [
      /Im Video bei/,
      'Ansehen',
      'Löschen',
      'Senden',
      'Hat sich erledigt',
      'Foto aufnehmen',
      'Video aufnehmen',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Dokumente und Einwilligungen: lesen ja, öffnen und entscheiden nein', async () => {
    const dokumente = zeige('/p/dokumente');
    expect(await screen.findByText('Arztbrief Knie.pdf')).toBeInTheDocument();
    expect(screen.getByText('In der Akte unter Dateien öffnen.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ansehen|Herunterladen/ })).not.toBeInTheDocument();
    dokumente.unmount();

    zeige('/p/einwilligungen');
    expect(await screen.findByText(/Erteilt am/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Widerrufen|Einwilligen/ }),
    ).not.toBeInTheDocument();
  });

  it('Ich: kein Abmelden, keine Einstellungen, kein Export', async () => {
    zeige('/p/ich');
    expect(await screen.findByText('Einstellungen')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Einstellungen/ })).not.toBeInTheDocument();
    expect(screen.getByText('Meine Daten herunterladen')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Meine Daten/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abmelden|abmelden/ })).not.toBeInTheDocument();
    expect(netz.aufgerufen).toBe(0);
  });

  // ANN-307: Die Übungstage sieht nur die Person. Der Server liefert sie der
  // Einsicht leer (`supabase/tests/platform-preview.test.ts`); die Seiten
  // sagen das, statt „keine Tage" zu zeigen - und zeigen keine, selbst wenn
  // welche kämen.
  it.each([
    ['wie vom Server: leer', []],
    ['selbst wenn welche kämen', [1, 3]],
  ])('Übungstage: nur die Person sieht sie (%s)', async (_fall, tage) => {
    const vorher = DATEN.platform_exercise_plans;
    DATEN.platform_exercise_plans = {
      today: '2026-10-14',
      plans: [eigenerPlan({ weekdays: tage, can_choose_days: true })],
    };
    try {
      const uebungen = zeige('/p/uebungen');
      expect(await screen.findByText('Heimprogramm Knie')).toBeInTheDocument();
      expect(screen.getByText(TAGE_NUR_DIE_PERSON)).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: /Meine Übungstage/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Meine Übungstage:/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /üben/ })).not.toBeInTheDocument();
      uebungen.unmount();

      zeige('/p/termine');
      expect(await screen.findByText(TAGE_NUR_DIE_PERSON)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Diese Woche' })).not.toBeInTheDocument();
      expect(screen.queryByText('Übungstag')).not.toBeInTheDocument();
    } finally {
      DATEN.platform_exercise_plans = vorher;
    }
  });

  it('ohne Einsicht bleiben die Seiten der Person, wie sie sind', () => {
    zeige('/p/termine/wunsch', false);
    expect(screen.getByTestId('ort')).toHaveTextContent('/p/termine/wunsch');
  });
});
