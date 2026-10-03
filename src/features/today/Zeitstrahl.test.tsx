import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type { DayPlanEntry } from './api';
import { Zeitstrahl } from './Zeitstrahl';
import type { Anfahrt } from './tagesstart';

/**
 * Der Zeitstrahl der Übersicht (Design-Handoff 2026-10-01, Abschnitte 5 und
 * 5a): alle Termine des Tages an einer Schiene, einer ausgeklappt, die
 * Jetzt-Marke vor dem ersten, der noch nicht begonnen hat.
 */

const HEUTE = '2026-09-26';

/** Ein Zeitpunkt des Tages aus einer UTC-Uhrzeit; Sommerzeit: 07:00Z ist 09:00 in Berlin. */
function zeitpunkt(um: string): number {
  return Date.parse(`${HEUTE}T${um}:00.000Z`);
}

function eintrag(
  teil: Partial<DayPlanEntry> & { id: string; um: string; bis: string },
): DayPlanEntry {
  const { um, bis, ...rest } = teil;
  return {
    patient_id: `p-${teil.id}`,
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: `${HEUTE}T${um}:00.000Z`,
    ends_at: `${HEUTE}T${bis}:00.000Z`,
    patient_given_name: 'Test',
    patient_family_name: teil.id,
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    ...rest,
  };
}

const erika = eintrag({ id: 'a', um: '06:30', bis: '07:30', patient_family_name: 'Erika' });
const max = eintrag({
  id: 'b',
  um: '08:00',
  bis: '09:00',
  patient_family_name: 'Max',
  visit_street: 'Beispielstrasse',
  visit_house_number: '12',
});
const petra = eintrag({ id: 'c', um: '09:30', bis: '10:30', patient_family_name: 'Petra' });
const plan = [erika, max, petra];
const anfahrten = new Map<string, Anfahrt>([
  ['a', { minuten: 12, vorher: null }],
  ['b', { minuten: 9, vorher: erika }],
  ['c', { minuten: 26, vorher: max }],
]);

function zeichne(
  teil: Partial<Parameters<typeof Zeitstrahl>[0]> & { plan?: readonly DayPlanEntry[] } = {},
) {
  return renderWithProviders(
    <Zeitstrahl
      plan={plan}
      fokusId="a"
      jetzt={zeitpunkt('06:05')}
      zeitzone="Europe/Berlin"
      anfahrten={anfahrten}
      karte={<article>Karte von Erika</article>}
      {...teil}
    />,
  );
}

/** Die Einträge der Liste in Reihenfolge: Terminkennung oder „jetzt". */
function reihenfolge(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((eintrag) =>
      eintrag.hasAttribute('data-jetzt') ? 'jetzt' : (eintrag.getAttribute('data-termin') ?? '?'),
    );
}

describe('Zeitstrahl', () => {
  it('stellt alle Termine in Uhrzeitfolge an die Schiene, mit der Uhrzeit der Praxis', async () => {
    const { container } = zeichne();

    expect(screen.getByRole('heading', { level: 2, name: 'Tagesablauf' })).toHaveClass('sr-only');
    expect(reihenfolge()).toEqual(['jetzt', 'a', 'b', 'c']);
    // 06:30Z ist 08:30 in Berlin - die Zeit der Praxis, nicht die des Geräts.
    const zeilen = screen.getAllByRole('listitem');
    expect(within(zeilen[1]!).getByText('08:30')).toHaveClass('tabular-nums', 'font-semibold');
    expect(within(zeilen[2]!).getByText('10:00')).toBeInTheDocument();
    expect(within(zeilen[3]!).getByText('11:30')).toBeInTheDocument();

    await pruefeBarrierefreiheit(container);
  });

  it('setzt die Jetzt-Marke vor den ersten Termin, der noch nicht begonnen hat', () => {
    const { unmount } = zeichne({ jetzt: zeitpunkt('06:05') });
    expect(reihenfolge()).toEqual(['jetzt', 'a', 'b', 'c']);
    expect(screen.getByText('Jetzt, 08:05 Uhr')).toHaveClass('sr-only');
    unmount();

    // Während der erste Besuch läuft, steht sie hinter ihm.
    const laeuft = zeichne({ jetzt: zeitpunkt('06:40') });
    expect(reihenfolge()).toEqual(['a', 'jetzt', 'b', 'c']);
    laeuft.unmount();

    // Genau zum Beginn zählt der Termin als begonnen.
    const beginn = zeichne({ jetzt: zeitpunkt('08:00') });
    expect(reihenfolge()).toEqual(['a', 'b', 'jetzt', 'c']);
    beginn.unmount();

    // Am Abend steht sie am Ende des Strahls.
    zeichne({ jetzt: zeitpunkt('15:00'), fokusId: null });
    expect(reihenfolge()).toEqual(['a', 'b', 'c', 'jetzt']);
    expect(screen.getByText('Jetzt, 17:00 Uhr')).toBeInTheDocument();
  });

  it('klappt genau einen Termin aus und macht alle anderen zu einer Zeile, die in den Termin fuehrt', () => {
    zeichne();

    const erste = screen.getAllByRole('listitem')[1]!;
    expect(within(erste).getByText('Karte von Erika')).toBeInTheDocument();
    // Der ausgeklappte Termin ist keine Zeile: Seine Ziele trägt die Karte.
    expect(within(erste).queryByRole('link')).toBeNull();

    const zeile = screen.getByRole('link', { name: /Test Max/ });
    expect(zeile).toHaveAttribute('href', `/kalender?termin=b&zurueck=${encodeURIComponent('/')}`);
    // Ein Tippziel von 44 px, und die ganze Zeile gehört dazu.
    expect(zeile).toHaveClass('min-h-11');
    expect(zeile).toHaveTextContent('Beispielstrasse 12 · Anfahrt ≈ 9 min');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('nennt den Ort statt der Art und die Anfahrt nur, solange der Besuch aussteht', () => {
    zeichne({
      plan: [
        { ...erika, status: 'documented', documentation_status: 'final' },
        max,
        eintrag({
          id: 'v',
          um: '09:30',
          bis: '10:15',
          patient_family_name: 'Video',
          appointment_type: 'video',
          visit_street: null,
          visit_house_number: null,
        }),
        eintrag({
          id: 'f',
          um: '11:00',
          bis: '12:00',
          kind: 'internal',
          patient_id: null,
          title: 'Teambesprechung',
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
          visit_street: null,
          visit_house_number: null,
        }),
      ],
      fokusId: 'b',
      jetzt: zeitpunkt('07:40'),
    });

    // Erledigt: Straße ohne Anfahrt, gedämpft, mit Abzeichen.
    const erledigt = screen.getByRole('link', { name: /Test Erika/ });
    expect(erledigt).toHaveTextContent('Testweg 7');
    expect(erledigt).not.toHaveTextContent('Anfahrt');
    expect(within(erledigt).getByText('Dokumentiert')).toBeInTheDocument();
    expect(within(erledigt).getByText('Test Erika')).toHaveClass('text-ink-muted', 'font-medium');
    // Der Hausbesuch trägt kein Wort (ANN-192).
    expect(erledigt).not.toHaveTextContent('Hausbesuch');

    expect(screen.getByRole('link', { name: /Test Video/ })).toHaveTextContent('Video');
    const fehlzeit = screen.getByRole('link', { name: /Teambesprechung/ });
    expect(fehlzeit).toHaveTextContent('Fehlzeit · Praxis · Hauptstandort');
    expect(fehlzeit).toHaveAttribute(
      'href',
      `/kalender?termin=f&zurueck=${encodeURIComponent('/')}`,
    );
    // „Steht aus" ist der Regelfall und trägt kein Abzeichen (UX-005h).
    expect(screen.queryByText('Steht aus')).toBeNull();
  });

  it('fuehrt am Trainingstermin in den Trainingsbereich und nennt den Namen aus dem Training (TRN-006)', () => {
    zeichne({
      plan: [
        erika,
        eintrag({
          id: 't',
          um: '08:00',
          bis: '09:00',
          kind: 'training',
          patient_id: null,
          patient_given_name: null,
          patient_family_name: null,
          training_given_name: 'Tina',
          training_family_name: 'Training',
        }),
      ],
    });
    const zeile = screen.getByRole('link', { name: /Tina Training/ });
    expect(zeile).toHaveAttribute('href', `/training/termine/t?zurueck=${encodeURIComponent('/')}`);
    expect(zeile).toHaveTextContent('Training · Testweg 7');
  });

  it('legt ueber jeden spaeteren Hausbesuch mit bekannter Fahrzeit einen schmalen Wegbalken', () => {
    zeichne();

    const [, erste, zweite, dritte] = screen.getAllByRole('listitem');
    // Der ausgeklappte Termin trägt keinen - sein Weg steht im großen Balken.
    expect(within(erste!).queryByText(/min Rad/)).toBeNull();
    // 09:30 bis 10:00: 30 Minuten, 9 davon Fahrt.
    expect(within(zweite!).getByText('≈ 9 min Rad · 21 min Puffer')).toHaveClass('text-accent');
    // 11:00 bis 11:30: 30 Minuten, 26 Fahrt - knapp, mit Zeichen und Wort.
    const knapp = within(dritte!).getByText(/26 min Rad/);
    expect(knapp.textContent).toBe('! ≈ 26 min Rad · 4 min Puffer');
    expect(knapp).toHaveClass('text-warnung');
  });

  it('zeigt keinen Wegbalken an Praxis, Video und Fehlzeit, ohne Fahrzeit oder ohne Termin davor', () => {
    const praxis = eintrag({
      id: 'p',
      um: '08:00',
      bis: '09:00',
      patient_family_name: 'Praxis',
      appointment_type: 'practice',
      location_name: 'Hauptstandort',
    });
    const fehlzeit = eintrag({
      id: 'f',
      um: '09:10',
      bis: '09:20',
      kind: 'internal',
      patient_id: null,
      title: 'Pause',
    });
    const ohneFahrzeit = eintrag({ id: 'o', um: '09:30', bis: '10:30' });
    const vomStart = eintrag({ id: 's', um: '11:00', bis: '12:00' });
    const erledigt = eintrag({ id: 'e', um: '12:30', bis: '13:30', status: 'completed' });
    zeichne({
      plan: [erika, praxis, fehlzeit, ohneFahrzeit, vomStart, erledigt],
      anfahrten: new Map<string, Anfahrt>([
        ['p', { minuten: 9, vorher: erika }],
        ['f', { minuten: 5, vorher: praxis }],
        ['s', { minuten: 7, vorher: null }],
        ['e', { minuten: 8, vorher: vomStart }],
      ]),
    });
    expect(screen.queryByText(/min Rad/)).toBeNull();
  });

  it('zeichnet den Punkt nach dem Stand des Termins - als Schmuck neben dem Abzeichen', () => {
    const { container } = zeichne({
      plan: [
        { ...erika, status: 'documented', documentation_status: 'final' },
        eintrag({ id: 'n', um: '07:40', bis: '07:50', status: 'no_show' }),
        eintrag({ id: 'x', um: '07:50', bis: '07:55', status: 'cancelled' }),
        max,
        petra,
        eintrag({
          id: 'f',
          um: '05:00',
          bis: '05:30',
          kind: 'internal',
          patient_id: null,
          title: 'Frühbesprechung',
        }),
      ],
      fokusId: 'b',
      jetzt: zeitpunkt('07:20'),
    });
    const punkt = (id: string) =>
      container.querySelector(`[data-termin="${id}"] [data-punkt]`) as HTMLElement;

    expect(punkt('a')).toHaveAttribute('data-punkt', 'erledigt');
    expect(punkt('a')).toHaveTextContent('✓');
    expect(punkt('a')).toHaveClass('bg-accent', 'border-accent');
    // Eine Fehlzeit hat man hinter sich, wenn ihr Ende erreicht ist (UEB-02).
    expect(punkt('f')).toHaveAttribute('data-punkt', 'erledigt');
    expect(punkt('n')).toHaveAttribute('data-punkt', 'ausgefallen');
    expect(punkt('n')).toHaveTextContent('×');
    expect(punkt('x')).toHaveTextContent('×');
    // Der nächste: hohl in der Hauptfarbe, solange er nicht bald beginnt.
    expect(punkt('b')).toHaveAttribute('data-punkt', 'naechster');
    expect(punkt('b')).toHaveClass('border-accent', 'bg-surface');
    expect(punkt('c')).toHaveAttribute('data-punkt', 'spaeter');
    expect(punkt('c')).toHaveClass('border-line-strong');
    // Der Punkt ist für Vorlesesoftware ausgeblendet.
    expect(punkt('a').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('fuellt den Punkt des naechsten Termins ab 30 Minuten vor dem Beginn', () => {
    const punkt = (container: HTMLElement) =>
      container.querySelector('[data-termin="a"] [data-punkt]') as HTMLElement;

    const frueh = zeichne({ jetzt: zeitpunkt('05:59') });
    expect(punkt(frueh.container)).toHaveClass('bg-surface');
    frueh.unmount();

    const bald = zeichne({ jetzt: zeitpunkt('06:00') });
    expect(punkt(bald.container)).toHaveClass('bg-accent');
    expect(punkt(bald.container)).toHaveClass('duration-200');
    bald.unmount();

    const laeuft = zeichne({ jetzt: zeitpunkt('06:45') });
    expect(punkt(laeuft.container)).toHaveClass('bg-accent');
  });

  it('sagt an einem erledigten Besuch, wenn die Dokumentation noch offen ist', () => {
    zeichne({
      plan: [{ ...erika, status: 'completed', documentation_status: 'none' }, max],
      fokusId: 'b',
      jetzt: zeitpunkt('07:40'),
    });
    const zeile = screen.getByRole('link', { name: /Test Erika/ });
    const grund = within(zeile).getByText('Doku offen');
    expect(grund).toHaveClass('text-warnung');
    expect(within(zeile).getByText('Abgeschlossen')).toBeInTheDocument();
  });

  it('kennzeichnet eine abweichende Laenge auch in der Zeile (§8.1, CAL-020)', () => {
    zeichne({
      plan: [erika, eintrag({ id: 'k', um: '08:00', bis: '08:30', patient_family_name: 'Kurz' })],
    });
    const zeile = screen.getByRole('link', { name: /Test Kurz/ });
    expect(within(zeile).getByTestId('laengenzeichen')).toHaveTextContent('30 Min.');
    expect(screen.getAllByTestId('laengenzeichen')).toHaveLength(1);
  });

  it('kommt ohne ausgeklappten Termin und ohne Fahrzeiten aus', () => {
    zeichne({ fokusId: null, anfahrten: new Map(), karte: null });
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByText(/Anfahrt/)).toBeNull();
    expect(screen.queryByText('Karte von Erika')).toBeNull();
  });
});
