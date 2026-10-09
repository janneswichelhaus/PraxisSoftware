import { useEffect, useState, type Ref } from 'react';
import { Button } from '@/components/ui/Button';
import { istPdf } from './dokumentarten';

/**
 * Eine Datei der Akte, angezeigt im eigenen Rahmen der Anwendung (ABN-027,
 * ADR-017 Punkte 19 und 54).
 *
 * Die Bytes liegen im Speicher der Seite (`ladeDateiZumAnzeigen`); gezeigt
 * wird aus einer Objekt-URL, die beim Schließen frei wird. Kein Fenster auf
 * den Verweis, kein Downloadname — wer die Datei auf dem Gerät braucht, tippt
 * „Herunterladen" (Punkt 55).
 *
 * Ein Bild als Bild, ein PDF im Rahmen (`PdfRahmen`, ADR-017 Fassung 4
 * Punkt 58).
 */
export function Dateiansicht({
  bild,
  name,
  onSchliessen,
  ref,
}: {
  bild: Blob;
  name: string;
  onSchliessen: () => void;
  /** Wohin der Fokus nach dem Laden geht. */
  ref?: Ref<HTMLElement>;
}) {
  const [adresse, setAdresse] = useState<string | null>(null);

  useEffect(() => {
    // Ein PDF bekommt seine eigene Objekt-URL mit festem Typ (`PdfRahmen`).
    if (istPdf(bild)) return;
    const neu = URL.createObjectURL(bild);
    setAdresse(neu);
    return () => URL.revokeObjectURL(neu);
  }, [bild]);

  return (
    <section ref={ref} tabIndex={-1} aria-label={`Ansicht: ${name}`} className="mt-3 outline-none">
      {istPdf(bild) ? (
        <PdfRahmen daten={bild} titel={name} />
      ) : adresse ? (
        <img
          src={adresse}
          alt={name}
          className="bg-ink rounded-image block max-h-[70vh] w-full max-w-2xl object-contain"
        />
      ) : null}
      <div className="mt-3">
        <Button type="button" variant="secondary" onClick={onSchliessen}>
          Schließen
        </Button>
      </div>
    </section>
  );
}

/**
 * Ein PDF in der Anwendung (ANN-223 Option a, BEF-133, ADR-017 Fassung 4
 * Punkt 58).
 *
 * Ein Rahmen **ohne** `sandbox`: Chromium zeigt ein PDF im abgeschotteten
 * Rahmen nicht. Die Objekt-URL entsteht aus den geladenen Bytes mit **festem
 * Typ `application/pdf`**, nie mit dem Typ des Speichers - so öffnet der
 * Rahmen den PDF-Betrachter des Browsers, der in eigenem Ursprung läuft, und
 * nie ein Dokument, das Skripte der Anwendung ausführen könnte. Die
 * Content-Security-Policy erlaubt dafür nur `frame-src blob:`. Zeigt ein Gerät
 * das PDF nicht vollständig, bleibt „Herunterladen" (Punkt 55).
 */
export function PdfRahmen({ daten, titel }: { daten: Blob; titel: string }) {
  const [adresse, setAdresse] = useState<string | null>(null);

  useEffect(() => {
    const neu = URL.createObjectURL(new Blob([daten], { type: 'application/pdf' }));
    setAdresse(neu);
    return () => URL.revokeObjectURL(neu);
  }, [daten]);

  return adresse ? (
    <iframe
      src={adresse}
      title={titel}
      className="border-line rounded-image block h-[70vh] w-full max-w-2xl border bg-white"
    />
  ) : null;
}
