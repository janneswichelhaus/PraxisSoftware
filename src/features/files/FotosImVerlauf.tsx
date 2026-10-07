import { EINWILLIGUNGEN_ANKER } from '@/features/patients/akte';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { datenschutzstand, fetchDatenschutzvermerke } from '@/features/datenschutz/vermerke';
import {
  canReadClinicalPatientFiles,
  canWriteClinicalPatientFiles,
  type CurrentUser,
} from '@/features/session/types';
import { loescheDatei } from './api';
import { NICHT_SERVERSEITIG_GEPRUEFT } from './dokumentarten';
import { Fotoverlustschutz } from './Fotoverlustschutz';
import { Kameradialog } from './Kameradialog';
import { fotoVomHeutigenTag, useKamera } from './kamera';
import {
  fetchPatientenfotos,
  fotoartLabels,
  ladePatientenfoto,
  speicherePatientenfoto,
  type Fotoart,
  type Patientenfoto,
} from './patientenfotos';

/**
 * Fotos im Verlauf (DOK-006, ADR-017 Abschnitte G und H).
 *
 * Zwei Arten (Punkt 43): das **Dokumentationsfoto** gehört zur Akte, die
 * **Arbeitshilfe** ist für Übergabe und Vergleich und liegt neben ihr. Die
 * Wahl fällt vor der Aufnahme, ohne Vorauswahl (Punkt 44). Keines ersetzt
 * einen Eintrag: Was die Therapeut:in auf einem Foto oder im Vergleich zweier
 * Fotos als wesentlich sieht, steht in Worten im Eintrag (Punkte 35 und 45).
 * Das sagt der Abschnitt, bevor er irgendetwas anbietet.
 *
 * Was hier bewusst fehlt, weil ADR-017 es ausschließt:
 *
 *   * **Kein Dateiwähler** (Punkt 33). Ein Foto entsteht nur im Kameradialog —
 *     auch dann, wenn die Kamera fehlt oder nicht freigegeben ist.
 *   * **Keine Vorschaubilder, keine Galerie** (Punkt 40). Eine Vorschau je
 *     Zeile wäre ein Verweis je Zeile auf Vorrat (Punkt 15). Ein Foto öffnet
 *     man bewusst, und das Öffnen ist protokolliert.
 *   * **Kein Download, kein Teilen** (Punkt 40). Die Ansicht lädt in den
 *     Speicher der Seite und zeigt aus einer Objekt-URL, die beim Schließen
 *     frei wird. Das Bild nimmt keine Berührung an — kein langes Drücken zum
 *     Sichern. Ein Bildschirmfoto kann eine Webanwendung nicht verhindern.
 *   * **Keine Bewertung** (Punkt 39, §17). Zwei Fotos stehen gleich groß
 *     nebeneinander mit Datum, Name und aufnehmender Person — ohne Text, Farbe,
 *     Symbol, Ausrichtung, Überlagerung oder Markierung.
 *
 * Wer was darf, prüft die Datenbank (Punkt 36 und 37); die Rolle bestimmt hier
 * nur, was angeboten wird.
 *
 * Gerahmt ist nur die Liste samt Ansicht, eine Auskunft; Einwilligung und
 * Aufnahme stehen darüber ohne Rahmen (UI-002c, DAT-21).
 */

const HINWEIS_GESICHT =
  'Nur die betroffene Region ins Bild nehmen. Das Gesicht nur, wenn es selbst die betroffene Region ist.';

/**
 * Der Tag eines Zeitpunkts in der Zeitzone der Praxis — Aufnahme und
 * Löschdatum sind `timestamptz`, keine Kalendertage (`@/lib/datum`).
 */
function tagDerPraxis(zeitpunkt: string, zeitzone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zeitzone,
  }).format(new Date(zeitpunkt));
}

/** Ein Kalendertag `YYYY-MM-DD` (Vermerke) im selben Format. */
function kalendertag(tag: string | null): string {
  if (!tag) return '—';
  const [jahr, monat, zahl] = tag.split('-');
  return `${zahl}.${monat}.${jahr}`;
}

function fotoSchluessel(patientId: string) {
  return ['patient-photos', patientId];
}

// -----------------------------------------------------------------------------
// Einwilligung
// -----------------------------------------------------------------------------

type EinwilligungStand = ReturnType<typeof datenschutzstand>['einwilligungen'][number];

/**
 * Was die Einwilligung zu Arbeitshilfen erlaubt, als Satz für die Wahl im
 * Fenster „Foto aufnehmen" (Akte entschlacken, 2026-10-03). Die Einwilligung
 * gilt nur der Arbeitshilfe; Dokumentationsfotos berührt sie nicht (ADR-017
 * Punkt 46).
 */
function einwilligungsSatz(stand: EinwilligungStand | undefined, geladen: boolean): string {
  if (!geladen) return 'Nicht möglich, solange der Stand der Einwilligung nicht geladen ist.';
  if (stand?.erteilt) {
    return `Einwilligung erteilt am ${kalendertag(stand.seit)}. Ein Widerruf löscht alle Arbeitshilfen sofort.`;
  }
  if (stand?.abgelehnt) {
    return `Nicht möglich: Die Einwilligung zu Arbeitshilfen wurde am ${kalendertag(stand.seit)} abgelehnt.`;
  }
  if (stand?.seit) {
    return `Nicht möglich: Die Einwilligung zu Arbeitshilfen wurde am ${kalendertag(stand.seit)} widerrufen.`;
  }
  return 'Nicht möglich: Es ist keine Einwilligung zu Arbeitshilfen vermerkt.';
}

// -----------------------------------------------------------------------------
// Aufnahme
// -----------------------------------------------------------------------------

/**
 * Die beiden Wahlmöglichkeiten vor der Aufnahme (ADR-017 Punkt 44, Wortlaut
 * ANN-221). Was die Art bedeutet, steht in der Wahl selbst — Frist und
 * Einwilligung —, damit niemand ein Foto ungewollt zehn Jahre liegen lässt
 * oder ungewollt nach einem Jahr verliert.
 */
const FOTOART_WAHL: Record<Fotoart, { titel: string; text: string }> = {
  dokumentationsfoto: {
    titel: 'Teil der Dokumentation (Akte, zehn Jahre)',
    text: 'Für die Dokumentation der Behandlung erforderlich. Keine Einwilligung nötig; löschen nur heute.',
  },
  patientenfoto: {
    titel: 'Arbeitshilfe (höchstens zwölf Monate, nur mit Einwilligung)',
    text: 'Für Übergabe und Vergleich. Ein Widerruf löscht sie sofort.',
  },
};

function Aufnahme({
  patientId,
  einwilligungErteilt,
  einwilligung,
  wahlOffen,
  onWahlSchliessen,
}: {
  patientId: string;
  /**
   * Darf eine Arbeitshilfe entstehen? `null`: Der Stand ist nicht geladen -
   * dann nein, ohne eine fehlende Einwilligung zu behaupten (DAT-03).
   */
  einwilligungErteilt: boolean | null;
  einwilligung: EinwilligungStand | undefined;
  /** Das Fenster „Foto aufnehmen" mit der Wahl der Art ist offen. */
  wahlOffen: boolean;
  onWahlSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const kamera = useKamera();
  // Keine Vorauswahl, auch nicht nach dem letzten Foto (Punkt 44).
  const [art, setArt] = useState<Fotoart | null>(null);
  const [kameraOffen, setKameraOffen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [erfolg, setErfolg] = useState<string | null>(null);
  const speichernRef = useRef<HTMLButtonElement>(null);

  const speichern = useMutation({
    mutationFn: (auftrag: { art: Fotoart; foto: Blob; anzeigename: string }) =>
      speicherePatientenfoto({ patientId, ...auftrag }),
    onSuccess: (_id, auftrag) => {
      setErfolg(`„${auftrag.anzeigename}“ ist gespeichert.`);
      verwerfen();
      void queryClient.invalidateQueries({ queryKey: fotoSchluessel(patientId) });
    },
  });

  // Die Vorschau des noch nicht gespeicherten Fotos lebt genau so lange wie
  // das Foto im Arbeitsspeicher.
  useEffect(() => {
    if (!vorschau) return;
    return () => URL.revokeObjectURL(vorschau);
  }, [vorschau]);

  // Nach „Foto verwenden" ist der Knopf, der den Dialog öffnete, fort; der
  // Fokus geht auf den nächsten Schritt (DAT-11).
  useEffect(() => {
    if (foto) speichernRef.current?.focus();
  }, [foto]);

  function aufgenommen(neu: Blob) {
    setKameraOffen(false);
    setErfolg(null);
    speichern.reset();
    setFoto(neu);
    setVorschau(URL.createObjectURL(neu));
    setName(fotoVomHeutigenTag());
  }

  function verwerfen() {
    setFoto(null);
    setVorschau(null);
    setName('');
    setArt(null);
  }

  // Wird die Einwilligung widerrufen, während die Arbeitshilfe gewählt ist,
  // gilt die Wahl nicht mehr.
  const gewaehlt = art === 'patientenfoto' && !einwilligungErteilt ? null : art;
  const gruppe = `fotoart-${patientId}`;

  if (kamera === 'ohneSchnittstelle') {
    return (
      <Statusmeldung ton="warnung">
        Die Kamera steht hier nicht zur Verfügung – sie braucht eine sichere Verbindung (https).
        Fotos entstehen nur über die Kamera der Anwendung, nicht aus der Mediathek.
      </Statusmeldung>
    );
  }
  // Am Rechner ohne Kamera kein Angebot, das in eine Sackgasse führt (DAT-25).
  if (kamera === 'keine') {
    return (
      <Statusmeldung ton="warnung">
        Auf diesem Gerät wurde keine Kamera gefunden. Fotos entstehen nur über die Kamera der
        Anwendung, nicht aus der Mediathek.
      </Statusmeldung>
    );
  }
  if (kamera === 'pruefen') return null;

  return (
    <div>
      {foto && vorschau ? (
        <div>
          {/* Eine Überschrift, keine fette Zeile: in der Gliederung auffindbar
              (DAT-20). Kein gestrichelter Kasten - Ablegen per Ziehen gibt es
              nicht (DAT-21). */}
          <h3 className="text-ink-muted tracking-label text-xs font-semibold uppercase">
            Neues Foto{gewaehlt ? ` · ${fotoartLabels[gewaehlt]}` : ''}
          </h3>
          <img
            src={vorschau}
            alt="Neues Foto, noch nicht gespeichert"
            draggable={false}
            className="bg-ink rounded-image pointer-events-none mt-2 block max-h-64 w-full max-w-md object-contain select-none"
          />
          <div className="mt-3 max-w-md">
            <Field
              label="Name"
              value={name}
              maxLength={200}
              hint="Unter diesem Namen steht das Foto in der Liste – etwa die Region."
              disabled={speichern.isPending}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              ref={speichernRef}
              type="button"
              disabled={speichern.isPending || !gewaehlt}
              onClick={() =>
                gewaehlt &&
                speichern.mutate({
                  art: gewaehlt,
                  foto,
                  anzeigename: name.trim() || fotoVomHeutigenTag(),
                })
              }
            >
              {speichern.isPending ? 'Wird gespeichert …' : 'Foto speichern'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={speichern.isPending}
              onClick={verwerfen}
            >
              Verwerfen
            </Button>
          </div>
          {speichern.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {speichern.error.message} Das Foto ist noch da – „Foto speichern“ versucht es erneut,
              solange diese Seite offen ist.
            </Statusmeldung>
          ) : null}
          <Fotoverlustschutz />
        </div>
      ) : null}

      {erfolg ? (
        <Statusmeldung ton="erfolg" className="mt-2 wrap-anywhere">
          {erfolg}
        </Statusmeldung>
      ) : null}

      {wahlOffen ? (
        <Dialogfenster titel="Foto aufnehmen" onSchliessen={onWahlSchliessen}>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-ink mb-3 text-sm">Wofür ist das Foto?</legend>
            {(['dokumentationsfoto', 'patientenfoto'] as const).map((k) => {
              const gesperrt = k === 'patientenfoto' && !einwilligungErteilt;
              const aktiv = gewaehlt === k;
              return (
                <div
                  key={k}
                  className={`rounded-card border-2 px-4 py-3 ${
                    gesperrt
                      ? 'border-line bg-surface-sunken'
                      : aktiv
                        ? 'border-accent bg-accent-soft'
                        : 'border-line'
                  }`}
                >
                  <label
                    className={`flex items-start gap-3 ${gesperrt ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="radio"
                      name={gruppe}
                      className="border-line-strong text-accent focus-visible:outline-accent mt-0.5 size-5 shrink-0"
                      checked={aktiv}
                      disabled={gesperrt}
                      onChange={() => setArt(k)}
                    />
                    <span className="text-sm">
                      <span
                        className={`block font-medium ${gesperrt ? 'text-ink-muted' : 'text-ink'}`}
                      >
                        {FOTOART_WAHL[k].titel}
                      </span>
                      {k === 'patientenfoto' ? (
                        <span
                          className={`block ${gesperrt ? 'text-warnung font-semibold' : 'text-ink-muted'}`}
                        >
                          {gesperrt ? <span aria-hidden="true">! </span> : null}
                          {gesperrt
                            ? einwilligungsSatz(einwilligung, einwilligungErteilt !== null)
                            : `${FOTOART_WAHL[k].text} ${einwilligungsSatz(einwilligung, true)}`}
                        </span>
                      ) : (
                        <span className="text-ink-muted block">{FOTOART_WAHL[k].text}</span>
                      )}
                    </span>
                  </label>
                  {gesperrt && einwilligungErteilt !== null ? (
                    <div className="mt-1 pl-8">
                      <Textlink
                        to={`/patienten/${patientId}/stammdaten#${EINWILLIGUNGEN_ANKER}`}
                        alleinstehend
                        className="text-sm"
                      >
                        Zu den Einwilligungen
                      </Textlink>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
          <p className="text-ink-muted mt-4 text-sm">
            Kein Foto ersetzt einen Eintrag: Was wesentlich ist, steht in Worten in der
            Dokumentation.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="quiet" onClick={onWahlSchliessen}>
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={!gewaehlt}
              onClick={() => {
                onWahlSchliessen();
                setErfolg(null);
                setKameraOffen(true);
              }}
            >
              Foto aufnehmen
            </Button>
          </div>
        </Dialogfenster>
      ) : null}

      {kameraOffen ? (
        <Kameradialog
          titel="Foto aufnehmen"
          hinweis={HINWEIS_GESICHT}
          onAufnahme={aufgenommen}
          onSchliessen={() => setKameraOffen(false)}
        />
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Ansicht und Vergleich
// -----------------------------------------------------------------------------

export interface Geladen {
  foto: Patientenfoto;
  adresse: string;
}

function Beschriftung({ foto, zeitzone }: { foto: Patientenfoto; zeitzone: string }) {
  return (
    <>
      <span className="text-ink block font-medium wrap-anywhere">{foto.display_name}</span>
      <span className="text-ink-muted block">
        {tagDerPraxis(foto.taken_at, zeitzone)}
        {foto.taken_by_name ? ` · ${foto.taken_by_name}` : ''}
      </span>
    </>
  );
}

/**
 * Ein Foto oder zwei nebeneinander, aus dem Speicher der Seite (Punkt 39 und
 * 40). Exportiert für die Prüfseite, die es ohne Server mit synthetischen
 * Bildern zeigt.
 *
 * Ein einzelnes Foto ist so breit wie eine Hälfte des Vergleichs (DAT-15):
 * Am Bildschirm wuchs es sonst auf rund 1 050 × 1 400 px, und „Schließen" lag
 * unter dem Bild. Die Ansicht steht im Rahmen der Liste und trägt deshalb
 * keinen eigenen (DAT-21).
 */
export function Ansicht({
  fotos,
  zeitzone,
  onSchliessen,
  ref,
}: {
  fotos: Geladen[];
  zeitzone: string;
  onSchliessen: () => void;
  /** Wohin der Fokus nach dem Laden geht (DAT-06). */
  ref?: Ref<HTMLElement>;
}) {
  // Die Objekt-URLs gibt die Ansicht frei, sobald sie verschwindet.
  useEffect(
    () => () => {
      for (const { adresse } of fotos) URL.revokeObjectURL(adresse);
    },
    [fotos],
  );

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={fotos.length > 1 ? 'Vergleich zweier Fotos' : 'Fotoansicht'}
      className="mt-4 outline-none"
      // Kein Kontextmenü mit „Bild speichern" (Punkt 40).
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className={fotos.length > 1 ? 'grid grid-cols-2 gap-3' : 'mx-auto max-w-md'}>
        {fotos.map(({ foto, adresse }) => (
          <figure key={foto.id} className="min-w-0">
            <img
              src={adresse}
              alt={foto.display_name}
              draggable={false}
              className="bg-ink rounded-image pointer-events-none block aspect-[3/4] w-full object-contain select-none [-webkit-touch-callout:none]"
            />
            <figcaption className="mt-2 text-sm">
              <Beschriftung foto={foto} zeitzone={zeitzone} />
            </figcaption>
          </figure>
        ))}
      </div>
      {fotos.length > 1 ? (
        <p className="text-ink-muted mt-3 text-sm">
          Was sich verändert hat, gehört in Worten in den Eintrag.
        </p>
      ) : null}
      <div className="mt-3">
        <Button type="button" variant="secondary" onClick={onSchliessen}>
          Schließen
        </Button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Liste
// -----------------------------------------------------------------------------

function Fotozeile({
  foto,
  zeitzone,
  patientId,
  darfLoeschen,
  ausgewaehlt,
  auswahlVoll,
  onAuswahl,
  onAnsehen,
  laeuft,
  laedtHier,
  fehlerHier,
}: {
  foto: Patientenfoto;
  zeitzone: string;
  patientId: string;
  darfLoeschen: boolean;
  ausgewaehlt: boolean;
  auswahlVoll: boolean;
  onAuswahl: (an: boolean) => void;
  onAnsehen: () => void;
  laeuft: boolean;
  /** Lädt gerade dieses Foto? Dann steht es hier, nicht unter der Liste (DAT-06). */
  laedtHier: boolean;
  fehlerHier: string | null;
}) {
  const queryClient = useQueryClient();
  const loeschen = useMutation({
    mutationFn: () => loescheDatei(foto.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fotoSchluessel(patientId) });
      void queryClient.invalidateQueries({ queryKey: ['storage-deletion-orders'] });
    },
  });

  return (
    <li className="border-line border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-sm wrap-anywhere">
          <p className="text-ink text-liste font-medium">{foto.display_name}</p>
          <p className="text-ink-muted mt-0.5">
            {tagDerPraxis(foto.taken_at, zeitzone)}
            {foto.taken_by_name ? ` · ${foto.taken_by_name}` : ''}
          </p>
          <p className="text-ink-muted mt-0.5">
            {fotoartLabels[foto.document_type]}
            {foto.delete_after
              ? ` · wird spätestens am ${tagDerPraxis(foto.delete_after, zeitzone)} gelöscht`
              : ' · Teil der Akte'}
            {foto.verified_at ? '' : ` · ${NICHT_SERVERSEITIG_GEPRUEFT}`}
          </p>
        </div>
        {foto.object_missing ? null : (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={onAnsehen}
              disabled={laeuft}
            >
              Ansehen<span className="sr-only">: {foto.display_name}</span>
            </Button>
            <Checkbox
              label={
                <>
                  Zum Vergleich<span className="sr-only">: {foto.display_name}</span>
                </>
              }
              checked={ausgewaehlt}
              disabled={!ausgewaehlt && auswahlVoll}
              onChange={(e) => onAuswahl(e.target.checked)}
            />
            {darfLoeschen ? (
              <Rueckfrage
                ausloeser="Löschen"
                ausloeserVariante="quiet"
                bezeichnung={`„${foto.display_name}“ löschen`}
                bestaetigen="Endgültig löschen"
                bestaetigenLaeuft="Wird gelöscht …"
                fehler={loeschen.isError ? loeschen.error.message : undefined}
                onAbbrechen={() => loeschen.reset()}
                onBestaetigen={() => loeschen.mutateAsync()}
              >
                <span className="wrap-anywhere">
                  „{foto.display_name}“ wird sofort aus der Liste entfernt. Das lässt sich nicht
                  rückgängig machen.
                  {foto.document_type === 'dokumentationsfoto'
                    ? ' Ein Dokumentationsfoto lässt sich nur am Tag der Aufnahme löschen.'
                    : ''}
                </span>
              </Rueckfrage>
            ) : null}
          </div>
        )}
      </div>
      {laedtHier ? <Statusmeldung className="mt-2">Foto wird geladen …</Statusmeldung> : null}
      {fehlerHier ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehlerHier}
        </Statusmeldung>
      ) : null}
      {foto.object_missing ? (
        <Statusmeldung ton="fehler" className="mt-2">
          Dieses Foto ist in der Ablage nicht auffindbar. Bitte der Praxisinhaber:in melden – es
          steht unter „Aufbewahrung“.
        </Statusmeldung>
      ) : null}
    </li>
  );
}

/** Wofür gerade ein Foto lädt: eine Zeile oder der Vergleich. */
type Ladeort = { art: 'zeile'; fotoId: string } | { art: 'vergleich' };

export function Patientenfotos({
  patientId,
  user,
  dateien,
}: {
  patientId: string;
  user: CurrentUser;
  /** Die Dateien der Doku, in derselben Karte unter den Fotos. */
  dateien?: ReactNode;
}) {
  const darfSehen = canReadClinicalPatientFiles(user.roles);
  const kamera = useKamera();
  const [wahlOffen, setWahlOffen] = useState(false);
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const darfAufnehmen = canWriteClinicalPatientFiles(user.roles);

  const fotos = useQuery({
    queryKey: fotoSchluessel(patientId),
    queryFn: () => fetchPatientenfotos(patientId),
    enabled: darfSehen,
    staleTime: 0,
    retry: false,
  });
  const vermerke = useQuery({
    queryKey: ['datenschutzvermerke', patientId],
    queryFn: () => fetchDatenschutzvermerke(patientId),
    enabled: darfSehen,
    retry: false,
  });

  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [ansicht, setAnsicht] = useState<Geladen[] | null>(null);
  const [ladeort, setLadeort] = useState<Ladeort | null>(null);
  const [fehler, setFehler] = useState<{ ort: Ladeort; text: string } | null>(null);
  const ansichtRef = useRef<HTMLElement>(null);
  // Wer „Ansehen" antippte, kommt mit „Schließen" dorthin zurück (DAT-11).
  const ausloeser = useRef<HTMLElement | null>(null);
  // Wer die Seite verlässt, während ein Foto lädt, bekommt keine Objekt-URL
  // mehr erzeugt, die dann niemand freigäbe.
  const eingehaengt = useRef(true);
  useEffect(() => {
    eingehaengt.current = true;
    return () => {
      eingehaengt.current = false;
    };
  }, []);

  // Die Ansicht steht unter der Liste; nach dem Laden rollt sie ins Bild und
  // bekommt den Fokus (DAT-06) - sonst geschah nach dem Tipp scheinbar nichts.
  useEffect(() => {
    if (!ansicht) return;
    ansichtRef.current?.scrollIntoView?.({ block: 'start' });
    ansichtRef.current?.focus();
  }, [ansicht]);

  if (!darfSehen) return null;

  const laeuft = ladeort !== null;
  const liste = fotos.data ?? [];
  const einwilligung = vermerke.data
    ? datenschutzstand(vermerke.data).einwilligungen.find((e) => e.zweck === 'patient_photos')
    : undefined;
  // Nur, was noch in der Liste steht, kann verglichen werden.
  const gewaehlt = auswahl.filter((id) => liste.some((foto) => foto.id === id));

  /** Öffnen ist immer ein Klick: ein Verweis je Foto, je Öffnen (Punkt 15). */
  async function oeffnen(auswahlFotos: Patientenfoto[], ort: Ladeort) {
    ausloeser.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFehler(null);
    setLadeort(ort);
    try {
      const bilder: Blob[] = [];
      for (const foto of auswahlFotos) bilder.push(await ladePatientenfoto(foto.id));
      if (!eingehaengt.current) return;
      setAnsicht(
        auswahlFotos.map((foto, i) => ({ foto, adresse: URL.createObjectURL(bilder[i]!) })),
      );
    } catch (ursache) {
      if (eingehaengt.current) setFehler({ ort, text: (ursache as Error).message });
    } finally {
      if (eingehaengt.current) setLadeort(null);
    }
  }

  function schliessen() {
    setAnsicht(null);
    if (ausloeser.current?.isConnected) ausloeser.current.focus();
  }

  const hierLadend = (fotoId: string) => ladeort?.art === 'zeile' && ladeort.fotoId === fotoId;
  const hierFehler = (fotoId: string) =>
    fehler?.ort.art === 'zeile' && fehler.ort.fotoId === fotoId ? fehler.text : null;

  return (
    // Fotos und Dateien in einer Karte (Akte entschlacken, 2026-10-03). Was
    // Dokumentationsfoto und Arbeitshilfe bedeuten und was die Einwilligung
    // erlaubt, steht im Fenster „Foto aufnehmen", wo gewählt wird.
    <Section
      titel="Fotos und Dateien"
      rahmen
      aktion={
        darfAufnehmen && kamera === 'vorhanden' ? (
          <Button
            type="button"
            variant="secondary"
            disabled={vermerke.isPending}
            onClick={() => setWahlOffen(true)}
          >
            Foto aufnehmen
          </Button>
        ) : undefined
      }
    >
      {/* Gesagt wird nur, was geladen ist (DAT-03, ZST-09): Scheitert das
          Laden der Vermerke, lassen sich nur Dokumentationsfotos aufnehmen. */}
      {vermerke.isError ? (
        <ErrorState
          title="Der Stand der Einwilligung konnte nicht geladen werden."
          description="Bis er geladen ist, lassen sich nur Dokumentationsfotos aufnehmen. Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => vermerke.refetch()}
        />
      ) : null}

      {darfAufnehmen && !vermerke.isPending ? (
        <Aufnahme
          patientId={patientId}
          einwilligungErteilt={vermerke.isSuccess ? einwilligung?.erteilt === true : null}
          einwilligung={einwilligung}
          wahlOffen={wahlOffen}
          onWahlSchliessen={() => setWahlOffen(false)}
        />
      ) : null}

      {/* Die Liste steht in der Karte „Fotos und Dateien“, ohne eigenen
          Kasten darin (Leitfaden L2). */}
      <div className="mt-4">
        {fotos.isPending ? <LoadingState label="Fotos werden geladen …" /> : null}
        {fotos.isError ? (
          <ErrorState
            title="Die Fotos konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => fotos.refetch()}
          />
        ) : null}
        {fotos.data && liste.length === 0 ? (
          <p className="text-ink text-liste">Für diese Person liegt kein Foto vor.</p>
        ) : null}

        {liste.length > 0 ? (
          <ul className="flex flex-col">
            {liste.map((foto) => (
              <Fotozeile
                key={foto.id}
                foto={foto}
                zeitzone={zeitzone}
                patientId={patientId}
                darfLoeschen={darfAufnehmen && foto.deletable}
                ausgewaehlt={gewaehlt.includes(foto.id)}
                auswahlVoll={gewaehlt.length >= 2}
                laeuft={laeuft}
                laedtHier={hierLadend(foto.id)}
                fehlerHier={hierFehler(foto.id)}
                onAuswahl={(an) =>
                  setAuswahl((bisher) =>
                    an ? [...bisher, foto.id] : bisher.filter((id) => id !== foto.id),
                  )
                }
                onAnsehen={() => void oeffnen([foto], { art: 'zeile', fotoId: foto.id })}
              />
            ))}
          </ul>
        ) : null}

        {liste.length > 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={gewaehlt.length !== 2 || laeuft}
              onClick={() =>
                void oeffnen(
                  gewaehlt
                    .map((id) => liste.find((foto) => foto.id === id))
                    .filter((foto): foto is Patientenfoto => Boolean(foto))
                    // Das ältere links, das jüngere rechts.
                    .sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
                  { art: 'vergleich' },
                )
              }
            >
              Nebeneinander ansehen
            </Button>
            <span className="text-ink-muted text-sm">
              {gewaehlt.length === 2 ? 'Zwei Fotos gewählt.' : 'Zwei Fotos „Zum Vergleich“ wählen.'}
            </span>
          </div>
        ) : null}
        {ladeort?.art === 'vergleich' ? (
          <Statusmeldung className="mt-2">Fotos werden geladen …</Statusmeldung>
        ) : null}
        {fehler?.ort.art === 'vergleich' ? (
          <Statusmeldung ton="fehler" className="mt-2">
            {fehler.text}
          </Statusmeldung>
        ) : null}

        {ansicht ? (
          <Ansicht ref={ansichtRef} fotos={ansicht} zeitzone={zeitzone} onSchliessen={schliessen} />
        ) : null}
      </div>

      {/* Die Größe des Kleingedruckten entscheidet Jannes für alle Stellen
          zugleich (TOK-04); bis dahin bleibt sie hier, wie sie ist. */}
      {dateien ? <div className="mt-4">{dateien}</div> : null}

      <div className="border-line mt-4 border-t pt-3">
        <p className="text-ink-muted max-w-prose text-sm leading-relaxed">
          Fotos lassen sich hier weder herunterladen noch teilen.
        </p>
      </div>
    </Section>
  );
}
