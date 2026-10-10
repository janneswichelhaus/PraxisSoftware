import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { DayPlanEntry } from './api';
import { TagesplanDruck } from './TagesplanDruck';

/**
 * Das Druckblatt der Übersicht (BEF-052, ANN-021 Fassung 3): jeder Termin des
 * Tages mit Anschrift, Zugang und Rufnummer. Ob es im Druck allein steht,
 * prüft `tests/e2e/uebersicht.spec.ts`.
 */
function eintrag(teil: Partial<DayPlanEntry>): DayPlanEntry {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    patient_id: '66666666-6666-4666-8666-000000000001',
    staff_member_id: '55555555-5555-4555-8555-000000000002',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2027-01-04T07:30:00.000Z',
    ends_at: '2027-01-04T08:30:00.000Z',
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    patient_phone: '+49 7071 0000001',
    patient_phone_mobile: '+49 160 0000006',
    home_visit_access_note: 'Erdgeschoss, Klingel "Beispiel".',
    special_note: 'Hund im Flur.',
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    ...teil,
  };
}

function rendern(termine: DayPlanEntry[], standVon: number | null = null) {
  return render(
    <TagesplanDruck
      termine={termine}
      name="Anna Beispiel"
      datum="Montag, 4. Januar 2027"
      zeitzone="Europe/Berlin"
      standVon={standVon}
    />,
  );
}

describe('TagesplanDruck', () => {
  it('nennt je Termin Zeit, Name, Anschrift, Etage, Zugang, Besonderheit und Rufnummern', () => {
    rendern([eintrag({})]);
    const blatt = screen.getByTestId('tagesplan-druck');

    // Am Bildschirm nie zu sehen, auch nicht für Vorlesesoftware.
    expect(blatt).toHaveClass('hidden', 'print:block');
    expect(blatt).toHaveAttribute('aria-hidden', 'true');

    const zeile = within(blatt).getAllByRole('listitem', { hidden: true })[0]!;
    expect(zeile).toHaveTextContent('08:30–09:30 Uhr');
    for (const text of [
      'Erika Beispiel',
      'Testweg 7, 72072 Tuebingen',
      'Erdgeschoss',
      'Klingel "Beispiel".',
      'Hund im Flur.',
      '+49 160 0000006',
      '+49 7071 0000001',
    ]) {
      expect(within(zeile).getByText(text)).toBeInTheDocument();
    }
    expect(within(blatt).getByText('Anna Beispiel')).toBeInTheDocument();
    // Keine Telefonverweise: Papier wählt nicht.
    expect(blatt.querySelector('a')).toBeNull();
  });

  it('zeigt jeden Termin, auch Fehlzeit und Praxistermin, und den abweichenden Zustand', () => {
    rendern([
      eintrag({}),
      eintrag({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
        appointment_type: 'practice',
        location_name: 'Hauptstandort Tuebingen',
        visit_street: null,
        visit_house_number: null,
        visit_postal_code: null,
        visit_city: null,
        status: 'cancelled',
      }),
      eintrag({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
        kind: 'internal',
        patient_id: null,
        title: 'Teambesprechung',
        appointment_type: 'video',
      }),
    ]);
    const zeilen = screen.getAllByRole('listitem', { hidden: true });
    expect(zeilen).toHaveLength(3);
    expect(zeilen[1]).toHaveTextContent('Erika Beispiel · Abgesagt');
    expect(zeilen[1]).toHaveTextContent('Hauptstandort Tuebingen');
    expect(zeilen[2]).toHaveTextContent('Teambesprechung');
  });

  it('sagt, wenn der Stand nicht frisch ist', () => {
    rendern([eintrag({})], Date.parse('2027-01-04T06:15:00.000Z'));
    expect(screen.getByText(/Stand 07:15 Uhr, kann veraltet sein/)).toBeInTheDocument();
  });

  it('sagt an einem leeren Tag, dass nichts ansteht', () => {
    rendern([]);
    expect(screen.getByText('Keine Termine an diesem Tag.')).toBeInTheDocument();
  });
});
