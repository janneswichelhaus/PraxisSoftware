import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
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
  fetchTreatmentDocumentation,
  finalizeTreatmentNote,
  treatmentNoteStatusLabels,
  type TreatmentNote,
} from './api';
import { ENTWURF_ZUSATZ, FREITEXT, herkunft, zeitpunkt } from './format';

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
}: {
  appointment: Appointment;
  note: TreatmentNote;
  darfSchreiben: boolean;
  istNachtrag: boolean;
  /** Steht oben am Termin schon „Dokumentieren und abschließen“ (DOK-14)? */
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
    <div className="border-line mt-2 border-t pt-4">
      {/* Zustände als Etikett, nicht als Bedienelement (UIK-18, DOK-13):
          „Finalisiert“ trägt das Zeichen ✓, der Rest bleibt neutral. Es geht
          um den Bearbeitungsstand, nicht um den Inhalt (§17). */}
      <div className="flex flex-wrap items-center gap-2">
        {istNachtrag ? <Badge>Nachtrag</Badge> : null}
        <Badge ton={final ? 'positiv' : 'neutral'}>{treatmentNoteStatusLabels[note.status]}</Badge>
        {/* Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018). Er steht
            als eigenes Merkmal neben dem Freitext, nicht darin: Ob behandelt
            wurde, entscheidet später über eine Rechnung ohne erbrachte
            Leistung (ADR-018 Fassung 3 Punkt 9). */}
        {note.visit_without_treatment ? <Badge>Ohne Behandlung</Badge> : null}
        {note.status === 'draft' ? (
          <span className="text-ink-muted text-xs">{ENTWURF_ZUSATZ}</span>
        ) : null}
        {final && note.version_count > 1 ? (
          <span className="text-ink-muted text-xs">
            {note.version_count} Versionen, zuletzt korrigiert am {zeitpunkt(note.updated_at, zone)}
          </span>
        ) : null}
      </div>

      {note.visit_without_treatment ? (
        <p className="text-ink-muted mt-3 max-w-prose text-sm leading-relaxed">
          Tür geöffnet, Behandlung auf Angabe der Patient:in nicht durchgeführt. Der Termin gilt als
          durchgeführt; eine Ausfallgebühr entsteht nicht.
        </p>
      ) : null}

      <p className={`text-ink text-liste mt-3 max-w-prose leading-relaxed ${FREITEXT}`}>
        {note.content}
      </p>

      <p className="text-ink-muted mt-3 text-xs leading-relaxed">{herkunft(note, zone)}</p>

      <div className="mt-4 flex flex-wrap items-start gap-3">
        {darfSchreiben && !final ? (
          <ButtonLink
            to={mit(istNachtrag ? `${basis}/${note.id}/bearbeiten` : basis)}
            variant="secondary"
          >
            {istNachtrag ? 'Nachtrag bearbeiten' : 'Dokumentation bearbeiten'}
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
            ausloeserVariante={hauptknopfOben ? 'secondary' : 'primary'}
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
          <ButtonLink to={mit(`${basis}/${note.id}/nachtrag`)} variant="secondary">
            Nachtrag hinzufügen
          </ButtonLink>
        ) : null}

        {darfSchreiben && final ? (
          <ButtonLink to={mit(`${basis}/${note.id}/korrektur`)} variant="quiet">
            Korrigieren
          </ButtonLink>
        ) : null}

        {note.version_count > 0 ? (
          <ButtonLink to={mit(`${basis}/${note.id}/verlauf`)} variant="secondary">
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
  // Am offenen Termin steht oben „Dokumentieren und abschließen“ als
  // Hauptknopf - für alle, die dokumentieren und Termine verwalten dürfen.
  // Hier unten ist der Weg dann sekundär (DOK-14).
  const hauptknopfOben =
    appointment.status === 'confirmed' && darfSchreiben && canManageAppointments(user.roles);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['treatment-note', appointment.id],
    queryFn: () => fetchTreatmentDocumentation(appointment.id),
    enabled: darfLesen,
    retry: false,
  });

  if (!darfLesen) return null;

  const eintrag = data?.primary ?? null;

  return (
    <Section titel="Behandlungsdokumentation">
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

      {!isPending && !isError && !eintrag ? (
        <div className="border-line mt-2 border-t pt-4">
          <p className="text-ink-muted text-liste max-w-prose">
            {abgesagt
              ? 'Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation.'
              : nichtAngetroffen
                ? 'Zu einem nicht angetroffenen Termin entsteht keine Behandlungsdokumentation. War das ein Irrtum, zuerst „Termin wieder öffnen“.'
                : 'Für diesen Termin ist noch keine Behandlungsdokumentation hinterlegt.'}
          </p>
          {darfSchreiben && !abgesagt && !nichtAngetroffen ? (
            <ButtonLink
              to={mitRueckweg(`/termine/${appointment.id}/dokumentation`, rueckweg)}
              variant={hauptknopfOben ? 'secondary' : 'primary'}
              className="mt-3"
            >
              Dokumentation anlegen
            </ButtonLink>
          ) : null}
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
            />
          ))}
        </>
      ) : null}

      <p className="text-ink-muted mt-4 max-w-prose text-xs leading-relaxed">
        Zugriffe auf die Behandlungsdokumentation werden protokolliert.
      </p>
    </Section>
  );
}
