import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Section } from '@/components/ui/Section';
import type { Antwort, Antworten } from '@/features/assessments/antworten';
import { ErhebungAnsicht } from '@/features/assessments/ErhebungAnsicht';
import { FragebogenFelder } from '@/features/assessments/FragebogenFelder';
import { Hervorhebungen } from '@/features/assessments/Hervorhebungen';
import { Befund } from '@/features/assessments/PatientBefundPage';
import { erhebungenQueryKey } from '@/features/assessments/api';
import { ereignisseQueryKey } from '@/features/assessments/verlauf';
import type { Patient } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { instrumentFuer } from '@/features/assessments/instrumente';
import { Ereignisliste, Messreihenbild } from '@/features/assessments/Messreihenbild';
import { messreihen, type Verlaufsereignis } from '@/features/assessments/verlauf';
import type { Erhebung } from '@/features/assessments/api';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `befund.html` (FRB-EPIC-002).
 *
 * Synthetische Antworten, kein Server, kein Router: gezeigt wird, was der
 * Befund der Akte und die Erhebungsseite aus den Komponenten machen.
 */
const anamnese = instrumentFuer('anamnese_v8')!;

const BEISPIEL: Antworten = {
  beschwerden_ort: {
    markierungen: [
      { x: 0.726, y: 0.387, bereich: 'lws' },
      { x: 0.762, y: 0.481, bereich: 'gesaess_rechts' },
      { x: 0.24, y: 0.668, bereich: 'knie_rechts' },
    ],
  },
  schmerzen_aktuell: { auswahl: 'ja' },
  schmerzstaerke: { wert: 6 },
  schmerzart: { auswahl: ['nachtschmerzen'] },
  symptome_allgemein: { auswahl: ['nachtschweiss', 'gewichtsverlust'] },
  tumor: { auswahl: 'nein' },
  erkrankungen: { auswahl: ['andere_erkrankung'], freitext: 'Gicht' },
  beschwerden_seit: { text: 'seit etwa sechs Wochen, nach Umzug' },
};

function erhebung(id: string, datum: string, wert: number): Erhebung {
  return {
    id,
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'abgeschlossen',
    recorded_on: datum,
    answers: { schmerzstaerke: { wert }, schmerz_durchschnitt: { wert: wert - 1 } },
    supersedes_response_id: null,
    superseded_by_response_id: null,
    change_reason: null,
    created_at: '',
    updated_at: '',
    completed_at: `${datum}T08:00:00Z`,
    author_name: 'Anna Beispiel',
    completed_by_name: 'Anna Beispiel',
    source: 'practice',
  };
}

const EREIGNISSE: Verlaufsereignis[] = [
  {
    id: 'v1',
    occurred_on: '2026-08-20',
    kind: 'erkrankung',
    note: 'zwei Wochen Grippe',
    created_at: '',
    author_name: null,
  },
];

export function Seite() {
  const [antworten, setAntworten] = useState<Antworten>(BEISPIEL);
  const setzen = useCallback((itemId: string, antwort: Antwort | undefined) => {
    setAntworten((bisher) => {
      const neu = { ...bisher };
      if (antwort === undefined) delete neu[itemId];
      else neu[itemId] = antwort;
      return neu;
    });
  }, []);

  const reihen = messreihen(
    [
      erhebung('a', '2026-08-03', 7),
      erhebung('b', '2026-09-01', 6),
      erhebung('c', '2026-09-22', 4),
    ],
    [anamnese],
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-6">
      <Section titel="Hervorgehobene Angaben">
        <Hervorhebungen definition={anamnese} antworten={antworten} datum="2026-09-22" />
      </Section>
      <Section titel="Antworten">
        <ErhebungAnsicht definition={anamnese} antworten={antworten} />
      </Section>
      <Section titel="Verlauf">
        <div className="flex flex-col gap-6">
          {reihen.map((reihe) => (
            <Messreihenbild
              key={reihe.item.id}
              reihe={reihe}
              ereignisse={EREIGNISSE}
              termine={['2026-08-05', '2026-08-12', '2026-09-03', '2026-09-10', '2026-09-17']}
            />
          ))}
          <Ereignisliste ereignisse={EREIGNISSE} />
        </div>
      </Section>
      <Section titel="Erhebung">
        <FragebogenFelder definition={anamnese} antworten={antworten} onChange={setzen} />
      </Section>
    </div>
  );
}

/**
 * `?ansicht=akte`: der Befund, wie er in der Akte unter `doku/befund` steht
 * (Design-Rollout B4) - mit Liege, Bögen, Messverlauf und Ereignissen aus
 * dem Speicher, ohne Server.
 */
const PATIENT = '66666666-6666-4666-8666-000000000001';

const patient: Patient = {
  id: PATIENT,
  status: 'active',
  care_started_on: '2026-08-01',
  care_concluded_on: null,
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1961-03-12',
  email: null,
  phone: null,
  phone_work: null,
  phone_mobile: null,
  institution: null,
  street: null,
  house_number: null,
  postal_code: null,
  city: null,
  primary_therapist_staff_member_id: null,
  primary_therapist_name: 'Anna Beispiel',
  home_visit_access_note: null,
  special_note: null,
  remark: null,
  geocode_precision: 'address',
  treatment_table_required: false,
  take_along_items: [],
};

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: 'Anna Beispiel',
    is_active: true,
  },
  roles: ['therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000002',
  revenueShare: false,
};

function InDerAkte() {
  const [client] = useState(() => {
    const neu = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    neu.setQueryData(erhebungenQueryKey(PATIENT), [
      { ...erhebung('a', '2026-08-03', 7), answers: BEISPIEL },
      erhebung('b', '2026-09-01', 6),
      { ...erhebung('c', '2026-09-22', 4), status: 'entwurf', completed_at: null },
    ]);
    neu.setQueryData(ereignisseQueryKey(PATIENT), EREIGNISSE);
    neu.setQueryData(['verlauf-termine', PATIENT], []);
    return neu;
  });
  const [router] = useState(() =>
    createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <main className="max-w-inhalt mx-auto w-full min-w-0 px-4 pt-4 pb-28 sm:px-6 sm:pt-6 sm:pb-10 lg:px-8 lg:pb-12">
              <Befund patient={patient} user={nutzer} />
            </main>
          ),
        },
      ],
      { initialEntries: [`/patienten/${PATIENT}/doku/befund`] },
    ),
  );
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
createRoot(wurzel).render(
  new URLSearchParams(window.location.search).get('ansicht') === 'akte' ? <InDerAkte /> : <Seite />,
);
