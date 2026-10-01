import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  appointmentTypeHint,
  completeAppointment,
  formatLocalTimeRange,
  reopenAppointment,
} from '@/features/appointments/api';
import {
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import {
  finalizeTrainingProtocol,
  getTrainingProtocol,
  listTrainingProtocols,
  saveTrainingProtocol,
  type TrainingAppointment,
  type TrainingClient,
  type TrainingProtocol,
} from './api';

/**
 * Das Trainingsprotokoll (TRN-009, TRN-010).
 *
 * Was in einer Einheit gemacht wurde, in eigenen Worten. Es ist ein
 * Fachdatum des Trainingsverhältnisses und ausdrücklich **kein Befund**
 * (ADR-022 Punkt 7, ADR-006 Fassung 3: „Beschriftung ist Zweckbestimmung").
 * Die Seite zeigt den Text und sonst nichts: keine Auswertung, keinen
 * Vorschlag, keine Farbe (ADR-006 Punkte 10 bis 12), und nichts aus der Akte
 * (ADR-021 Punkt 7).
 *
 * Schreiben, Abschließen und Lesen dürfen owner und Trainingsbetreuung
 * (ANN-184); das prüft der Server, die Seite blendet nur aus. Abgeschlossen
 * ist das Protokoll unveränderlich (ANN-185), und der Termin gilt als
 * dokumentiert (ADR-018 Punkt 3).
 */

const PROTOKOLLTEXTE: Verlustschutztexte = {
  bezeichnung: 'Ungespeichertes Trainingsprotokoll',
  weitergehen: 'Das Protokoll ist noch nicht gespeichert. Beim Weitergehen geht der Text verloren.',
  abmelden: 'Das Protokoll ist noch nicht gespeichert. Beim Abmelden geht der Text verloren.',
  bleibtStehen: 'Der Text steht weiter im Feld',
  ohneVerbindung:
    'Ohne Verbindung lässt sich gerade nicht speichern. Der Text bleibt im Feld stehen – bitte warten, bis die Verbindung zurück ist, und dann erneut speichern.',
  weitergeschrieben:
    'Während des Speicherns wurde weitergeschrieben. Der neue Text steht noch im Feld und liegt noch nicht auf dem Server – bitte noch einmal speichern.',
};

function zeitpunkt(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zone,
  }).format(new Date(iso));
}

/** Wie in der Terminliste darüber: „Mi., 30.09.2026". */
function kurzesDatum(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zone,
  }).format(new Date(iso));
}

/**
 * Lädt nach, was ein Vorgang am Termin geändert hat. Das Protokoll selbst nur
 * nach dem Abschluss: Beim Vermerken und Wiederöffnen steht vielleicht
 * ungespeicherter Text im Feld, und ein gescheitertes Nachladen darf ihn
 * nicht wegnehmen (Zweitreview 4) - es wäre auch ein unnötiges Lesen im
 * Protokoll.
 */
function invalidiereTermin(
  queryClient: ReturnType<typeof useQueryClient>,
  termin: TrainingAppointment,
  mitProtokoll: boolean,
) {
  void queryClient.invalidateQueries({ queryKey: ['training-appointment', termin.id] });
  if (mitProtokoll) {
    void queryClient.invalidateQueries({ queryKey: ['training-protocol', termin.id] });
  }
  void queryClient.invalidateQueries({
    queryKey: ['training-protocols', termin.training_relationship_id],
  });
  void queryClient.invalidateQueries({
    queryKey: ['training-client-appointments', termin.training_relationship_id],
  });
  void queryClient.invalidateQueries({ queryKey: ['appointments'] });
  void queryClient.invalidateQueries({ queryKey: ['day-plan'] });
}

export function TrainingProtokoll({ termin }: { termin: TrainingAppointment }) {
  const protokoll = useQuery({
    queryKey: ['training-protocol', termin.id],
    queryFn: () => getTrainingProtocol(termin.id),
    retry: false,
  });

  return (
    <Section titel="Trainingsprotokoll" rahmen>
      {/* Ein gescheitertes Nachladen ersetzt vorhandene Daten nicht - sonst
          nähme es den Text im Feld mit (Zweitreview 4). */}
      {protokoll.data === undefined ? (
        protokoll.isError ? (
          <ErrorState
            title="Das Trainingsprotokoll konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => protokoll.refetch()}
          />
        ) : (
          <LoadingState label="Trainingsprotokoll wird geladen …" />
        )
      ) : protokoll.data?.status === 'final' ? (
        <Abgeschlossen protokoll={protokoll.data} zone={termin.organization_time_zone} />
      ) : termin.status === 'confirmed' || termin.status === 'completed' ? (
        <Entwurf termin={termin} protokoll={protokoll.data} />
      ) : (
        // Ein dokumentierter Termin ohne Protokoll: Der Löschlauf hat es nach
        // Ablauf der Frist genommen (ANN-183). Einen neuen Entwurf gibt es
        // hier nicht (Zweitreview 2).
        <p className="text-ink-muted text-sm">Zu diesem Termin gibt es kein Trainingsprotokoll.</p>
      )}
    </Section>
  );
}

function Abgeschlossen({ protokoll, zone }: { protokoll: TrainingProtocol; zone: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink leading-relaxed whitespace-pre-wrap">{protokoll.content}</p>
      <p className="text-ink-muted text-sm">
        Abgeschlossen
        {protokoll.finalized_at ? ` am ${zeitpunkt(protokoll.finalized_at, zone)}` : ''}
        {/* Dass ein abgeschlossenes Protokoll fest ist, sagt die Rückfrage
            beim Abschließen; hier steht nur der Stand (UX-005i). */}
        {protokoll.finalized_by_name ? ` von ${protokoll.finalized_by_name}` : ''}.
      </p>
    </div>
  );
}

function Entwurf({
  termin,
  protokoll,
}: {
  termin: TrainingAppointment;
  protokoll: TrainingProtocol | null;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(protokoll?.content ?? '');
  const [gespeichert, setGespeichert] = useState(protokoll?.content ?? '');
  const [stand, setStand] = useState<string | null>(protokoll?.updated_at ?? null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const textRef = useRef(text);
  textRef.current = text;

  const ungespeichert = text.trim() !== gespeichert.trim();

  async function speichern(): Promise<boolean> {
    const inhalt = textRef.current;
    const neu = await saveTrainingProtocol(termin.id, inhalt, stand);
    setStand(neu.updated_at);
    setGespeichert(inhalt);
    void queryClient.invalidateQueries({
      queryKey: ['training-protocols', termin.training_relationship_id],
    });
    return textRef.current === inhalt;
  }

  const { schreiben, laeuft, schutz } = useTextverlustschutz({
    ungespeichert,
    speichern,
    texte: PROTOKOLLTEXTE,
  });

  const abschluss = useMutation({
    mutationFn: () => finalizeTrainingProtocol(termin.id, textRef.current, stand),
    onSuccess: () => {
      setGespeichert(textRef.current);
      invalidiereTermin(queryClient, termin, true);
    },
  });

  function pruefen(): boolean {
    if (text.trim() === '') {
      setFehler('Bitte festhalten, was in der Einheit gemacht wurde.');
      return false;
    }
    setFehler(undefined);
    return true;
  }

  return (
    <div className="flex flex-col gap-4">
      {meldung ? <Statusmeldung ton="erfolg">{meldung}</Statusmeldung> : null}
      {/* Was Entwurf und Abschluss bedeuten, sagen Knopf und Rückfrage (UX-005i). */}
      <TextArea
        label="Was in der Einheit gemacht wurde"
        hint="Übungen, Umfang, Absprachen – in eigenen Worten."
        rows={6}
        maxLength={20000}
        value={text}
        error={fehler}
        onChange={(e) => {
          setText(e.target.value);
          setMeldung(null);
          if (fehler) setFehler(undefined);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {/* Das Abzeichen steht in der Knopfzeile statt in einem eigenen
            Absatz (UX-005i). */}
        {protokoll || stand ? <Badge>Entwurf</Badge> : null}
        <Button
          type="button"
          variant="secondary"
          disabled={laeuft || abschluss.isPending || !ungespeichert}
          onClick={() => {
            if (!pruefen()) return;
            void schreiben({
              ausfuehren: speichern,
              fehlertitel: 'Das Protokoll wurde nicht gespeichert',
              danach: () => setMeldung('Entwurf gespeichert.'),
            });
          }}
        >
          {laeuft ? 'Wird gespeichert …' : 'Entwurf speichern'}
        </Button>
        <Rueckfrage
          ausloeser="Protokoll abschließen"
          ausloeserVariante="primary"
          bestaetigen="Ja, abschließen"
          bestaetigenLaeuft="Wird abgeschlossen …"
          fehler={abschluss.isError ? abschluss.error.message : undefined}
          laeuft={laeuft || abschluss.isPending}
          onBestaetigen={async () => {
            if (!pruefen()) throw new Error('Bitte festhalten, was in der Einheit gemacht wurde.');
            await abschluss.mutateAsync();
          }}
        >
          <p>
            Das Protokoll wird mit dem Text im Feld abgeschlossen und lässt sich danach nicht mehr
            ändern. Der Termin gilt dann als dokumentiert.
          </p>
        </Rueckfrage>
      </div>
      {schutz}
    </div>
  );
}

/**
 * Abschließen und Wiederöffnen am Trainingstermin (TRN-010, ANN-186).
 *
 * „Durchgeführt" ist eine organisatorische Feststellung ohne Inhalt, wie am
 * Behandlungstermin (ANN-005); dokumentiert ist der Termin erst mit dem
 * abgeschlossenen Protokoll. Wieder öffnen geht nur vom durchgeführten
 * Termin - ein dokumentierter hat keinen Rückweg (ADR-018 Punkt 2).
 */
export function TerminAbschluss({
  termin,
  onGeaendert,
}: {
  termin: TrainingAppointment;
  onGeaendert: (meldung: string) => void;
}) {
  const queryClient = useQueryClient();
  const abschliessen = useMutation({
    mutationFn: () => completeAppointment(termin.id, termin.updated_at),
    onSuccess: () => {
      invalidiereTermin(queryClient, termin, false);
      onGeaendert('Termin als durchgeführt vermerkt.');
    },
  });
  const oeffnen = useMutation({
    mutationFn: () => reopenAppointment(termin.id, termin.updated_at),
    onSuccess: () => {
      invalidiereTermin(queryClient, termin, false);
      onGeaendert('Termin wieder geöffnet.');
    },
  });

  if (termin.status === 'confirmed') {
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={abschliessen.isPending}
          onClick={() => abschliessen.mutate()}
        >
          {abschliessen.isPending ? 'Wird vermerkt …' : 'Als durchgeführt vermerken'}
        </Button>
        {abschliessen.isError ? (
          <p role="alert" className="text-danger text-sm">
            {abschliessen.error.message}
          </p>
        ) : null}
      </div>
    );
  }
  if (termin.status === 'completed') {
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="quiet"
          disabled={oeffnen.isPending}
          onClick={() => oeffnen.mutate()}
        >
          {oeffnen.isPending ? 'Wird geöffnet …' : 'Wieder öffnen'}
        </Button>
        {oeffnen.isError ? (
          <p role="alert" className="text-danger text-sm">
            {oeffnen.error.message}
          </p>
        ) : null}
      </div>
    );
  }
  return null;
}

/**
 * Die Einheiten einer Trainingskund:in (TRN-009) - der Navigationspunkt
 * „Sessions" der Referenz (ROADMAP Block 3, Punkt 3): protokollierte
 * Einheiten, neueste zuerst. Kein Zähler, keine Kurve, keine Bewertung
 * (ADR-006 Punkt 11); jedes gezeigte Protokoll protokolliert der Server.
 */
export function TrainingEinheiten({ kundin }: { kundin: TrainingClient }) {
  const hier = `/training/${kundin.id}`;
  const einheiten = useQuery({
    queryKey: ['training-protocols', kundin.id],
    queryFn: () => listTrainingProtocols(kundin.id),
    retry: false,
  });

  return (
    <Section titel="Einheiten" rahmen>
      {einheiten.isPending ? (
        <LoadingState label="Einheiten werden geladen …" />
      ) : einheiten.isError ? (
        <ErrorState
          title="Die Einheiten konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => einheiten.refetch()}
        />
      ) : einheiten.data.length === 0 ? (
        <p className="text-ink-muted text-sm">
          Noch kein Trainingsprotokoll. Es entsteht am Trainingstermin.
        </p>
      ) : (
        <ul className="divide-line flex flex-col divide-y">
          {einheiten.data.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  className="text-accent hover:underline"
                  to={mitRueckweg(`/training/termine/${e.appointment_id}`, hier)}
                >
                  {kurzesDatum(e.starts_at, e.organization_time_zone)},{' '}
                  {formatLocalTimeRange(e.starts_at, e.ends_at, e.organization_time_zone)}
                </Link>
                <span className="text-ink-muted flex items-center gap-2 text-sm">
                  {/* Nur eine abweichende Terminart steht dran (ANN-192, UX-005i). */}
                  {appointmentTypeHint(e.appointment_type)
                    ? `${appointmentTypeHint(e.appointment_type)} · `
                    : ''}
                  {e.staff_given_name}
                  {e.status === 'draft' ? <Badge>Entwurf</Badge> : null}
                </span>
              </div>
              <p className="text-ink text-sm leading-relaxed whitespace-pre-wrap">{e.content}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
