import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { datenschutzstand, fetchDatenschutzvermerke } from '@/features/datenschutz/vermerke';
import {
  canReadClinicalPatientFiles,
  canWriteClinicalPatientFiles,
  type CurrentUser,
} from '@/features/session/types';
import { loescheDatei } from './api';
import { Fotoverlustschutz } from './Fotoverlustschutz';
import { Kameradialog } from './Kameradialog';
import { fotoVomHeutigenTag, kameraVerfuegbar } from './kamera';
import {
  fetchPatientenfotos,
  ladePatientenfoto,
  speicherePatientenfoto,
  type Patientenfoto,
} from './patientenfotos';

/**
 * Fotos im Verlauf (DOK-006, ADR-017 Abschnitt G).
 *
 * Arbeitshilfe für Übergabe und Vergleich — nicht die Dokumentation. Was die
 * Therapeut:in auf einem Foto oder im Vergleich zweier Fotos als wesentlich
 * sieht, steht in Worten im Eintrag (Punkt 35). Das sagt der Abschnitt, bevor
 * er irgendetwas anbietet.
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

function Einwilligungsstand({
  patientId,
  stand,
}: {
  patientId: string;
  stand: ReturnType<typeof datenschutzstand>['einwilligungen'][number] | undefined;
}) {
  const zumDatenschutz = (
    <Link
      to={`/patienten/${patientId}/datenschutz`}
      className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
    >
      Zum Datenschutz der Akte
    </Link>
  );

  if (stand?.erteilt) {
    return (
      <p className="text-ink-muted text-sm">
        Einwilligung erteilt am {kalendertag(stand.seit)}. Ein Widerruf löscht alle Fotos sofort.
      </p>
    );
  }

  const text = stand?.abgelehnt
    ? `Einwilligung abgelehnt am ${kalendertag(stand.seit)}. Ohne Einwilligung entstehen keine Fotos.`
    : stand?.seit
      ? `Einwilligung widerrufen am ${kalendertag(stand.seit)}. Neue Fotos erst nach einer neuen Einwilligung.`
      : 'Keine Einwilligung vermerkt. Fotos entstehen erst, wenn sie vorliegt.';

  return (
    <div>
      <p className="text-ink-muted text-sm">{text}</p>
      {zumDatenschutz}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Aufnahme
// -----------------------------------------------------------------------------

function Aufnahme({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const [kameraOffen, setKameraOffen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [erfolg, setErfolg] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: (auftrag: { foto: Blob; anzeigename: string }) =>
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
  }

  if (!kameraVerfuegbar()) {
    return (
      <Statusmeldung ton="warnung">
        Die Kamera steht hier nicht zur Verfügung — sie braucht eine sichere Verbindung (https).
        Fotos entstehen nur über die Kamera der Anwendung, nicht aus der Mediathek.
      </Statusmeldung>
    );
  }

  return (
    <div>
      {foto && vorschau ? (
        <div className="border-line rounded-card border border-dashed p-4">
          <p className="text-ink text-[0.9375rem] font-medium">Neues Foto</p>
          <img
            src={vorschau}
            alt="Neues Foto, noch nicht gespeichert"
            draggable={false}
            className="bg-ink rounded-card pointer-events-none mt-2 block max-h-64 w-full object-contain select-none"
          />
          <div className="mt-3 max-w-md">
            <Field
              label="Name"
              value={name}
              maxLength={200}
              hint="Unter diesem Namen steht das Foto in der Liste — etwa die Region."
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={speichern.isPending}
              onClick={() =>
                speichern.mutate({ foto, anzeigename: name.trim() || fotoVomHeutigenTag() })
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
              {speichern.error.message} Das Foto ist noch da — „Foto speichern“ versucht es erneut,
              solange diese Seite offen ist.
            </Statusmeldung>
          ) : null}
          <Fotoverlustschutz />
        </div>
      ) : (
        <Button type="button" onClick={() => setKameraOffen(true)}>
          Foto aufnehmen
        </Button>
      )}

      {erfolg ? (
        <Statusmeldung ton="neutral" className="mt-2">
          {erfolg}
        </Statusmeldung>
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
      <span className="text-ink block font-medium">{foto.display_name}</span>
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
 */
export function Ansicht({
  fotos,
  zeitzone,
  onSchliessen,
}: {
  fotos: Geladen[];
  zeitzone: string;
  onSchliessen: () => void;
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
      aria-label={fotos.length > 1 ? 'Vergleich zweier Fotos' : 'Fotoansicht'}
      className="border-line bg-surface rounded-card mt-4 border p-4"
      // Kein Kontextmenü mit „Bild speichern" (Punkt 40).
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className={fotos.length > 1 ? 'grid grid-cols-2 gap-3' : ''}>
        {fotos.map(({ foto, adresse }) => (
          <figure key={foto.id} className="min-w-0">
            <img
              src={adresse}
              alt={foto.display_name}
              draggable={false}
              className="bg-ink rounded-card pointer-events-none block aspect-[3/4] w-full object-contain select-none [-webkit-touch-callout:none]"
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
        <div className="min-w-0 text-sm">
          <p className="text-ink text-[0.9375rem] font-medium">{foto.display_name}</p>
          <p className="text-ink-muted mt-0.5">
            {tagDerPraxis(foto.taken_at, zeitzone)}
            {foto.taken_by_name ? ` · ${foto.taken_by_name}` : ''} · wird spätestens am{' '}
            {tagDerPraxis(foto.delete_after, zeitzone)} gelöscht
          </p>
        </div>
        {foto.object_missing ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAnsehen}
              disabled={laeuft}
              className={kartenAktionKlassen()}
            >
              Ansehen<span className="sr-only">: {foto.display_name}</span>
            </button>
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
                laeuft={loeschen.isPending}
                fehler={loeschen.isError ? loeschen.error.message : undefined}
                onBestaetigen={() => loeschen.mutate()}
              >
                „{foto.display_name}“ wird sofort aus der Liste entfernt; das abgelegte Foto löscht
                der Löschauftrag. Rückgängig machen lässt sich das nicht.
              </Rueckfrage>
            ) : null}
          </div>
        )}
      </div>
      {foto.object_missing ? (
        <Statusmeldung ton="fehler" className="mt-2">
          Dieses Foto ist in der Ablage nicht auffindbar. Bitte der Praxisinhaber:in melden — es
          steht in der Aufbewahrungsübersicht.
        </Statusmeldung>
      ) : null}
    </li>
  );
}

export function Patientenfotos({ patientId, user }: { patientId: string; user: CurrentUser }) {
  const darfSehen = canReadClinicalPatientFiles(user.roles);
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
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Wer die Seite verlässt, während ein Foto lädt, bekommt keine Objekt-URL
  // mehr erzeugt, die dann niemand freigäbe.
  const eingehaengt = useRef(true);
  useEffect(() => {
    eingehaengt.current = true;
    return () => {
      eingehaengt.current = false;
    };
  }, []);

  if (!darfSehen) return null;

  const liste = fotos.data ?? [];
  const einwilligung = vermerke.data
    ? datenschutzstand(vermerke.data).einwilligungen.find((e) => e.zweck === 'patient_photos')
    : undefined;
  // Nur, was noch in der Liste steht, kann verglichen werden.
  const gewaehlt = auswahl.filter((id) => liste.some((foto) => foto.id === id));

  /** Öffnen ist immer ein Klick: ein Verweis je Foto, je Öffnen (Punkt 15). */
  async function oeffnen(auswahlFotos: Patientenfoto[]) {
    setFehler(null);
    setLaeuft(true);
    try {
      const bilder: Blob[] = [];
      for (const foto of auswahlFotos) bilder.push(await ladePatientenfoto(foto.id));
      if (!eingehaengt.current) return;
      setAnsicht(
        auswahlFotos.map((foto, i) => ({ foto, adresse: URL.createObjectURL(bilder[i]!) })),
      );
    } catch (ursache) {
      if (eingehaengt.current) setFehler((ursache as Error).message);
    } finally {
      if (eingehaengt.current) setLaeuft(false);
    }
  }

  return (
    <Section
      titel="Fotos"
      rahmen
      hinweis="Arbeitshilfe für Übergabe und Vergleich, neben der Akte. Ein Foto ersetzt keinen Eintrag: Was wesentlich ist, steht in Worten in der Dokumentation."
    >
      {vermerke.isPending ? null : (
        <Einwilligungsstand patientId={patientId} stand={einwilligung} />
      )}

      {darfAufnehmen && einwilligung?.erteilt ? (
        <div className="mt-3">
          <Aufnahme patientId={patientId} />
        </div>
      ) : null}

      <div className="mt-4">
        {fotos.isPending ? <LoadingState label="Fotos werden geladen …" /> : null}
        {fotos.isError ? <ErrorState title="Die Fotos konnten nicht geladen werden." /> : null}
        {fotos.data && liste.length === 0 ? (
          <EmptyState title="Keine Fotos" description="Für diese Person liegt kein Foto vor." />
        ) : null}

        {liste.length > 0 ? (
          <ul className="flex flex-col">
            {liste.map((foto) => (
              <Fotozeile
                key={foto.id}
                foto={foto}
                zeitzone={zeitzone}
                patientId={patientId}
                darfLoeschen={darfAufnehmen}
                ausgewaehlt={gewaehlt.includes(foto.id)}
                auswahlVoll={gewaehlt.length >= 2}
                laeuft={laeuft}
                onAuswahl={(an) =>
                  setAuswahl((bisher) =>
                    an ? [...bisher, foto.id] : bisher.filter((id) => id !== foto.id),
                  )
                }
                onAnsehen={() => void oeffnen([foto])}
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

        {laeuft ? <LoadingState label="Foto wird geladen …" /> : null}
        {fehler ? (
          <Statusmeldung ton="fehler" className="mt-2">
            {fehler}
          </Statusmeldung>
        ) : null}

        {ansicht ? (
          <Ansicht fotos={ansicht} zeitzone={zeitzone} onSchliessen={() => setAnsicht(null)} />
        ) : null}
      </div>

      <p className="text-ink-subtle mt-4 max-w-prose text-xs leading-relaxed">
        Jedes Öffnen eines Fotos wird protokolliert. Fotos lassen sich hier weder herunterladen noch
        teilen.
      </p>
    </Section>
  );
}
