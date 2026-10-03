import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { ButtonLink } from '@/components/ui/ButtonLink';
import {
  canReadTreatmentNote,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeHint,
  formatLocalTime,
  fetchAppointment,
  formatLocalTimeRange,
  staffName,
} from '@/features/appointments/api';
import type { Patient } from '@/features/patients/api';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  fetchDocumentationDeadline,
  fetchPatientTreatmentNotesPage,
  fetchTreatmentDocumentation,
  naechsteAkteSeite,
  type AkteCursor,
  type PatientTreatmentNotesEntry,
  type RecordAppointment,
  type TreatmentNote,
} from './api';
import { FREITEXT, fristDatum } from './format';

/** „28.09.2026" in der Zeit der Praxis. */
function kurzesDatum(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zone,
  }).format(new Date(iso));
}

/** Der Monat eines Termins als Schlüssel und Überschrift: „2026-09", „September 2026". */
function monatVon(iso: string, zone: string): { schluessel: string; titel: string } {
  const tag = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(iso));
  const titel = new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: zone,
  }).format(new Date(iso));
  return { schluessel: tag.slice(0, 7), titel };
}

/** Termine nach Monat, in der Reihenfolge der Liste (neueste zuerst). */
function nachMonat(
  termine: readonly PatientTreatmentNotesEntry[],
): { schluessel: string; titel: string; termine: PatientTreatmentNotesEntry[] }[] {
  const gruppen: { schluessel: string; titel: string; termine: PatientTreatmentNotesEntry[] }[] =
    [];
  for (const termin of termine) {
    const monat = monatVon(termin.starts_at, termin.organization_time_zone);
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.schluessel === monat.schluessel) letzte.termine.push(termin);
    else gruppen.push({ ...monat, termine: [termin] });
  }
  return gruppen;
}

/**
 * Kopfzeile eines Termins in der Akte.
 *
 * Datum, Zeit, Art, behandelnde Person und Terminstatus sind organisatorische
 * Angaben, die jede Praxisrolle am Termin ohnehin sieht (PROJECT_PRINCIPLES.md
 * 4.3). Darunter stehen die Eintraege.
 *
 * Der Status steht neben dem Datum, nicht am anderen Rand der Liste: Bei
 * 1.440 px lagen die beiden sonst rund 1.100 px auseinander (DOK-22).
 *
 * UX-005e: Das Datum **ist** der Weg zum Termin - eine eigene Zeile „Zum
 * Termin" unter jeder Karte wiederholte ihn. Ein Etikett trägt nur ein Termin,
 * der nicht stattfand (abgesagt, nicht angetroffen); „Bestätigt",
 * „Abgeschlossen", „Dokumentiert" sind in einer Dokumentationsliste der
 * Regelfall und sagen nichts.
 */
function TerminKopf({ termin, rueckweg }: { termin: RecordAppointment; rueckweg: string }) {
  const zone = termin.organization_time_zone;
  const ausgefallen =
    termin.appointment_status === 'cancelled' || termin.appointment_status === 'no_show';
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          to={mitRueckweg(`/termine/${termin.appointment_id}`, rueckweg)}
          // 15 px in 600 (Design-Handoff 2026-10-01, Abschnitt 7): Das Datum
          // ist der Kopf der Karte, keine Seitenüberschrift.
          className="text-accent text-liste font-semibold hover:underline"
        >
          {kurzesDatum(termin.starts_at, zone)}
        </Link>
        {ausgefallen ? (
          <Badge ton={appointmentStatusTon[termin.appointment_status]}>
            {appointmentStatusLabels[termin.appointment_status]}
          </Badge>
        ) : null}
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

/** Datum und Uhrzeit kurz, in der Praxiszeitzone: „12.05.2027, 11:32". */
function kurzerZeitpunkt(wert: string, zone: string): string {
  const tag = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: zone }).format(
    new Date(wert),
  );
  return `${tag}, ${formatLocalTime(wert, zone)}`;
}

/**
 * Die Herkunftszeile eines Eintrags in der Akte (UX-005e).
 *
 * Kürzer als am Termin (`herkunft` in `format.ts`): Die Karte nennt die
 * behandelnde Person schon im Kopf, deshalb steht ein Name nur, wenn jemand
 * anderes finalisiert oder zuletzt geändert hat. Die automatische
 * Finalisierung hat keine handelnde Person (DOK-004, ADR-016 Punkt 7).
 */
function akteHerkunft(note: TreatmentNote, termin: RecordAppointment): string {
  const zone = termin.organization_time_zone;
  const behandelnd = staffName(termin);
  const von = (name: string | null) => (name && name !== behandelnd ? ` von ${name}` : '');

  if (note.status === 'final' && note.finalized_at) {
    if (note.finalisation_kind === 'automatic') {
      return `Automatisch finalisiert ${kurzerZeitpunkt(note.finalized_at, zone)}`;
    }
    return `Finalisiert ${kurzerZeitpunkt(note.finalized_at, zone)}${von(note.finalized_by_name)}`;
  }
  return `Zuletzt geändert ${kurzerZeitpunkt(note.updated_at, zone)}${von(note.last_editor_name)}`;
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
  fristTage,
}: {
  termin: RecordAppointment;
  note: TreatmentNote;
  /** Der Weg zurück in den Verlauf der Akte - für den Änderungsverlauf (DOK-01). */
  rueckweg: string;
  /** Die Frist der Praxis in Tagen, sobald geladen (ADR-016 Punkt 7). */
  fristTage: number | undefined;
}) {
  const frist = fristDatum(termin.starts_at, termin.organization_time_zone, fristTage);
  const istNachtrag = note.addendum_to_note_id !== null;
  const final = note.status === 'final';

  return (
    <div className="mt-3">
      {/* Zustände als Etikett, nicht als Bedienelement (UIK-18): „✓ Version n"
          oder „! Entwurf · Frist …" (Design-Handoff 2026-10-01, Abschnitt 7). */}
      <div className="flex flex-wrap items-center gap-2">
        {istNachtrag ? <Badge>Nachtrag</Badge> : null}
        {final ? (
          <Badge ton="positiv">{`Version ${note.version_count}`}</Badge>
        ) : (
          <Badge ton="warnung">{frist ? `Entwurf · Frist ${frist}` : 'Entwurf'}</Badge>
        )}
        {/* Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018) steht in der
            Akte wie am Termin: Ob behandelt wurde, entscheidet später über
            eine Rechnung ohne erbrachte Leistung (ADR-018 Fassung 3 Punkt 9). */}
        {note.visit_without_treatment ? <Badge>Ohne Behandlung</Badge> : null}
      </div>

      {/* BEF-078: Der Eintrag steht in einem eigenen, abgesetzten Feld -
          vorher lief er im gleichen Grau wie Kopf und Herkunft durch. */}
      <p
        className={`text-ink text-liste bg-surface-sunken rounded-card mt-2 max-w-prose p-3 leading-relaxed ${FREITEXT}`}
      >
        {note.content}
      </p>

      <p className="text-ink-muted mt-2 text-sm leading-relaxed">
        {akteHerkunft(note, termin)}
        {/* DOK-02: Der Entwurf sagt, dass er von selbst festgeschrieben wird. */}
        {note.status === 'draft'
          ? frist
            ? ` · wird am ${frist} automatisch festgeschrieben`
            : ' · wird automatisch festgeschrieben'
          : null}
      </p>

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
function Behandlungsdokumentation({
  patient,
  user,
  ohneTermin,
}: {
  patient: Patient;
  user: CurrentUser;
  /** Der Termin, der oben als „Dieser Termin" steht - hier nicht ein zweites Mal. */
  ohneTermin: string | null;
}) {
  const organisation = user.profile.organization_id;
  const { data: fristTage } = useQuery({
    queryKey: ['documentation-deadline', organisation],
    queryFn: () => fetchDocumentationDeadline(organisation),
    retry: false,
  });
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

  const termine: PatientTreatmentNotesEntry[] = (seiten.data?.pages.flat() ?? []).filter(
    (termin) => termin.appointment_id !== ohneTermin,
  );
  const verlauf = `/patienten/${patient.id}/doku`;
  const monate = nachMonat(termine);
  // Die Sprungleiste lohnt erst ab zwei Monaten (Abschnitt 7). Sie kennt nur,
  // was geladen ist; ältere Monate kommen mit „Ältere Termine anzeigen" dazu.
  const mitLeiste = monate.length >= 2;

  return (
    // Der Abschnitt bleibt ein benannter Bereich für Vorlesesoftware; die
    // Überschrift kommt aus `Section` wie überall sonst (UIK-20, TOK-05).
    <div role="region" aria-label="Behandlungsdokumentation" className="mt-8">
      {/* Der Hinweis auf das Protokoll steht wieder unter der Überschrift: Der
          Design-Handoff vom 2026-10-01 behält ihn ausdrücklich (Abschnitt 1,
          Entscheidung Jannes), nachdem UX-005e ihn gestrichen hatte. Er steht
          vor dem Lesen, nicht danach. */}
      <Section
        titel="Behandlungsdokumentation"
        hinweis={mitLeiste ? undefined : 'Jeder gelesene Eintrag wird protokolliert.'}
      >
        {/* Sprungleiste (Design-Handoff 2026-10-01, Abschnitt 7): bleibt beim
            Scrollen oben stehen, je Monat ein Ziel; der Hinweis auf das
            Protokoll steht dann hier statt unter der Überschrift. */}
        {mitLeiste ? (
          <nav
            aria-label="Springen zu"
            className="bg-canvas sticky top-14 z-10 -mx-1 mb-3 flex items-center gap-x-2 gap-y-1 overflow-x-auto px-1 py-2 sm:flex-wrap"
          >
            <span className="text-ink-muted tracking-label shrink-0 text-xs font-semibold whitespace-nowrap uppercase">
              Springen zu
            </span>
            {monate.map((monat) => (
              <a
                key={monat.schluessel}
                href={`#monat-${monat.schluessel}`}
                className="border-line-strong text-accent hover:bg-accent-soft rounded-pill inline-flex min-h-11 shrink-0 items-center border px-3 text-sm font-semibold whitespace-nowrap transition-colors"
              >
                {monat.titel}
              </a>
            ))}
            <span className="text-ink-muted ml-auto shrink-0 text-[13px] whitespace-nowrap">
              Lesen wird protokolliert
            </span>
          </nav>
        ) : null}
        {seiten.isPending ? <LoadingState label="Dokumentation wird geladen …" /> : null}

        {seiten.isError ? (
          <ErrorState
            title="Die Behandlungsdokumentation konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => seiten.refetch()}
          />
        ) : null}

        {seiten.data && termine.length === 0 ? (
          <EmptyState title="Noch kein Eintrag." inKarte />
        ) : null}

        {/* Nach Monat gruppiert (Abschnitt 7); je Termin eine Karte (BEF-078). */}
        {monate.map((monat) => (
          <section
            key={monat.schluessel}
            id={`monat-${monat.schluessel}`}
            aria-labelledby={`monat-titel-${monat.schluessel}`}
            // Die Sprungleiste steht beim Ziel noch oben - der Titel darunter.
            className="mt-5 scroll-mt-32 first-of-type:mt-0"
          >
            <h3
              id={`monat-titel-${monat.schluessel}`}
              className="text-ink-muted tracking-label mb-2 text-xs font-semibold uppercase"
            >
              {monat.titel}
            </h3>
            <ol className="flex flex-col gap-3">
              {monat.termine.map((termin) => (
                <li
                  key={termin.appointment_id}
                  // Innen 14/16 (Design-Handoff 2026-10-01, Abschnitt 7).
                  className="border-line bg-surface rounded-card border px-4 py-3.5"
                >
                  <TerminKopf termin={termin} rueckweg={verlauf} />

                  {termin.notes.length === 0 ? (
                    <p className="text-ink-muted text-liste mt-2">Keine Dokumentation.</p>
                  ) : (
                    termin.notes.map((note) => (
                      <AkteEintrag
                        key={note.id}
                        termin={termin}
                        note={note}
                        rueckweg={verlauf}
                        fristTage={fristTage}
                      />
                    ))
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}

        <WeitereSeite
          sichtbar={Boolean(seiten.hasNextPage)}
          laufend={seiten.isFetchingNextPage}
          fehler={seiten.isFetchNextPageError}
          onClick={() => void seiten.fetchNextPage()}
        />
        {/* UX-005e: Kein Protokollhinweis unter der Liste - protokolliert wird
            weiter je gelesenem Eintrag (ADR-010), nur der Satz entfällt. */}
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
  ohneTermin = null,
}: {
  patient: Patient;
  user: CurrentUser;
  ohneTermin?: string | null;
}) {
  if (!canReadTreatmentNote(user.roles)) return null;
  return <Behandlungsdokumentation patient={patient} user={user} ohneTermin={ohneTermin} />;
}

/**
 * „Dieser Termin" oben in der Doku (AKTE-008, ANN-225): der Eintrag zum
 * Termin, aus dem man kommt - über `?termin=` von der Tageskarte.
 *
 * Gelesen über dieselben Wege wie die Schreibseite (`fetchAppointment`,
 * `get_treatment_note`, unter denselben Schlüsseln); jeder gelieferte
 * Eintrag wird auf dem Server protokolliert (ADR-010). Ein Termin einer
 * anderen Person zeigt nichts.
 *
 * Geschrieben wird nicht hier, sondern auf der Schreibseite außerhalb des
 * Aktenrahmens (UX-009: wer tippt, sieht die Bereichsleiste nicht). Der Knopf
 * führt dorthin und wieder zurück. Ein festgeschriebener Eintrag wird am
 * Termin korrigiert oder ergänzt, wie überall in der Akte.
 */
export function DieserTermin({
  patient,
  user,
  terminId,
}: {
  patient: Patient;
  user: CurrentUser;
  terminId: string;
}) {
  const ort = useLocation();
  const darfLesen = canReadTreatmentNote(user.roles);
  const termin = useQuery({
    queryKey: ['appointment', terminId],
    queryFn: () => fetchAppointment(terminId),
    enabled: darfLesen,
    retry: false,
  });
  const dokumentation = useQuery({
    queryKey: ['treatment-note', terminId],
    queryFn: () => fetchTreatmentDocumentation(terminId),
    enabled: darfLesen && termin.data?.patient_id === patient.id,
    retry: false,
  });
  const { data: fristTage } = useQuery({
    queryKey: ['documentation-deadline', user.profile.organization_id],
    queryFn: () => fetchDocumentationDeadline(user.profile.organization_id),
    enabled: darfLesen,
    retry: false,
  });

  if (!darfLesen) return null;
  if (termin.isPending) return <LoadingState label="Der Termin wird geladen …" />;
  if (termin.isError) {
    return (
      <ErrorState
        title="Der Termin konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => termin.refetch()}
      />
    );
  }
  const daten = termin.data;
  if (!daten || daten.patient_id !== patient.id) return null;

  const kopf: RecordAppointment = {
    appointment_id: daten.id,
    starts_at: daten.starts_at,
    ends_at: daten.ends_at,
    appointment_type: daten.appointment_type,
    appointment_status: daten.status,
    staff_given_name: daten.staff_given_name ?? '',
    staff_family_name: daten.staff_family_name ?? '',
    organization_time_zone: daten.organization_time_zone,
  };
  const hier = `${ort.pathname}${ort.search}`;
  const eintraege = dokumentation.data
    ? [
        ...(dokumentation.data.primary ? [dokumentation.data.primary] : []),
        ...dokumentation.data.addenda,
      ]
    : [];
  const haupteintrag = dokumentation.data?.primary ?? null;
  const schreiben =
    canWriteTreatmentNote(user.roles) && dokumentation.data && haupteintrag?.status !== 'final'
      ? haupteintrag
        ? 'Weiterschreiben'
        : 'Eintrag schreiben'
      : null;

  return (
    <Section titel="Dieser Termin">
      <div className="border-line bg-surface rounded-card border px-4 py-3.5">
        <TerminKopf termin={kopf} rueckweg={hier} />
        {dokumentation.isPending ? <LoadingState label="Dokumentation wird geladen …" /> : null}
        {dokumentation.isError ? (
          <ErrorState
            title="Die Dokumentation konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => dokumentation.refetch()}
          />
        ) : null}
        {dokumentation.data && eintraege.length === 0 ? (
          <p className="text-ink-muted text-liste mt-2">Noch kein Eintrag.</p>
        ) : null}
        {eintraege.map((note) => (
          <AkteEintrag
            key={note.id}
            termin={kopf}
            note={note}
            rueckweg={hier}
            fristTage={fristTage}
          />
        ))}
        {schreiben ? (
          <ButtonLink
            to={mitRueckweg(`/termine/${terminId}/abschluss`, hier)}
            variant={haupteintrag ? 'secondary' : 'primary'}
            groesse="kompakt"
            className="mt-3"
          >
            {schreiben}
          </ButtonLink>
        ) : null}
      </div>
    </Section>
  );
}
