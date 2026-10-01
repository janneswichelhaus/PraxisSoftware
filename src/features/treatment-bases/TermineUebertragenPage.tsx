import { useId, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
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
  appointmentTypeHint,
  type PatientAppointment,
} from '@/features/appointments/api';
import { fetchPatient, fullName } from '@/features/patients/api';
import { formatDate } from '@/lib/datum';
import type { CurrentUser } from '@/features/session/types';
import { grundlageBezeichnung, transferAppointmentsToTreatmentBasis } from './api';
import {
  useVerordnungenDerAkte,
  type Uebertragungsergebnis,
  type VerordnungMitZahlen,
} from './grundlagen';

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
 * `docs/development/archiv/CAL-EPIC-004.md`, CAL-022): Von der neuen Grundlage aus
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

/**
 * Was eine Grundlage als Ziel noch trägt (VER-13).
 *
 * Wer von der überplanten Grundlage kommt, muss sehen, welche noch Platz hat -
 * sonst wandert die Lücke nur weiter. Ohne Zahlen steht kein Zustand da; er
 * wäre geraten.
 */
function zielzustand({ kontingent, zustand }: VerordnungMitZahlen): string | null {
  if (!kontingent) return null;
  if (kontingent.uncovered > 0) return `${kontingent.uncovered} ohne Deckung`;
  if (zustand === 'ausgeschoepft') return 'ausgeschöpft';
  if (zustand === 'verplant') return 'vollständig verplant';
  return `noch ${kontingent.remaining} planbar`;
}

function zielBeschriftung(eintrag: VerordnungMitZahlen): string {
  const { bauart, praeposition } = grundlageBezeichnung(eintrag.verordnung);
  const name = `${bauart} ${praeposition} ${formatDate(eintrag.verordnung.issued_on)}`;
  const zustand = zielzustand(eintrag);
  return zustand ? `${name} – ${zustand}` : name;
}

/**
 * Die abgebende Grundlage (VER-13): Ihre eigenen Termine sind ungedeckt, sie
 * hat keinen Platz mehr. Als Ziel wäre sie ein Tausch der Lücke gegen sich
 * selbst - sie steht deshalb in der Auswahl, ist aber nicht wählbar.
 */
function gibtAb(eintrag: VerordnungMitZahlen): boolean {
  return (eintrag.kontingent?.uncovered ?? 0) > 0;
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
              {/* Nur eine abweichende Terminart steht dran (ANN-192). */}
              {appointmentTypeHint(termin.appointment_type)
                ? ` · ${appointmentTypeHint(termin.appointment_type)}`
                : ''}
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
  const sperrgrundId = useId();

  const akte = `/patienten/${patientId}/verordnungen`;

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  const { eintraege, isPending, isError, erneutLaden } = useVerordnungenDerAkte(
    patientId ?? '',
    user,
  );

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
    onSuccess: async (anzahl) => {
      await queryClient.invalidateQueries({ queryKey: ['patient-appointments', patientId] });
      await queryClient.invalidateQueries({
        queryKey: ['patient-treatment-basis-slots', patientId],
      });
      // Die Akte sagt danach, wie viele gewandert sind - die Zahl aus der
      // Antwort des Servers, nicht aus der Auswahl (VER-13).
      const ergebnis: Uebertragungsergebnis = { termineUebertragen: anzahl };
      void navigate(akte, { state: ergebnis });
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

  if (!patientId) {
    return (
      <ErrorState
        title="Nicht gefunden"
        description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
      />
    );
  }

  // Ein gesperrter Knopf sagt, warum (VER-13).
  const sperrgrund = !ziel
    ? 'Zuerst die Grundlage wählen.'
    : gewaehlt.length === 0
      ? 'Mindestens einen Termin wählen.'
      : null;

  return (
    <>
      <Rueckweg standard={akte} beschriftung="Zurück zu den Behandlungsgrundlagen" />

      <PageHeader
        title="Termine übertragen"
        description={
          patient.data
            ? `Für ${fullName(patient.data)}. Alles oder nichts – entweder wandern alle gewählten Termine, oder keiner.`
            : 'Alles oder nichts – entweder wandern alle gewählten Termine, oder keiner.'
        }
      />

      {isPending || termine.isPending ? <LoadingState label="Wird geladen …" /> : null}
      {isError || termine.isError ? (
        <ErrorState
          title="Termine oder Grundlagen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => Promise.all([erneutLaden(), termine.isError ? termine.refetch() : null])}
        />
      ) : null}

      {!isPending && !termine.isPending && !isError && !termine.isError ? (
        <form onSubmit={absenden} noValidate className="max-w-xl">
          {/* Zwei Abschnitte direkt unter der Seitenüberschrift: Ebene 2
              (VER-16). */}
          <Section titel="Ziel">
            <Select
              label="Auf welche Behandlungsgrundlage? *"
              value={ziel}
              onChange={(e) => setZiel(e.target.value)}
              hint="Nur Grundlagen dieser Patient:in."
            >
              <option value="">Bitte wählen …</option>
              {eintraege.map((eintrag) => (
                <option
                  key={eintrag.verordnung.id}
                  value={eintrag.verordnung.id}
                  disabled={gibtAb(eintrag)}
                >
                  {zielBeschriftung(eintrag)}
                </option>
              ))}
            </Select>
          </Section>

          <Section
            titel="Diese Termine"
            hinweis="Vorgeschlagen sind die ungedeckten künftigen Termine. Einzeln abwählbar."
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
              nicht übertragen – dann bleibt alles, wie es war.
            </Statusmeldung>
          ) : null}

          {/* Ohne Angebot kein Knopf über null Termine (VER-13): Der
              Leerzustand sagt es, der Rückweg steht oben. */}
          {angebot.length > 0 ? (
            <>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={sperrgrund !== null || uebertragen.isPending}
                  aria-describedby={sperrgrund ? sperrgrundId : undefined}
                >
                  {uebertragen.isPending
                    ? 'Wird übertragen …'
                    : gewaehlt.length === 1
                      ? '1 Termin übertragen'
                      : `${gewaehlt.length} Termine übertragen`}
                </Button>
                {/* Ein Seitenwechsel und deshalb ein Link (UIK-13). */}
                <ButtonLink to={akte} variant="secondary">
                  Abbrechen
                </ButtonLink>
              </div>
              {sperrgrund ? (
                <p id={sperrgrundId} className="text-ink-muted mt-2 text-sm">
                  {sperrgrund}
                </p>
              ) : null}
            </>
          ) : null}
        </form>
      ) : null}
    </>
  );
}
