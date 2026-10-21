import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type * as TodayApiModule from './api';
import { tagePlus } from '@/features/appointments/calendar';
import { renderMitVorschau } from '@/test-utils';
import { Nachzuholen, NochOffen } from './NochOffen';

const fetchDayPlan = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TodayApiModule>()),
  fetchDayPlan: (tag: string, person: string) =>
    fetchDayPlan(tag, person) as Promise<TodayApiModule.DayPlanEntry[]>,
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
              // B4: festgeschrieben, aber nicht abgehakt - es fehlt der Haken.
              eintrag({
                id: 'ohne-haken',
                status: 'documented',
                documentation_status: 'final',
                checked_at: null,
                patient_given_name: 'Lea',
                patient_family_name: 'Ruhig',
              }),
              eintrag({ id: 'abgesagt', status: 'cancelled' }),
              eintrag({ id: 'weg', status: 'no_show', documentation_status: null }),
              eintrag({ id: 'fehlzeit', kind: 'internal', patient_id: null, status: 'confirmed' }),
            ]
          : [],
      ),
    );
    renderMitVorschau(<Nachzuholen heute={HEUTE} staffMemberId="s1" zeitzone={ZONE} />);

    const kopf = await screen.findByRole('heading', { name: 'Nachzuholen' });
    expect(kopf.closest('summary')).toHaveTextContent('Nachzuholen (3)');
    const zeilen = screen.getAllByRole('listitem');
    expect(zeilen).toHaveLength(3);
    expect(zeilen[0]).toHaveTextContent('Erika Beispiel');
    expect(zeilen[0]).toHaveTextContent('Doku offen');
    expect(zeilen[1]).toHaveTextContent('Nicht abgeschlossen');
    expect(zeilen[2]).toHaveTextContent('Haken fehlt');
    // Wo nur der Haken fehlt, ist er die Aktion - nicht „Doku“.
    expect(
      within(zeilen[2]!).getByRole('button', { name: 'Termin abschließen: Lea Ruhig' }),
    ).toBeInTheDocument();
    expect(within(zeilen[2]!).queryByRole('link', { name: /^Doku/ })).toBeNull();
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

  it('setzt „Ausfall“ auch unter Liegengebliebenes (B12)', async () => {
    const gestern = tagePlus(HEUTE, -1);
    fetchDayPlan.mockImplementation((tag: string) =>
      Promise.resolve(tag === gestern ? [eintrag({ id: 'kein-haken', status: 'confirmed' })] : []),
    );
    renderMitVorschau(
      <Nachzuholen
        heute={HEUTE}
        staffMemberId="s1"
        zeitzone={ZONE}
        ausfall={(termin) => (
          <button type="button">Ausfall für {termin.patient_family_name}</button>
        )}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Ausfall für Beispiel' })).toBeInTheDocument();
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

describe('NochOffen: zurückgewiesener Freizeitausgleich (BEF-179)', () => {
  const morgen = tagePlus(HEUTE, 1);
  const spaeter = '2026-10-22';

  it('steht unter den Besuchen, bis sein Tag vorbei ist - ohne Grund, die Zeile führt ins Zeitkonto', async () => {
    renderMitVorschau(
      <NochOffen
        plan={[eintrag({ id: 'doku-offen' })]}
        tagWort="Heute"
        heute={HEUTE}
        darfDokumentieren
        jetzt={Date.parse('2026-10-13T18:00:00.000Z')}
        zeitzone={ZONE}
        zurueckgewiesen={[
          { id: 'z-heute', on_date: HEUTE, starts_at: '16:00', ends_at: '18:00' },
          { id: 'z-morgen', on_date: morgen, starts_at: '08:00', ends_at: '10:00' },
          { id: 'z-spaeter', on_date: spaeter, starts_at: '13:00', ends_at: '14:30' },
        ]}
      />,
    );
    const abschnitt = (
      await screen.findByRole('heading', { name: 'Heute noch offen (4)' })
    ).closest('section')!;
    const zeilen = within(abschnitt).getAllByRole('listitem');
    expect(zeilen).toHaveLength(4);
    // Erst die Besuche, wie bisher (K15).
    expect(zeilen[0]).toHaveTextContent('Erika Beispiel');
    expect(zeilen[1]).toHaveTextContent('16:00Freizeitausgleich zurückgewiesen');
    expect(zeilen[1]).toHaveTextContent('Heute · 16:00–18:00 wieder Arbeitszeit');
    expect(zeilen[2]).toHaveTextContent('Morgen · 08:00–10:00 wieder Arbeitszeit');
    expect(zeilen[3]).toHaveTextContent('Am Do., 22.10. · 13:00–14:30 wieder Arbeitszeit');
    for (const zeile of zeilen.slice(1)) {
      expect(within(zeile).getByRole('link')).toHaveAttribute('href', '/betrieb/zeitkonto');
      expect(within(zeile).queryByRole('button')).toBeNull();
    }
  });

  it('steht auch allein, wenn an den Besuchen nichts fehlt', async () => {
    renderMitVorschau(
      <NochOffen
        plan={[eintrag({ status: 'documented', documentation_status: 'final' })]}
        tagWort="Heute"
        heute={HEUTE}
        darfDokumentieren
        jetzt={Date.parse('2026-10-13T18:00:00.000Z')}
        zeitzone={ZONE}
        zurueckgewiesen={[{ id: 'z', on_date: morgen, starts_at: '08:00', ends_at: '10:00' }]}
      />,
    );
    const abschnitt = (
      await screen.findByRole('heading', { name: 'Heute noch offen (1)' })
    ).closest('section')!;
    expect(within(abschnitt).getAllByRole('listitem')).toHaveLength(1);
    expect(abschnitt).toHaveTextContent('Freizeitausgleich zurückgewiesen');
  });
});

describe('NochOffen (Auftrag C1, B4, B7)', () => {
  it('nennt eine festgeschriebene Doku ohne Haken „Haken fehlt“ und bietet den Haken an', async () => {
    renderMitVorschau(
      <NochOffen
        plan={[
          eintrag({
            id: 'ohne-haken',
            status: 'documented',
            documentation_status: 'final',
            checked_at: null,
          }),
          eintrag({
            id: 'abgehakt',
            status: 'documented',
            documentation_status: 'final',
            checked_at: '2026-10-12T09:00:00.000Z',
            patient_given_name: 'Max',
            patient_family_name: 'Mustermann',
          }),
        ]}
        tagWort="Heute"
        heute={HEUTE}
        darfDokumentieren
        jetzt={Date.parse('2026-10-12T18:00:00.000Z')}
        zeitzone={ZONE}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Heute noch offen (1)' })).toBeVisible();
    expect(screen.getByText('Haken fehlt')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Termin abschließen: Erika Beispiel' }),
    ).toBeInTheDocument();
    // B7: Heilmittel bestätigt niemand mehr - es gibt dafür keine Zeile.
    expect(screen.queryByText('Heilmittel offen')).toBeNull();
    expect(screen.queryByText(/Mustermann/)).toBeNull();
  });

  // B12: „Ausfall“ an jeder Zeile - unter ihr, weil das Feld dahinter die
  // volle Breite braucht. Wann er passt, sagt die Übersicht (`ausfall`).
  it('setzt „Ausfall“ unter die Zeile, wo die Übersicht ihn anbietet (B12)', async () => {
    const ausfall = vi.fn((termin: TodayApiModule.DayPlanEntry) =>
      termin.id === 'nicht-abgeschlossen' ? (
        <button type="button">Ausfall für {termin.patient_family_name}</button>
      ) : null,
    );
    renderMitVorschau(
      <NochOffen
        plan={[
          eintrag({ id: 'nicht-abgeschlossen', status: 'confirmed' }),
          eintrag({
            id: 'ohne-haken',
            status: 'documented',
            documentation_status: 'final',
            checked_at: null,
            patient_given_name: 'Max',
            patient_family_name: 'Mustermann',
          }),
        ]}
        tagWort="Heute"
        heute={HEUTE}
        darfDokumentieren
        jetzt={Date.parse('2026-10-12T18:00:00.000Z')}
        zeitzone={ZONE}
        ausfall={ausfall}
      />,
    );
    const knopf = await screen.findByRole('button', { name: 'Ausfall für Beispiel' });
    // In derselben Zeile wie Name und Doku, darunter.
    const zeile = knopf.closest('li')!;
    expect(within(zeile).getByText('Erika Beispiel')).toBeInTheDocument();
    expect(within(zeile).getByRole('link', { name: /^Doku/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Ausfall/ })).toHaveLength(1);
    expect(ausfall).toHaveBeenCalledTimes(2);
  });

  it('nennt offene Doku nur denen, die schreiben', () => {
    const { container } = renderMitVorschau(
      <NochOffen
        plan={[eintrag({ id: 'a', documentation_status: 'draft' })]}
        tagWort="Heute"
        heute={HEUTE}
        darfDokumentieren={false}
        jetzt={Date.parse('2026-10-12T18:00:00.000Z')}
        zeitzone={ZONE}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
