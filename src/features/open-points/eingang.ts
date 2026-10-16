import { queryOptions, useQuery } from '@tanstack/react-query';
import { tagePlus } from '@/features/appointments/calendar';
import { FAELLIG_SCHLUESSEL, fetchFaellige, type Bereich } from '@/features/exercise-plans/api';
import { fetchOffeneScans } from '@/features/files/api';
import { fetchRueckfragen, rueckfragenKey, type Verhaeltnisart } from '@/features/messages/api';
import {
  canConcludePatientCare,
  canDecideStaffRequests,
  canManageAppointments,
  canManageInvoicing,
  canManageTasks,
  canReadPatientDirectory,
  canReadTrainingClients,
  canReadTreatmentBases,
  canWriteExercisePlans,
  canWriteTreatmentBases,
  isTherapyStaff,
  type CurrentUser,
} from '@/features/session/types';
import { fetchWaitlist } from '@/features/waitlist/api';
import { fetchUrlaub, urlaubSchluessel, type Urlaubsstand } from '@/features/vacation/api';
import { urlaubsfenster } from '@/features/vacation/fenster';
import { ABO_KUENDIGUNGEN_KEY, fetchAboKuendigungen } from './aftercare-cancellations-api';
import { CALL_LIST_KEY, fetchCallList, stillToCall } from './call-list-api';
import { CONSENT_WITHDRAWALS_KEY, fetchConsentWithdrawals } from './consent-withdrawals-api';
import { OPEN_INTAKES_KEY, fetchOpenIntakes } from './intake-api';
import { PLATFORM_REQUESTS_KEY, fetchPlatformRequests } from './platform-requests-api';
import {
  ENDING_KEY,
  IDLE_KEY,
  fetchCareWithoutConclusion,
  fetchEndingPrescriptions,
} from './reminders-api';
import { PATIENT_OVERVIEW_KEY, fetchPatientOverview } from '@/features/patients/uebersicht';
import { TASKS_KEY, fetchTasks } from './tasks-api';
import { TRAININGSWIDERRUFE_KEY, fetchTrainingswiderrufe } from './training-withdrawals-api';

/**
 * Der Eingang „Offene Punkte" als ein Ganzes (Design-Rollout B5, ANN-450).
 *
 * Bis dahin standen 13 Listen untereinander, jede mit eigener Kopfzeile und
 * eigenem Satz für „nichts da" - am Telefon waren sieben von zehn Abschnitten
 * nur „Kein …". Jetzt erscheint eine Gruppe nur, wenn sie etwas enthält, und
 * ist alles leer, sagt die Seite es einmal: „Nichts offen".
 *
 * Dafür muss die Seite wissen, ob jede Gruppe geladen und leer ist. Die
 * Abfragen stehen deshalb hier, an einer Stelle: Jede Gruppe liest ihre Liste
 * über dieselbe Abfrage wie die Seite - derselbe Schlüssel, dieselbe Funktion,
 * also **ein** Aufruf je Liste (TanStack Query legt gleiche Abfragen
 * zusammen). Gelesen wird nichts, was die Seite nicht schon las; was eine
 * Rolle nicht sehen darf, fragt sie gar nicht erst ab - verbindlich prüft der
 * Server (ADR-004).
 */

/** Fotos vom Termin, die an keiner Grundlage hängen (PRX-011). */
export const OPEN_SCANS_KEY = ['open-points', 'prescription-scans'] as const;

/** Wartelisteneinträge, die seit acht Wochen niemand angefasst hat (ABN-018). */
export const WAITLIST_REVIEW_KEY = ['open-points', 'waitlist-review'] as const;

/** Die Abfragen der Gruppen - geteilt von Seite und Gruppe. */
export const abfragen = {
  terminwuensche: () =>
    queryOptions({
      queryKey: PLATFORM_REQUESTS_KEY,
      queryFn: () => fetchPlatformRequests('open'),
      retry: false,
    }),
  // URL-001 (ANN-576): offene Urlaubsanträge für die, die entscheiden -
  // dieselbe Abfrage wie die Urlaubsseite, ein Schlüssel.
  urlaub: (heute: string) => {
    const fenster = urlaubsfenster(heute);
    return queryOptions({
      queryKey: urlaubSchluessel(fenster.von, fenster.bis),
      queryFn: () => fetchUrlaub(fenster.von, fenster.bis),
      retry: false,
      select: (stand: Urlaubsstand) => stand.to_decide,
    });
  },
  aufgaben: () =>
    queryOptions({
      queryKey: [...TASKS_KEY, 'open'],
      queryFn: () => fetchTasks('open'),
      retry: false,
    }),
  anrufe: (morgen: string) =>
    queryOptions({
      queryKey: [...CALL_LIST_KEY, morgen],
      queryFn: () => fetchCallList(morgen),
      retry: false,
    }),
  widerrufe: () =>
    queryOptions({
      queryKey: CONSENT_WITHDRAWALS_KEY,
      queryFn: fetchConsentWithdrawals,
      retry: false,
    }),
  trainingswiderrufe: () =>
    queryOptions({
      queryKey: TRAININGSWIDERRUFE_KEY,
      queryFn: fetchTrainingswiderrufe,
      retry: false,
    }),
  kuendigungen: () =>
    queryOptions({
      queryKey: ABO_KUENDIGUNGEN_KEY,
      queryFn: fetchAboKuendigungen,
      retry: false,
    }),
  scans: () =>
    queryOptions({
      queryKey: OPEN_SCANS_KEY,
      queryFn: fetchOffeneScans,
      retry: false,
    }),
  erstaufnahmen: () =>
    queryOptions({
      queryKey: OPEN_INTAKES_KEY,
      queryFn: fetchOpenIntakes,
      retry: false,
    }),
  verordnungEndet: () =>
    queryOptions({
      queryKey: ENDING_KEY,
      queryFn: fetchEndingPrescriptions,
      retry: false,
    }),
  warteliste: () =>
    queryOptions({
      queryKey: WAITLIST_REVIEW_KEY,
      queryFn: () => fetchWaitlist('open'),
      retry: false,
      select: (eintraege) => eintraege.filter((e) => e.review_due),
    }),
  // Zweitreview A: Akten ohne jede Behandlung haben keinen Fristanker.
  ohneBehandlung: () =>
    queryOptions({
      queryKey: IDLE_KEY,
      queryFn: fetchCareWithoutConclusion,
      retry: false,
    }),
  // B1 (BEF-151): Verordnungen, die Termine oder die Abrechnung brauchen -
  // dieselbe Abfrage wie die Patientenliste, ein Schlüssel.
  verordnungOffen: () =>
    queryOptions({
      queryKey: PATIENT_OVERVIEW_KEY,
      queryFn: fetchPatientOverview,
      retry: false,
      select: (liste) =>
        liste.filter((eintrag) => eintrag.bases_need_appointments > 0 || eintrag.bases_ready > 0),
    }),
};

/** Was die Rolle im Eingang sieht - dieselben Regeln wie bisher je Liste. */
export function eingangsrechte(user: CurrentUser) {
  const rollen = user.roles;
  // KOM-002 (ANN-309): die Rückfragen der Bereiche, die die Person liest.
  const rueckfrageBereiche: Verhaeltnisart[] = [
    ...(isTherapyStaff(rollen) ? (['treatment'] as const) : []),
    ...(canReadTrainingClients(rollen) ? (['training'] as const) : []),
  ];
  // UEB-007: die Pläne der Bereiche, die die Person schreibt (ANN-302).
  const planBereiche: Bereich[] = (['therapy', 'training'] as const).filter((bereich) =>
    canWriteExercisePlans(rollen, bereich),
  );
  return {
    rueckfrageBereiche,
    planBereiche,
    rueckfragen: rueckfrageBereiche.length > 0,
    terminwuensche: canManageAppointments(rollen) || canReadTrainingClients(rollen),
    urlaubsantraege: canDecideStaffRequests(rollen),
    aufgaben: canManageTasks(rollen),
    anrufe: canManageAppointments(rollen),
    // ANG-003 und KND-004: wer Abo und Paket führt (owner, office).
    trainingswiderrufe: canManageInvoicing(rollen),
    widerrufe: canReadPatientDirectory(rollen) || canReadTrainingClients(rollen),
    kuendigungen: canManageInvoicing(rollen),
    scans: canWriteTreatmentBases(rollen),
    erstaufnahmen: canReadPatientDirectory(rollen),
    verordnungEndet: canReadTreatmentBases(rollen),
    plaene: planBereiche.length > 0,
    warteliste: canManageAppointments(rollen),
    verordnungOffen: canReadTreatmentBases(rollen),
    ohneBehandlung: canConcludePatientCare(rollen),
  };
}

export type Eingangsrechte = ReturnType<typeof eingangsrechte>;

/** Der Stand einer Gruppe für die Seite. */
interface Gruppe {
  aktiv: boolean;
  isPending: boolean;
  isError: boolean;
  anzahl: number;
  /**
   * Eine stille Gruppe zeigte schon vor dem Umbau bei einem Ladefehler nichts
   * (Widerrufe, Kündigungen): Sie zählt dann als leer, wie bisher.
   */
  still?: boolean;
}

/**
 * Lädt der Eingang noch, und ist alles leer?
 *
 * `laedt`, solange eine Gruppe, die die Rolle sieht, noch keine Antwort hat;
 * `nichtsOffen`, wenn alle geantwortet haben, keine etwas enthält und keine
 * mit einem Fehler steht - ein gescheitertes Laden ist nie „nichts offen".
 * `anrufeOffen` sagt, ob morgen noch jemand anzurufen ist.
 */
export function useEingang(user: CurrentUser, today: string) {
  const darf = eingangsrechte(user);
  const morgen = tagePlus(today, 1);

  const rueckfragen = useQuery({
    queryKey: rueckfragenKey(null, null, false),
    queryFn: () => fetchRueckfragen(null),
    enabled: darf.rueckfragen,
    retry: false,
  });
  const terminwuensche = useQuery({ ...abfragen.terminwuensche(), enabled: darf.terminwuensche });
  const urlaub = useQuery({ ...abfragen.urlaub(today), enabled: darf.urlaubsantraege });
  const aufgaben = useQuery({ ...abfragen.aufgaben(), enabled: darf.aufgaben });
  const anrufe = useQuery({ ...abfragen.anrufe(morgen), enabled: darf.anrufe });
  const trainingswiderrufe = useQuery({
    ...abfragen.trainingswiderrufe(),
    enabled: darf.trainingswiderrufe,
  });
  const widerrufe = useQuery({ ...abfragen.widerrufe(), enabled: darf.widerrufe });
  const kuendigungen = useQuery({ ...abfragen.kuendigungen(), enabled: darf.kuendigungen });
  const scans = useQuery({ ...abfragen.scans(), enabled: darf.scans });
  const erstaufnahmen = useQuery({ ...abfragen.erstaufnahmen(), enabled: darf.erstaufnahmen });
  const verordnungEndet = useQuery({
    ...abfragen.verordnungEndet(),
    enabled: darf.verordnungEndet,
  });
  // Dieselbe Abfrage wie „Pläne laufen aus" (exercise-plans/Wiedervorlage).
  const plaene = useQuery({
    queryKey: FAELLIG_SCHLUESSEL,
    queryFn: fetchFaellige,
    enabled: darf.plaene,
    retry: false,
  });
  const warteliste = useQuery({ ...abfragen.warteliste(), enabled: darf.warteliste });
  const verordnungOffen = useQuery({
    ...abfragen.verordnungOffen(),
    enabled: darf.verordnungOffen,
  });
  const ohneBehandlung = useQuery({ ...abfragen.ohneBehandlung(), enabled: darf.ohneBehandlung });

  const anrufeOffen = (anrufe.data ?? []).filter(stillToCall).length;

  const gruppen: Gruppe[] = [
    {
      aktiv: darf.rueckfragen,
      ...rueckfragen,
      anzahl: (rueckfragen.data ?? []).filter(
        (z) => z.status === 'open' && darf.rueckfrageBereiche.includes(z.relationship_kind),
      ).length,
    },
    { aktiv: darf.terminwuensche, ...terminwuensche, anzahl: terminwuensche.data?.length ?? 0 },
    { aktiv: darf.urlaubsantraege, ...urlaub, anzahl: urlaub.data?.length ?? 0 },
    { aktiv: darf.aufgaben, ...aufgaben, anzahl: aufgaben.data?.length ?? 0 },
    { aktiv: darf.anrufe, ...anrufe, anzahl: anrufeOffen },
    {
      aktiv: darf.trainingswiderrufe,
      ...trainingswiderrufe,
      anzahl: trainingswiderrufe.data?.length ?? 0,
      still: true,
    },
    { aktiv: darf.widerrufe, ...widerrufe, anzahl: widerrufe.data?.length ?? 0, still: true },
    {
      aktiv: darf.kuendigungen,
      ...kuendigungen,
      anzahl: kuendigungen.data?.length ?? 0,
      still: true,
    },
    { aktiv: darf.scans, ...scans, anzahl: scans.data?.length ?? 0 },
    { aktiv: darf.erstaufnahmen, ...erstaufnahmen, anzahl: erstaufnahmen.data?.length ?? 0 },
    { aktiv: darf.verordnungEndet, ...verordnungEndet, anzahl: verordnungEndet.data?.length ?? 0 },
    {
      aktiv: darf.plaene,
      ...plaene,
      anzahl: (plaene.data?.plans ?? []).filter((p) => darf.planBereiche.includes(p.service_area))
        .length,
    },
    { aktiv: darf.warteliste, ...warteliste, anzahl: warteliste.data?.length ?? 0 },
    { aktiv: darf.verordnungOffen, ...verordnungOffen, anzahl: verordnungOffen.data?.length ?? 0 },
    { aktiv: darf.ohneBehandlung, ...ohneBehandlung, anzahl: ohneBehandlung.data?.length ?? 0 },
  ];

  const sichtbar = gruppen.filter((g) => g.aktiv);
  // Eine abgeschaltete Abfrage steht immer auf „pending" - deshalb nur die
  // Gruppen, die die Rolle sieht.
  const laedt = sichtbar.some((g) => g.isPending && !g.isError);
  const nichtsOffen =
    !laedt && sichtbar.every((g) => (g.isError ? g.still === true : g.anzahl === 0));

  return { darf, morgen, laedt, nichtsOffen, anrufeOffen };
}
