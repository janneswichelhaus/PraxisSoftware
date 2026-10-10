import { useId, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { bereicheText } from '@/features/assessments/koerperschema';
import {
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import type { CurrentUser } from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import {
  EINTRAEGE_MAX,
  EMPFEHLUNG_MAX,
  TEXT_MAX,
  berichtAbschliessen,
  berichtQueryKey,
  berichtSpeichern,
  berichtVerwerfen,
  berichteQueryKey,
  fetchBericht,
  fetchBerichtQuellen,
  quellenQueryKey,
  type Bericht,
  type BerichtEingabe,
  type Quellenzeile,
} from './api';
import { Berichtsblatt } from './Berichtsblatt';

/**
 * Einen Therapiebericht schreiben (DOK-005).
 *
 * Die Seite ist ein Formular mit vier Teilen — ankreuzen, was aus der Akte
 * hinein soll, das Körperschema wählen, den eigenen Text und die Empfehlung
 * zum Verordnungsende schreiben. **Nichts ist vorausgewählt** (ANN-122): Die
 * Anwendung entscheidet nicht, welcher Eintrag „wichtig“ ist; das wäre eine
 * Auswahl nach klinischem Gehalt (ADR-006 Punkt 4).
 *
 * Darunter steht der gespeicherte Stand als Blatt, genau wie er gedruckt
 * würde. Abschließen friert ihn ein (ANN-121); danach führt die Adresse auf
 * das Druckblatt.
 *
 * **Ungespeichertes geht nicht still verloren (UXR-008; DOK-03, ZST-02).**
 * Bis dahin verwarf jeder Weg aus der Seite - „Druckansicht“ direkt neben
 * „Entwurf speichern“, der Rückweg, die Tableiste, ein Neuladen - Text und
 * Auswahl ohne Rückfrage. Jetzt fragt derselbe Schutz wie in der
 * Dokumentation (ANN-046, Änderungspfad „Schutz auf weitere Formulare
 * ausdehnen“). Der Bericht kennt einen Entwurf; „Speichern“ aus der Rückfrage
 * ist deshalb genau „Entwurf speichern“ und nie ein Abschluss.
 */

/**
 * Die Sätze des Schutzes für den Bericht: Es geht um Änderungen im Formular
 * - Häkchen, Auswahl, zwei Texte -, nicht um den „Text im Feld“ der
 * Dokumentation (BEF-17). Vollständig, wie `Verlustschutztexte` es verlangt.
 */
const BERICHTSTEXTE: Verlustschutztexte = {
  bezeichnung: 'Ungespeicherter Bericht',
  weitergehen:
    'Die Änderungen am Bericht sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
  abmelden:
    'Die Änderungen am Bericht sind noch nicht gespeichert. Beim Abmelden gehen sie verloren.',
  bleibtStehen: 'Die Änderungen stehen weiter im Formular',
  ohneVerbindung:
    'Ohne Verbindung lässt sich gerade nicht speichern. Die Änderungen bleiben im Formular stehen – bitte warten, bis die Verbindung zurück ist, und dann erneut speichern.',
  weitergeschrieben:
    'Während des Speicherns wurde weiter geändert. Die neuen Änderungen stehen noch im Formular und sind noch nicht gespeichert – bitte noch einmal speichern.',
};

/** Was sich am Bericht geändert hat, während das Formular offen war (DOK-B01). */
type Berichtswechsel = 'abgeschlossen' | 'verworfen';

const BERICHTSWECHSEL: Record<Berichtswechsel, string> = {
  abgeschlossen: 'Der Bericht wurde inzwischen abgeschlossen',
  verworfen: 'Der Entwurf wurde inzwischen verworfen',
};

function ausBericht(bericht: Bericht): BerichtEingabe {
  return {
    text: bericht.report_text ?? '',
    empfehlung: bericht.recommendation ?? '',
    eintraege: bericht.note_ids,
    koerperschema: bericht.body_chart_response_id,
  };
}

/**
 * Sind zwei Eingaben für den Server dieselbe?
 *
 * Die Texte gehen getrimmt auf den Server (`berichtSpeichern`), die Einträge
 * als Menge: Ein Leerzeichen am Ende oder eine andere Reihenfolge der Häkchen
 * ist keine ungespeicherte Änderung.
 */
function gleicheEingabe(a: BerichtEingabe, b: BerichtEingabe): boolean {
  if (a.text.trim() !== b.text.trim()) return false;
  if (a.empfehlung.trim() !== b.empfehlung.trim()) return false;
  if (a.koerperschema !== b.koerperschema) return false;
  if (a.eintraege.length !== b.eintraege.length) return false;
  return a.eintraege.every((id) => b.eintraege.includes(id));
}

export function TherapieberichtPage({ user }: { user: CurrentUser }) {
  const { patientId = '', berichtId = '' } = useParams();

  const bericht = useQuery({
    queryKey: berichtQueryKey(berichtId),
    queryFn: () => fetchBericht(berichtId),
    retry: false,
  });
  const quellen = useQuery({
    queryKey: quellenQueryKey(berichtId),
    queryFn: () => fetchBerichtQuellen(berichtId),
    retry: false,
    enabled: bericht.data?.status === 'entwurf',
  });

  // Entschieden wird beim ersten Laden und danach festgehalten (DOK-B01), wie
  // in der Erhebung: Ein späteres Nachladen - nach einem Funkloch, nach dem
  // eigenen Speichern - darf das Formular nicht abbauen, nur weil eine
  // Kollegin den Bericht inzwischen abgeschlossen oder verworfen hat. Mit dem
  // Formular gingen Text und Auswahl still verloren.
  const ausgangslage = useRef<string | null>(null);
  const zuletzt = useRef<Bericht | null>(null);
  if (bericht.data) zuletzt.current = bericht.data;
  const bekannt = bericht.data ?? (zuletzt.current?.id === berichtId ? zuletzt.current : null);
  const formularOffen = ausgangslage.current === berichtId && bekannt !== null;

  // Der Rückweg steht vor jedem Zustand (DOK-12): Auch wer auf einen Ladefehler
  // oder einen verworfenen Bericht trifft, kommt zur Verordnung zurück.
  const verordnungen = `/patienten/${patientId}/verordnungen`;
  const rueckweg = bekannt ? (
    <Rueckweg
      standard={`${verordnungen}#verordnung-${bekannt.treatment_basis_id}`}
      beschriftung="Zurück zur Verordnung"
    />
  ) : (
    <Rueckweg standard={verordnungen} beschriftung="Zurück zu den Verordnungen" />
  );

  if (!formularOffen) {
    if (bericht.isPending) {
      return (
        <>
          {rueckweg}
          <LoadingState label="Bericht wird geladen …" />
        </>
      );
    }
    // Ersetzt wird nur, wenn es nichts zu zeigen gibt (ZST-03).
    if (bericht.isError && !bericht.data) {
      return (
        <>
          {rueckweg}
          <ErrorState
            title="Der Bericht konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => bericht.refetch()}
          />
        </>
      );
    }
    if (!bericht.data) {
      return (
        <>
          {rueckweg}
          <ErrorState
            title="Bericht nicht gefunden"
            description="Vielleicht wurde der Entwurf inzwischen verworfen."
          />
        </>
      );
    }
    if (bericht.data.status === 'abgeschlossen') {
      return <Navigate to={`/patienten/${patientId}/berichte/${berichtId}/druck`} replace />;
    }
    if (quellen.isPending) {
      return (
        <>
          {rueckweg}
          <LoadingState label="Einträge der Akte werden geladen …" />
        </>
      );
    }
    if (quellen.isError && !quellen.data) {
      return (
        <>
          {rueckweg}
          <ErrorState
            title="Die Einträge der Akte konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => quellen.refetch()}
          />
        </>
      );
    }
    ausgangslage.current = berichtId;
  }

  // Hier steht immer ein Bericht: frisch geladen oder - nachdem ihn jemand
  // verworfen hat - der zuletzt gesehene, damit das Formular stehen bleibt.
  const aktuell = bericht.data ?? zuletzt.current!;
  const inzwischen: Berichtswechsel | undefined = !bericht.data
    ? 'verworfen'
    : bericht.data.status === 'abgeschlossen'
      ? 'abgeschlossen'
      : undefined;

  return (
    <>
      {rueckweg}
      <Berichtsformular
        // Neu aufsetzen, wenn ein anderer Bericht geladen wird.
        key={aktuell.id}
        bericht={aktuell}
        quellen={quellen.data ?? []}
        patientId={patientId}
        user={user}
        inzwischen={inzwischen}
        nichtAktualisiert={bericht.isError || quellen.isError}
        onErneut={() =>
          Promise.all([
            bericht.isError ? bericht.refetch() : null,
            quellen.isError ? quellen.refetch() : null,
          ])
        }
      />
    </>
  );
}

function Berichtsformular({
  bericht,
  quellen,
  patientId,
  inzwischen,
  nichtAktualisiert,
  onErneut,
}: {
  bericht: Bericht;
  quellen: Quellenzeile[];
  patientId: string;
  user: CurrentUser;
  /** Hat jemand anderes den Bericht inzwischen abgeschlossen oder verworfen? */
  inzwischen: Berichtswechsel | undefined;
  /** Ist das letzte Nachladen gescheitert? Das Formular bleibt dann stehen. */
  nichtAktualisiert: boolean;
  onErneut: () => unknown;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const zuVieleId = useId();

  // Der erwartete Stand für die Konflikterkennung. Eine Referenz, weil ein
  // Schreibvorgang ihn setzt und der nächste ihn sofort braucht.
  const stand = useRef(bericht.updated_at);
  const [eingabe, setEingabe] = useState<BerichtEingabe>(() => ausBericht(bericht));
  // Was zuletzt auf dem Server gelandet ist - Grundlage für „ungespeichert“.
  const [gesichert, setGesichert] = useState<BerichtEingabe>(() => ausBericht(bericht));
  const [gespeichert, setGespeichert] = useState(false);
  // Die eigenen Vorgänge, die den Bericht beenden. Danach ist „inzwischen
  // abgeschlossen“ keine Nachricht, sondern die eigene Tat.
  const selbstBeendet = useRef(false);

  // Die Eingabe, wie sie in diesem Augenblick im Formular steht - nicht die
  // von vorhin. Ein Schreibvorgang dauert (FIX-014).
  const eingabeRef = useRef(eingabe);
  eingabeRef.current = eingabe;

  const ungespeichert = !gleicheEingabe(eingabe, gesichert);
  // Läuft Abschluss oder Verwerfen, sichert nichts von selbst dazwischen.
  const [beendetGerade, setBeendetGerade] = useState(false);

  // Einmal beim ersten Zeichnen: offen, wenn dort schon etwas angekreuzt ist.
  // Danach entscheidet die Person - ein gesteuertes `open` klappte die Liste
  // beim Abhaken des letzten Eintrags unter dem Finger zu (DOK-21).
  const [weitereOffen] = useState(() =>
    quellen.some(
      (q) => q.kind === 'eintrag' && !q.in_treatment_basis && bericht.note_ids.includes(q.id),
    ),
  );

  const eintraege = quellen.filter((q) => q.kind === 'eintrag');
  const dieserVerordnung = eintraege.filter((q) => q.in_treatment_basis);
  const weitere = eintraege.filter((q) => !q.in_treatment_basis);
  const koerperschemata = quellen.filter((q) => q.kind === 'koerperschema');
  const verordnungsziel = `/patienten/${patientId}/verordnungen#verordnung-${bericht.treatment_basis_id}`;
  const druckziel = `/patienten/${patientId}/berichte/${bericht.id}/druck`;

  async function neuLaden() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: berichtQueryKey(bericht.id) }),
      queryClient.invalidateQueries({ queryKey: berichteQueryKey(patientId) }),
    ]);
  }

  /**
   * Den Entwurf sichern - ohne Seitenwechsel.
   *
   * Beide Wege gehen hier durch: „Entwurf speichern“ und das Speichern aus
   * der Rückfrage des Schutzes. Der Rückgabewert sagt, ob **alles**, was im
   * Formular steht, jetzt auf dem Server liegt.
   */
  async function entwurfSichern(): Promise<boolean> {
    const zuSichern = eingabeRef.current;
    if (zuSichern.eintraege.length > EINTRAEGE_MAX) {
      throw new Error(`Höchstens ${EINTRAEGE_MAX} Einträge – bitte abwählen.`);
    }
    const neuerStand = await berichtSpeichern(bericht.id, zuSichern, stand.current);
    stand.current = neuerStand;
    setGesichert(zuSichern);
    await neuLaden();
    return gleicheEingabe(eingabeRef.current, zuSichern);
  }

  const { freigeben, laeuft, schreiben, schutz, sicherungsstand } = useTextverlustschutz({
    ungespeichert,
    speichern: entwurfSichern,
    texte: BERICHTSTEXTE,
    // Von selbst nur, solange niemand abschließt oder verwirft und die
    // Auswahl sich sichern lässt (BEF-056, ANN-319). Abschluss und
    // Verwerfen laufen neben dem Schreibweg des Schutzes.
    selbst: {
      stand: JSON.stringify(eingabe),
      bereit: eingabe.eintraege.length <= EINTRAEGE_MAX && !inzwischen && !beendetGerade,
    },
  });

  const abschliessen = useMutation({
    onMutate: () => setBeendetGerade(true),
    onSettled: () => setBeendetGerade(false),
    mutationFn: async () => {
      // Was im Formular steht, ist das, was abgeschlossen wird - nicht ein
      // älterer gespeicherter Stand.
      const zuSichern = eingabeRef.current;
      const neuerStand = await berichtSpeichern(bericht.id, zuSichern, stand.current);
      stand.current = neuerStand;
      setGesichert(zuSichern);
      await berichtAbschliessen(bericht.id, neuerStand);
      selbstBeendet.current = true;
    },
    onSuccess: async () => {
      await neuLaden();
      // Der eigene Weg nach dem Abschluss braucht keine Rückfrage.
      freigeben();
      void navigate(druckziel, { replace: true });
    },
  });

  const verwerfen = useMutation({
    onMutate: () => setBeendetGerade(true),
    onSettled: () => setBeendetGerade(false),
    mutationFn: () => berichtVerwerfen(bericht.id),
    onSuccess: async () => {
      selbstBeendet.current = true;
      await queryClient.invalidateQueries({ queryKey: berichteQueryKey(patientId) });
      // Verwerfen ist die ausdrückliche Entscheidung gegen das Formular.
      freigeben();
      void navigate(verordnungsziel, { replace: true });
    },
  });

  function aendern(teil: Partial<BerichtEingabe>) {
    setEingabe((alt) => ({ ...alt, ...teil }));
    setGespeichert(false);
  }

  function umschalten(id: string, an: boolean) {
    const ohne = eingabe.eintraege.filter((e) => e !== id);
    aendern({ eintraege: an ? [...ohne, id] : ohne });
  }

  const zuViele = eingabe.eintraege.length > EINTRAEGE_MAX;
  const { patient } = bericht.document;
  const wechsel = inzwischen && !selbstBeendet.current ? inzwischen : undefined;

  return (
    <>
      <PageHeader
        title="Therapiebericht"
        description={`${patient.given_name} ${patient.family_name} · Verordnung vom ${formatDate(
          bericht.document.verordnung.issued_on,
        )} · Entwurf`}
      />

      {bericht.document.korrektur ? (
        <p className="text-ink mb-6 max-w-2xl text-sm">
          Korrektur des Berichts vom{' '}
          {formatDate(bericht.document.korrektur.ersetzt_abgeschlossen_am)}. Grund:{' '}
          {bericht.document.korrektur.grund}
        </p>
      ) : null}

      {wechsel ? (
        <Statusmeldung ton="warnung" className="mb-6 max-w-2xl">
          {ungespeichert
            ? `${BERICHTSWECHSEL[wechsel]} – Ihre Änderungen stehen noch im Formular und sind nicht gespeichert.`
            : `${BERICHTSWECHSEL[wechsel]}.`}
        </Statusmeldung>
      ) : null}

      {nichtAktualisiert ? (
        <div className="mb-6 flex max-w-2xl flex-wrap items-center gap-x-3">
          <Statusmeldung ton="warnung">
            Der Stand konnte nicht aktualisiert werden. Ihre Eingaben stehen weiter im Formular.
          </Statusmeldung>
          <Button type="button" variant="quiet" groesse="kompakt" onClick={() => void onErneut()}>
            Erneut versuchen
          </Button>
        </div>
      ) : null}

      {/* Freitextformulare sind so breit wie die Dokumentation (max-w-2xl,
          DOK-19) - vorher stand der Bericht als einziges bei max-w-3xl. */}
      <form
        className="flex max-w-2xl flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (zuViele) return;
          setGespeichert(false);
          void schreiben({
            ausfuehren: entwurfSichern,
            fehlertitel: 'Nicht gespeichert',
            danach: () => setGespeichert(true),
          });
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink-muted tracking-label text-xs font-semibold uppercase">
            Einträge aus der Dokumentation
          </legend>
          <p className="text-ink-muted text-sm">
            Angekreuzte Einträge stehen wörtlich im Bericht, mit Tag und Verfasser:in. Nur
            finalisierte Einträge lassen sich übernehmen; vorausgewählt ist nichts.
          </p>
          {/* Die Grenze ist beim Auswählen sichtbar, nicht erst beim Speichern
              (ABN-016, BEF-104). */}
          <p className="text-ink text-sm tabular-nums" aria-live="polite">
            {eingabe.eintraege.length} von {EINTRAEGE_MAX} Einträgen gewählt
            {eingabe.eintraege.length >= EINTRAEGE_MAX
              ? ' – mehr passen nicht in einen Bericht.'
              : ''}
          </p>
          {eintraege.length === 0 ? (
            <Statusmeldung>Die Akte hat noch keinen finalisierten Eintrag.</Statusmeldung>
          ) : null}
          {dieserVerordnung.length > 0 ? (
            <Eintragsliste
              titel="Zu dieser Verordnung"
              eintraege={dieserVerordnung}
              gewaehlt={eingabe.eintraege}
              onUmschalten={umschalten}
            />
          ) : null}
          {weitere.length > 0 ? (
            <details className="group" open={weitereOffen}>
              <summary className={`${aufklappKopfKlassen} text-accent text-sm`}>
                <Aufklappzeichen />
                Weitere Einträge der Akte ({weitere.length})
              </summary>
              <Eintragsliste
                eintraege={weitere}
                gewaehlt={eingabe.eintraege}
                onUmschalten={umschalten}
              />
            </details>
          ) : null}
          {zuViele ? (
            <div id={zuVieleId}>
              <Statusmeldung ton="fehler">
                Höchstens {EINTRAEGE_MAX} Einträge – ein Bericht ist keine Kopie der Akte.
              </Statusmeldung>
            </div>
          ) : null}
        </fieldset>

        {koerperschemata.length > 0 ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-ink-muted tracking-label text-xs font-semibold uppercase">
              Körperschema
            </legend>
            <p className="text-ink-muted mb-1 text-sm">
              Die Kreise aus einem abgeschlossenen Anamnesebogen, als Bild im Bericht.
            </p>
            <Auswahlknopf
              name="koerperschema"
              label="Kein Körperschema"
              checked={eingabe.koerperschema === null}
              onWaehlen={() => aendern({ koerperschema: null })}
            />
            {koerperschemata.map((k) => (
              <Auswahlknopf
                key={k.id}
                name="koerperschema"
                label={`Angabe vom ${formatDate(k.occurred_on)}: ${bereicheText(
                  (k.body_chart ?? []).map((m) => m.bereich),
                )}`}
                checked={eingabe.koerperschema === k.id}
                onWaehlen={() => aendern({ koerperschema: k.id })}
              />
            ))}
          </fieldset>
        ) : null}

        <TextArea
          label="Bericht der Therapeut:in"
          hint="Ihr eigener Text an die Verordner:in. Er steht mit Ihrem Namen und dem Tag im Bericht."
          rows={6}
          maxLength={TEXT_MAX}
          value={eingabe.text}
          onChange={(e) => aendern({ text: e.target.value })}
        />

        <TextArea
          label="Empfehlung der Therapeut:in zum Verordnungsende"
          hint="Von Ihnen formuliert und verantwortet – die Anwendung schlägt nichts vor. Sie steht danach auch an der Verordnung."
          rows={3}
          maxLength={EMPFEHLUNG_MAX}
          value={eingabe.empfehlung}
          onChange={(e) => aendern({ empfehlung: e.target.value })}
        />

        <div className="flex flex-col gap-3">
          {/* Hinweise, Fehler und die Rückfrage vor dem Verlassen stehen über
              den Knöpfen - „Druckansicht“ ist ein Seitenwechsel und läuft
              damit durch dieselbe Rückfrage wie Rückweg und Tableiste. */}
          {sicherungsstand}
          {schutz}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={laeuft || zuViele}>
              {laeuft ? 'Wird gespeichert …' : 'Entwurf speichern'}
            </Button>
            <ButtonLink to={druckziel} variant="quiet">
              Druckansicht
            </ButtonLink>
          </div>
          {gespeichert && !ungespeichert ? (
            <Statusmeldung ton="erfolg">Entwurf gespeichert.</Statusmeldung>
          ) : null}
        </div>
      </form>

      {/* Nebeneinander statt gestreckt (DOK-21): Die Auslöser sind so breit
          wie ihr Text; eine geöffnete Rückfrage nimmt die ganze Zeile. */}
      <div className="mt-8 flex max-w-2xl flex-wrap items-start gap-3">
        {zuViele ? (
          // Mit zu vielen Einträgen lehnt der Server den Abschluss ab - bis
          // UXR-008 mit einer Meldung ohne Grund (DOK-21). Der Grund steht
          // über dem Knopf und ist mit ihm verbunden.
          <Button type="button" variant="secondary" disabled aria-describedby={zuVieleId}>
            Bericht abschließen
          </Button>
        ) : (
          <Rueckfrage
            ausloeser="Bericht abschließen"
            bestaetigen="Ja, Bericht abschließen"
            bestaetigenLaeuft="Wird abgeschlossen …"
            laeuft={abschliessen.isPending}
            fehler={abschliessen.isError ? abschliessen.error.message : undefined}
            onBestaetigen={() => abschliessen.mutateAsync()}
            onAbbrechen={() => abschliessen.reset()}
          >
            Der Bericht wird so eingefroren, wie er jetzt im Formular steht – spätere Änderungen in
            der Akte erreichen ihn nicht mehr. Eine Korrektur ist danach ein neuer Bericht mit
            Verweis und Grund.
          </Rueckfrage>
        )}
        <Rueckfrage
          ausloeser="Entwurf verwerfen"
          ausloeserVariante="quiet"
          bestaetigen="Ja, Entwurf verwerfen"
          bestaetigenLaeuft="Wird verworfen …"
          laeuft={verwerfen.isPending}
          fehler={verwerfen.isError ? verwerfen.error.message : undefined}
          onBestaetigen={() => verwerfen.mutateAsync()}
          onAbbrechen={() => verwerfen.reset()}
        >
          Der Entwurf wird gelöscht. Die Einträge der Akte bleiben unberührt.
        </Rueckfrage>
      </div>

      <div className="mt-10">
        <Section titel="Vorschau" hinweis="Der zuletzt gespeicherte Stand, wie er gedruckt würde.">
          {/* Die Vorschau zeigt den Server, nicht das Formular (DOK-03). Wer
              darin nachsieht, soll nicht glauben, die neuen Änderungen seien
              schon drin. */}
          {ungespeichert ? (
            <Statusmeldung className="mb-3">
              Ihre letzten Änderungen sind noch nicht gespeichert und fehlen in der Vorschau.
            </Statusmeldung>
          ) : null}
          <div className="border-line rounded-card bg-surface border p-4 sm:p-8">
            <Berichtsblatt dokument={bericht.document} entwurf eingebettet />
          </div>
        </Section>
      </div>
    </>
  );
}

function Eintragsliste({
  titel,
  eintraege,
  gewaehlt,
  onUmschalten,
}: {
  titel?: string;
  eintraege: Quellenzeile[];
  gewaehlt: readonly string[];
  onUmschalten: (id: string, an: boolean) => void;
}) {
  // Bei 50 ist Schluss: Ein weiterer Haken lässt sich nicht setzen, statt dass
  // der Bericht still kürzer würde (ABN-016, BEF-104).
  const voll = gewaehlt.length >= EINTRAEGE_MAX;
  return (
    <div>
      {titel ? <p className="text-ink-muted mt-2 text-sm font-medium">{titel}</p> : null}
      <ul className="flex flex-col">
        {eintraege.map((eintrag) => (
          <li key={eintrag.id} className="border-line border-b py-1 last:border-b-0">
            <Checkbox
              label={
                <>
                  {formatDate(eintrag.occurred_on)}
                  {eintrag.is_addendum ? ' · Nachtrag' : ''}
                  {eintrag.author_name ? ` · ${eintrag.author_name}` : ''}
                </>
              }
              hint={
                // Klinischer Freitext bricht auch lange Zeichenketten um (DOK-23).
                <span className="line-clamp-3 wrap-anywhere whitespace-pre-line">
                  {eintrag.content}
                </span>
              }
              checked={gewaehlt.includes(eintrag.id)}
              disabled={voll && !gewaehlt.includes(eintrag.id)}
              onChange={(e) => onUmschalten(eintrag.id, e.target.checked)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Auswahlknopf({
  name,
  label,
  checked,
  onWaehlen,
}: {
  name: string;
  label: string;
  checked: boolean;
  onWaehlen: () => void;
}) {
  // Farbe und Fokus kommen aus den Grundregeln (accent-color, :focus-visible).
  // Rahmen- und Textklassen wirkten auf das native Radio nie (UIK-03); ein
  // Auswahl-Baustein fehlt in ui/ noch (UIK-06).
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onWaehlen}
        className="size-5 shrink-0"
      />
      <span className="text-ink text-sm">{label}</span>
    </label>
  );
}
