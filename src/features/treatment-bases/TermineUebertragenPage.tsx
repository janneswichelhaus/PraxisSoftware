import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  fetchPatientAppointments,
  formatLocalDate,
  formatLocalTimeRange,
  staffName,
  appointmentTypeLabels,
  type PatientAppointment,
} from '@/features/appointments/api';
import { fetchPatient, fullName } from '@/features/patients/api';
import { formatDate } from '@/lib/datum';
import type { CurrentUser } from '@/features/session/types';
import { grundlageBezeichnung, transferAppointmentsToTreatmentBasis } from './api';
import { useVerordnungenDerAkte, type VerordnungMitZahlen } from './grundlagen';

/**
 * Termine auf eine andere Behandlungsgrundlage übertragen (CAL-022).
 *
 * Über das Kontingent hinaus zu planen ist zulässig — so entstehen
 * Dauertermine über das Verordnungsende hinaus. Kommt die Folgeverordnung,
 * wandern die ungedeckten Termine auf sie. Das ist ein **eigener Vorgang**
 * und kein Nebeneffekt des Anlegens: alles oder nichts, protokolliert, und
 * die Prüfungen stehen serverseitig (ANN-068).
 *
 * Eine Seite für beide Einstiege aus der Akte (Vorgabe in
 * `docs/development/CAL-EPIC-004.md`, CAL-022): Von der neuen Grundlage aus
 * steht das Ziel schon in der Adresse („Termine übernehmen"), von der
 * überplanten aus wird es hier gewählt („Termine übertragen"). Angeboten wird
 * in beiden Fällen dasselbe — die ungedeckten **künftigen** Termine dieser
 * Patient:in.
 *
 * Was hier **nicht** entschieden wird: ob die Zielgrundlage die Termine deckt.
 * Auch sie darf überplant sein; die Akte sagt danach, was ungedeckt blieb.
 * Eine Sperre widerspräche der Zusage, dass Planen nicht Verbrauchen ist.
 */

/** Wie viele künftige Termine geprüft werden. Obergrenze der Datenbank: 50. */
const HOECHSTZAHL = 50;

function zielBeschriftung(eintrag: VerordnungMitZahlen): string {
  const { bauart, praeposition } = grundlageBezeichnung(eintrag.verordnung);
  return `${bauart} ${praeposition} ${formatDate(eintrag.verordnung.issued_on)}`;
}

function Terminzeile({
  termin,
  gewaehlt,
  umschalten,
}: {
  termin: PatientAppointment;
  gewaehlt: boolean;
  umschalten: (id: string, an: boolean) => void;
}) {
  const zone = termin.organization_time_zone;

  return (
    <li className="border-line border-t first:border-t-0">
      <Checkbox
        checked={gewaehlt}
        onChange={(e) => umschalten(termin.id, e.target.checked)}
        label={
          <>
            <span className="text-ink font-medium">{formatLocalDate(termin.starts_at, zone)}</span>
            <span className="text-ink-muted block">
              {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
              {` · ${appointmentTypeLabels[termin.appointment_type]}`}
              {` · ${staffName(termin)}`}
            </span>
          </>
        }
      />
    </li>
  );
}

export function TermineUebertragenPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const akte = `/patienten/${patientId}/verordnungen`;

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  const { eintraege, isPending, isError } = useVerordnungenDerAkte(patientId ?? '', user);

  // Nur die künftigen Termine: Ein vergangener Termin ist behandelt, und seine
  // Grundlage ist Teil dessen, was passiert ist. Geblättert wird hier nicht -
  // wer mehr als 50 künftige Termine ungedeckt stehen hat, überträgt in zwei
  // Vorgängen und sieht das als Hinweis.
  const termine = useQuery({
    queryKey: ['patient-appointments', patientId, true, null, HOECHSTZAHL],
    queryFn: () =>
      fetchPatientAppointments(patientId!, {
        kuenftig: true,
        limit: HOECHSTZAHL,
        verordnung: null,
      }),
    enabled: Boolean(patientId),
    staleTime: 0,
    retry: false,
  });

  const [ziel, setZiel] = useState(() => suche.get('ziel') ?? '');
  const [abgewaehlt, setAbgewaehlt] = useState<ReadonlySet<string>>(new Set());

  /**
   * Was sich übertragen lässt: ungedeckt, künftig, nicht schon am Ziel.
   *
   * „Ungedeckt" rechnet nicht diese Seite — die Datenbank liefert es je Termin
   * (CAL-022). Ein Termin ohne Grundlage steht bewusst nicht dabei: Er ist
   * nicht ungedeckt, sondern ungebunden, und ihn einer Grundlage zuzuordnen
   * ist eine andere Frage als diese.
   */
  const angebot = useMemo(
    () =>
      (termine.data ?? []).filter(
        (termin) => termin.treatment_basis_covered === false && termin.treatment_basis_id !== ziel,
      ),
    [termine.data, ziel],
  );

  const gewaehlt = angebot.filter((termin) => !abgewaehlt.has(termin.id));

  const uebertragen = useMutation({
    mutationFn: (ids: readonly string[]) => transferAppointmentsToTreatmentBasis(ziel, ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient-appointments', patientId] });
      await queryClient.invalidateQueries({
        queryKey: ['patient-treatment-basis-slots', patientId],
      });
      void navigate(akte);
    },
  });

  function umschalten(id: string, an: boolean) {
    setAbgewaehlt((bisher) => {
      const naechste = new Set(bisher);
      if (an) naechste.delete(id);
      else naechste.add(id);
      return naechste;
    });
  }

  function absenden(e: FormEvent) {
    e.preventDefault();
    if (!ziel || gewaehlt.length === 0) return;
    uebertragen.mutate(gewaehlt.map((termin) => termin.id));
  }

  if (!patientId) return <ErrorState title="Diese Akte gibt es nicht." />;

  return (
    <>
      <Rueckweg standard={akte} beschriftung="Zurück zur Akte" />

      <PageHeader
        title="Termine übertragen"
        description={
          patient.data
            ? `Für ${fullName(patient.data)}. Alles oder nichts — entweder wandern alle gewählten Termine, oder keiner.`
            : 'Alles oder nichts — entweder wandern alle gewählten Termine, oder keiner.'
        }
      />

      {isPending || termine.isPending ? <LoadingState label="Wird geladen …" /> : null}
      {isError || termine.isError ? (
        <ErrorState
          title="Die Akte konnte nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {!isPending && !termine.isPending && !isError && !termine.isError ? (
        <form onSubmit={absenden} noValidate className="max-w-2xl">
          <Section titel="Ziel" ebene={3}>
            <Select
              label="Auf welche Behandlungsgrundlage? *"
              value={ziel}
              onChange={(e) => setZiel(e.target.value)}
              hint="Nur Grundlagen dieser Patient:in. Der Server prüft das noch einmal."
            >
              <option value="">Bitte wählen …</option>
              {eintraege.map((eintrag) => (
                <option key={eintrag.verordnung.id} value={eintrag.verordnung.id}>
                  {zielBeschriftung(eintrag)}
                </option>
              ))}
            </Select>
          </Section>

          <Section
            titel="Diese Termine"
            hinweis="Vorgeschlagen sind die ungedeckten künftigen Termine. Einzeln abwählbar."
            ebene={3}
          >
            {angebot.length === 0 ? (
              <EmptyState
                title="Kein ungedeckter Termin"
                description="Jeder künftige Termin dieser Person wird von seiner Behandlungsgrundlage getragen. Es gibt nichts zu übertragen."
              />
            ) : (
              <ul>
                {angebot.map((termin) => (
                  <Terminzeile
                    key={termin.id}
                    termin={termin}
                    gewaehlt={!abgewaehlt.has(termin.id)}
                    umschalten={umschalten}
                  />
                ))}
              </ul>
            )}

            {termine.data?.length === HOECHSTZAHL ? (
              <Statusmeldung className="mt-3">
                Geprüft wurden die nächsten {HOECHSTZAHL} Termine. Sind es mehr, bleibt der Rest
                stehen und lässt sich danach in einem zweiten Vorgang übertragen.
              </Statusmeldung>
            ) : null}
          </Section>

          {uebertragen.isError ? (
            <Statusmeldung ton="fehler" className="mt-4">
              {uebertragen.error.message} Ein abgesagter oder bereits abgerechneter Termin wird
              nicht übertragen — dann bleibt alles, wie es war.
            </Statusmeldung>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={!ziel || gewaehlt.length === 0 || uebertragen.isPending}
            >
              {uebertragen.isPending
                ? 'Wird übertragen …'
                : gewaehlt.length === 1
                  ? '1 Termin übertragen'
                  : `${gewaehlt.length} Termine übertragen`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void navigate(akte)}>
              Abbrechen
            </Button>
          </div>
        </form>
      ) : null}
    </>
  );
}
