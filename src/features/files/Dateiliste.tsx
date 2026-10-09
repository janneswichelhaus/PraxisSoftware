import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure, Inhaltsflaeche } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { ladeDateiHerunter, ladeDateiZumAnzeigen, setzeFreigabe, type PatientFile } from './api';
import { Dateiansicht } from './Dateiansicht';
import { Fotoverlustschutz } from './Fotoverlustschutz';
import { Kameradialog } from './Kameradialog';
import { fotoVomHeutigenTag, useKamera } from './kamera';
import { useDateiLoeschen, useDateiUpload, useDateien, useDokumentartKorrigieren } from './dateien';
import {
  DATEI_ACCEPT,
  dateiAblehnungsgrund,
  dokumentartHinweise,
  dokumentartLabels,
  formatBytes,
  istAnzeigbar,
  istKlinisch,
  NICHT_SERVERSEITIG_GEPRUEFT,
  sichtbarkeitHinweis,
  type Dokumentart,
} from './dokumentarten';
import {
  canCorrectPatientFileType,
  canWriteClinicalPatientFiles,
  canWriteTreatmentBases,
  type CurrentUser,
} from '@/features/session/types';

/**
 * Dateien einer Akte: anzeigen, hinzufügen, öffnen (DAT-001, ADR-017).
 *
 * Ein Baustein für die Reiter der Akte (AKTE-007: je Reiter ein Ausschnitt,
 * `Aktendateien.tsx`) und die einzelne Verordnung (VER-004). Der Unterschied ist ein Parameter, nicht eine
 * zweite Umsetzung: An einer Verordnung ist die Art auf den Verordnungsscan
 * festgelegt, in der Akte wird sie gewählt.
 *
 * Drei Dinge sind hier bewusst unbequem:
 *
 *   * **Öffnen ist immer ein bewusster Tap.** Es gibt keine Vorschaubilder und
 *     keine Verweise auf Vorrat (ADR-017 Punkt 15) — jeder erzeugte Verweis
 *     ist ein Auditeintrag, und eine Liste, die von allein zwanzig davon
 *     erzeugt, wäre ein Protokoll ohne Aussage.
 *   * **Die Dokumentart steht neben ihrer Folge.** Wer wählt, liest im selben
 *     Atemzug, wer die Datei danach sehen kann. Eine falsche Art ist eine
 *     Offenlegung nach §13, kein Schönheitsfehler.
 *   * **Eine fehlende Datei ist ein sichtbarer Fehler**, keine leere Fläche
 *     (Punkt 27, §13).
 *
 * Gerahmt ist nur die Liste, eine Auskunft; das Hinzufügen ist ein Formular
 * und steht als eigener Abschnitt ohne Rahmen darunter (UI-002c, DAT-21).
 */

/** Wie eine Zeit der Ablage als Tag der Praxis erscheint - wie bei den Fotos, zweistellig (WRT-15). */
function tagDerPraxis(zeitpunkt: string, zeitzone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zeitzone,
  }).format(new Date(zeitpunkt));
}

function Dokumentartauswahl({
  wert,
  onChange,
  arten,
  feldId,
  disabled = false,
}: {
  wert: Dokumentart;
  onChange: (art: Dokumentart) => void;
  arten: readonly Dokumentart[];
  feldId?: string | undefined;
  disabled?: boolean;
}) {
  return (
    <Select
      feldId={feldId}
      label="Art des Dokuments"
      hint={`${dokumentartHinweise[wert]} ${sichtbarkeitHinweis(wert)}`}
      value={wert}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Dokumentart)}
    >
      {arten.map((art) => (
        <option key={art} value={art}>
          {dokumentartLabels[art]}
        </option>
      ))}
    </Select>
  );
}

interface UploadfeldProps {
  patientId: string;
  grundlageId: string | null;
  /** Auswählbare Arten. Genau eine bedeutet: keine Auswahl, nur ein Hinweis. */
  arten: readonly Dokumentart[];
}

/**
 * Datei wählen oder fotografieren, Art bestimmen, hinzufügen.
 *
 * Der Anzeigename kommt aus dem Dateinamen und ist änderbar — er ist das
 * einzige Wort, unter dem die Datei später wiederzufinden ist, und
 * `IMG_4711.jpg` ist keins. Im Objektschlüssel steht er nie (ADR-017 Punkt 5).
 *
 * **Dokument fotografieren** (DOK-006, ADR-017 Punkt 33): Für ein Blatt auf
 * Papier — Verordnung, Anamnesebogen, unterschriebene Einwilligung — ist der
 * Kameradialog der angebotene Weg; das Foto landet dann nicht in der
 * Mediathek des Handys. Der Dateiwähler bleibt für das, was schon als Datei
 * vorliegt. Bis zum Hinzufügen liegt das Foto nur im Arbeitsspeicher; der
 * `Fotoverlustschutz` fragt, bevor jemand die Seite mit ihm verlässt.
 *
 * Der Knopf heißt **nicht** „Foto aufnehmen" wie beim Patientenfoto im
 * Behandlungsverlauf (DAT-01): Hinter den beiden Knöpfen liegen zwei
 * Rechtswege - hier ein Dokument der Akte, dort ein Foto der Person mit
 * Einwilligung und Zwölfmonatsfrist (ADR-017, „scharfe Kante").
 */
function Uploadfeld({ patientId, grundlageId, arten }: UploadfeldProps) {
  const dateifeldId = useId();
  const [art, setArt] = useState<Dokumentart>(arten[0]!);
  const [datei, setDatei] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [ablehnung, setAblehnung] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [kameraOffen, setKameraOffen] = useState(false);
  const [ausKamera, setAusKamera] = useState(false);
  const [vorschau, setVorschau] = useState<string | null>(null);
  // Ein Dateifeld lässt sich nicht über seinen Wert leeren. Der Zähler baut es
  // nach dem Hinzufügen neu auf - sonst stünde dort noch der Name der Datei,
  // die schon in der Akte liegt.
  const [durchgang, setDurchgang] = useState(0);
  const kamera = useKamera();

  const upload = useDateiUpload(patientId);
  // Während des Hochladens bleibt alles stehen, was hochgeladen wird (DAT-09):
  // Eine andere Datei, Art oder ein anderer Name danach wäre nicht das, was
  // gerade in die Akte geht.
  const laeuft = upload.isPending;

  // Die Vorschau des Fotos lebt so lange wie das Foto im Arbeitsspeicher.
  useEffect(() => {
    if (!vorschau) return;
    return () => URL.revokeObjectURL(vorschau);
  }, [vorschau]);

  function dateiGewaehlt(gewaehlt: File | null) {
    setErfolg(null);
    setAusKamera(false);
    setVorschau(null);
    upload.reset();
    if (!gewaehlt) {
      setDatei(null);
      setAblehnung(null);
      return;
    }
    const grund = dateiAblehnungsgrund(gewaehlt);
    setAblehnung(grund);
    setDatei(grund ? null : gewaehlt);
    if (!grund) setName(gewaehlt.name);
  }

  function fotoAufgenommen(foto: Blob) {
    setKameraOffen(false);
    setErfolg(null);
    upload.reset();
    const vorschlag = fotoVomHeutigenTag();
    const aufnahme = new File([foto], `${vorschlag}.jpg`, { type: 'image/jpeg' });
    const grund = dateiAblehnungsgrund(aufnahme);
    setAblehnung(grund);
    setDatei(grund ? null : aufnahme);
    setAusKamera(!grund);
    setVorschau(grund ? null : URL.createObjectURL(aufnahme));
    setName(vorschlag);
    // Eine vorher gewählte Datei stünde sonst weiter im Feld.
    setDurchgang((n) => n + 1);
  }

  function zuruecksetzen() {
    setDatei(null);
    setName('');
    setAblehnung(null);
    setAusKamera(false);
    setVorschau(null);
    setDurchgang((n) => n + 1);
  }

  function hinzufuegen() {
    if (!datei) return;
    upload.mutate(
      {
        patientId,
        grundlageId,
        documentType: art,
        displayName: name.trim() || datei.name,
        datei,
      },
      {
        onSuccess: () => {
          setErfolg(`„${name.trim() || datei.name}“ ist in der Akte.`);
          zuruecksetzen();
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Ein Foto aus der Kamera steht an der Stelle des Dateifelds, mit
          Vorschau (DAT-08): Das neu aufgebaute Feld zeigte „keine Datei",
          während darunter das Foto stand. */}
      {ausKamera && datei && vorschau ? (
        <div className="flex flex-wrap items-center gap-3">
          <img
            src={vorschau}
            alt="Foto aus der Kamera, noch nicht hinzugefügt"
            draggable={false}
            className="bg-ink rounded-image pointer-events-none block h-24 w-18 object-contain select-none"
          />
          <p className="text-ink text-sm">Foto aus der Kamera – noch nicht hinzugefügt</p>
        </div>
      ) : (
        <div className="max-w-xl">
          <Field
            key={durchgang}
            feldId={dateifeldId}
            label="Datei"
            type="file"
            accept={DATEI_ACCEPT}
            // Hinweis und Ablehnungsgrund verbindet das Feld selbst mit der
            // Eingabe (DAT-12) - ein eigenes aria-describedby von hier
            // überschriebe beides.
            hint="PDF, JPEG oder PNG bis 10 MB. Ort, Gerät und Vorschaubild werden aus Bildern vor dem Hochladen entfernt. Eine hinzugefügte Datei lässt sich nicht mehr ändern – eine Korrektur ist eine neue Datei."
            error={ablehnung ?? undefined}
            disabled={laeuft}
            // Der Knopf des Browsers bekommt die Gestalt eines Sekundärknopfs
            // (DAT-10): Ohne sie stand „Datei auswählen" als bloßer Text im
            // Feldrahmen.
            className="file:rounded-button file:border-line-strong file:text-accent file:hover:bg-accent-soft file:mr-3 file:min-h-10 file:cursor-pointer file:border file:bg-transparent file:px-4 file:text-sm file:font-bold"
            onChange={(e) => dateiGewaehlt(e.currentTarget.files?.[0] ?? null)}
          />
          {/* Der Grund entsteht beim Wählen, nicht beim Absenden: Er wird
              deshalb auch angesagt (DAT-12). */}
          <p role="alert" className="sr-only">
            {ablehnung ?? ''}
          </p>
          {kamera === 'vorhanden' ? (
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              disabled={laeuft}
              onClick={() => setKameraOffen(true)}
            >
              {grundlageId ? 'Rezept fotografieren' : 'Dokument fotografieren'}
            </Button>
          ) : null}
        </div>
      )}

      <div className="grid max-w-3xl gap-3 lg:grid-cols-2">
        {arten.length > 1 ? (
          <Dokumentartauswahl wert={art} onChange={setArt} arten={arten} disabled={laeuft} />
        ) : (
          <div>
            <p className="text-ink text-sm font-medium">{dokumentartLabels[art]}</p>
            <p className="text-ink-muted mt-1 max-w-prose text-sm">{sichtbarkeitHinweis(art)}</p>
          </div>
        )}

        {datei ? (
          <Field
            label="Name in der Akte"
            value={name}
            maxLength={200}
            hint="Unter diesem Namen steht die Datei in der Akte."
            disabled={laeuft}
            onChange={(e) => setName(e.target.value)}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={hinzufuegen} disabled={!datei || laeuft}>
          {laeuft ? 'Wird hinzugefügt …' : 'Datei hinzufügen'}
        </Button>
        {datei ? (
          <Button type="button" variant="secondary" disabled={laeuft} onClick={zuruecksetzen}>
            Verwerfen
          </Button>
        ) : null}
        {datei ? (
          <span className="text-ink-muted min-w-0 text-sm wrap-anywhere">
            {ausKamera ? 'Foto aus der Kamera' : datei.name} · {formatBytes(datei.size)}
          </span>
        ) : null}
      </div>

      {upload.isError ? (
        <Statusmeldung ton="fehler">
          {upload.error.message}
          {ausKamera
            ? ' Das Foto ist noch da – „Datei hinzufügen“ versucht es erneut, solange diese Seite offen ist.'
            : null}
        </Statusmeldung>
      ) : null}
      {erfolg ? (
        <Statusmeldung ton="erfolg" className="wrap-anywhere">
          {erfolg}
        </Statusmeldung>
      ) : null}

      {kameraOffen ? (
        <Kameradialog
          titel="Foto eines Dokuments"
          hinweis="Das Blatt flach hinlegen und ganz ins Bild nehmen. Das Foto bleibt in der Anwendung und landet nicht in der Mediathek des Geräts."
          onAufnahme={fotoAufgenommen}
          onSchliessen={() => setKameraOffen(false)}
        />
      ) : null}
      {ausKamera && datei ? <Fotoverlustschutz /> : null}
    </div>
  );
}

/**
 * Die Dokumentart einer bestehenden Datei korrigieren (DAT-002).
 *
 * Aufgeklappt statt in einem Dialog, weil die Folge mitgelesen werden soll:
 * Die Auswahl zeigt bei jeder Art, wer die Datei danach sieht. ADR-017
 * Punkt 13 nennt das ausdrücklich keinen Stammdatenvorgang — die Änderung
 * verschiebt eine Sichtbarkeitsgrenze.
 *
 * Der Kasten sieht aus und führt den Fokus wie die Rückfrage daneben (DAT-22,
 * DAT-11): beim Öffnen in die Auswahl, beim Abbrechen und nach dem Übernehmen
 * zurück auf „Art korrigieren" - und danach steht da, was sich geändert hat.
 */
function Artkorrektur({
  datei,
  patientId,
  arten,
}: {
  datei: PatientFile;
  patientId: string;
  arten: readonly Dokumentart[];
}) {
  const auswahlId = useId();
  const [offen, setOffen] = useState(false);
  const [art, setArt] = useState<Dokumentart>(datei.document_type as Dokumentart);
  const [geaendert, setGeaendert] = useState<string | null>(null);
  const [fokusZurueck, setFokusZurueck] = useState(false);
  const ausloeserRef = useRef<HTMLButtonElement>(null);
  const korrektur = useDokumentartKorrigieren(patientId);

  useEffect(() => {
    if (offen) document.getElementById(auswahlId)?.focus();
  }, [offen, auswahlId]);

  // Zurück auf den Auslöser braucht einen eigenen Durchlauf: Solange der
  // Kasten steht, gibt es ihn nicht.
  useEffect(() => {
    if (!offen && fokusZurueck) {
      ausloeserRef.current?.focus();
      setFokusZurueck(false);
    }
  }, [offen, fokusZurueck]);

  // Ein Verordnungsscan braucht eine Verordnung (ADR-017 Punkt 10). Hängt die
  // Datei an keiner, steht die Art gar nicht erst zur Wahl - der Server würde
  // sie abweisen, und ein Angebot, das keins ist, ist ein Rätsel (§13).
  const waehlbar = datei.treatment_basis_id
    ? arten
    : arten.filter((eintrag) => eintrag !== 'verordnungsscan');

  function schliessen() {
    setOffen(false);
    setFokusZurueck(true);
  }

  if (!offen) {
    return (
      <>
        <Button
          ref={ausloeserRef}
          type="button"
          variant="quiet"
          groesse="kompakt"
          onClick={() => {
            setGeaendert(null);
            korrektur.reset();
            setArt(datei.document_type as Dokumentart);
            setOffen(true);
          }}
        >
          Art korrigieren<span className="sr-only">: {datei.display_name}</span>
        </Button>
        {geaendert ? (
          <Statusmeldung ton="erfolg" className="w-full">
            {geaendert}
          </Statusmeldung>
        ) : null}
      </>
    );
  }

  const bisher = dokumentartLabels[datei.document_type as Dokumentart] ?? datei.document_type;

  return (
    <div
      role="group"
      aria-label={`Art von „${datei.display_name}“ korrigieren`}
      // Wie eine Rückfrage: vertieft mit Linie links, kein Kasten in der
      // Liste (Leitfaden L2).
      className="border-line-strong bg-surface-sunken mt-2 w-full border-l-4 py-4 pr-4 pl-5"
    >
      <Dokumentartauswahl
        feldId={auswahlId}
        wert={art}
        onChange={setArt}
        arten={waehlbar}
        disabled={korrektur.isPending}
      />
      {korrektur.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {korrektur.error.message}
        </Statusmeldung>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={korrektur.isPending || art === datei.document_type}
          onClick={() =>
            korrektur.mutate(
              { fileId: datei.id, documentType: art },
              {
                onSuccess: () => {
                  setGeaendert(`Art geändert: ${bisher} → ${dokumentartLabels[art]}.`);
                  schliessen();
                },
              },
            )
          }
        >
          {korrektur.isPending ? 'Wird geändert …' : 'Art übernehmen'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          disabled={korrektur.isPending}
          onClick={() => {
            setArt(datei.document_type as Dokumentart);
            schliessen();
          }}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

/**
 * Eine Zeile der Liste.
 *
 * „Öffnen" zeigt die Datei in der Anwendung (ADR-017 Punkt 54): Verweis ohne
 * Downloadnamen erst beim Tap, Bytes in den Speicher der Seite, Ansicht unter
 * der Zeile. „Herunterladen" ist eine eigene Aktion mit eigenem Verweis und
 * Kennzeichen im Protokoll (Punkt 55). Ein Verweis lebt 60 Sekunden und ist
 * nicht widerrufbar (Punkt 17) — deshalb steht er nirgendwo im Markup und
 * wird nirgends gemerkt. Ein PDF steht im Rahmen (Punkt 58, ANN-223).
 *
 * „Löschen" nimmt die Datei sofort aus der Akte; das Objekt folgt über den
 * Löschauftrag (Punkt 25). Die Rückfrage sagt, was für die Person zählt: Die
 * Datei ist weg, und das lässt sich nicht rückgängig machen (DAT-23). Sie
 * wartet auf das Ergebnis und zeigt einen Fehlschlag im Kasten (ZST-06).
 */
/** Fotos erscheinen nie auf der Plattform (ADR-017 Punkt 37, ANN-249). */
function istFoto(art: string): boolean {
  return art === 'patientenfoto' || art === 'dokumentationsfoto';
}

function Dateizeile({
  datei,
  patientId,
  zeitzone,
  darfLoeschen,
  darfArtKorrigieren,
  darfFreigeben,
  arten,
}: {
  datei: PatientFile;
  patientId: string;
  zeitzone: string;
  darfLoeschen: boolean;
  darfArtKorrigieren: boolean;
  /** POR-014: für die Person auf der Plattform freigeben (Behandlungsrollen). */
  darfFreigeben: boolean;
  arten: readonly Dokumentart[];
}) {
  const queryClient = useQueryClient();
  const freigabe = useMutation({
    mutationFn: (freigegeben: boolean) => setzeFreigabe(datei.id, freigegeben),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patient-files', patientId] }),
  });
  const [laeuft, setLaeuft] = useState<'oeffnen' | 'herunterladen' | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Blob | null>(null);
  const ansichtRef = useRef<HTMLElement>(null);
  const oeffnenRef = useRef<HTMLButtonElement>(null);
  const art = datei.document_type as Dokumentart;
  const loeschen = useDateiLoeschen(patientId);
  const anzeigbar = istAnzeigbar(datei.mime_type);

  // Nach dem Laden rollt die Ansicht ins Bild und bekommt den Fokus (DAT-06).
  useEffect(() => {
    if (!ansicht) return;
    ansichtRef.current?.scrollIntoView?.({ block: 'nearest' });
    ansichtRef.current?.focus();
  }, [ansicht]);

  async function ausfuehren(aktion: 'oeffnen' | 'herunterladen') {
    setFehler(null);
    setLaeuft(aktion);
    try {
      if (aktion === 'oeffnen') setAnsicht((await ladeDateiZumAnzeigen(datei.id)).bild);
      else await ladeDateiHerunter(datei.id);
    } catch (ursache) {
      setFehler((ursache as Error).message);
    } finally {
      setLaeuft(null);
    }
  }

  function schliessen() {
    setAnsicht(null);
    oeffnenRef.current?.focus();
  }

  return (
    <li className="border-line border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Namen ohne Leerzeichen - „Befundbericht_Orthopaedie_…pdf" - brechen
            um, statt die Seite waagerecht rollen zu lassen (DAT-05, RSP-15). */}
        <div className="min-w-0 wrap-anywhere">
          <p className="text-ink text-liste font-medium">{datei.display_name}</p>
          <p className="text-ink-muted mt-0.5 text-sm">
            {dokumentartLabels[art] ?? datei.document_type} · {formatBytes(datei.byte_size)}
            {datei.uploaded_at ? ` · ${tagDerPraxis(datei.uploaded_at, zeitzone)}` : ''}
            {datei.uploaded_by_name ? ` · ${datei.uploaded_by_name}` : ''}
            {datei.verified_at ? '' : ` · ${NICHT_SERVERSEITIG_GEPRUEFT}`}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* Farbe ist nie allein Bedeutungsträger: der Zustand steht als Wort. */}
          <Badge ton={istKlinisch(art) ? 'neutral' : 'akzent'}>
            {istKlinisch(art) ? 'Klinisch' : 'Organisatorisch'}
          </Badge>
          {datei.released_at ? <Badge ton="positiv">Für die Person freigegeben</Badge> : null}
          {datei.object_missing || !anzeigbar ? null : (
            <Button
              ref={oeffnenRef}
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => void ausfuehren('oeffnen')}
              disabled={laeuft !== null}
            >
              {laeuft === 'oeffnen' ? 'Wird geöffnet …' : 'Öffnen'}
              {/* Die Knopfliste der Vorlesesoftware nennt die Datei (DAT-24). */}
              <span className="sr-only">: {datei.display_name}</span>
            </Button>
          )}
          {datei.object_missing ? null : (
            <Button
              type="button"
              variant={anzeigbar ? 'quiet' : 'secondary'}
              groesse="kompakt"
              onClick={() => void ausfuehren('herunterladen')}
              disabled={laeuft !== null}
            >
              {laeuft === 'herunterladen' ? 'Wird heruntergeladen …' : 'Herunterladen'}
              <span className="sr-only">: {datei.display_name}</span>
            </Button>
          )}
          {darfArtKorrigieren ? (
            <Artkorrektur datei={datei} patientId={patientId} arten={arten} />
          ) : null}
          {/* POR-014 (DSN-001 D3): einzeln freigeben, jederzeit zurücknehmen;
              Fotos bietet die Liste gar nicht an. */}
          {darfFreigeben && !datei.object_missing ? (
            <Rueckfrage
              ausloeser={datei.released_at ? 'Freigabe zurücknehmen' : 'Für die Person freigeben'}
              ausloeserVariante="quiet"
              bezeichnung={`„${datei.display_name}“ ${datei.released_at ? 'nicht mehr' : ''} für die Person freigeben`}
              bestaetigen={datei.released_at ? 'Freigabe zurücknehmen' : 'Freigeben'}
              bestaetigenLaeuft="Wird gespeichert …"
              fehler={freigabe.isError ? freigabe.error.message : undefined}
              onAbbrechen={() => freigabe.reset()}
              onBestaetigen={() => freigabe.mutateAsync(!datei.released_at)}
            >
              <span className="wrap-anywhere">
                {datei.released_at
                  ? `„${datei.display_name}“ verschwindet sofort von der Plattform der Person.`
                  : `„${datei.display_name}“ erscheint auf der Plattform der Person unter „Dokumente“. Sie kann die Datei ansehen und herunterladen; jeder Abruf steht im Protokoll.`}
              </span>
            </Rueckfrage>
          ) : null}
          {darfLoeschen ? (
            <Rueckfrage
              ausloeser="Löschen"
              ausloeserVariante="quiet"
              bezeichnung={`„${datei.display_name}“ löschen`}
              bestaetigen="Endgültig löschen"
              bestaetigenLaeuft="Wird gelöscht …"
              fehler={loeschen.isError ? loeschen.error.message : undefined}
              onAbbrechen={() => loeschen.reset()}
              onBestaetigen={() => loeschen.mutateAsync(datei.id)}
            >
              <span className="wrap-anywhere">
                „{datei.display_name}“ wird sofort aus der Akte entfernt. Das lässt sich nicht
                rückgängig machen.
              </span>
            </Rueckfrage>
          ) : null}
        </div>
      </div>

      {/* Punkt 27: Ein Datensatz ohne Objekt ist ein sichtbarer Fehler - keine
          leere Fläche und kein stiller Ausgleich (§13). */}
      {datei.object_missing ? (
        <Statusmeldung ton="fehler" className="mt-2">
          Diese Datei ist in der Ablage nicht auffindbar. Bitte der Praxisinhaber:in melden – sie
          steht unter „Aufbewahrung“.
        </Statusmeldung>
      ) : null}
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler}
        </Statusmeldung>
      ) : null}
      {ansicht ? (
        <Dateiansicht
          ref={ansichtRef}
          bild={ansicht}
          name={datei.display_name}
          onSchliessen={schliessen}
        />
      ) : null}
    </li>
  );
}

interface DateilisteProps {
  patientId: string;
  user: CurrentUser;
  /** Gesetzt: nur die Dateien dieser Verordnung, und der Scan als einzige Art. */
  grundlageId?: string | null;
  /** Darf die aufrufende Person hier etwas hinzufügen? */
  darfHinzufuegen: boolean;
  /**
   * Überschrift über der Liste - nur, solange sie etwas zeigt (UX-005e). An
   * der Verordnung stand „Scan des Rezepts" sonst über einem leeren Satz.
   */
  titel?: string;
  /** Der Satz im leeren Zustand. Ohne ihn steht leer und kompakt nichts da (UX-005e). */
  leerHinweis?: string;
  /** Der nächste Schritt im leeren Bereich, etwa ein Link (DAT-01). */
  leerAktion?: ReactNode;
  /**
   * Die Liste in einen Rahmen stellen - im Aktenbereich „Dateien", wo sie die
   * Auskunft des Abschnitts ist (UI-002c, DAT-21). An der Verordnung steht sie
   * schon in einer Karte.
   */
  rahmen?: boolean;
  /**
   * Das Hinzufügen eingeklappt hinter dieser Zeile, etwa „Scan hinzufügen"
   * (VER-01): An jeder Verordnung offen, machte es die Karte am Telefon rund
   * 760 px länger. Ohne Angabe steht es offen unter der Liste.
   */
  hinzufuegenEingeklappt?: string;
  /**
   * Die Zeile zum Aufklappen, wenn schon etwas da ist - etwa „Weiteren Scan
   * hinzufügen" (BEF-060 Teil 2): „Scan hinzufügen" neben einem vorhandenen
   * Scan klang, als fehle er.
   */
  hinzufuegenEingeklapptWeitere?: string;
  /** Leer als ein Satz statt als großer Leerzustand - in einer Karte (VER-01). */
  leerKompakt?: boolean;
  /**
   * Nur diese Dateien zeigen - der Ausschnitt eines Aktenreiters (AKTE-007).
   * Der Server liefert dieselbe Liste; der Filter verteilt sie nur auf die
   * Reiter und ist keine Zugriffskontrolle (ADR-004).
   */
  auswahl?: (datei: PatientFile) => boolean;
  /**
   * Welche Arten hier hinzugefügt werden können (AKTE-007). Zusammen mit dem
   * Schreibrecht der Rolle; bleibt nichts übrig, gibt es kein Hinzufügen.
   */
  hinzufuegbar?: readonly Dokumentart[];
}

export function Dateiliste({
  patientId,
  user,
  grundlageId = null,
  darfHinzufuegen,
  titel,
  leerHinweis,
  leerAktion,
  rahmen = false,
  hinzufuegenEingeklappt,
  hinzufuegenEingeklapptWeitere,
  leerKompakt = false,
  auswahl,
  hinzufuegbar,
}: DateilisteProps) {
  const {
    dateien: alleDateien,
    isPending,
    isError,
    veraltet,
    erneutLaden,
    verborgen,
  } = useDateien(patientId, user, grundlageId);

  if (verborgen) return null;
  const dateien = auswahl ? alleDateien.filter(auswahl) : alleDateien;

  // Sehen dürfen seit E15 alle vier Praxisrollen jede Art (ROL-002). Was
  // hinzugefügt, gelöscht und korrigiert werden darf, hängt dagegen am
  // Schreibrecht der Art (ADR-017 Punkt 13) - office pflegt nur
  // organisatorische Unterlagen.
  const klinischSchreiben = canWriteClinicalPatientFiles(user.roles);
  const grundlagenSchreiben = canWriteTreatmentBases(user.roles);
  const darfArtKorrigieren = canCorrectPatientFileType(user.roles);
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';

  // An der Verordnung gibt es genau eine sinnvolle Art (ADR-017 Punkt 12:
  // Vorbelegung aus dem Kontext). In der Akte stehen die Arten zur Wahl, die
  // die Rolle hinzufügen darf.
  const rollenarten: readonly Dokumentart[] = grundlageId
    ? (['verordnungsscan'] as const)
    : klinischSchreiben
      ? (['befund', 'arztbrief', 'klinisches_bild', 'einwilligung', 'vertrag'] as const)
      : (['einwilligung', 'vertrag'] as const);
  const arten = hinzufuegbar
    ? rollenarten.filter((art) => hinzufuegbar.includes(art))
    : rollenarten;

  // Beim Korrigieren steht an einer Verordnung mehr zur Wahl als beim Anlegen:
  // Was dort als Scan liegt, kann ein Arztbrief sein, den jemand am falschen
  // Ort eingestellt hat. Ein Scan bleibt aber an seine Verordnung gebunden -
  // Arten, die keine sein können, sind trotzdem wählbar, weil die Datei die
  // Verordnung behält (ADR-017 Punkt 10); die Datenbank weist nur den
  // umgekehrten Fall ab.
  const korrekturarten: readonly Dokumentart[] = [
    'verordnungsscan',
    'befund',
    'arztbrief',
    'klinisches_bild',
    'einwilligung',
    'vertrag',
  ];

  const liste = (
    <>
      {isPending ? <LoadingState label="Dateien werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Dateien konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={erneutLaden}
        />
      ) : null}
      {veraltet ? (
        <Statusmeldung ton="warnung" className="mb-2">
          Die Liste konnte nicht aktualisiert werden; gezeigt wird der zuletzt geladene Stand.
        </Statusmeldung>
      ) : null}

      {!isPending && !isError && dateien.length === 0 ? (
        leerKompakt ? (
          leerHinweis ? (
            <p className="text-ink-muted text-sm">{leerHinweis}</p>
          ) : null
        ) : (
          <EmptyState title="Keine Datei" description={leerHinweis} aktion={leerAktion} />
        )
      ) : null}

      {/* UX-005e: Die Überschrift gehört zur Liste, nicht zum leeren Zustand. */}
      {titel && dateien.length > 0 ? <p className="text-ink text-sm font-medium">{titel}</p> : null}
      {dateien.length > 0 ? (
        <ul className="flex flex-col">
          {dateien.map((datei) => (
            <Dateizeile
              key={datei.id}
              datei={datei}
              patientId={patientId}
              zeitzone={zeitzone}
              // Löschen folgt dem Schreibrecht an der Art (ADR-017 Punkt 13),
              // nicht dem Leserecht: office sieht seit E15 klinische Dateien,
              // löscht aber nur organisatorische. Die Datenbank prüft es noch
              // einmal.
              // Der Verordnungsscan folgt der Grundlage (PRX-010): Wer sie
              // schreibt, pflegt auch ihren Scan.
              darfLoeschen={
                darfHinzufuegen &&
                (!datei.is_clinical ||
                  klinischSchreiben ||
                  (datei.document_type === 'verordnungsscan' && grundlagenSchreiben))
              }
              darfArtKorrigieren={darfArtKorrigieren}
              darfFreigeben={klinischSchreiben && !istFoto(datei.document_type)}
              arten={korrekturarten}
            />
          ))}
        </ul>
      ) : null}
    </>
  );

  const uploadfeld =
    darfHinzufuegen && arten.length > 0 ? (
      <Uploadfeld patientId={patientId} grundlageId={grundlageId} arten={arten} />
    ) : null;

  return (
    <>
      {rahmen ? <Inhaltsflaeche>{liste}</Inhaltsflaeche> : liste}
      {uploadfeld && hinzufuegenEingeklappt ? (
        <Disclosure
          summary={
            dateien.length > 0 && hinzufuegenEingeklapptWeitere
              ? hinzufuegenEingeklapptWeitere
              : hinzufuegenEingeklappt
          }
        >
          {uploadfeld}
        </Disclosure>
      ) : uploadfeld ? (
        <Section titel="Datei hinzufügen" ebene={3}>
          {uploadfeld}
        </Section>
      ) : null}
    </>
  );
}
