import { useState } from 'react';
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
 * **Vorbereiten und Mitteilen sind zwei Schritte** (seit UX-012). Drucken
 * öffnet den Druckdialog, die E-Mail öffnet das Mailprogramm — beides
 * vermerkt nichts. Erst die Bestätigung danach hält fest, dass der Zettel
 * ausgehändigt beziehungsweise die Nachricht gesendet wurde (CAL-012, ANN-039
 * und ANN-041 je Fassung 2). Vorher vermerkte schon die Vorbereitung, und ein
 * abgebrochener Druckdialog hinterließ eine Aushändigung, die nie stattfand.
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
   * Drucken ist noch keine Mitteilung (CAL-012, ANN-039 Fassung 2).
   *
   * Bis UX-012 vermerkte ein Klick auf „Drucken" die Termine **vor** dem
   * Druckdialog als ausgehändigt. Der Dialog wird aber laufend abgebrochen —
   * falscher Drucker, kein Papier, nur mal nachsehen — und in der Akte stand
   * danach eine Aushändigung, die nie stattgefunden hat. Der Vermerk ist ein
   * Nachweis; ein Nachweis, der regelmäßig falsch ist, ist keiner.
   *
   * Deshalb zwei Schritte: Der Knopf öffnet den Druckdialog und schreibt
   * nichts. Danach fragt die Seite, ob der Zettel tatsächlich ausgehändigt
   * wurde — erst diese Bestätigung vermerkt. Die Anwendung sieht den Ausgang
   * des Druckdialogs nicht; sie fragt deshalb die Person, die ihn gesehen hat.
   */
  const [gedruckt, setGedruckt] = useState(false);

  const vermerken = useMutation({
    mutationFn: (ids: string[]) => addAppointmentNotification(ids, 'slip'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient-upcoming-appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['appointment-slip', patientId] });
      setGedruckt(false);
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
              onClick={() => {
                vermerken.reset();
                window.print();
                setGedruckt(true);
              }}
            >
              Terminzettel drucken
            </Button>
            {vermerken.isSuccess ? (
              <Statusmeldung>
                Die aufgeführten Termine sind als „Terminzettel ausgehändigt" vermerkt. Am Termin
                lässt sich der Vermerk zurücknehmen.
              </Statusmeldung>
            ) : null}
          </div>

          {/* Die Frage nach dem Druckdialog - der zweite Schritt (ANN-039
              Fassung 2). Sie bleibt stehen, bis sie beantwortet ist: Eine
              Meldung, die von selbst verschwindet, wäre genau die stille
              Annahme, die hier abgeschafft wird. */}
          {gedruckt ? (
            <div
              role="status"
              className="border-line-strong bg-surface-sunken rounded-card flex flex-col gap-3 border px-4 py-3"
            >
              <p className="text-ink text-[0.9375rem]">
                Wurde der Zettel ausgehändigt? Nur dann gelten die Termine als mitgeteilt.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={vermerken.isPending}
                  onClick={() => vermerken.mutate(eintraege.map((eintrag) => eintrag.id))}
                >
                  {vermerken.isPending ? 'Wird vermerkt …' : 'Ja, als mitgeteilt vermerken'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setGedruckt(false)}>
                  Nein, nichts vermerken
                </Button>
                {vermerken.isError ? (
                  <Statusmeldung ton="fehler">
                    {vermerken.error.message} Es wurde nichts vermerkt.
                  </Statusmeldung>
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="text-ink-subtle max-w-prose text-xs leading-relaxed">
            Der Druck selbst vermerkt nichts. Erst die Bestätigung danach hält fest, dass die
            Termine ausgehändigt wurden; am Termin lässt sich der Vermerk zurücknehmen.
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
