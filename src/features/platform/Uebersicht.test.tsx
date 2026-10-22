import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as PlattformApi from './api';
import type { Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Die Übersicht (POR-015, DSN-001 4.1): Befundbogen, nächster Termin, Antwort
 * der Praxis, offene Rechnung - in dieser Reihenfolge; leer sagt sie es.
 */

const ladeTermine = vi.fn();
const ladeWuensche = vi.fn();
const ladeRechnungen = vi.fn();
const ladeBefundbogen = vi.fn();
const ladeAbo = vi.fn();
const ladeTrainingsangebot = vi.fn();
const ladeCheckins = vi.fn();
const ladeGewohnheiten = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<unknown[]>,
  ladeWuensche: (...args: unknown[]) => ladeWuensche(...args) as Promise<unknown[]>,
  ladeRechnungen: (...args: unknown[]) => ladeRechnungen(...args) as Promise<unknown[]>,
  ladeBefundbogen: (...args: unknown[]) => ladeBefundbogen(...args) as Promise<unknown[]>,
  ladeAbo: (...args: unknown[]) => ladeAbo(...args) as Promise<unknown>,
  ladeTrainingsangebot: (...args: unknown[]) => ladeTrainingsangebot(...args) as Promise<unknown>,
  ladeCheckins: (...args: unknown[]) => ladeCheckins(...args) as Promise<unknown>,
  ladeGewohnheiten: (...args: unknown[]) => ladeGewohnheiten(...args) as Promise<unknown>,
}));

const { Uebersicht } = await import('./Uebersicht');

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

function inTagen(tage: number, stunde: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, 30, 0, 0);
  return d.toISOString();
}

const TERMIN = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: inTagen(3, 9),
  ends_at: inTagen(3, 10),
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_name: 'Anna Beispiel',
  location_name: null,
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  late_notice: false,
  open_request_kind: null,
};

function zeige(zugang = ZUGANG, pfad = '/p?bereich=treatment') {
  return renderWithProviders(
    <Uebersicht praxis="Test Praxis Tuebingen" zugang={zugang} eigeneBereiche={1} />,
    pfad,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeTermine.mockResolvedValue([]);
  ladeWuensche.mockResolvedValue([]);
  ladeRechnungen.mockResolvedValue([]);
  ladeBefundbogen.mockResolvedValue([]);
  ladeAbo.mockResolvedValue(null);
  ladeTrainingsangebot.mockResolvedValue(null);
  ladeCheckins.mockResolvedValue(null);
  ladeGewohnheiten.mockResolvedValue(null);
});

function checkin(teil: Record<string, unknown> = {}) {
  return {
    today: '2026-10-12',
    schedule: { interval_days: 7, parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'] },
    due_on: '2026-10-12',
    due: true,
    can_answer: true,
    consent_needed: false,
    last_values: {},
    history: [],
    ...teil,
  };
}

describe('Uebersicht (POR-015)', () => {
  // KND-003: das Angebot aus dem Abschlussgespräch als eigene Zeile.
  it('zeigt das Trainingsangebot der Praxis mit dem Weg dorthin', async () => {
    ladeTrainingsangebot.mockResolvedValue({
      label: 'Trainingspaket 3 Monate',
      valid_until: '2026-10-21',
    });
    zeige();
    expect(await screen.findByText(/Trainingspaket 3 Monate/)).toBeInTheDocument();
    expect(screen.getByText(/gilt bis 21.10.2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Training nach der Behandlung/ })).toHaveAttribute(
      'href',
      '/p/angebot?bereich=treatment',
    );
  });

  it('fragt für eine Begleitung kein Angebot an', async () => {
    zeige({ ...ZUGANG, access_kind: 'companion', represented_name: 'Max Mustermann' });
    expect(await screen.findByText(/Als Begleitung/)).toBeInTheDocument();
    expect(ladeTrainingsangebot).not.toHaveBeenCalled();
  });

  it('zeigt Befundbogen, naechsten Termin und offene Rechnung in der Reihenfolge aus DSN-001', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladeRechnungen.mockResolvedValue([
      {
        id: 'ffffffff-ffff-4fff-8fff-000000000001',
        invoice_number: 'RG-2026-0001',
        issued_on: '2026-09-25',
        due_on: '2026-10-09',
        total_cents: 14000,
        currency: 'EUR',
        paid_cents: 0,
        outstanding_cents: 14000,
        payment_state: 'unpaid',
        overdue: false,
        cancelled: false,
        cancelled_on: null,
        recipient_kind: 'self',
        recipient_name: 'Erika Beispiel',
        service_from: null,
        service_to: null,
      },
    ]);
    zeige();
    expect(await screen.findByText('Fragebogen ausfüllen')).toBeInTheDocument();
    // Was zu tun ist, in der Reihenfolge aus DSN-001; der Termin darunter.
    const ziele = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href) => /befundbogen|rechnungen|termine/.test(href ?? ''));
    expect(ziele).toEqual([
      '/p/befundbogen?bereich=treatment',
      '/p/rechnungen/ffffffff-ffff-4fff-8fff-000000000001?bereich=treatment',
      '/p/termine?bereich=treatment',
    ]);
    expect(screen.getByRole('link', { name: /^Fragebogen ausfüllen/ })).toHaveAttribute(
      'href',
      '/p/befundbogen?bereich=treatment',
    );
    expect(screen.getByRole('heading', { name: 'Nächster Termin' })).toBeInTheDocument();
    expect(screen.getByText('Hausbesuch · Anna Beispiel kommt zu Ihnen')).toBeInTheDocument();
    expect(screen.getByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Offene Rechnung: 140,00\s€/ })).toHaveAttribute(
      'href',
      '/p/rechnungen/ffffffff-ffff-4fff-8fff-000000000001?bereich=treatment',
    );
    expect(screen.queryByText(/Gerade ist nichts zu tun/)).not.toBeInTheDocument();
  });

  it('fuehrt eine Begleitung nicht zum Befundbogen (ANN-248) und meldet einen Fehler als Satz', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    zeige({
      ...ZUGANG,
      access_id: 'cafecafe-cafe-4afe-8afe-000000000004',
      access_kind: 'companion',
      represented_name: 'Max Mustermann',
    });
    expect(await screen.findByText('Nächster Termin')).toBeInTheDocument();
    expect(screen.queryByText('Fragebogen ausfüllen')).not.toBeInTheDocument();

    ladeRechnungen.mockRejectedValue(new Error('Netz weg'));
    zeige();
    expect(
      await screen.findByText('Ihre Übersicht konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Gerade ist nichts zu tun/)).not.toBeInTheDocument();
  });

  it('laesst den Befundbogen weg, wenn er vorliegt, und sagt sonst, dass nichts zu tun ist', async () => {
    ladeBefundbogen.mockResolvedValue([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
        instrument_id: 'anamnese_v8',
        definition_version: '1.0.0',
        status: 'abgeschlossen',
        recorded_on: '2026-10-01',
        source: 'practice',
        answers: null,
        updated_at: '2026-10-01T08:00:00.000Z',
        completed_at: '2026-10-01T08:00:00.000Z',
      },
    ]);
    zeige();
    expect(await screen.findByText(/Gerade ist nichts zu tun/)).toBeInTheDocument();
    expect(screen.getByText(/Zurzeit ist kein Termin vereinbart/)).toBeInTheDocument();
    expect(screen.queryByText('Fragebogen ausfüllen')).not.toBeInTheDocument();
  });

  it('zeigt die Antwort der Praxis auf einen Wunsch und im Training keinen Befundbogen', async () => {
    ladeWuensche.mockResolvedValue([
      {
        id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
        kind: 'new',
        appointment_id: null,
        preferred_days: ['2026-10-20'],
        preferred_times: [],
        note: null,
        status: 'declined',
        created_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
        answer: 'Diese Woche ist voll.',
      },
    ]);
    zeige({ ...ZUGANG, relationship_kind: 'training' }, '/p?bereich=training');
    expect(
      await screen.findByText('Ihr Terminwunsch war leider nicht möglich.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Antwort der Praxis: Diese Woche ist voll.')).toBeInTheDocument();
    expect(screen.queryByText('Fragebogen ausfüllen')).not.toBeInTheDocument();
    expect(ladeBefundbogen).not.toHaveBeenCalled();
  });

  it('zeigt den fälligen Check-in als Zeile (TRK-003, DSN-001 4.1 Punkt 3)', async () => {
    ladeCheckins.mockResolvedValue(checkin());
    zeige();
    expect(await screen.findByText(/^3 kurze Fragen · freiwillig/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Check-in beantworten/ })).toHaveAttribute(
      'href',
      '/p/checkin?bereich=treatment',
    );
    expect(screen.queryByText(/Gerade ist nichts zu tun/)).not.toBeInTheDocument();
  });

  it('zeigt keinen Check-in, wenn er nicht fällig ist, und mahnt nicht (IDEA-TRK-004)', async () => {
    ladeCheckins.mockResolvedValue(
      checkin({ due: false, can_answer: false, due_on: '2026-10-19' }),
    );
    zeige();
    expect(await screen.findByText('Fragebogen ausfüllen')).toBeInTheDocument();
    await waitFor(() => expect(ladeCheckins).toHaveBeenCalled());
    expect(screen.queryByText(/Check-in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/verpasst|überfällig|vergessen/i)).not.toBeInTheDocument();
  });

  it('führt im Training ohne Einwilligung zu den Einwilligungen, nicht zum Check-in', async () => {
    ladeCheckins.mockResolvedValue(checkin({ can_answer: false, consent_needed: true }));
    zeige({ ...ZUGANG, relationship_kind: 'training' }, '/p?bereich=training');
    expect(await screen.findByText('Ihre Praxis bittet um einen Check-in')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /^Ihre Praxis bittet um einen Check-in/ }),
    ).toHaveAttribute('href', '/p/einwilligungen?bereich=training');
    expect(screen.queryByRole('link', { name: /Check-in beantworten/ })).not.toBeInTheDocument();
  });

  it('zeigt laufende Gewohnheiten als Zeile, pausierte nicht, ohne Zählwerk (ALT-003)', async () => {
    const gewohnheit = {
      id: 'g1',
      action: 'zwei Minuten Mobilität',
      cue: 'Nach dem Zähneputzen',
      place: null,
      starts_on: '2026-10-01',
      paused: false,
      ended_at: null,
      marks: [],
    };
    ladeGewohnheiten.mockResolvedValue({
      today: '2026-10-12',
      mark_days: 7,
      can_mark: true,
      consent_needed: false,
      habits: [gewohnheit, { ...gewohnheit, id: 'g2', action: 'Treppe', paused: true }],
    });
    zeige();
    expect(await screen.findByText('Eine kleine Gewohnheit')).toBeInTheDocument();
    expect(screen.getByText('zwei Minuten Mobilität')).toBeInTheDocument();
    expect(screen.queryByText(/Treppe/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Eine kleine Gewohnheit/ })).toHaveAttribute(
      'href',
      '/p/gewohnheiten?bereich=treatment',
    );
  });

  it('sagt nach dem Absenden, was mit den Angaben geschieht (D5)', async () => {
    zeige(ZUGANG, '/p?bereich=treatment&checkin=1');
    expect(
      await screen.findByText(
        'Danke. Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin. Bei akuten Beschwerden: 112 oder 116117.',
      ),
    ).toBeInTheDocument();
  });

  it('bestaetigt den abgeschickten Befundbogen', async () => {
    zeige(ZUGANG, '/p?bereich=treatment&bogen=1');
    expect(await screen.findByText(/Ihr Fragebogen ist bei der Praxis/)).toBeInTheDocument();
  });

  it('nennt nach einem gekündigten Nachsorge-Abo dessen Ende und die Lesezeit (ANG-004)', async () => {
    ladeAbo.mockResolvedValue({
      id: 'abababab-abab-4bab-8bab-000000000001',
      starts_on: '2026-09-05',
      ends_on: '2026-11-04',
      state: 'ending',
      next_month_start: null,
      next_month_price_cents: null,
      cancel_effective_on: null,
      cancelled_at: '2026-10-07T09:30:00Z',
      cancelled_via: 'platform',
      can_cancel: false,
    });
    zeige({ ...ZUGANG, read_until: '2026-12-05T00:00:00+01:00' });
    expect(
      await screen.findByText(/Ihr Nachsorge-Abo endet am 04\.11\.2026\. Sie können hier noch bis/),
    ).toBeInTheDocument();
  });
});
