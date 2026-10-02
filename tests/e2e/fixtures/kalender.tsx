import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { CalendarPage } from '@/features/appointments/CalendarPage';
import { bereichFuer } from '@/features/appointments/calendar';
import { todayInTimeZone, type CalendarEntry } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import type { WorkingHour } from '@/features/scheduling/api';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `kalender.html` (UX-EPIC-002, BEF-035 bis BEF-039).
 *
 * Der Kalender mit Rahmen, Kopfzeile und Tableiste, wie ihn eine
 * therapeutische Rolle sieht — mit erfundenen Terminen am heutigen Tag, ohne
 * Server: Die Abfragen des gezeigten Tages und seiner Woche sind vorab
 * gefüllt und veralten nicht. Wer blättert, verlässt den gefüllten Bereich;
 * dann meldet die Seite, dass nichts geladen werden konnte.
 *
 * `?rolle=trainer` zeigt denselben Kalender, wie ihn die Trainingsbetreuung
 * sieht (TRN-006): Toms Spalte mit seinen Trainingsterminen, sonst nichts.
 */
const ZONE = 'Europe/Berlin';
const heute = todayInTimeZone(ZONE);

const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';
const ORT = '33333333-3333-4333-8333-000000000001';
const TOM = '55555555-5555-4555-8555-000000000006';
const alsTrainer = new URLSearchParams(window.location.search).get('rolle') === 'trainer';

const nutzer: CurrentUser = alsTrainer
  ? {
      profile: {
        id: '11111111-1111-4111-8111-000000000007',
        organization_id: '22222222-2222-4222-8222-000000000001',
        person_id: '44444444-4444-4444-8444-000000000010',
        display_name: 'Tom Trainingsbetreuung',
        is_active: true,
      },
      roles: ['trainer'],
      organizationName: 'Test Praxis Tuebingen',
      organizationTimeZone: ZONE,
      appointmentGridMinutes: 5,
      staffMemberId: TOM,
      revenueShare: false,
    }
  : {
      profile: {
        id: '11111111-1111-4111-8111-000000000002',
        organization_id: '22222222-2222-4222-8222-000000000001',
        person_id: '44444444-4444-4444-8444-000000000002',
        display_name: 'Anna Beispiel',
        is_active: true,
      },
      roles: ['therapist'],
      organizationName: 'Test Praxis Tuebingen',
      organizationTimeZone: ZONE,
      appointmentGridMinutes: 5,
      staffMemberId: ANNA,
      revenueShare: false,
    };

/** Versatz der Praxiszeitzone am heutigen Tag, etwa `+02:00`. */
function versatz(): string {
  const teil = new Intl.DateTimeFormat('en', { timeZone: ZONE, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${heute}T12:00:00Z`))
    .find((t) => t.type === 'timeZoneName')!.value; // „GMT+2"
  const stunden = Number(teil.replace('GMT', '') || '0');
  return `${stunden < 0 ? '-' : '+'}${String(Math.abs(stunden)).padStart(2, '0')}:00`;
}

function zeitpunkt(zeit: string): string {
  return new Date(`${heute}T${zeit}:00${versatz()}`).toISOString();
}

let laufend = 0;
function termin(
  person: string,
  von: string,
  bis: string,
  name: [string, string] | null,
  titel: string | null = null,
): CalendarEntry {
  laufend += 1;
  return {
    id: `77777777-7777-4777-8777-${String(laufend).padStart(12, '0')}`,
    patient_id: name ? `66666666-6666-4666-8666-${String(laufend).padStart(12, '0')}` : null,
    staff_member_id: person,
    location_id: ORT,
    appointment_type: name ? 'home_visit' : 'practice',
    kind: name ? 'therapy' : 'internal',
    title: titel,
    status: 'confirmed',
    starts_at: zeitpunkt(von),
    ends_at: zeitpunkt(bis),
    patient_given_name: name?.[0] ?? null,
    patient_family_name: name?.[1] ?? null,
    staff_given_name: person === ANNA ? 'Anna' : 'Tim',
    staff_family_name: person === ANNA ? 'Beispiel' : 'Teamleitung',
    location_name: 'Hauptstandort Tuebingen',
  };
}

/** Ein Trainingstermin bei Tom - der Name kommt aus dem Training (TRN-006). */
function training(von: string, bis: string, name: [string, string]): CalendarEntry {
  laufend += 1;
  return {
    id: `77777777-7777-4777-8777-${String(laufend).padStart(12, '0')}`,
    patient_id: null,
    staff_member_id: TOM,
    location_id: ORT,
    appointment_type: 'practice',
    kind: 'training',
    title: null,
    status: 'confirmed',
    starts_at: zeitpunkt(von),
    ends_at: zeitpunkt(bis),
    patient_given_name: null,
    patient_family_name: null,
    staff_given_name: 'Tom',
    staff_family_name: 'Trainingsbetreuung',
    location_name: 'Hauptstandort Tuebingen',
    training_relationship_id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
    training_given_name: name[0],
    training_family_name: name[1],
  };
}

const TRAININGSTERMINE: CalendarEntry[] = [
  training('10:00', '11:00', ['Tina', 'Trainingskundin']),
  training('17:00', '18:00', ['Konstantin', 'Kraftausdauer-Langname']),
];

const PRAXISTERMINE: CalendarEntry[] = [
  termin(ANNA, '08:00', '08:45', ['Berta', 'Bestand']),
  termin(ANNA, '09:15', '10:15', ['Carl', 'Muster']),
  termin(ANNA, '11:00', '11:45', ['Dora', 'Probe']),
  termin(ANNA, '13:00', '13:30', null, 'Teambesprechung'),
  termin(ANNA, '14:00', '15:00', ['Emil', 'Beispiel']),
  termin(TIM, '08:30', '09:30', ['Frida', 'Test']),
  termin(TIM, '10:00', '10:45', ['Gustav', 'Vorlage']),
  termin(TIM, '15:30', '16:30', ['Hanna', 'Muster']),
];

const TERMINE = alsTrainer ? TRAININGSTERMINE : PRAXISTERMINE;

const WOCHENPLAN: WorkingHour[] = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
  { id: `a${weekday}`, staff_member_id: ANNA, weekday, starts_at: '08:00', ends_at: '16:00' },
  { id: `t${weekday}`, staff_member_id: TIM, weekday, starts_at: '08:30', ends_at: '17:00' },
]);

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
// Die Spalten des Kalenders unter dem Schlüssel der Seite (TRN-006): die
// Therapeutin fragt nur die behandelnden Personen, die Trainingsbetreuung nur
// die Trainingsbetreuung.
const praxis = [
  { staff_member_id: ANNA, display_name: 'Anna Beispiel' },
  { staff_member_id: TIM, display_name: 'Tim Teamleitung' },
];
const betreuung = [{ staff_member_id: TOM, display_name: 'Tom Trainingsbetreuung' }];
client.setQueryData(
  ['calendar-staff', !alsTrainer, alsTrainer],
  alsTrainer
    ? { alle: betreuung, behandlung: new Set<string>(), training: new Set([TOM]) }
    : {
        alle: praxis,
        behandlung: new Set(praxis.map((p) => p.staff_member_id)),
        training: new Set<string>(),
      },
);
client.setQueryData(['locations'], [{ id: ORT, name: 'Hauptstandort Tuebingen' }]);
client.setQueryData(['working-hours'], WOCHENPLAN);
for (const ansicht of ['tag', 'woche'] as const) {
  const { von, bis } = bereichFuer(ansicht, heute);
  client.setQueryData(['working-hour-exceptions', von, bis], []);
  for (const person of [null, ANNA, TIM, TOM]) {
    const eigene = person ? TERMINE.filter((t) => t.staff_member_id === person) : TERMINE;
    client.setQueryData(['appointments', von, bis, person, null, 'active'], eigene);
    // ABN-021 (BEF-112): eine Behandlung zur Mittagszeit, ohne lesbaren Termin.
    client.setQueryData(
      ['busy-blocks', von, bis, person],
      alsTrainer
        ? [{ staff_member_id: TOM, starts_at: zeitpunkt('12:30'), ends_at: zeitpunkt('13:30') }]
        : [],
    );
  }
}

const start = new URLSearchParams(window.location.search).get('start') ?? `ansicht=tag`;

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[`/kalender?${start}&datum=${heute}`]}>
      <AppShell user={nutzer} onSignOut={() => undefined}>
        <CalendarPage user={nutzer} />
      </AppShell>
    </MemoryRouter>
  </QueryClientProvider>,
);
