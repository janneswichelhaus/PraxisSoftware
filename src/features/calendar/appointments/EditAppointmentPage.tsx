import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { fetchPatient } from '@/features/patients';
import type { CurrentUser } from '@/features/core';
import { AppointmentForm } from './AppointmentForm';
import { UebernommeneAdresse } from './AppointmentFormFields';
import { TerritoryHint } from '@/features/calendar/territories/TerritoryHint';
import { NachladeHinweis } from '@/components/ui/Rueckmeldung';
import {
  appointmentToFormValues,
  fetchAppointment,
  locationSummary,
  terminLaengeMinuten,
  updateAppointment,
} from './api';
import { tageslageNeuLaden } from './tageslage';
import { useAppointmentFormLists } from './useAppointmentFormLists';
import { formatLocalDate, formatLocalTimeRange, todayInTimeZone } from '@/lib/datum';
import {
  patientName,
  type AppointmentType,
  kalenderZumTermin,
  zurueckZumTermin,
} from '@/lib/termin';

/** Ein Ereignis ohne Patient:in hätte beim Hausbesuch keine Anschrift; der Server weist ihn ab. */
const EREIGNIS_ARTEN = ['practice', 'video'] as const satisfies AppointmentType[];

/**
 * Einen geplanten Termin organisatorisch ändern, gegen den gelesenen Stand. An einer Fehlzeit
 * heißt die Seite „Teilnahme ändern“ und tauscht nur die Person (ANN-051).
 */
export function EditAppointmentPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  // Der Rückweg des Termins reist durch die Bearbeitung weiter.
  const rueckweg = suche.get(RUECKWEG_PARAM);
  const queryClient = useQueryClient();

  const termin = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
    retry: false,
  });

  const istEreignis = termin.data?.kind === 'internal';
  // An einer Fehlzeit stehen Beschäftigte zur Wahl, nicht nur Behandelnde: Das Büro nimmt teil.
  const listen = useAppointmentFormLists(istEreignis ? 'staff' : 'therapy', Boolean(termin.data));

  // Die Anschrift der Akte braucht erst der Wechsel zu einem Hausbesuch.
  const patient = useQuery({
    queryKey: ['patient', termin.data?.patient_id],
    queryFn: () => fetchPatient(termin.data!.patient_id!),
    enabled: Boolean(termin.data?.patient_id),
    retry: false,
  });

  const heute = user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : '';

  // Ein Hausbesuch, der Hausbesuch bleibt, behält seine Anschrift (ANN-003); sie steht in der Route.
  const weg = useMemo(() => {
    const t = termin.data;
    if (!t || t.kind === 'internal' || !user.organizationTimeZone) return undefined;
    return {
      patientId: t.patient_id,
      zeitzone: user.organizationTimeZone,
      bestehend:
        t.appointment_type === 'home_visit'
          ? { terminId: t.id, datum: appointmentToFormValues(t).date, person: t.staff_member_id }
          : null,
      ohneTermin: t.id,
    };
  }, [termin.data, user.organizationTimeZone]);

  // Der Rückweg steht in jedem Zustand der Seite; ohne mitgereisten Weg führt er zum Termin.
  const kopf = <Rueckweg standard={kalenderZumTermin(appointmentId ?? '')} />;

  // Nur ohne Termin ersetzt der Zustand das Formular; ein Ladefehler ist kein „Nicht gefunden“.
  if (!termin.data) {
    return (
      <>
        {kopf}
        <Abfragezustand
          abfrage={termin}
          laden="Termin wird geladen …"
          fehler="Der Termin konnte nicht geladen werden."
        >
          {() => (
            <ErrorState
              title="Nicht gefunden"
              description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
            />
          )}
        </Abfragezustand>
      </>
    );
  }

  const daten = termin.data;
  const zone = daten.organization_time_zone;

  // Ein Trainingstermin wird im Trainingsbereich verschoben, mit der Betreuung zur Wahl.
  if (daten.kind === 'training') {
    return <Navigate to={`/training/termine/${daten.id}/bearbeiten`} replace />;
  }

  // Ein abgesagter Termin ist terminal; der Server weist ihn ohnehin ab.
  if (daten.status === 'cancelled') {
    return (
      <>
        {kopf}
        <ErrorState
          title="Abgesagte Termine werden nicht bearbeitet"
          description="Der Termin bleibt zur Nachvollziehbarkeit erhalten. Für einen neuen Zeitraum bitte einen neuen Termin anlegen."
        />
      </>
    );
  }

  const gespeichert = appointmentToFormValues(daten);
  const fensterMinuten = terminLaengeMinuten(daten);

  return (
    <>
      {kopf}

      <PageHeader
        title={istEreignis ? 'Teilnahme ändern' : 'Termin bearbeiten'}
        description={
          istEreignis
            ? 'Hier wird nur die beteiligte Person getauscht.'
            : `Für ${patientName(daten)}`
        }
      />

      {termin.isError ? (
        <NachladeHinweis
          className="mb-6"
          laeuft={termin.isFetching}
          onErneut={() => void termin.refetch()}
        />
      ) : null}

      {/* Was an einer Fehlzeit für alle gilt, steht als Auskunft da, mit dem Weg, wo es sich ändert. */}
      {istEreignis ? (
        <div className="max-w-formular mb-8">
          <Section titel="Fehlzeit" rahmen>
            <DetailList>
              {daten.title ? <DetailRow label="Bezeichnung">{daten.title}</DetailRow> : null}
              <DetailRow label="Datum">{formatLocalDate(daten.starts_at, zone)}</DetailRow>
              <DetailRow label="Zeit">
                {formatLocalTimeRange(daten.starts_at, daten.ends_at, zone)}
              </DetailRow>
              <DetailRow label={daten.appointment_type === 'practice' ? 'Standort' : 'Ort'}>
                {locationSummary(daten)}
              </DetailRow>
            </DetailList>
            <Textlink
              alleinstehend
              className="text-sm"
              to={mitRueckweg(`/termine/${daten.id}/ereignis-bearbeiten`, rueckweg)}
            >
              Zeit oder Ort für alle ändern
            </Textlink>
          </Section>
        </div>
      ) : null}

      <AppointmentForm
        key={daten.id}
        listen={listen}
        startwerte={gespeichert}
        // Die Länge des gespeicherten Termins: Öffnen allein verlängert oder verkürzt nichts (§8.1).
        startMinuten={fensterMinuten}
        heute={heute}
        rasterMinuten={user.appointmentGridMinutes}
        // Ein gespeicherter Termin behält, was er trägt, auch eine gerade nicht zuordenbare Person.
        vorbelegen={false}
        bestehenderTag={gespeichert.date}
        nurPerson={istEreignis}
        arten={istEreignis ? EREIGNIS_ARTEN : undefined}
        dauerFest={istEreignis ? `Dauer: ${fensterMinuten} Minuten, wie eingetragen.` : undefined}
        texte={{
          absenden: 'Änderungen speichern',
          laeuft: 'Wird gespeichert …',
          trotzdem: 'Änderung trotzdem speichern',
          fehlerTitel: istEreignis
            ? 'Die Teilnahme konnte nicht geändert werden.'
            : 'Der Termin konnte nicht geändert werden.',
          standardfehler: 'Der Termin konnte nicht geändert werden.',
          ungespeichert: istEreignis ? 'Ungespeicherte Teilnahme' : 'Ungespeicherter Termin',
        }}
        abbrechenZiel={zurueckZumTermin(rueckweg, daten.id)}
        onSpeichern={async (werte, b) => {
          await updateAppointment(daten.id, daten.updated_at, werte, b.bestaetigt, b.vergangenheit);
          return daten.id;
        }}
        onGespeichert={async () => {
          // Detailansicht, Kalender, Tour und Fahrwege zeigen sonst weiter den alten Stand.
          await queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
          await tageslageNeuLaden(queryClient);
          void navigate(zurueckZumTermin(rueckweg, daten.id), { replace: true });
        }}
        weg={weg}
        hausbesuch={({ werte }) => {
          const bleibtHausbesuch =
            daten.appointment_type === 'home_visit' && werte.appointment_type === 'home_visit';
          return (
            <>
              {bleibtHausbesuch ? (
                <UebernommeneAdresse
                  ueberschrift="Festgehaltene Anschrift"
                  street={daten.visit_street}
                  houseNumber={daten.visit_house_number}
                  postalCode={daten.visit_postal_code}
                  city={daten.visit_city}
                />
              ) : (
                <UebernommeneAdresse
                  ueberschrift="Adresse des Hausbesuchs"
                  street={patient.data?.street ?? null}
                  houseNumber={patient.data?.house_number ?? null}
                  postalCode={patient.data?.postal_code ?? null}
                  city={patient.data?.city ?? null}
                  // Die Änderung selbst reist nicht mit; der Schutz fragt deshalb vorher nach.
                  ergaenzenZiel={
                    daten.patient_id
                      ? mitRueckweg(
                          `/patienten/${daten.patient_id}/bearbeiten`,
                          mitRueckweg(`/termine/${daten.id}/bearbeiten`, rueckweg),
                        )
                      : undefined
                  }
                />
              )}
              {/* Gebietstag der Adresse: warnt, sperrt nichts. */}
              <TerritoryHint
                postalCode={
                  bleibtHausbesuch ? daten.visit_postal_code : (patient.data?.postal_code ?? null)
                }
                slots={[{ datum: werte.date, beginn: werte.start_time }]}
              />
            </>
          );
        }}
      />
    </>
  );
}
