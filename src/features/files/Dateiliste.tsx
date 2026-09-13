import { useId, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { oeffneDatei, type PatientFile } from './api';
import { useDateiUpload, useDateien } from './dateien';
import {
  DATEI_ACCEPT,
  dateiAblehnungsgrund,
  dokumentartHinweise,
  dokumentartLabels,
  formatBytes,
  istKlinisch,
  sichtbarkeitHinweis,
  type Dokumentart,
} from './dokumentarten';
import { canReadClinicalPatientFiles, type CurrentUser } from '@/features/session/types';

/**
 * Dateien einer Akte: anzeigen, hinzufügen, öffnen (DAT-001, ADR-017).
 *
 * Ein Baustein für zwei Stellen — den Bereich „Dateien" der Akte und die
 * einzelne Verordnung (VER-004). Der Unterschied ist ein Parameter, nicht eine
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
 */

function Dokumentartauswahl({
  wert,
  onChange,
  arten,
}: {
  wert: Dokumentart;
  onChange: (art: Dokumentart) => void;
  arten: readonly Dokumentart[];
}) {
  return (
    <Select
      label="Art des Dokuments"
      hint={`${dokumentartHinweise[wert]} ${sichtbarkeitHinweis(wert)}`}
      value={wert}
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
  prescriptionId: string | null;
  /** Auswählbare Arten. Genau eine bedeutet: keine Auswahl, nur ein Hinweis. */
  arten: readonly Dokumentart[];
}

/**
 * Datei wählen, Art bestimmen, hinzufügen.
 *
 * Der Anzeigename kommt aus dem Dateinamen und ist änderbar — er ist das
 * einzige Wort, unter dem die Datei später wiederzufinden ist, und
 * `IMG_4711.jpg` ist keins. Im Objektschlüssel steht er nie (ADR-017 Punkt 5).
 */
function Uploadfeld({ patientId, prescriptionId, arten }: UploadfeldProps) {
  const beschreibungId = useId();
  const [art, setArt] = useState<Dokumentart>(arten[0]!);
  const [datei, setDatei] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [ablehnung, setAblehnung] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  // Ein Dateifeld lässt sich nicht über seinen Wert leeren. Der Zähler baut es
  // nach dem Hinzufügen neu auf - sonst stünde dort noch der Name der Datei,
  // die schon in der Akte liegt.
  const [durchgang, setDurchgang] = useState(0);

  const upload = useDateiUpload(patientId);

  function dateiGewaehlt(gewaehlt: File | null) {
    setErfolg(null);
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

  function zuruecksetzen() {
    setDatei(null);
    setName('');
    setAblehnung(null);
    setDurchgang((n) => n + 1);
  }

  function hinzufuegen() {
    if (!datei) return;
    upload.mutate(
      {
        patientId,
        prescriptionId,
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
    <div className="border-line rounded-card mt-4 border border-dashed p-4">
      <p className="text-ink text-[0.9375rem] font-medium">Datei hinzufügen</p>
      <p id={beschreibungId} className="text-ink-muted mt-0.5 text-sm">
        PDF, JPEG oder PNG bis 10 MB. Eine hinzugefügte Datei lässt sich nicht mehr ändern — eine
        Korrektur ist eine neue Datei.
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Field
          key={durchgang}
          label="Datei"
          type="file"
          accept={DATEI_ACCEPT}
          aria-describedby={beschreibungId}
          error={ablehnung ?? undefined}
          onChange={(e) => dateiGewaehlt(e.currentTarget.files?.[0] ?? null)}
        />

        {arten.length > 1 ? (
          <Dokumentartauswahl wert={art} onChange={setArt} arten={arten} />
        ) : (
          <div>
            <p className="text-ink text-sm font-medium">{dokumentartLabels[art]}</p>
            <p className="text-ink-muted mt-1 text-sm">{sichtbarkeitHinweis(art)}</p>
          </div>
        )}

        {datei ? (
          <Field
            label="Name in der Akte"
            value={name}
            maxLength={200}
            hint="Unter diesem Namen steht die Datei in der Akte. Im Ablageort steht er nie."
            onChange={(e) => setName(e.target.value)}
          />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={hinzufuegen} disabled={!datei || upload.isPending}>
          {upload.isPending ? 'Wird hinzugefügt …' : 'Datei hinzufügen'}
        </Button>
        {datei ? (
          <span className="text-ink-muted text-sm">
            {datei.name} · {formatBytes(datei.size)}
          </span>
        ) : null}
      </div>

      {upload.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {upload.error.message}
        </Statusmeldung>
      ) : null}
      {erfolg ? (
        <Statusmeldung ton="neutral" className="mt-2">
          {erfolg}
        </Statusmeldung>
      ) : null}
    </div>
  );
}

/**
 * Eine Zeile der Liste.
 *
 * „Öffnen" erzeugt den Verweis erst beim Tap und öffnet ihn in einem neuen
 * Fenster. Der Verweis lebt 60 Sekunden und ist nicht widerrufbar (ADR-017
 * Punkt 17) — deshalb steht er nirgendwo im Markup und wird nirgends gemerkt.
 */
function Dateizeile({ datei }: { datei: PatientFile }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const art = datei.document_type as Dokumentart;

  async function oeffnen() {
    setFehler(null);
    setLaeuft(true);
    try {
      const verweis = await oeffneDatei(datei.id);
      window.open(verweis, '_blank', 'noopener,noreferrer');
    } catch (ursache) {
      setFehler((ursache as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <li className="border-line border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-[0.9375rem] font-medium">{datei.display_name}</p>
          <p className="text-ink-muted mt-0.5 text-sm">
            {dokumentartLabels[art] ?? datei.document_type} · {formatBytes(datei.byte_size)}
            {datei.uploaded_at
              ? ` · ${new Date(datei.uploaded_at).toLocaleDateString('de-DE')}`
              : ''}
            {datei.uploaded_by_name ? ` · ${datei.uploaded_by_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Farbe ist nie allein Bedeutungsträger: der Zustand steht als Wort. */}
          <Badge ton={istKlinisch(art) ? 'neutral' : 'akzent'}>
            {istKlinisch(art) ? 'Klinisch' : 'Organisatorisch'}
          </Badge>
          {datei.object_missing ? null : (
            <button
              type="button"
              onClick={() => void oeffnen()}
              disabled={laeuft}
              className={kartenAktionKlassen()}
            >
              {laeuft ? 'Wird geöffnet …' : 'Öffnen'}
            </button>
          )}
        </div>
      </div>

      {/* Punkt 27: Ein Datensatz ohne Objekt ist ein sichtbarer Fehler - keine
          leere Fläche und kein stiller Ausgleich (§13). */}
      {datei.object_missing ? (
        <Statusmeldung ton="fehler" className="mt-2">
          Diese Datei ist in der Ablage nicht auffindbar. Bitte der Praxisinhaber:in melden — sie
          steht in der Aufbewahrungsübersicht.
        </Statusmeldung>
      ) : null}
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler}
        </Statusmeldung>
      ) : null}
    </li>
  );
}

export interface DateilisteProps {
  patientId: string;
  user: CurrentUser;
  /** Gesetzt: nur die Dateien dieser Verordnung, und der Scan als einzige Art. */
  prescriptionId?: string | null;
  /** Darf die aufrufende Person hier etwas hinzufügen? */
  darfHinzufuegen: boolean;
  leerHinweis: string;
}

export function Dateiliste({
  patientId,
  user,
  prescriptionId = null,
  darfHinzufuegen,
  leerHinweis,
}: DateilisteProps) {
  const { dateien, isPending, isError, verborgen } = useDateien(patientId, user, prescriptionId);

  if (verborgen) return null;

  // An der Verordnung gibt es genau eine sinnvolle Art (ADR-017 Punkt 12:
  // Vorbelegung aus dem Kontext). In der Akte stehen alle zur Wahl, die die
  // Rolle auch wieder sehen könnte - eine Datei hochzuladen, die man danach
  // nicht mehr findet, wäre eine Falle.
  const arten: readonly Dokumentart[] = prescriptionId
    ? (['verordnungsscan'] as const)
    : canReadClinicalPatientFiles(user.roles)
      ? (['befund', 'arztbrief', 'klinisches_bild', 'einwilligung', 'vertrag'] as const)
      : (['einwilligung', 'vertrag'] as const);

  return (
    <>
      {isPending ? <LoadingState label="Dateien werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Dateien konnten nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {!isPending && !isError && dateien.length === 0 ? (
        <EmptyState title="Keine Datei" description={leerHinweis} />
      ) : null}

      {dateien.length > 0 ? (
        <ul className="flex flex-col">
          {dateien.map((datei) => (
            <Dateizeile key={datei.id} datei={datei} />
          ))}
        </ul>
      ) : null}

      {darfHinzufuegen ? (
        <Uploadfeld patientId={patientId} prescriptionId={prescriptionId} arten={arten} />
      ) : null}
    </>
  );
}
