import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { NachladeHinweis } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { mitRueckweg } from '@/lib/rueckweg';
import { completeAppointment, reopenAppointment } from '@/features/calendar';
import { useTextverlustschutz, type Verlustschutztexte } from '@/app/Textverlustschutz';
import {
  finalizeTrainingProtocol,
  addTrainingProtocolAddendum,
  getTrainingProtocol,
  listTrainingProtocols,
  saveTrainingProtocol,
  type TrainingAppointment,
  type TrainingClient,
  type TrainingProtocol,
} from './api';
import { formatLocalTimeRange } from '@/lib/datum';
import { appointmentTypeHint } from '@/lib/termin';

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

/**
 * Das Protokoll am Termin. Lesen dürfen seit ABN-022 auch das Büro
 * (`darfSchreiben` false: nur der Text, kein Feld); schreiben, abschließen und
 * Nachträge anhängen owner und Trainingsbetreuung (BEF-113).
 *
 * Seit dem Design-Rollout (Welle B3a) ist der Entwurf eine Arbeitsseite
 * (DESIGN.md „Arbeitsseite“): das lange Feld im Abschnitt, „Entwurf
 * speichern“ und „Protokoll abschließen“ in der klebenden `Aktionsleiste`
 * über der Tableiste, der Hauptknopf rechts. Die Leiste steht deshalb neben
 * dem Abschnitt, nicht in ihm - die Seite setzt diese Komponente als letztes
 * Glied, damit die Leiste über die ganze Seite klebt.
 */
export function TrainingProtokoll({
  termin,
  darfSchreiben = true,
}: {
  termin: TrainingAppointment;
  darfSchreiben?: boolean;
}) {
  const protokoll = useQuery({
    queryKey: ['training-protocol', termin.id],
    queryFn: () => getTrainingProtocol(termin.id),
    retry: false,
  });

  if (protokoll.data === undefined) {
    return (
      <Section titel="Trainingsprotokoll">
        <Abfragezustand
          abfrage={protokoll}
          laden="Trainingsprotokoll wird geladen …"
          fehler="Das Trainingsprotokoll konnte nicht geladen werden."
          inKarte
        >
          {() => null}
        </Abfragezustand>
      </Section>
    );
  }

  // Ein gescheitertes Nachladen ersetzt vorhandene Daten nicht - sonst nähme
  // es den Text im Feld mit (Zweitreview 4). Der Stand bleibt, mit Hinweis.
  const veraltet = protokoll.isError ? (
    <NachladeHinweis
      className="mb-3"
      laeuft={protokoll.isFetching}
      onErneut={() => void protokoll.refetch()}
    />
  ) : null;

  if (protokoll.data?.status === 'final') {
    return (
      <Section titel="Trainingsprotokoll" rahmen>
        {veraltet}
        <Abgeschlossen
          protokoll={protokoll.data}
          zone={termin.organization_time_zone}
          termin={termin}
          darfNachtragen={darfSchreiben}
        />
      </Section>
    );
  }
  if (!darfSchreiben) {
    // Das Büro liest den Entwurf, schreibt aber nicht (ANN-184 Fassung 2).
    return (
      <Section titel="Trainingsprotokoll" rahmen>
        {veraltet}
        {protokoll.data ? (
          <div className="flex flex-col gap-2">
            <div>
              <Badge>Entwurf</Badge>
            </div>
            <p className="text-ink leading-relaxed whitespace-pre-wrap">{protokoll.data.content}</p>
          </div>
        ) : (
          <p className="text-ink-muted text-sm">Noch kein Protokoll.</p>
        )}
      </Section>
    );
  }
  if (termin.status === 'confirmed' || termin.status === 'completed') {
    return <Entwurf termin={termin} protokoll={protokoll.data} veraltet={veraltet} />;
  }
  // Ein dokumentierter Termin ohne Protokoll: Der Löschlauf hat es nach Ablauf
  // der Frist genommen (ANN-183). Einen neuen Entwurf gibt es hier nicht
  // (Zweitreview 2).
  return (
    <Section titel="Trainingsprotokoll" rahmen>
      {veraltet}
      <p className="text-ink-muted text-sm">Zu diesem Termin gibt es kein Trainingsprotokoll.</p>
    </Section>
  );
}

function Abgeschlossen({
  protokoll,
  zone,
  termin,
  darfNachtragen,
}: {
  protokoll: TrainingProtocol;
  zone: string;
  termin: TrainingAppointment;
  darfNachtragen: boolean;
}) {
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
      {/* Nachträge unter dem Text, wie in der Behandlung (ABN-022, BEF-113):
          als Zeile mit Linie links, kein Kasten im Kasten (L2). */}
      {protokoll.addenda.map((n) => (
        <div key={n.id} className="border-line border-l-2 pl-3">
          <p className="text-ink-muted text-sm">
            Nachtrag vom {zeitpunkt(n.created_at, zone)}
            {n.author_name ? ` von ${n.author_name}` : ''} · Grund: {n.reason}
          </p>
          <p className="text-ink leading-relaxed whitespace-pre-wrap">{n.content}</p>
        </div>
      ))}
      {darfNachtragen ? <Nachtrag termin={termin} /> : null}
    </div>
  );
}

/** Einen Nachtrag mit Grund anhängen - der Text darüber bleibt (ANN-185 Fassung 2). */
function Nachtrag({ termin }: { termin: TrainingAppointment }) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [inhalt, setInhalt] = useState('');
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const nachtragen = useMutation({
    mutationFn: () => addTrainingProtocolAddendum(termin.id, inhalt, grund),
    onSuccess: async () => {
      setOffen(false);
      setInhalt('');
      setGrund('');
      await queryClient.invalidateQueries({ queryKey: ['training-protocol', termin.id] });
    },
  });

  if (!offen) {
    return (
      <div className="border-line border-t pt-3">
        <Button type="button" variant="secondary" groesse="kompakt" onClick={() => setOffen(true)}>
          Nachtrag schreiben
        </Button>
      </div>
    );
  }
  return (
    <form
      noValidate
      aria-label="Nachtrag schreiben"
      className="border-line flex flex-col gap-4 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (inhalt.trim() === '' || grund.trim().length < 3) {
          setFehler('Bitte Nachtrag und Grund angeben.');
          return;
        }
        setFehler(undefined);
        nachtragen.mutate();
      }}
    >
      <TextArea
        label="Nachtrag"
        rows={3}
        maxLength={5000}
        value={inhalt}
        onChange={(e) => setInhalt(e.target.value)}
      />
      <TextArea
        label="Grund des Nachtrags"
        rows={2}
        maxLength={500}
        error={fehler}
        value={grund}
        onChange={(e) => setGrund(e.target.value)}
      />
      {nachtragen.isError ? (
        <Statusmeldung ton="fehler">{nachtragen.error.message}</Statusmeldung>
      ) : null}
      <Formularfuss>
        <Button type="submit" disabled={nachtragen.isPending}>
          {nachtragen.isPending ? 'Wird gespeichert …' : 'Nachtrag speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}

function Entwurf({
  termin,
  protokoll,
  veraltet,
}: {
  termin: TrainingAppointment;
  protokoll: TrainingProtocol | null;
  veraltet: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(protokoll?.content ?? '');
  const [gespeichert, setGespeichert] = useState(protokoll?.content ?? '');
  const [stand, setStand] = useState<string | null>(protokoll?.updated_at ?? null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const [abschliessen, setAbschliessen] = useState(false);
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

  // Als Zeile über der Leiste statt als Kasten (Design-Handoff 2026-10-01,
  // Abschnitt 6a) - dieselben drei Wege wie auf der Schreibseite (ANN-046).
  const { schreiben, laeuft, schutz } = useTextverlustschutz({
    ungespeichert,
    speichern,
    texte: PROTOKOLLTEXTE,
    kompakt: true,
  });

  const abschluss = useMutation({
    mutationFn: () => finalizeTrainingProtocol(termin.id, textRef.current, stand),
    onSuccess: () => {
      setGespeichert(textRef.current);
      setAbschliessen(false);
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
    <>
      <Section titel="Trainingsprotokoll" rahmen>
        {veraltet}
        {/* Was Entwurf und Abschluss bedeuten, sagen Knopf und Rückfrage (UX-005i). */}
        <TextArea
          label="Was in der Einheit gemacht wurde"
          hint="Übungen, Umfang, Absprachen – in eigenen Worten."
          rows={8}
          maxLength={20000}
          value={text}
          error={fehler}
          onChange={(e) => {
            setText(e.target.value);
            setMeldung(null);
            if (fehler) setFehler(undefined);
          }}
        />
      </Section>

      <Aktionsleiste
        oben={
          <>
            {meldung ? (
              <Statusmeldung ton="erfolg" className="px-4 py-1">
                {meldung}
              </Statusmeldung>
            ) : null}
            {schutz}
          </>
        }
      >
        {/* Das Abzeichen steht in der Leiste statt in einem eigenen Absatz
            (UX-005i). */}
        {protokoll || stand ? <Badge>Entwurf</Badge> : null}
        <Button
          type="button"
          variant="quiet"
          className="ml-auto"
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
        <Button
          type="button"
          disabled={laeuft || abschluss.isPending}
          onClick={() => {
            abschluss.reset();
            setAbschliessen(true);
          }}
        >
          Protokoll abschließen
        </Button>
      </Aktionsleiste>

      {/* Die Rückfrage als Fenster über dem Inhalt: Sie entsteht in der
          Leiste am unteren Rand, wo ein aufgehender Kasten keinen Platz hat
          (FIX-016, ANN-058). Der Text ist derselbe wie bisher. */}
      {abschliessen ? (
        <Dialogfenster
          titel="Protokoll abschließen?"
          onSchliessen={() => {
            if (!abschluss.isPending) setAbschliessen(false);
          }}
        >
          <p className="text-ink text-sm">
            Das Protokoll wird mit dem Text im Feld abgeschlossen und lässt sich danach nicht mehr
            ändern. Der Termin gilt dann als dokumentiert.
          </p>
          {abschluss.isError ? (
            <Statusmeldung ton="fehler" className="mt-3">
              {abschluss.error.message}
            </Statusmeldung>
          ) : null}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              data-autofocus
              disabled={laeuft || abschluss.isPending}
              onClick={() => {
                if (!pruefen()) {
                  setAbschliessen(false);
                  return;
                }
                abschluss.mutate();
              }}
            >
              {abschluss.isPending ? 'Wird abgeschlossen …' : 'Ja, abschließen'}
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={abschluss.isPending}
              onClick={() => setAbschliessen(false)}
            >
              Abbrechen
            </Button>
          </div>
        </Dialogfenster>
      ) : null}
    </>
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
          <Statusmeldung ton="fehler">{abschliessen.error.message}</Statusmeldung>
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
          <Statusmeldung ton="fehler">{oeffnen.error.message}</Statusmeldung>
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
 *
 * Seit Welle B3a eine Zeilenliste: Datum, Art und Person, darunter der Anfang
 * des Textes in zwei Zeilen; das Ganze steht am Trainingstermin, zu dem die
 * Zeile führt (Liste → Detail).
 */
export function TrainingEinheiten({ kundin }: { kundin: TrainingClient }) {
  const hier = `/training/${kundin.id}`;
  const einheiten = useQuery({
    queryKey: ['training-protocols', kundin.id],
    queryFn: () => listTrainingProtocols(kundin.id),
    retry: false,
  });

  return (
    <Section titel="Einheiten">
      <Abfragezustand
        abfrage={einheiten}
        laden="Einheiten werden geladen …"
        fehler="Die Einheiten konnten nicht geladen werden."
        inKarte
        leer={{
          wenn: (liste) => liste.length === 0,
          titel: 'Noch kein Trainingsprotokoll.',
          beschreibung: 'Es entsteht am Trainingstermin.',
        }}
      >
        {(liste) => (
          <ListRows>
            {liste.map((e) => (
              <ListRow
                key={e.id}
                to={mitRueckweg(`/training/termine/${e.appointment_id}`, hier)}
                titel={`${kurzesDatum(e.starts_at, e.organization_time_zone)}, ${formatLocalTimeRange(
                  e.starts_at,
                  e.ends_at,
                  e.organization_time_zone,
                )}`}
                meta={
                  <>
                    {/* Nur eine abweichende Terminart steht dran (ANN-192, UX-005i). */}
                    {[appointmentTypeHint(e.appointment_type), e.staff_given_name]
                      .filter(Boolean)
                      .join(' · ')}
                    <span className="text-ink mt-0.5 line-clamp-2 block whitespace-pre-wrap">
                      {e.content}
                    </span>
                  </>
                }
                status={e.status === 'draft' ? <Badge>Entwurf</Badge> : undefined}
              />
            ))}
          </ListRows>
        )}
      </Abfragezustand>
    </Section>
  );
}
