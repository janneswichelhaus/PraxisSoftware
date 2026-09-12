import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { fetchPatient, fullName } from '@/features/patients/api';
import { TermineMailen } from './TermineMailen';
import {
  addAppointmentNotification,
  fetchAppointmentSlip,
  formatLocalDate,
  formatLocalTimeRange,
  slipOrt,
  staffName,
} from './api';

/**
 * Die Termine der Patient:in mitteilen (CAL-011, CAL-013, `IDEA-PRX-006`).
 *
 * Ein Blatt, das die Patient:in mitnimmt: Datum, Uhrzeit, wo und wer. Kein
 * Status, keine Verordnung, kein Behandlungsinhalt — was nicht darauf gehört,
 * liefert der Server gar nicht erst.
 *
 * **Zwei Wege, eine Liste.** Gedruckt und in die Hand gegeben, oder als
 * E-Mail an die Patient:in. Die E-Mail entsteht seit CAL-013 als Entwurf im
 * Mailprogramm der Praxis; die Anwendung verschickt weiterhin nichts selbst
 * und beteiligt keinen neuen Dienstleister (ANN-041, `TermineMailen.tsx`).
 * SMS und Messenger gibt es nicht — Messenger ist nach B15 ausgeschlossen.
 *
 * Beide Wege vermerken die aufgeführten Termine von selbst (CAL-012) — damit
 * in der Akte steht, dass sie mitgeteilt sind.
 *
 * **Keine Wortmarke.** `marke/README.md` ist dazu ausdrücklich: Die
 * Druckregeln blenden die Kopfzeile aus, und die Marke auf Papier kommt
 * innerhalb der Anwendung erst mit ABR-000 aus den Praxis-Stammdaten. Hier
 * wird deshalb keine zweite Fassung gebaut.
 *
 * Die Druck-Basis aus UI-000 (`@media print` in `src/index.css`) blendet
 * `nav`, `header` und jeden `button` von selbst aus; `.nicht-drucken` nimmt
 * zusätzlich aus, was ein Link ist.
 */
export function AppointmentSlipPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const queryClient = useQueryClient();

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  const termine = useQuery({
    queryKey: ['appointment-slip', patientId],
    queryFn: () => fetchAppointmentSlip(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  /**
   * Drucken heißt mitteilen (CAL-012).
   *
   * Der Zettel listet alle bevorstehenden Termine auf einem Blatt — wer ihn
   * aushändigt, teilt sie alle mit und soll sie nicht einzeln abhaken müssen.
   * Vermerkt wird **vor** dem Druckdialog: Scheitert der Vermerk, wird auch
   * nicht gedruckt, statt eine Aushändigung zu behaupten, die nicht
   * festgehalten ist. Einen Irrtum nimmt die Terminseite wieder zurück.
   */
  const drucken = useMutation({
    mutationFn: (ids: string[]) => addAppointmentNotification(ids, 'slip'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient-upcoming-appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['appointment-slip', patientId] });
      window.print();
    },
  });

  if (patient.isPending || termine.isPending) {
    return <LoadingState label="Terminzettel wird geladen …" />;
  }
  if (patient.isError || !patient.data || termine.isError) {
    return (
      <ErrorState
        title="Nicht gefunden"
        description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
      />
    );
  }

  const patientDaten = patient.data;
  const eintraege = termine.data ?? [];

  return (
    <>
      <div className="nicht-drucken">
        <Link
          to={`/patienten/${patientDaten.id}`}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          ← Zurück zur Akte
        </Link>
      </div>

      {/* Bewusst kein PageHeader: Die Überschrift steht auf dem Papier und ist
          an die Patient:in gerichtet, nicht an die bedienende Person. */}
      <section className="max-w-prose">
        <h1 className="text-ink text-xl font-semibold">Ihre nächsten Termine</h1>
        <p className="text-ink-muted mt-1 text-[0.9375rem]">{fullName(patientDaten)}</p>

        {eintraege.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="Keine bevorstehenden Termine"
              description="Sobald ein Termin vereinbart ist, steht er hier und lässt sich ausdrucken."
            />
          </div>
        ) : (
          <ul className="divide-line border-line mt-6 divide-y border-t border-b">
            {eintraege.map((eintrag) => (
              <li key={eintrag.id} className="py-3">
                <p className="text-ink text-[0.9375rem] font-medium">
                  {formatLocalDate(eintrag.starts_at, eintrag.organization_time_zone)}
                </p>
                <p className="text-ink mt-0.5 text-[0.9375rem]">
                  {formatLocalTimeRange(
                    eintrag.starts_at,
                    eintrag.ends_at,
                    eintrag.organization_time_zone,
                  )}
                  {' · '}
                  {slipOrt(eintrag)}
                </p>
                <p className="text-ink-muted mt-0.5 text-sm">{staffName(eintrag)}</p>
              </li>
            ))}
          </ul>
        )}

        <p className="text-ink-subtle mt-6 text-xs leading-relaxed">
          Bitte sagen Sie einen Termin rechtzeitig ab, wenn Sie ihn nicht wahrnehmen können.
        </p>
      </section>

      {eintraege.length > 0 ? (
        <div className="nicht-drucken mt-8 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={drucken.isPending}
              onClick={() => drucken.mutate(eintraege.map((eintrag) => eintrag.id))}
            >
              {drucken.isPending ? 'Wird vermerkt …' : 'Terminzettel drucken'}
            </Button>
            {drucken.isError ? (
              <Statusmeldung ton="fehler">
                {drucken.error.message} Es wurde nichts gedruckt und nichts vermerkt.
              </Statusmeldung>
            ) : null}
          </div>
          <p className="text-ink-subtle max-w-prose text-xs leading-relaxed">
            Die aufgeführten Termine werden dabei als „Terminzettel ausgehändigt" vermerkt und
            tragen das Zeichen danach in der Akte. Am Termin lässt sich der Vermerk zurücknehmen.
          </p>

          {/* Der zweite Weg steht unter dem ersten, nicht daneben: Der Ausdruck
              bleibt der Normalfall, die E-Mail die Ausnahme auf Wunsch. */}
          <div className="border-line mt-3 border-t pt-4">
            <TermineMailen patient={patientDaten} eintraege={eintraege} />
          </div>
        </div>
      ) : null}

      <p className="text-ink-subtle nicht-drucken mt-10 max-w-prose text-xs leading-relaxed">
        Ausdruck und E-Mail enthalten ausschließlich organisatorische Angaben — dieselbe Liste, die
        oben steht. Eine Terminliste ist trotzdem ein Gesundheitsdatum: Sie sagt, dass jemand in
        Behandlung ist.
      </p>
    </>
  );
}
