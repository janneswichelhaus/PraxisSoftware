import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Textlink } from '@/components/ui/Textlink';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  canManageAppointments,
  canReadTreatmentNote,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import type { Appointment } from '@/features/appointments/api';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import {
  fetchDocumentationDeadline,
  fetchTreatmentDocumentation,
  finalizeTreatmentNote,
  type TreatmentNote,
} from './api';
import { FREITEXT, fristDatum, herkunft, zeitpunkt } from './format';

/** Das Abzeichen eines Eintrags: festgeschrieben mit Version, sonst Entwurf mit Frist. */
function zustandsAbzeichen(note: TreatmentNote, frist: string | null) {
  return note.status === 'final' ? (
    <Badge ton="positiv">{`Festgeschrieben · Version ${note.version_count}`}</Badge>
  ) : (
    <Badge ton="warnung">{frist ? `Entwurf · Frist ${frist}` : 'Entwurf'}</Badge>
  );
}

/**
 * Ein Eintrag - Haupteintrag oder Nachtrag - mit seinen Handlungen.
 *
 * Angezeigt wird der Freitext unverändert. Die Anwendung fügt ihm nichts hinzu
 * - keine Hervorhebung, keine Einordnung, keine Bewertung (ADR-006).
 */
function Eintrag({
  appointment,
  note,
  darfSchreiben,
  istNachtrag,
  hauptknopfOben,
  eingehend,
  frist,
}: {
  appointment: Appointment;
  note: TreatmentNote;
  darfSchreiben: boolean;
  istNachtrag: boolean;
  /** Bis wann ein Entwurf von selbst festgeschrieben wird, oder `null`. */
  frist: string | null;
  /** Steht oben am Termin schon die Aktionsleiste mit „Doku“ (DOK-14)? */
  hauptknopfOben: boolean;
  /** Der Rückweg des Termins - er reist mit auf die Doku-Seiten (DOK-01). */
  eingehend: string;
}) {
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;
  const [finalisiertGemeldet, setFinalisiertGemeldet] = useState(false);
  const meldung = useRef<HTMLDivElement>(null);

  const finalisieren = useMutation({
    mutationFn: () => finalizeTreatmentNote(note.id, note.updated_at),
    onSuccess: async () => {
      setFinalisiertGemeldet(true);
      await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
      // Die Finalisierung hebt den Termin auf „dokumentiert" (CAL-008d,
      // ADR-018 Punkt 3). Ohne diese beiden Zeilen zeigte die Seite daneben
      // weiter den alten Zustand — und der Kalender ebenfalls.
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  const final = note.status === 'final';
  // Nach der Finalisierung ist der Auslöser fort. Der Fokus fiele an den
  // Seitenanfang; er geht stattdessen auf die Bestätigung am Ort (ZST-16).
  const bestaetigt = finalisiertGemeldet && final;
  useEffect(() => {
    if (bestaetigt) meldung.current?.focus();
  }, [bestaetigt]);

  const basis = `/termine/${appointment.id}/dokumentation`;
  const mit = (ziel: string) => mitRueckweg(ziel, eingehend);

  return (
    <div className={istNachtrag ? 'border-line mt-4 border-t pt-3' : 'mt-2'}>
      {/* Zustände als Etikett, nicht als Bedienelement (UIK-18, DOK-13). Der
          Zustand des Haupteintrags steht im Kopf des Abschnitts; ein Nachtrag
          trägt seinen eigenen. Es geht um den Bearbeitungsstand, nicht um den
          Inhalt (§17). */}
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {istNachtrag ? <Badge>Nachtrag</Badge> : null}
        {istNachtrag ? zustandsAbzeichen(note, frist) : null}
        {/* Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018). Er steht
            als eigenes Merkmal neben dem Freitext, nicht darin: Ob behandelt
            wurde, entscheidet später über eine Rechnung ohne erbrachte
            Leistung (ADR-018 Fassung 3 Punkt 9). */}
        {note.visit_without_treatment ? <Badge>Ohne Behandlung</Badge> : null}
        {final && note.version_count > 1 ? (
          <span className="text-ink-muted text-xs">
            {note.version_count} Versionen, zuletzt korrigiert am {zeitpunkt(note.updated_at, zone)}
          </span>
        ) : null}
      </div>

      {/* Das Kennzeichen „Ohne Behandlung" steht schon oben; hier nur die
          eine Folge, die nicht am Kennzeichen ablesbar ist (UX-005g). */}
      {note.visit_without_treatment ? (
        <p className="text-ink-muted mt-2 max-w-prose text-sm leading-relaxed">
          Keine Ausfallgebühr.
        </p>
      ) : null}

      {/* Der Text mit einer Linie links statt eines Kastens (Leitfaden L2):
          Er steht meist schon in einer Karte - Termin, Akte -, und ein
          Kasten darin war der Kasten im Kasten. */}
      <p
        data-testid="eintragstext"
        className={`border-line-strong text-ink text-liste mt-2 max-w-prose border-l-2 py-0.5 pl-3.5 leading-relaxed ${FREITEXT}`}
      >
        {note.content}
      </p>

      <p className="text-ink-muted mt-2 text-[13px] leading-relaxed">{herkunft(note, zone)}</p>
      {/* DOK-02: Ein Entwurf sagt, dass er von selbst festgeschrieben wird -
          mit dem Tag, sobald die Frist der Praxis geladen ist. */}
      {note.status === 'draft' ? (
        <p className="text-warnung text-[13px] leading-relaxed">
          {frist
            ? `Wird am ${frist} automatisch festgeschrieben, wenn niemand vorher finalisiert.`
            : 'Wird automatisch festgeschrieben, wenn niemand vorher finalisiert.'}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-start gap-2 empty:hidden">
        {/* „Doku" heißt der Weg zum Schreiben überall (Abschnitt 6a). Steht er
            oben in der Aktionsleiste schon, nicht noch einmal (DOK-14). */}
        {darfSchreiben && !final && (istNachtrag || !hauptknopfOben) ? (
          <ButtonLink
            to={mit(
              istNachtrag
                ? `${basis}/${note.id}/bearbeiten`
                : `/termine/${appointment.id}/abschluss`,
            )}
            groesse="kompakt"
          >
            {istNachtrag ? 'Nachtrag bearbeiten' : 'Doku'}
          </ButtonLink>
        ) : null}

        {/* Die Finalisierung ist nicht rückgängig zu machen: ab hier ist der
            Eintrag Bestandteil der Akte, und jede weitere Änderung erzeugt
            eine Version mit Begründung (ADR-016 Punkt 4 bis 6). Ein
            versehentlicher Klick darf das nicht auslösen (PROJECT_PRINCIPLES.md
            13) - die Rückfrage ist der Baustein mit Fokusführung und Sperre
            gegen den Doppelklick (ZST-16). Steht oben am Termin schon der
            Hauptknopf, ist dieser hier sekundär: ein Hauptknopf je Ansicht
            (DOK-14). */}
        {darfSchreiben && !final ? (
          <Rueckfrage
            ausloeser="Finalisieren"
            ausloeserVariante="secondary"
            ausloeserGroesse="kompakt"
            bezeichnung="Dokumentation finalisieren"
            bestaetigen="Ja, jetzt finalisieren"
            bestaetigenLaeuft="Wird finalisiert …"
            fehler={finalisieren.isError ? finalisieren.error.message : undefined}
            onBestaetigen={() => finalisieren.mutateAsync()}
            onAbbrechen={() => finalisieren.reset()}
          >
            Nach der Finalisierung ist der Eintrag Bestandteil der Patientenakte. Der jetzige
            Wortlaut wird als Version 1 festgeschrieben; jede spätere Änderung braucht eine
            Begründung und bleibt nachvollziehbar.
            {/* Die zweite Folge, die bisher niemand ansagte (BEF-055, Teil 1):
                Am offenen Termin setzt die Finalisierung den Termin mit auf
                „dokumentiert“ (ADR-018 Fassung 3, ANN-036). Danach ist
                „nicht angetroffen“ nicht mehr wählbar. */}
            {!istNachtrag && appointment.status === 'confirmed'
              ? ' Der Termin wird dabei als durchgeführt geführt; „nicht angetroffen“ lässt sich danach nicht mehr vermerken.'
              : null}
          </Rueckfrage>
        ) : null}

        {/* Ergänzen ist der Regelfall, Ändern die Ausnahme (ADR-016 Punkt 6):
            Der Nachtrag steht vorn am Eintrag, die Korrektur leise dahinter
            (DOK-14). Zu einem Nachtrag gibt es keinen weiteren. */}
        {darfSchreiben && final && !istNachtrag ? (
          <ButtonLink
            to={mit(`${basis}/${note.id}/nachtrag`)}
            variant="secondary"
            groesse="kompakt"
          >
            Nachtrag hinzufügen
          </ButtonLink>
        ) : null}

        {darfSchreiben && final ? (
          <ButtonLink to={mit(`${basis}/${note.id}/korrektur`)} variant="quiet" groesse="kompakt">
            Korrigieren
          </ButtonLink>
        ) : null}

        {note.version_count > 0 ? (
          <ButtonLink to={mit(`${basis}/${note.id}/verlauf`)} variant="quiet" groesse="kompakt">
            Änderungsverlauf
          </ButtonLink>
        ) : null}
      </div>

      {bestaetigt ? (
        <div ref={meldung} tabIndex={-1} className="mt-3">
          <Statusmeldung ton="erfolg">
            {istNachtrag
              ? 'Finalisiert – der Nachtrag ist jetzt Bestandteil der Akte.'
              : 'Finalisiert – der Eintrag ist jetzt Bestandteil der Akte.'}
          </Statusmeldung>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Behandlungsdokumentation am Termin (DOK-001, DOK-002).
 *
 * Für Patientenkonten wird der Abschnitt gar nicht erst gerendert und auch
 * nicht abgefragt (PROJECT_PRINCIPLES.md 4.6). `office` liest ihn seit E15 wie
 * die therapeutischen Rollen, bekommt aber keinen Schreibweg (4.3, ROL-001).
 * Das ist ausdrücklich keine Zugriffskontrolle: `get_treatment_note` prüft die
 * Rolle selbst, und auf die Tabellen gibt es überhaupt kein Recht.
 */
export function TreatmentNoteSection({
  appointment,
  user,
  eingehend,
}: {
  appointment: Appointment;
  user: CurrentUser;
  /**
   * Der Rückweg des Termins. Ohne Angabe gilt der aus der Adresszeile - der
   * Abschnitt steht auf der Terminseite, die ihn dort trägt.
   */
  eingehend?: string;
}) {
  const [suche] = useSearchParams();
  const rueckweg = eingehend ?? leseRueckweg(suche, '');
  const darfLesen = canReadTreatmentNote(user.roles);
  const darfSchreiben = canWriteTreatmentNote(user.roles);
  const abgesagt = appointment.status === 'cancelled';
  // Aus „nicht angetroffen“ führt nur das Wiederöffnen weiter (ADR-018); der
  // Server weist die Dokumentation ab (TER-B01).
  const nichtAngetroffen = appointment.status === 'no_show';
  // Am offenen Termin steht oben die Aktionsleiste mit Haken und „Doku“ -
  // für alle, die dokumentieren und Termine verwalten dürfen. Hier unten
  // steht der Weg dann nicht noch einmal (DOK-14).
  const hauptknopfOben =
    appointment.status === 'confirmed' && darfSchreiben && canManageAppointments(user.roles);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['treatment-note', appointment.id],
    queryFn: () => fetchTreatmentDocumentation(appointment.id),
    enabled: darfLesen,
    retry: false,
  });

  // Die Frist der Praxis für das Abzeichen „Entwurf · Frist 08.10." (ADR-016
  // Punkt 7); dieselbe Abfrage wie unter Organisatorisches.
  const organisation = user.profile.organization_id;
  const { data: fristTage } = useQuery({
    queryKey: ['documentation-deadline', organisation],
    queryFn: () => fetchDocumentationDeadline(organisation),
    enabled: darfLesen && Boolean(data?.primary?.status === 'draft' || data?.addenda.length),
    retry: false,
  });

  if (!darfLesen) return null;

  const zone = appointment.organization_time_zone;
  const frist = fristDatum(appointment.starts_at, zone, fristTage);
  const eintrag = data?.primary ?? null;
  // Ohne Eintrag sagt der Abschnitt nur etwas, wenn eine Doku fällig ist: am
  // abgeschlossenen oder vorbeigegangenen Termin (Abschnitt 6). Zu einem
  // abgesagten oder nicht angetroffenen Termin entsteht keine; das sagen dort
  // die Zeilen des Zustands, nicht ein Erklärsatz (UX-005g).
  const vorbei = Date.parse(appointment.ends_at) <= Date.now();
  const faellig = !abgesagt && !nichtAngetroffen && (appointment.status !== 'confirmed' || vorbei);
  const anlegenHier = darfSchreiben && faellig && !hauptknopfOben;

  // „Dokumentation fehlt" sieht, wer Dokumentation lesen darf - auch das
  // Büro (ABN-005, ANN-201 Fassung 2, ADR-004 Fassung 2). Der Weg zum
  // Schreiben bleibt bei den behandelnden Rollen (`anlegenHier`).
  if (!isPending && !isError && !eintrag && !faellig) return null;

  const kopfAbzeichen = eintrag ? (
    zustandsAbzeichen(eintrag, frist)
  ) : !isPending && !isError ? (
    <Badge ton="warnung">Dokumentation fehlt</Badge>
  ) : null;

  return (
    <section aria-labelledby="dokumentation-titel" className="mt-5">
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          id="dokumentation-titel"
          className="text-ink-muted tracking-label text-xs font-semibold uppercase"
        >
          Dokumentation
        </h2>
        {kopfAbzeichen}
        {eintrag && appointment.patient_id ? (
          <Textlink
            to={mitRueckweg(`/patienten/${appointment.patient_id}/doku`, rueckweg)}
            className="ml-auto inline-flex min-h-11 items-center text-sm"
          >
            Eintrag in der Akte →
          </Textlink>
        ) : null}
      </div>
      {isPending ? <LoadingState label="Dokumentation wird geladen …" /> : null}

      {isError ? (
        <div className="mt-2">
          <ErrorState
            title="Die Behandlungsdokumentation konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => refetch()}
          />
        </div>
      ) : null}

      {!isPending && !isError && !eintrag && anlegenHier ? (
        <div className="mt-2 flex">
          <ButtonLink
            to={mitRueckweg(`/termine/${appointment.id}/abschluss`, rueckweg)}
            groesse="kompakt"
          >
            Doku <span className="sr-only">schreiben</span>
          </ButtonLink>
        </div>
      ) : null}

      {eintrag ? (
        <>
          <Eintrag
            appointment={appointment}
            note={eintrag}
            darfSchreiben={darfSchreiben}
            istNachtrag={false}
            hauptknopfOben={hauptknopfOben}
            eingehend={rueckweg}
            frist={frist}
          />

          {data?.addenda.map((nachtrag) => (
            <Eintrag
              key={nachtrag.id}
              appointment={appointment}
              note={nachtrag}
              darfSchreiben={darfSchreiben}
              istNachtrag
              hauptknopfOben={hauptknopfOben}
              eingehend={rueckweg}
              frist={frist}
            />
          ))}
        </>
      ) : null}
      {/* Keine Fußnote zur Protokollierung mehr: Sie erklärte das System,
          nicht den Eintrag (UX-005g). Protokolliert wird unverändert (ADR-010). */}
    </section>
  );
}
