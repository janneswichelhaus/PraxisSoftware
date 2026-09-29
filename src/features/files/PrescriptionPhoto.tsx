import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Fotoverlustschutz } from './Fotoverlustschutz';
import { Kameradialog } from './Kameradialog';
import { useDateiUpload } from './dateien';
import { DATEI_ACCEPT, dateiAblehnungsgrund } from './dokumentarten';
import { fotoVomHeutigenTag, useKamera } from './kamera';

/**
 * Verordnung ohne Papier (PRX-011): Die Therapeut:in fotografiert das Rezept
 * am Termin, das Büro tippt es später mit dem Foto daneben ab.
 *
 * ANN-141: Das Foto geht als Verordnungsscan **ohne** Grundlage in die Akte - an der
 * Person, bis das Büro es beim Erfassen zuordnet (ADR-017 Punkt 10). Es landet
 * nicht in der Mediathek des Geräts (Kameradialog, Punkt 33); bis zum
 * Hinzufügen liegt es nur im Arbeitsspeicher, und der Fotoverlustschutz fragt,
 * bevor jemand die Seite mit ihm verlässt.
 *
 * Ohne Kamera (am Rechner) bleibt der Dateiwähler: ein Rezept, das als PDF
 * oder Bild vorliegt, nimmt denselben Weg.
 */
export function PrescriptionPhoto({ patientId }: { patientId: string }) {
  const kamera = useKamera();
  const upload = useDateiUpload(patientId);
  const [kameraOffen, setKameraOffen] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [ablehnung, setAblehnung] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState(false);

  useEffect(() => {
    if (!vorschau) return;
    return () => URL.revokeObjectURL(vorschau);
  }, [vorschau]);

  function uebernehmen(datei: File) {
    setErledigt(false);
    upload.reset();
    const grund = dateiAblehnungsgrund(datei);
    setAblehnung(grund);
    setFoto(grund ? null : datei);
    setVorschau(grund || datei.type === 'application/pdf' ? null : URL.createObjectURL(datei));
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

  function insBuero() {
    if (!foto) return;
    upload.mutate(
      {
        patientId,
        grundlageId: null,
        documentType: 'verordnungsscan',
        displayName: `Verordnung, ${fotoVomHeutigenTag()}`,
        datei: foto,
      },
      {
        onSuccess: () => {
          setFoto(null);
          setVorschau(null);
          setErledigt(true);
        },
      },
    );
  }

  const laeuft = upload.isPending;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted max-w-prose text-sm">
        Neues Rezept dabei? Ein Foto genügt – das Büro erfasst die Grundlage daraus.
      </p>

      {foto ? (
        <div className="flex flex-wrap items-center gap-3">
          {vorschau ? (
            <img
              src={vorschau}
              alt="Foto der Verordnung, noch nicht übergeben"
              draggable={false}
              className="bg-ink rounded-image pointer-events-none block h-24 w-18 object-contain select-none"
            />
          ) : null}
          <p className="text-ink text-sm">Noch nicht übergeben.</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {foto ? (
          <>
            <Button type="button" onClick={insBuero} disabled={laeuft}>
              {laeuft ? 'Wird übergeben …' : 'Ans Büro geben'}
            </Button>
            <Button type="button" variant="quiet" onClick={verwerfen} disabled={laeuft}>
              Verwerfen
            </Button>
          </>
        ) : kamera === 'vorhanden' ? (
          <Button type="button" variant="secondary" onClick={() => setKameraOffen(true)}>
            Verordnung fotografieren
          </Button>
        ) : (
          <label className="text-ink text-sm">
            <span className="mb-1 block font-medium">Verordnung als Datei</span>
            <input
              type="file"
              accept={DATEI_ACCEPT}
              className="file:rounded-button file:border-line-strong file:text-accent file:mr-3 file:min-h-10 file:cursor-pointer file:border file:bg-transparent file:px-4 file:text-sm file:font-bold"
              onChange={(e) => {
                const datei = e.currentTarget.files?.[0];
                if (datei) uebernehmen(datei);
                e.currentTarget.value = '';
              }}
            />
          </label>
        )}
      </div>

      {ablehnung ? <Statusmeldung ton="fehler">{ablehnung}</Statusmeldung> : null}
      {upload.isError ? (
        <Statusmeldung ton="fehler">
          {upload.error.message} Das Foto ist noch da – „Ans Büro geben“ versucht es erneut.
        </Statusmeldung>
      ) : null}
      {erledigt ? (
        <Statusmeldung ton="erfolg">
          Das Foto liegt beim Büro unter <Textlink to="/offen">Offene Punkte</Textlink> und wartet
          aufs Erfassen.
        </Statusmeldung>
      ) : null}

      {kameraOffen ? (
        <Kameradialog
          titel="Foto der Verordnung"
          hinweis="Das Rezept flach hinlegen und ganz ins Bild nehmen. Das Foto bleibt in der Anwendung und landet nicht in der Mediathek des Geräts."
          onAufnahme={aufgenommen}
          onSchliessen={() => setKameraOffen(false)}
        />
      ) : null}
      {foto ? <Fotoverlustschutz /> : null}
    </div>
  );
}
