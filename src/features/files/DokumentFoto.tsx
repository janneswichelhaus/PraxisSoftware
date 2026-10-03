import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { textlinkKlassen } from '@/components/ui/buttonStile';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Fotoverlustschutz } from './Fotoverlustschutz';
import { Kameradialog } from './Kameradialog';
import { useDateiUpload } from './dateien';
import { DATEI_ACCEPT, dateiAblehnungsgrund, type Dokumentart } from './dokumentarten';
import { fotoVomHeutigenTag, useKamera } from './kamera';

/**
 * Ein Papierblatt als Foto in die Akte (PRX-011, Akte entschlacken 2026-10-03).
 *
 * Verordnung und Anmeldebogen nehmen denselben Weg: Kameradialog (das Foto
 * landet nicht in der Mediathek des Geräts, ADR-017 Punkt 33), ohne Kamera
 * der Dateiwähler. Bis zum Speichern liegt das Foto nur im Arbeitsspeicher,
 * und der Fotoverlustschutz fragt, bevor jemand die Seite mit ihm verlässt.
 *
 * `sofort`: Das „Foto verwenden" im Kameradialog ist schon die Bestätigung -
 * das Foto geht ohne Vorschau und zweiten Tipp in die Akte. So erledigt ein
 * Tipp auf „Fotografieren" im Kopf der Akte den Anmeldebogen, ohne die Seite
 * zu wechseln. Ohne `sofort` steht das Foto erst mit Vorschau da.
 */
export interface DokumentFotoProps {
  patientId: string;
  documentType: Dokumentart;
  /** Anzeigename in der Akte, vor dem Datum: „Verordnung" → „Verordnung, 03.10.2026 …". */
  anzeigename: string;
  /** Beschriftung des Auslösers mit Kamera. */
  knopf: string;
  /** Beschriftung des Dateiwählers ohne Kamera. */
  dateiLabel: string;
  kameraTitel: string;
  kameraHinweis: string;
  /** Wie die Vorschau das Foto beschreibt (Alternativtext). */
  vorschauAlt?: string;
  /** Beschriftung des Speicherns nach der Vorschau. */
  speichernKnopf?: string;
  speichernLaeuft?: string;
  /** Was neben der Vorschau steht, solange das Foto nicht gespeichert ist. */
  wartetText?: string;
  /** Text über dem Auslöser. */
  einleitung?: ReactNode;
  /** Was nach dem Speichern dasteht. */
  erfolg: ReactNode;
  onErfolg?: () => void;
  sofort?: boolean;
  /** `link`: der Auslöser als Textlink, etwa in der Hinweiszeile im Kopf. */
  ausloeser?: 'knopf' | 'link';
}

export function DokumentFoto({
  patientId,
  documentType,
  anzeigename,
  knopf,
  dateiLabel,
  kameraTitel,
  kameraHinweis,
  vorschauAlt = 'Foto, noch nicht gespeichert',
  speichernKnopf = 'Speichern',
  speichernLaeuft = 'Wird gespeichert …',
  wartetText = 'Noch nicht gespeichert.',
  einleitung,
  erfolg,
  onErfolg,
  sofort = false,
  ausloeser = 'knopf',
}: DokumentFotoProps) {
  const kamera = useKamera();
  const upload = useDateiUpload(patientId);
  const [kameraOffen, setKameraOffen] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [ablehnung, setAblehnung] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState(false);
  const dateiwahl = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!vorschau) return;
    return () => URL.revokeObjectURL(vorschau);
  }, [vorschau]);

  function speichern(datei: File) {
    upload.mutate(
      {
        patientId,
        grundlageId: null,
        documentType,
        displayName: `${anzeigename}, ${fotoVomHeutigenTag()}`,
        datei,
      },
      {
        onSuccess: () => {
          setFoto(null);
          setVorschau(null);
          setErledigt(true);
          onErfolg?.();
        },
      },
    );
  }

  function uebernehmen(datei: File) {
    setErledigt(false);
    upload.reset();
    const grund = dateiAblehnungsgrund(datei);
    setAblehnung(grund);
    setFoto(grund ? null : datei);
    if (grund) {
      setVorschau(null);
      return;
    }
    if (sofort) {
      speichern(datei);
      return;
    }
    setVorschau(datei.type === 'application/pdf' ? null : URL.createObjectURL(datei));
  }

  function aufgenommen(blob: Blob) {
    setKameraOffen(false);
    uebernehmen(new File([blob], `${fotoVomHeutigenTag()}.jpg`, { type: 'image/jpeg' }));
  }

  function verwerfen() {
    setFoto(null);
    setVorschau(null);
    setAblehnung(null);
    upload.reset();
  }

  const laeuft = upload.isPending;
  const alsLink = ausloeser === 'link';

  const dateiFeld = (
    <input
      ref={dateiwahl}
      type="file"
      accept={DATEI_ACCEPT}
      aria-label={alsLink ? dateiLabel : undefined}
      className={
        alsLink
          ? 'sr-only'
          : 'file:rounded-button file:border-line-strong file:text-accent file:mr-3 file:min-h-10 file:cursor-pointer file:border file:bg-transparent file:px-4 file:text-sm file:font-bold'
      }
      onChange={(e) => {
        const datei = e.currentTarget.files?.[0];
        if (datei) uebernehmen(datei);
        e.currentTarget.value = '';
      }}
    />
  );

  function ausloeserKnopf() {
    if (alsLink) {
      return (
        <>
          <button
            type="button"
            className={textlinkKlassen(true, 'gap-1')}
            disabled={laeuft}
            onClick={() =>
              kamera === 'vorhanden' ? setKameraOffen(true) : dateiwahl.current?.click()
            }
          >
            {laeuft ? speichernLaeuft : knopf}
          </button>
          {kamera === 'vorhanden' ? null : dateiFeld}
        </>
      );
    }
    if (kamera === 'vorhanden') {
      return (
        <Button type="button" variant="secondary" onClick={() => setKameraOffen(true)}>
          {knopf}
        </Button>
      );
    }
    return (
      <label className="text-ink text-sm">
        <span className="mb-1 block font-medium">{dateiLabel}</span>
        {dateiFeld}
      </label>
    );
  }

  const meldungen = (
    <>
      {ablehnung ? <Statusmeldung ton="fehler">{ablehnung}</Statusmeldung> : null}
      {upload.isError ? (
        <Statusmeldung ton="fehler">
          {upload.error.message}{' '}
          {sofort
            ? 'Bitte noch einmal fotografieren.'
            : `Das Foto ist noch da – „${speichernKnopf}“ versucht es erneut.`}
        </Statusmeldung>
      ) : null}
      {erledigt ? <Statusmeldung ton="erfolg">{erfolg}</Statusmeldung> : null}
    </>
  );

  const dialog = (
    <>
      {kameraOffen ? (
        <Kameradialog
          titel={kameraTitel}
          hinweis={kameraHinweis}
          onAufnahme={aufgenommen}
          onSchliessen={() => setKameraOffen(false)}
        />
      ) : null}
      {foto ? <Fotoverlustschutz /> : null}
    </>
  );

  if (alsLink) {
    return (
      <>
        {ausloeserKnopf()}
        {ablehnung || upload.isError ? <div className="basis-full">{meldungen}</div> : null}
        {dialog}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {einleitung ? <p className="text-ink-muted max-w-prose text-sm">{einleitung}</p> : null}

      {foto && !sofort ? (
        <div className="flex flex-wrap items-center gap-3">
          {vorschau ? (
            <img
              src={vorschau}
              alt={vorschauAlt}
              draggable={false}
              className="bg-ink rounded-image pointer-events-none block h-24 w-18 object-contain select-none"
            />
          ) : null}
          <p className="text-ink text-sm">{wartetText}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {foto && !sofort ? (
          <>
            <Button type="button" onClick={() => speichern(foto)} disabled={laeuft}>
              {laeuft ? speichernLaeuft : speichernKnopf}
            </Button>
            <Button type="button" variant="quiet" onClick={verwerfen} disabled={laeuft}>
              Verwerfen
            </Button>
          </>
        ) : laeuft ? (
          <p className="text-ink-muted text-sm">{speichernLaeuft}</p>
        ) : (
          ausloeserKnopf()
        )}
      </div>

      {meldungen}
      {dialog}
    </div>
  );
}
