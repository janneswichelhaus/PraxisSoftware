import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  canReadTreatmentEvidence,
  canReadTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  formatLocalDate,
  formatLocalTimeRange,
  staffName,
} from '@/features/appointments/api';
import type { Patient } from '@/features/patients/api';
import {
  fetchPatientTreatmentNotesPage,
  fetchTreatmentEvidencePage,
  naechsteAkteSeite,
  treatmentNoteStatusLabels,
  type AkteCursor,
  type PatientTreatmentNotesEntry,
  type RecordAppointment,
  type TreatmentEvidenceEntry,
  type TreatmentNote,
} from './api';
import { herkunft, zeitpunkt } from './format';

const abzeichen =
  'border-line-strong bg-surface-sunken text-ink-muted rounded-full border px-2.5 py-0.5 text-xs font-medium';
const linkLeise = 'text-accent inline-flex min-h-11 items-center text-sm hover:underline';

/**
 * Kopfzeile eines Termins in der Akte - beiden Sichten gemeinsam.
 *
 * Datum, Zeit, Art, behandelnde Person und Terminstatus sind organisatorische
 * Angaben, die jede Praxisrolle am Termin ohnehin sieht (PROJECT_PRINCIPLES.md
 * 4.3). Was darunter steht, unterscheidet die Sichten.
 */
function TerminKopf({ termin }: { termin: RecordAppointment }) {
  const zone = termin.organization_time_zone;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-ink font-medium">{formatLocalDate(termin.starts_at, zone)}</p>
        <span className={abzeichen}>{appointmentStatusLabels[termin.appointment_status]}</span>
      </div>
      <p className="text-ink-muted mt-1 text-sm">
        {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)} ·{' '}
        {appointmentTypeLabels[termin.appointment_type]} · {staffName(termin)}
      </p>
    </>
  );
}

/**
 * Schaltflaeche fuer die naechste Seite der Akte.
 *
 * Eine volle Seite kann die letzte gewesen sein - dann bleibt nach dem Klick
 * die Liste unveraendert und die Schaltflaeche verschwindet. Ein leerer Aufruf
 * ist billiger als eine eigene Zaehlabfrage vorab.
 */
function WeitereSeite({
  sichtbar,
  laufend,
  fehler,
  onClick,
}: {
  sichtbar: boolean;
  laufend: boolean;
  fehler: boolean;
  onClick: () => void;
}) {
  if (!sichtbar) return null;
  return (
    <div className="mt-4">
      <Button type="button" variant="secondary" disabled={laufend} onClick={onClick}>
        {laufend ? 'Wird geladen …' : 'Ältere Termine anzeigen'}
      </Button>
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-2">
          Die weiteren Termine konnten nicht geladen werden. Bitte erneut versuchen.
        </Statusmeldung>
      ) : null}
    </div>
  );
}

/** Der Dokumentationsstand in einem Satz - ohne jeden Inhalt (ANN-006). */
function nachweisText(eintrag: TreatmentEvidenceEntry): string {
  if (eintrag.documentation_status === 'final' && eintrag.documented_at) {
    return `Dokumentation finalisiert am ${zeitpunkt(
      eintrag.documented_at,
      eintrag.organization_time_zone,
    )}.`;
  }
  if (eintrag.documentation_status === 'draft') {
    return 'Dokumentation als Entwurf vorhanden, noch nicht finalisiert.';
  }
  return 'Keine Dokumentation.';
}

/**
 * Behandlungsnachweis in der Akte (DOK-003, PROJECT_PRINCIPLES.md 4.4).
 *
 * Die datensparsame Sicht fuer die Verwaltung: je Termin nur, ob und wann
 * dokumentiert wurde. Sie ist eine eigene Serverfunktion mit eigenem
 * Datenumfang (ADR-004) - nichts hier wird aus klinischen Daten
 * herausgefiltert, weil nichts davon ankommt.
 */
function Behandlungsnachweis({ patient }: { patient: Patient }) {
  const seiten = useInfiniteQuery({
    queryKey: ['treatment-evidence', patient.id],
    queryFn: ({ pageParam }) => fetchTreatmentEvidencePage(patient.id, pageParam),
    initialPageParam: null as AkteCursor | null,
    getNextPageParam: (letzteSeite) => naechsteAkteSeite(letzteSeite),
    // Beim Oeffnen der Akte immer der aktuelle Stand: wer gerade am Termin
    // abgesagt oder finalisiert hat, soll das hier sofort sehen - unabhaengig
    // davon, welcher Schreibweg die Aenderung ausgeloest hat.
    staleTime: 0,
    retry: false,
  });

  const eintraege = seiten.data?.pages.flat() ?? [];

  return (
    <section className="mt-8" aria-labelledby="behandlungsnachweis">
      <h2
        id="behandlungsnachweis"
        className="text-ink-muted text-sm font-semibold tracking-wide uppercase"
      >
        Behandlungsnachweis
      </h2>
      <p className="text-ink-muted mt-1 max-w-prose text-sm">
        Termine mit Status und Dokumentationsstand, ohne Behandlungsinhalte. Zukünftige Termine ohne
        Dokumentation stehen im Kalender.
      </p>

      {seiten.isPending ? <LoadingState label="Behandlungsnachweis wird geladen …" /> : null}

      {seiten.isError ? (
        <div className="mt-3">
          <ErrorState title="Der Behandlungsnachweis konnte nicht geladen werden." />
        </div>
      ) : null}

      {seiten.data && eintraege.length === 0 ? (
        <p className="text-ink-muted border-line mt-3 border-t pt-4 text-[0.9375rem]">
          Für diese Person gibt es noch keine Termine in der Akte.
        </p>
      ) : null}

      {eintraege.length > 0 ? (
        <ol className="divide-line border-line mt-3 divide-y border-t">
          {eintraege.map((eintrag) => (
            <li key={eintrag.appointment_id} className="py-4">
              <TerminKopf termin={eintrag} />
              <p className="text-ink mt-2 text-[0.9375rem]">{nachweisText(eintrag)}</p>
              <Link to={`/termine/${eintrag.appointment_id}`} className={`${linkLeise} mt-1`}>
                Zum Termin
              </Link>
            </li>
          ))}
        </ol>
      ) : null}

      <WeitereSeite
        sichtbar={Boolean(seiten.hasNextPage)}
        laufend={seiten.isFetchingNextPage}
        fehler={seiten.isFetchNextPageError}
        onClick={() => void seiten.fetchNextPage()}
      />
    </section>
  );
}

/**
 * Ein Eintrag in der Akte - Haupteintrag oder Nachtrag - ohne Handlungen.
 *
 * Der Freitext steht unveraendert da; die Anwendung fuegt ihm nichts hinzu
 * (ADR-006). Bearbeitet, finalisiert, korrigiert und nachgetragen wird am
 * Termin: die Akte ist der Ort zum Lesen, nicht der zweite Ort zum Schreiben.
 */
function AkteEintrag({ termin, note }: { termin: RecordAppointment; note: TreatmentNote }) {
  const zone = termin.organization_time_zone;
  const istNachtrag = note.addendum_to_note_id !== null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {istNachtrag ? <span className={abzeichen}>Nachtrag</span> : null}
        <span className={abzeichen}>{treatmentNoteStatusLabels[note.status]}</span>
        {note.status === 'draft' ? (
          <span className="text-ink-subtle text-xs">noch nicht finalisiert</span>
        ) : null}
        {note.status === 'final' && note.version_count > 1 ? (
          <span className="text-ink-subtle text-xs">{note.version_count} Versionen</span>
        ) : null}
      </div>

      <p className="text-ink mt-2 max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
        {note.content}
      </p>

      <p className="text-ink-subtle mt-2 text-xs leading-relaxed">{herkunft(note, zone)}</p>

      {note.version_count > 0 ? (
        <Link
          to={`/termine/${termin.appointment_id}/dokumentation/${note.id}/verlauf`}
          className={linkLeise}
        >
          Änderungsverlauf
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Behandlungsdokumentation in der Akte (DOK-003).
 *
 * Die klinische Sicht fuer owner, therapist und team_lead: alle Eintraege
 * ueber die Termine hinweg, neueste zuerst. Jeder gelesene Eintrag wird
 * serverseitig protokolliert (ADR-010, ADR-016 Punkt 9); die Seitengroesse
 * begrenzt, wie viel ein Aufruf offenlegt.
 */
function Behandlungsdokumentation({ patient }: { patient: Patient }) {
  const seiten = useInfiniteQuery({
    queryKey: ['patient-treatment-notes', patient.id],
    queryFn: ({ pageParam }) => fetchPatientTreatmentNotesPage(patient.id, pageParam),
    initialPageParam: null as AkteCursor | null,
    getNextPageParam: (letzteSeite) => naechsteAkteSeite(letzteSeite),
    // Wie beim Nachweis: beim Oeffnen immer der aktuelle Stand. Jeder erneute
    // Serverzugriff ist ein erneutes Lesen und wird als solches protokolliert;
    // aus dem Zwischenspeicher gezeigte Inhalte erzeugen keinen zweiten
    // Eintrag, weil der Server sie nicht erneut geliefert hat (ADR-010).
    staleTime: 0,
    retry: false,
  });

  const termine: PatientTreatmentNotesEntry[] = seiten.data?.pages.flat() ?? [];

  return (
    <section className="mt-8" aria-labelledby="behandlungsdokumentation">
      <h2
        id="behandlungsdokumentation"
        className="text-ink-muted text-sm font-semibold tracking-wide uppercase"
      >
        Behandlungsdokumentation
      </h2>
      <p className="text-ink-muted mt-1 max-w-prose text-sm">
        Alle Termine mit ihren Einträgen, neueste zuerst. Bearbeitet, finalisiert und ergänzt wird
        am Termin. Zukünftige Termine ohne Dokumentation stehen im Kalender.
      </p>

      {seiten.isPending ? <LoadingState label="Dokumentation wird geladen …" /> : null}

      {seiten.isError ? (
        <div className="mt-3">
          <ErrorState title="Die Behandlungsdokumentation konnte nicht geladen werden." />
        </div>
      ) : null}

      {seiten.data && termine.length === 0 ? (
        <p className="text-ink-muted border-line mt-3 border-t pt-4 text-[0.9375rem]">
          Für diese Person gibt es noch keine Termine in der Akte.
        </p>
      ) : null}

      {termine.length > 0 ? (
        <ol className="divide-line border-line mt-3 divide-y border-t">
          {termine.map((termin) => (
            <li key={termin.appointment_id} className="py-4">
              <TerminKopf termin={termin} />

              {termin.notes.length === 0 ? (
                <p className="text-ink-muted mt-2 text-[0.9375rem]">Keine Dokumentation.</p>
              ) : (
                termin.notes.map((note) => (
                  <AkteEintrag key={note.id} termin={termin} note={note} />
                ))
              )}

              <Link to={`/termine/${termin.appointment_id}`} className={`${linkLeise} mt-1`}>
                Zum Termin
              </Link>
            </li>
          ))}
        </ol>
      ) : null}

      <WeitereSeite
        sichtbar={Boolean(seiten.hasNextPage)}
        laufend={seiten.isFetchingNextPage}
        fehler={seiten.isFetchNextPageError}
        onClick={() => void seiten.fetchNextPage()}
      />

      <p className="text-ink-subtle mt-4 max-w-prose text-xs leading-relaxed">
        Zugriffe auf die Behandlungsdokumentation werden je Eintrag protokolliert.
      </p>
    </section>
  );
}

/**
 * Dokumentation in der Akte, rollenabhaengig (DOK-003).
 *
 * Welche Sicht gerendert wird, entscheidet die Rolle nur fuer die
 * Darstellung: klinische Rollen bekommen die Dokumentation mit Inhalt, die
 * Verwaltung den Behandlungsnachweis, ein Patientenkonto keinen Abschnitt.
 * Verbindlich prueft der Server in jeder Sicht selbst (ADR-004); eine Rolle,
 * die hier falsch waere, bekaeme vom Server schlicht keine Daten. Die Wahl
 * verhindert zugleich, dass die Verwaltung ueberhaupt einen Aufruf startet,
 * der abgewiesen wuerde.
 */
export function PatientRecordDocumentation({
  patient,
  user,
}: {
  patient: Patient;
  user: CurrentUser;
}) {
  if (canReadTreatmentNote(user.roles)) return <Behandlungsdokumentation patient={patient} />;
  if (canReadTreatmentEvidence(user.roles)) return <Behandlungsnachweis patient={patient} />;
  return null;
}
