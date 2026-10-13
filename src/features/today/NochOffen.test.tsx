import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type * as TodayApiModule from './api';
import type * as LeistungenModule from '@/features/appointments/leistungenAmTermin';
import { tagePlus } from '@/features/appointments/calendar';
import { renderMitVorschau } from '@/test-utils';
import { Nachzuholen, NochOffen } from './NochOffen';

const fetchDayPlan = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TodayApiModule>()),
  fetchDayPlan: (tag: string, person: string) =>
    fetchDayPlan(tag, person) as Promise<TodayApiModule.DayPlanEntry[]>,
}));
const fetchLeistungenAmTermin = vi.fn();
vi.mock('@/features/appointments/leistungenAmTermin', async (importOriginal) => ({
  ...(await importOriginal<typeof LeistungenModule>()),
  fetchLeistungenAmTermin: (id: string) =>
    fetchLeistungenAmTermin(id) as Promise<LeistungenModule.LeistungenAmTermin | null>,
}));

const HEUTE = '2026-10-13';
const ZONE = 'Europe/Berlin';

function eintrag(teil: Partial<TodayApiModule.DayPlanEntry>): TodayApiModule.DayPlanEntry {
  return {
    id: 't1',
    patient_id: 'p1',
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'completed',
    starts_at: '2026-10-12T08:00:00.000Z',
    ends_at: '2026-10-12T09:00:00.000Z',
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: null,
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: ZONE,
    ...teil,
  };
}

describe('Nachzuholen (Auftrag C1, ANN-478)', () => {
  beforeEach(() => {
    fetchDayPlan.mockReset();
  });

  it('liest die sieben Tage davor über die Tagesliste und zeigt, was liegen blieb', async () => {
    const gestern = tagePlus(HEUTE, -1);
    fetchDayPlan.mockImplementation((tag: string) =>
      Promise.resolve(
        tag === gestern
          ? [
              eintrag({ id: 'doku-offen' }),
              eintrag({
                id: 'kein-haken',
                status: 'confirmed',
                patient_given_name: 'Max',
                patient_family_name: 'Mustermann',
              }),
              eintrag({ id: 'fertig', status: 'documented', documentation_status: 'final' }),
              eintrag({ id: 'abgesagt', status: 'cancelled' }),
              eintrag({ id: 'weg', status: 'no_show', documentation_status: null }),
              eintrag({ id: 'fehlzeit', kind: 'internal', patient_id: null, status: 'confirmed' }),
            ]
          : [],
      ),
    );
    renderMitVorschau(<Nachzuholen heute={HEUTE} staffMemberId="s1" zeitzone={ZONE} />);

    const kopf = await screen.findByRole('heading', { name: 'Nachzuholen' });
    expect(kopf.closest('summary')).toHaveTextContent('Nachzuholen (2)');
    const zeilen = screen.getAllByRole('listitem');
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toHaveTextContent('Erika Beispiel');
    expect(zeilen[0]).toHaveTextContent('Doku offen');
    expect(zeilen[1]).toHaveTextContent('Nicht abgeschlossen');
    expect(within(zeilen[0]!).getByRole('link', { name: /^Doku/ })).toHaveAttribute(
      'href',
      `/termine/doku-offen/abschluss?zurueck=${encodeURIComponent('/')}`,
    );
    // Genau die sieben Tage davor, je einmal - nicht heute.
    expect(fetchDayPlan).toHaveBeenCalledTimes(7);
    for (let abstand = 1; abstand <= 7; abstand += 1) {
      expect(fetchDayPlan).toHaveBeenCalledWith(tagePlus(HEUTE, -abstand), 's1');
    }
    expect(fetchDayPlan).not.toHaveBeenCalledWith(HEUTE, 's1');
  });

  it('bleibt ohne Liegengebliebenes ganz weg', async () => {
    fetchDayPlan.mockResolvedValue([
      eintrag({ status: 'documented', documentation_status: 'final' }),
    ]);
    const { container } = renderMitVorschau(
      <Nachzuholen heute={HEUTE} staffMemberId="s1" zeitzone={ZONE} />,
    );
    await vi.waitFor(() => expect(fetchDayPlan).toHaveBeenCalledTimes(7));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('NochOffen (Auftrag C1)', () => {
  beforeEach(() => {
    fetchLeistungenAmTermin.mockReset();
  });

  it('fragt den Stand der Heilmittel nur, wo die Rolle bestätigen darf (ANN-140)', async () => {
    fetchLeistungenAmTermin.mockResolvedValue({
      appointment_id: 'eigen',
      can_record: true,
      services: [],
      recorded_at: null,
      recorded_by_name: null,
      basis_items: null,
      session_fee_cents: null,
    });
    renderMitVorschau(
      <NochOffen
        plan={[
          eintrag({ id: 'eigen', status: 'documented', documentation_status: 'final' }),
          eintrag({
            id: 'fremd',
            staff_member_id: 's2',
            status: 'documented',
            documentation_status: 'final',
          }),
        ]}
        tagWort="Heute"
        darfDokumentieren
        darfHeilmittel={(person) => person === 's1'}
        jetzt={Date.parse('2026-10-12T18:00:00.000Z')}
        zeitzone={ZONE}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Heute noch offen (1)' })).toBeVisible();
    expect(fetchLeistungenAmTermin).toHaveBeenCalledTimes(1);
    expect(fetchLeistungenAmTermin).toHaveBeenCalledWith('eigen');
    expect(screen.getByText('Heilmittel offen')).toBeInTheDocument();
  });

  it('nennt offene Doku nur denen, die schreiben', () => {
    const { container } = renderMitVorschau(
      <NochOffen
        plan={[eintrag({ id: 'a', documentation_status: 'draft' })]}
        tagWort="Heute"
        darfDokumentieren={false}
        darfHeilmittel={() => false}
        jetzt={Date.parse('2026-10-12T18:00:00.000Z')}
        zeitzone={ZONE}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
