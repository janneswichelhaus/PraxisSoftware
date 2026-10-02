import { useEffect, useState, type Ref } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Eine Datei der Akte, angezeigt im eigenen Rahmen der Anwendung (ABN-027,
 * ADR-017 Punkte 19 und 54).
 *
 * Die Bytes liegen im Speicher der Seite (`ladeDateiZumAnzeigen`); gezeigt
 * wird aus einer Objekt-URL, die beim Schließen frei wird. Kein Fenster auf
 * den Verweis, kein Downloadname — wer die Datei auf dem Gerät braucht, tippt
 * „Herunterladen" (Punkt 55).
 *
 * **Nur Bilder.** Ein PDF im abgeschotteten Rahmen ohne Skriptrechte, wie
 * Punkt 54 es vorsieht, zeigt Chromium nicht an, und die
 * Content-Security-Policy der Test-Umgebung lässt keinen Rahmen aus einer
 * Objekt-URL zu. Beides zu öffnen ist eine Entscheidung über eine
 * Sicherheitsmaßnahme (ANN-223); bis dahin bleibt für PDF der Weg aus
 * Punkt 55.
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
    const neu = URL.createObjectURL(bild);
    setAdresse(neu);
    return () => URL.revokeObjectURL(neu);
  }, [bild]);

  return (
    <section ref={ref} tabIndex={-1} aria-label={`Ansicht: ${name}`} className="mt-3 outline-none">
      {adresse ? (
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

/** Lässt sich die Datei in der Anwendung zeigen? Bis ANN-223 entschieden ist: nur Bilder. */
export function istAnzeigbar(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/png';
}
