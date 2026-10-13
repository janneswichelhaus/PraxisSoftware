import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { fetchPatient, fullName } from '@/features/patients/api';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { TermineMailen } from './TermineMailen';
import { Terminzettelblatt } from './Terminzettelblatt';
import { addAppointmentNotification, fetchAppointmentSlip } from './api';
import { useAbsender } from '@/features/datenschutz/useAbsender';
import { absenderKontakt } from '@/features/datenschutz/absender';
import type { CurrentUser } from '@/features/session/types';

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
 * **Keine Wortmarke.** `marke/README.md` sieht sie auf Papier nur für
 * Rechnung und Fax vor. **Ein Absender** steht seit UX-009a darauf (BEF-052,
 * ANN-323): Name, Anschrift, Telefon und E-Mail der Praxis aus den
 * Stammdaten, damit die Bitte um rechtzeitige Absage sagt, wo - eine zu späte
 * Absage kann ein Ausfallhonorar auslösen. Beim Praxistermin steht die
 * Anschrift des Standorts am Termin.
 *
 * Die Druck-Basis aus UI-000 (`@media print` in `src/index.css`) blendet
 * `nav` und jeden `button` von selbst aus; `.nicht-drucken` nimmt die Kopfzeile
 * der Anwendung und zusätzlich aus, was ein Link ist.
 */
export function AppointmentSlipPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();
  const queryClient = useQueryClient();
  // Gedruckt wird erst mit Absender (Zweitreview B6).
  const { absender, hinweis, laedt: absenderLaedt } = useAbsender(user.organizationName);
  const kontakt = absenderKontakt(absender);

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
    onSuccess: () => {
      // Die Bestätigung folgt dem Server, nicht dem Nachladen (ZST-B01).
      setGedruckt(false);
      void queryClient.invalidateQueries({ queryKey: ['patient-upcoming-appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['appointment-slip', patientId] });
    },
  });

  // Der Rückweg steht in jedem Zustand - auch im Fehlerfall, wo er sonst der
  // einzige Weg zurück wäre (TER-03, ZST-08). Auf Papier nicht.
  const kopf = (
    <div className="nicht-drucken">
      <Rueckweg standard={`/patienten/${patientId ?? ''}`} beschriftung="Zurück zur Akte" />
    </div>
  );

  // Ein Ladefehler ist kein „Nicht gefunden" (TER-11, ZST-08): Im Funkloch
  // wirkte die Akte sonst gelöscht oder gesperrt.
  if (patient.isPending || termine.isPending) {
    return (
      <>
        {kopf}
        <LoadingState label="Terminzettel wird geladen …" />
      </>
    );
  }
  if (!patient.data) {
    return (
      <>
        {kopf}
        {patient.isError ? (
          <ErrorState
            title="Die Patientendaten konnten nicht geladen werden."
            description={VERBINDUNG_PRUEFEN}
            onErneut={() => void patient.refetch()}
          />
        ) : (
          <ErrorState
            title="Nicht gefunden"
            description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
          />
        )}
      </>
    );
  }
  if (!termine.data) {
    return (
      <>
        {kopf}
        <ErrorState
          title="Die Termine konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void termine.refetch()}
        />
      </>
    );
  }

  const patientDaten = patient.data;
  const eintraege = termine.data;

  return (
    <>
      {kopf}
      {hinweis}

      {/* Das Blatt selbst nach dem Profil „Druckblatt“ (DESIGN.md). */}
      <Terminzettelblatt
        absender={absender}
        patientName={fullName(patientDaten)}
        eintraege={eintraege}
        kontakt={kontakt}
      />

      {eintraege.length > 0 ? (
        <div className="nicht-drucken max-w-prose">
          {/* Kein Absatz dazu, was der Druck vermerkt und was nicht: Die
              Rückfrage nach dem Druck sagt es dort, wo es ansteht (UX-005g).
              Am Telefon in voller Breite unter dem Blatt (DESIGN.md
              „Formular“). */}
          <Formularfuss>
            <Button
              type="button"
              disabled={absenderLaedt}
              onClick={() => {
                vermerken.reset();
                window.print();
                setGedruckt(true);
              }}
            >
              Terminzettel drucken
            </Button>
          </Formularfuss>

          {/* Eine Bestätigung im Erfolgston, und mit dem Fokus: Der Knopf,
              der ihn hatte, ist mit der Frage verschwunden (UIK-21, ZST-16). */}
          {vermerken.isSuccess ? (
            <Rueckmeldung className="mt-6">
              Die aufgeführten Termine sind als „Terminzettel ausgehändigt“ vermerkt. Am Termin
              lässt sich der Vermerk zurücknehmen.
            </Rueckmeldung>
          ) : null}

          {/* Die Frage nach dem Druckdialog - der zweite Schritt (ANN-039
              Fassung 2). Sie bleibt stehen, bis sie beantwortet ist: Eine
              Meldung, die von selbst verschwindet, wäre genau die stille
              Annahme, die hier abgeschafft wird. Eine Zeile mit Linie links
              wie jede Rückfrage (DESIGN.md Regel 2), keine Karte. */}
          {gedruckt ? (
            <div
              role="status"
              className="border-line-strong bg-surface-sunken mt-6 flex flex-col gap-3 border-l-4 py-3 pr-4 pl-4"
            >
              <p className="text-ink text-liste">
                Wurde der Zettel ausgehändigt? Nur dann gelten die Termine als mitgeteilt.
              </p>
              <div className="flex flex-col gap-3 *:w-full sm:flex-row sm:flex-wrap sm:items-center sm:*:w-auto">
                <Button
                  type="button"
                  disabled={vermerken.isPending}
                  onClick={() => vermerken.mutate(eintraege.map((eintrag) => eintrag.id))}
                >
                  {vermerken.isPending ? 'Wird vermerkt …' : 'Ja, als mitgeteilt vermerken'}
                </Button>
                <Button type="button" variant="quiet" onClick={() => setGedruckt(false)}>
                  Nein, nichts vermerken
                </Button>
              </div>
              {vermerken.isError ? (
                <Statusmeldung ton="fehler">
                  {vermerken.error.message} Es wurde nichts vermerkt.
                </Statusmeldung>
              ) : null}
            </div>
          ) : null}

          {/* Der zweite Weg steht unter dem ersten, nicht daneben: Der Ausdruck
              bleibt der Normalfall, die E-Mail die Ausnahme auf Wunsch. */}
          <div className="border-line mt-8 border-t pt-6">
            <TermineMailen patient={patientDaten} eintraege={eintraege} />
          </div>
        </div>
      ) : null}
      {/* Keine Fußnote zu organisatorischen Angaben und Gesundheitsdatum mehr:
          Sie erklärte das System, nicht die Liste (UX-005g). */}
    </>
  );
}
