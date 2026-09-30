import { useInfiniteQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { canReadTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  appointmentStatusLabels,
  appointmentTypeHint,
  formatLocalDate,
  formatLocalTimeRange,
  staffName,
} from '@/features/appointments/api';
import type { Patient } from '@/features/patients/api';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  fetchPatientTreatmentNotesPage,
  naechsteAkteSeite,
  treatmentNoteStatusLabels,
  type AkteCursor,
  type PatientTreatmentNotesEntry,
  type RecordAppointment,
  type TreatmentNote,
} from './api';
import { ENTWURF_ZUSATZ, FREITEXT, herkunft } from './format';

/**
 * Kopfzeile eines Termins in der Akte.
 *
 * Datum, Zeit, Art, behandelnde Person und Terminstatus sind organisatorische
 * Angaben, die jede Praxisrolle am Termin ohnehin sieht (PROJECT_PRINCIPLES.md
 * 4.3). Darunter stehen die Eintraege.
 *
 * Der Status steht neben dem Datum, nicht am anderen Rand der Liste: Bei
 * 1.440 px lagen die beiden sonst rund 1.100 px auseinander (DOK-22).
 */
function TerminKopf({ termin }: { termin: RecordAppointment }) {
  const zone = termin.organization_time_zone;
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-accent text-h4 font-bold">{formatLocalDate(termin.starts_at, zone)}</p>
        <Badge>{appointmentStatusLabels[termin.appointment_status]}</Badge>
      </div>
      <p className="text-ink-muted mt-1 text-sm">
        {/* Nur eine abweichende Terminart steht dran (ANN-192). */}
        {[
          formatLocalTimeRange(termin.starts_at, termin.ends_at, zone),
          appointmentTypeHint(termin.appointment_type),
          staffName(termin),
        ]
          .filter(Boolean)
          .join(' · ')}
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
          Die weiteren Termine konnten nicht geladen werden. Bitte die Verbindung prüfen und erneut
          versuchen.
        </Statusmeldung>
      ) : null}
    </div>
  );
}

/**
 * Ein Eintrag in der Akte - Haupteintrag oder Nachtrag - ohne Handlungen.
 *
 * Der Freitext steht unveraendert da; die Anwendung fuegt ihm nichts hinzu
 * (ADR-006). Bearbeitet, finalisiert, korrigiert und nachgetragen wird am
 * Termin: die Akte ist der Ort zum Lesen, nicht der zweite Ort zum Schreiben.
 */
function AkteEintrag({
  termin,
  note,
  rueckweg,
}: {
  termin: RecordAppointment;
  note: TreatmentNote;
  /** Der Weg zurück in den Verlauf der Akte - für den Änderungsverlauf (DOK-01). */
  rueckweg: string;
}) {
  const zone = termin.organization_time_zone;
  const istNachtrag = note.addendum_to_note_id !== null;
  const final = note.status === 'final';

  return (
    <div className="mt-3">
      {/* Zustände als Etikett, nicht als Bedienelement (UIK-18): „Finalisiert“
          trägt das Zeichen ✓, der Rest bleibt neutral. */}
      <div className="flex flex-wrap items-center gap-2">
        {istNachtrag ? <Badge>Nachtrag</Badge> : null}
        <Badge ton={final ? 'positiv' : 'neutral'}>{treatmentNoteStatusLabels[note.status]}</Badge>
        {/* Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018) steht in der
            Akte wie am Termin: Ob behandelt wurde, entscheidet später über
            eine Rechnung ohne erbrachte Leistung (ADR-018 Fassung 3 Punkt 9). */}
        {note.visit_without_treatment ? <Badge>Ohne Behandlung</Badge> : null}
        {note.status === 'draft' ? (
          <span className="text-ink-muted text-xs">{ENTWURF_ZUSATZ}</span>
        ) : null}
        {final && note.version_count > 1 ? (
          <span className="text-ink-muted text-xs">{note.version_count} Versionen</span>
        ) : null}
      </div>

      {/* BEF-078: Der Eintrag steht in einem eigenen, abgesetzten Feld -
          vorher lief er im gleichen Grau wie Kopf und Herkunft durch. */}
      <p
        className={`text-ink text-liste bg-surface-sunken rounded-card mt-2 max-w-prose p-3 leading-relaxed ${FREITEXT}`}
      >
        {note.content}
      </p>

      <p className="text-ink-muted mt-2 text-xs leading-relaxed">{herkunft(note, zone)}</p>

      {note.version_count > 0 ? (
        <Textlink
          to={mitRueckweg(
            `/termine/${termin.appointment_id}/dokumentation/${note.id}/verlauf`,
            rueckweg,
          )}
          alleinstehend
          className="text-sm"
        >
          Änderungsverlauf
        </Textlink>
      ) : null}
    </div>
  );
}

/**
 * Behandlungsdokumentation in der Akte (DOK-003, ROL-001).
 *
 * Die klinische Sicht fuer alle vier Praxisrollen - seit E15 auch fuer office
 * (ADR-004 Fassung 2): alle Eintraege ueber die Termine hinweg, neueste
 * zuerst. Jeder gelesene Eintrag wird serverseitig protokolliert (ADR-010,
 * ADR-016 Punkt 9); die Seitengroesse begrenzt, wie viel ein Aufruf offenlegt.
 */
function Behandlungsdokumentation({ patient }: { patient: Patient }) {
  const seiten = useInfiniteQuery({
    queryKey: ['patient-treatment-notes', patient.id],
    queryFn: ({ pageParam }) => fetchPatientTreatmentNotesPage(patient.id, pageParam),
    initialPageParam: null as AkteCursor | null,
    getNextPageParam: (letzteSeite) => naechsteAkteSeite(letzteSeite),
    // Beim Oeffnen immer der aktuelle Stand: wer gerade am Termin abgesagt oder
    // finalisiert hat, soll das hier sofort sehen. Jeder erneute Serverzugriff
    // ist ein erneutes Lesen und wird als solches protokolliert; aus dem
    // Zwischenspeicher gezeigte Inhalte erzeugen keinen zweiten Eintrag, weil
    // der Server sie nicht erneut geliefert hat (ADR-010).
    staleTime: 0,
    retry: false,
  });

  const termine: PatientTreatmentNotesEntry[] = seiten.data?.pages.flat() ?? [];
  const verlauf = `/patienten/${patient.id}/verlauf`;

  return (
    // Der Abschnitt bleibt ein benannter Bereich für Vorlesesoftware; die
    // Überschrift kommt aus `Section` wie überall sonst (UIK-20, TOK-05).
    <div role="region" aria-label="Behandlungsdokumentation" className="mt-8">
      <Section
        titel="Behandlungsdokumentation"
        hinweis="Neueste zuerst. Geschrieben wird am Termin."
      >
        {seiten.isPending ? <LoadingState label="Dokumentation wird geladen …" /> : null}

        {seiten.isError ? (
          <ErrorState
            title="Die Behandlungsdokumentation konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => seiten.refetch()}
          />
        ) : null}

        {seiten.data && termine.length === 0 ? (
          <p className="text-ink-muted border-line text-liste border-t pt-4">
            Für diese Person gibt es noch keine Termine in der Akte.
          </p>
        ) : null}

        {termine.length > 0 ? (
          // BEF-078: Je Termin eine eigene Karte statt Zeilen in einem Kasten -
          // man sieht, wo ein Termin endet und der nächste beginnt.
          <ol className="flex flex-col gap-3">
            {termine.map((termin) => (
              <li
                key={termin.appointment_id}
                className="border-line bg-surface rounded-card border p-4 sm:p-5"
              >
                <TerminKopf termin={termin} />

                {termin.notes.length === 0 ? (
                  <p className="text-ink-muted text-liste mt-2">Keine Dokumentation.</p>
                ) : (
                  termin.notes.map((note) => (
                    <AkteEintrag key={note.id} termin={termin} note={note} rueckweg={verlauf} />
                  ))
                )}

                <Textlink
                  to={mitRueckweg(`/termine/${termin.appointment_id}`, verlauf)}
                  alleinstehend
                  className="mt-1 text-sm"
                >
                  Zum Termin
                </Textlink>
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

        <p className="text-ink-muted mt-4 max-w-prose text-xs leading-relaxed">
          Zugriffe auf die Behandlungsdokumentation werden je Eintrag protokolliert.
        </p>
      </Section>
    </div>
  );
}

/**
 * Dokumentation in der Akte (DOK-003, ROL-001).
 *
 * Alle vier Praxisrollen bekommen dieselbe klinische Sicht, ein Patientenkonto
 * keinen Abschnitt. Die Rolle entscheidet hier nur die Darstellung; verbindlich
 * prueft der Server (ADR-004). Wer nicht lesen darf, startet auch keinen
 * Aufruf, der ohnehin abgewiesen wuerde. Den Behandlungsnachweis ohne Inhalt
 * gibt es weiterhin als Rechnungssicht auf dem Server (ADR-004 Fassung 2
 * Punkt 4) - in der Akte wird er seit E15 nicht mehr gebraucht.
 */
export function PatientRecordDocumentation({
  patient,
  user,
}: {
  patient: Patient;
  user: CurrentUser;
}) {
  if (!canReadTreatmentNote(user.roles)) return null;
  return <Behandlungsdokumentation patient={patient} />;
}
