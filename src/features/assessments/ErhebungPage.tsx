import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { TextArea } from '@/components/ui/TextArea';
import { formatDate } from '@/lib/datum';
import type { Formularfehler } from '@/lib/formularfehler';
import { todayInTimeZone } from '@/features/appointments/api';
import { fetchPatient, fullName, type Patient } from '@/features/patients/api';
import {
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { canWriteQuestionnaire, type CurrentUser } from '@/features/session/types';
import { antwortFehler, type Antwort, type Antworten } from './antworten';
import {
  erhebungAbschliessen,
  erhebungenQueryKey,
  erhebungSpeichern,
  erhebungVerwerfen,
  fetchErhebungen,
  type Erhebung as ErhebungDaten,
} from './api';
import { beschriftung, erhebenPfad, frageFeldId, ohneAbsenden } from './darstellung';
import { FragebogenFelder } from './FragebogenFelder';
import { erhebbareInstrumente } from './instrumente';
import type { ScoreDefinition } from './schema';

/**
 * Einen Fragebogen erheben (FRB-002b).
 *
 * Drei Wege, eine Seite: neu erheben, einen Entwurf weiter ausfüllen
 * (`?entwurf=`), einen abgeschlossenen Bogen korrigieren (`?korrigiert=`). Die
 * Korrektur beginnt mit den alten Antworten und endet als **neue** Erhebung
 * mit Begründung — die alte bleibt, wie sie war (ANN-103).
 *
 * Die Seite liegt außerhalb des Aktenrahmens: Wer 39 Fragen ausfüllt, soll
 * nicht mit einem Tap auf die Bereichsleiste alles verlieren (UX-009).
 *
 * Jeder Zustand, in dem kein Bogen erscheint, trägt Titel und Rückweg zum
 * Befund (BEF-02): Bis UXR-009 führte aus diesen Seiten nur die Tableiste.
 */
export function ErhebungPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();
  return <Erhebung patientId={patientId} user={user} />;
}

/**
 * Die Sätze des Verlustschutzes für den Bogen (BEF-17): Verloren gingen hier
 * Antworten, kein „Text" - auch dann, wenn nur Kreuze gesetzt sind.
 */
const ANTWORTTEXTE: Verlustschutztexte = {
  bezeichnung: 'Ungespeicherte Antworten',
  weitergehen: 'Die Antworten sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
  abmelden: 'Die Antworten sind noch nicht gespeichert. Beim Abmelden gehen sie verloren.',
  bleibtStehen: 'Die Antworten stehen weiter im Bogen',
  ohneVerbindung:
    'Ohne Verbindung lässt sich gerade nicht speichern. Die Antworten bleiben im Bogen stehen – bitte warten, bis die Verbindung zurück ist, und dann erneut speichern.',
  weitergeschrieben:
    'Während des Speicherns wurde weiter geantwortet. Die neuen Antworten stehen noch im Bogen und sind noch nicht gespeichert – bitte noch einmal speichern.',
};

/** Ein Zustand ohne Bogen: Titel, Rückweg zum Befund und die Meldung (BEF-02). */
function Fehlerseite({
  zurueck,
  titel,
  beschreibung,
  children,
}: {
  zurueck: string;
  titel: string;
  beschreibung?: string | undefined;
  children: ReactNode;
}) {
  return (
    <>
      <Rueckweg standard={zurueck} beschriftung="Zurück zum Befund" />
      <PageHeader title={titel} description={beschreibung} />
      {children}
    </>
  );
}

interface Ausgangslage {
  /** Instrument, Entwurf und Korrektur aus der Adresse - wechselt die, gilt eine neue Lage. */
  schluessel: string;
  entwurf: ErhebungDaten | undefined;
  korrigiert: ErhebungDaten | undefined;
  /** Der Bogen, den eine Korrektur ersetzt - neu begonnen oder als Entwurf fortgesetzt. */
  ersetzt: ErhebungDaten | undefined;
}

export function Erhebung({
  patientId,
  user,
}: {
  patientId: string | undefined;
  user: CurrentUser;
}) {
  const [suche] = useSearchParams();

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });
  const erhebungen = useQuery({
    queryKey: erhebungenQueryKey(patientId ?? ''),
    queryFn: () => fetchErhebungen(patientId!),
    enabled: Boolean(patientId),
  });
  const ausgangslage = useRef<Ausgangslage | null>(null);

  const zurueck = `/patienten/${patientId ?? ''}/doku/befund`;
  const definition = erhebbareInstrumente().find(
    (score) => score.meta.id === suche.get('instrument'),
  );
  const titel = definition?.meta.name_de ?? 'Fragebogen erheben';

  if (!canWriteQuestionnaire(user.roles)) {
    return (
      <Fehlerseite zurueck={zurueck} titel={titel}>
        <ErrorState
          title="Nicht freigegeben"
          description="Fragebögen erheben Praxisinhaber:in, Therapeut:innen und Teamleitung."
        />
      </Fehlerseite>
    );
  }
  if (patient.isPending || erhebungen.isPending) return <LoadingState label="Wird geladen …" />;
  // Nur ohne Daten ersetzt der Fehler die Seite (ZST-03): Scheitert ein
  // Nachladen im Hintergrund - nach dem eigenen Sichern, beim Wiederverbinden
  // -, bleiben die Daten und mit ihnen der Bogen samt Antworten stehen.
  if (patient.data === undefined || erhebungen.data === undefined) {
    return (
      <Fehlerseite zurueck={zurueck} titel={titel}>
        <ErrorState
          title="Der Bogen konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => Promise.all([patient.refetch(), erhebungen.refetch()])}
        />
      </Fehlerseite>
    );
  }
  // Nicht gefunden ist etwas anderes als nicht geladen (ZST-08).
  if (patient.data === null) {
    return (
      <Fehlerseite zurueck={zurueck} titel={titel}>
        <ErrorState
          title="Nicht gefunden"
          description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
        />
      </Fehlerseite>
    );
  }
  const name = fullName(patient.data);

  if (!definition) {
    return (
      <Fehlerseite zurueck={zurueck} titel={titel} beschreibung={name}>
        <ErrorState
          title="Diesen Fragebogen gibt es nicht oder er ist nicht freigegeben."
          description="Welche Bögen sich erheben lassen, steht im Befund der Akte."
        />
      </Fehlerseite>
    );
  }

  // Entschieden wird beim ersten Laden und danach festgehalten: Das eigene
  // Sichern ändert die Liste (der Entwurf wird abgeschlossen, der korrigierte
  // Bogen bekommt einen Nachfolger), und ohne diesen Riegel verschwände das
  // Formular mitten im Speichern (Zweitreview FRB-EPIC-002, Befund 1). Neu
  // entschieden wird nur, wenn die Adresse einen anderen Bogen nennt - etwa
  // nach „Entwurf verwerfen und neu erheben".
  const schluessel = ['instrument', 'entwurf', 'korrigiert']
    .map((teil) => suche.get(teil) ?? '')
    .join('|');
  if (ausgangslage.current?.schluessel !== schluessel) {
    const entwurf = erhebungen.data.find(
      (e) => e.id === suche.get('entwurf') && e.status === 'entwurf',
    );
    const korrigiert = erhebungen.data.find(
      (e) =>
        e.id === suche.get('korrigiert') &&
        e.status === 'abgeschlossen' &&
        e.superseded_by_response_id === null,
    );
    // Ein gesicherter Entwurf einer Korrektur nennt den Bogen, den er ersetzt
    // (BEF-12) - auch wenn er über `?entwurf=` fortgesetzt wird.
    const ersetzt =
      korrigiert ??
      (entwurf?.supersedes_response_id
        ? erhebungen.data.find((e) => e.id === entwurf.supersedes_response_id)
        : undefined);
    ausgangslage.current = { schluessel, entwurf, korrigiert, ersetzt };
  }
  const { entwurf, korrigiert, ersetzt } = ausgangslage.current;
  if ((suche.get('entwurf') && !entwurf) || (suche.get('korrigiert') && !korrigiert)) {
    return (
      <Fehlerseite zurueck={zurueck} titel={titel} beschreibung={name}>
        <ErrorState
          title="Dieser Bogen lässt sich hier nicht mehr bearbeiten."
          description="Er ist inzwischen abgeschlossen, korrigiert oder verworfen. Der aktuelle Stand steht im Befund."
        />
      </Fehlerseite>
    );
  }
  // Ein Entwurf haelt die Version fest, mit der er begonnen wurde; der Server
  // aendert sie nicht. Stimmt sie nicht mehr, wird neu begonnen statt still
  // gegen eine andere Fassung weiterzuschreiben.
  if (entwurf && entwurf.definition_version !== definition.meta.version) {
    return (
      <Fehlerseite zurueck={zurueck} titel={titel} beschreibung={name}>
        <VeralteterEntwurf
          patientId={patient.data.id}
          instrumentId={definition.meta.id}
          entwurf={entwurf}
        />
      </Fehlerseite>
    );
  }

  return (
    <Formular
      key={entwurf?.id ?? korrigiert?.id ?? 'neu'}
      patient={patient.data}
      definition={definition}
      entwurf={entwurf}
      korrigiert={korrigiert}
      ersetzt={ersetzt}
      heute={user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : ''}
    />
  );
}

/**
 * Ein Entwurf aus einer früheren Fassung des Bogens (BEF-02).
 *
 * Fortsetzen geht nicht - der Server hält die Fassung eines Entwurfs fest.
 * Bis UXR-009 verwies die Seite auf ein Verwerfen „in der Akte", das es dort
 * nicht gab, und der Knopf der Akte führte wieder hierher. Jetzt steht der
 * Ausweg hier: verwerfen (derselbe Serverweg wie sonst) und ohne `?entwurf=`
 * neu beginnen.
 */
function VeralteterEntwurf({
  patientId,
  instrumentId,
  entwurf,
}: {
  patientId: string;
  instrumentId: string;
  entwurf: ErhebungDaten;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verwerfen = useMutation({
    mutationFn: () => erhebungVerwerfen(entwurf.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: erhebungenQueryKey(patientId) });
      void navigate(erhebenPfad(patientId, instrumentId), { replace: true });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <ErrorState
        title="Der Entwurf gehört zu einer früheren Fassung des Bogens."
        description={`Er lässt sich mit der aktuellen Fassung nicht fortsetzen. Bitte den Entwurf vom ${formatDate(entwurf.recorded_on)} verwerfen und den Bogen neu erheben.`}
      />
      <div>
        <Rueckfrage
          ausloeser="Entwurf verwerfen und neu erheben"
          bestaetigen="Ja, Entwurf verwerfen"
          bestaetigenLaeuft="Wird verworfen …"
          fehler={verwerfen.isError ? verwerfen.error.message : undefined}
          onAbbrechen={() => verwerfen.reset()}
          onBestaetigen={() => verwerfen.mutateAsync()}
        >
          Die gespeicherten Antworten dieses Entwurfs werden gelöscht. Danach beginnt ein neuer
          Bogen in der aktuellen Fassung.
        </Rueckfrage>
      </div>
    </div>
  );
}

const DATUM_ID = 'erhebung-datum';
const BEGRUENDUNG_ID = 'erhebung-begruendung';

function Formular({
  patient,
  definition,
  entwurf,
  korrigiert,
  ersetzt,
  heute,
}: {
  patient: Patient;
  definition: ScoreDefinition;
  entwurf: ErhebungDaten | undefined;
  korrigiert: ErhebungDaten | undefined;
  ersetzt: ErhebungDaten | undefined;
  heute: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zurueck = `/patienten/${patient.id}/doku/befund`;

  const [antworten, setAntworten] = useState<Antworten>(
    () => entwurf?.answers ?? korrigiert?.answers ?? {},
  );
  const [datum, setDatum] = useState(entwurf?.recorded_on ?? korrigiert?.recorded_on ?? heute);
  const [begruendung, setBegruendung] = useState('');
  // Was die letzte Prüfung beanstandet hat: an der Frage und im Kasten über
  // den Schaltflächen (BEF-03). Es bleibt stehen bis zur nächsten Prüfung.
  const [fehlerJeFrage, setFehlerJeFrage] = useState<Record<string, string>>({});
  const [zusammenfassung, setZusammenfassung] = useState<Formularfehler[]>([]);
  const [datumFehler, setDatumFehler] = useState<string | undefined>(undefined);
  const [begruendungFehler, setBegruendungFehler] = useState<string | undefined>(undefined);
  // Welche Schaltfläche schreibt gerade? Nur sie zeigt, dass es läuft (BEF-17).
  const [vorgang, setVorgang] = useState<'abschliessen' | 'entwurf' | null>(null);

  // Stabil über die Lebensdauer des Formulars, damit nur die geänderte Frage
  // neu gezeichnet wird (`memo` in FragebogenFelder).
  const setzen = useCallback((itemId: string, antwort: Antwort | undefined) => {
    setAntworten((bisher) => {
      const neu = { ...bisher };
      if (antwort === undefined) delete neu[itemId];
      else neu[itemId] = antwort;
      return neu;
    });
  }, []);

  // Was zuletzt auf dem Server liegt. Nach dem ersten Sichern ist aus einer
  // neuen Erhebung (oder einer Korrektur) ein Entwurf geworden; jedes weitere
  // Sichern überschreibt ihn, statt einen zweiten anzulegen.
  const [entwurfId, setEntwurfId] = useState<string | null>(entwurf?.id ?? null);
  const stand = JSON.stringify([antworten, datum, begruendung]);
  const [gesichert, setGesichert] = useState(() =>
    entwurf ? JSON.stringify([entwurf.answers, entwurf.recorded_on, '']) : null,
  );
  const standRef = useRef(stand);
  standRef.current = stand;
  const entwurfIdRef = useRef(entwurfId);
  entwurfIdRef.current = entwurfId;

  /**
   * Prüft den Bogen und hängt jeden Fehler an seine Frage (BEF-03). Leer
   * heißt: in Ordnung.
   */
  function pruefen(): Formularfehler[] {
    const jeFrage = Object.fromEntries(
      antwortFehler(definition, antworten).map((f) => [f.itemId, f.meldung]),
    );
    const datumMeldung = datum === '' ? 'Bitte das Datum der Erhebung angeben.' : undefined;
    const begruendungMeldung =
      korrigiert && !entwurfIdRef.current && begruendung.trim().length < 3
        ? 'Eine Korrektur braucht eine Begründung.'
        : undefined;

    const liste: Formularfehler[] = definition.items
      .filter((item) => jeFrage[item.id] !== undefined)
      .map((item) => ({
        feldId: frageFeldId(item.id),
        feld: beschriftung(item),
        meldung: jeFrage[item.id]!,
      }));
    if (datumMeldung) {
      liste.push({ feldId: DATUM_ID, feld: 'Datum der Erhebung', meldung: datumMeldung });
    }
    if (begruendungMeldung) {
      liste.push({
        feldId: BEGRUENDUNG_ID,
        feld: 'Begründung der Korrektur',
        meldung: begruendungMeldung,
      });
    }

    setFehlerJeFrage(jeFrage);
    setDatumFehler(datumMeldung);
    setBegruendungFehler(begruendungMeldung);
    setZusammenfassung(liste);
    return liste;
  }

  /**
   * Den Bogen als Entwurf auf den Server legen und melden, ob danach alles
   * dort liegt (FIX-014: wer währenddessen weiter ankreuzt, hat wieder
   * Ungespeichertes). Wirft mit verständlicher Meldung - bei einer
   * beanstandeten Angabe mit genau dieser (BEF-03), statt auf eine
   * Markierung zu verweisen, die es nicht gab.
   */
  async function entwurfSichern(): Promise<boolean> {
    const zuSichern = standRef.current;
    const [erster] = pruefen();
    if (erster) throw new Error(`„${erster.feld}“: ${erster.meldung}`);
    const id = await erhebungSpeichern({
      patientId: patient.id,
      erhebungId: entwurfIdRef.current,
      instrumentId: definition.meta.id,
      version: definition.meta.version,
      datum,
      antworten,
      korrigiert: entwurfIdRef.current ? null : (korrigiert?.id ?? null),
      begruendung: korrigiert && !entwurfIdRef.current ? begruendung.trim() : null,
    });
    setEntwurfId(id);
    entwurfIdRef.current = id;
    setGesichert(zuSichern);
    await queryClient.invalidateQueries({ queryKey: erhebungenQueryKey(patient.id) });
    return standRef.current === zuSichern;
  }

  // Ungespeichert ist, was vom zuletzt gesicherten Stand abweicht - bei einem
  // neuen Bogen jede erste Angabe.
  const leer = Object.keys(antworten).length === 0 && begruendung.trim() === '';
  const ungespeichert = gesichert === null ? !leer : gesichert !== stand;

  const { freigeben, laeuft, schreiben, schutz } = useTextverlustschutz({
    ungespeichert,
    speichern: entwurfSichern,
    texte: ANTWORTTEXTE,
  });

  function zurueckZurAkte() {
    freigeben();
    void navigate(zurueck, { replace: true });
  }

  const verwerfen = useMutation({
    mutationFn: () => erhebungVerwerfen(entwurfId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: erhebungenQueryKey(patient.id) });
      zurueckZurAkte();
    },
  });

  function absenden(abschliessen: boolean) {
    if (laeuft || pruefen().length > 0) return;
    setVorgang(abschliessen ? 'abschliessen' : 'entwurf');
    void schreiben({
      ausfuehren: async () => {
        const vollstaendig = await entwurfSichern();
        if (vollstaendig && abschliessen) {
          await erhebungAbschliessen(entwurfIdRef.current!);
          await queryClient.invalidateQueries({ queryKey: erhebungenQueryKey(patient.id) });
        }
        return vollstaendig;
      },
      fehlertitel: abschliessen ? 'Nicht abgeschlossen' : 'Nicht gespeichert',
      danach: zurueckZurAkte,
    }).finally(() => setVorgang(null));
  }

  const korrektur = ersetzt !== undefined;
  const titel = korrektur ? `${definition.meta.name_de} korrigieren` : definition.meta.name_de;
  // Die Begründung einer gesicherten Korrektur steht fest: Der Server nimmt
  // am Entwurf keine andere mehr an (BEF-12). Sie steht deshalb als Text da.
  const festeBegruendung =
    entwurf?.change_reason ?? (entwurfId && korrigiert ? begruendung.trim() : null);

  return (
    <>
      <Rueckweg standard={zurueck} beschriftung="Zurück zum Befund" />
      <PageHeader
        title={titel}
        description={`${fullName(patient)} · Jede Frage darf offen bleiben.`}
      />
      {ersetzt ? (
        <div className="-mt-3 mb-6 max-w-prose text-sm">
          <p className="text-ink">Ersetzt den Bogen vom {formatDate(ersetzt.recorded_on)}.</p>
          {festeBegruendung ? (
            <p className="text-ink-muted mt-1">Begründung der Korrektur: {festeBegruendung}</p>
          ) : null}
        </div>
      ) : null}

      {/* Keine Schaltfläche schickt dieses Formular ab: Enter in einem
          einzeiligen Feld soll den Bogen nicht sichern und verlassen (BEF-09).
          Gespeichert wird allein über die Schaltflächen unten. */}
      <form onSubmit={(event) => event.preventDefault()} noValidate className="max-w-2xl">
        <FragebogenFelder
          definition={definition}
          antworten={antworten}
          onChange={setzen}
          fehler={fehlerJeFrage}
        />

        <div className="border-line mt-8 flex flex-col gap-4 border-t pt-6">
          {korrektur ? (
            // Eine Korrektur bleibt am Erhebungstag des korrigierten Bogens;
            // wann korrigiert wurde, hält der Server getrennt fest (ABN-014,
            // BEF-101 Punkt 2). Im Verlauf steht sie deshalb am selben Tag.
            <p className="text-ink text-sm">
              Datum der Erhebung: {formatDate(datum)} – wie im korrigierten Bogen.
            </p>
          ) : (
            <Field
              feldId={DATUM_ID}
              label="Datum der Erhebung"
              type="date"
              value={datum}
              max={heute || undefined}
              required
              error={datumFehler}
              onKeyDown={ohneAbsenden}
              onChange={(e) => setDatum(e.target.value)}
            />
          )}
          {korrigiert && !entwurfId ? (
            <TextArea
              feldId={BEGRUENDUNG_ID}
              label="Begründung der Korrektur"
              hint="Der ursprüngliche Bogen bleibt unverändert in der Akte. Die Begründung lässt sich nach dem ersten Speichern nicht mehr ändern."
              rows={2}
              maxLength={500}
              required
              error={begruendungFehler}
              value={begruendung}
              onChange={(e) => setBegruendung(e.target.value)}
            />
          ) : null}

          <Fehlerzusammenfassung fehler={zusammenfassung} />
          {schutz}

          <p className="text-ink-muted text-sm">
            Abgeschlossen lässt sich der Bogen nicht mehr ändern, nur noch korrigieren.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => absenden(true)} disabled={laeuft}>
              {laeuft && vorgang === 'abschliessen' ? 'Wird abgeschlossen …' : 'Abschließen'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => absenden(false)}
              disabled={laeuft}
            >
              {laeuft && vorgang === 'entwurf' ? 'Wird gespeichert …' : 'Als Entwurf speichern'}
            </Button>
            {entwurfId ? (
              laeuft ? (
                <Button type="button" variant="quiet" disabled>
                  Entwurf verwerfen
                </Button>
              ) : (
                // Verwerfen löscht den Entwurf auf dem Server - erst nach
                // einer Rückfrage (BEF-01), wie beim Bericht.
                <Rueckfrage
                  ausloeser="Entwurf verwerfen"
                  ausloeserVariante="quiet"
                  bestaetigen="Ja, Entwurf verwerfen"
                  bestaetigenLaeuft="Wird verworfen …"
                  fehler={verwerfen.isError ? verwerfen.error.message : undefined}
                  onAbbrechen={() => verwerfen.reset()}
                  onBestaetigen={() => verwerfen.mutateAsync()}
                >
                  Die gespeicherten Antworten werden gelöscht.
                </Rueckfrage>
              )
            ) : null}
          </div>
        </div>
      </form>
    </>
  );
}
