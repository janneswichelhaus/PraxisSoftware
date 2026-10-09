import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { ladeDateiHerunter, ladeDateiZumAnzeigen } from '@/features/files/api';
import { istAnzeigbar, istPdf } from '@/features/files/dokumentarten';
import { PdfRahmen } from '@/features/files/Dateiansicht';

/**
 * Das Foto der Verordnung neben dem Formular (PRX-011): Das Büro tippt ab,
 * was die Therapeut:in am Termin fotografiert hat.
 *
 * Das Bild erscheint erst auf Tipp - jeder Verweis lebt 60 Sekunden (ADR-017
 * Punkt 15). Es wird in den Speicher der Seite geladen und aus einer
 * Objekt-URL gezeigt, ohne Downloadnamen (Punkt 54); es bleibt stehen, solange
 * die Seite offen ist. Ein PDF steht im Rahmen (Punkt 58, BEF-133).
 */
export function ScanBesideForm({ fileId }: { fileId: string }) {
  const [ansicht, setAnsicht] = useState<Blob | null>(null);
  const [bild, setBild] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Die Objekt-URL eines Bildes lebt so lange wie die Ansicht.
  useEffect(() => {
    if (!ansicht || istPdf(ansicht)) return;
    const neu = URL.createObjectURL(ansicht);
    setBild(neu);
    return () => URL.revokeObjectURL(neu);
  }, [ansicht]);

  async function zeigen() {
    setFehler(null);
    setLaeuft(true);
    try {
      const geladen = await ladeDateiZumAnzeigen(fileId);
      if (istAnzeigbar(geladen.mimeType)) setAnsicht(geladen.bild);
      else await ladeDateiHerunter(fileId);
    } catch (ursache) {
      setFehler((ursache as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <aside
      aria-label="Foto der Verordnung"
      className="border-line bg-surface rounded-card border p-4 lg:sticky lg:top-4"
    >
      <p className="text-ink text-liste font-medium">Foto der Verordnung</p>
      <p className="text-ink-muted mt-1 text-sm">
        Beim Speichern hängt das Foto an dieser Grundlage und verlässt die offenen Punkte.
      </p>
      {ansicht && istPdf(ansicht) ? (
        <div className="mt-3">
          <PdfRahmen daten={ansicht} titel="Foto der Verordnung" />
        </div>
      ) : bild ? (
        <img
          src={bild}
          alt="Foto der Verordnung"
          className="bg-ink rounded-image mt-3 block w-full object-contain"
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={laeuft}
          onClick={() => void zeigen()}
        >
          {laeuft ? 'Wird geöffnet …' : 'Foto anzeigen'}
        </Button>
      )}
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {fehler}
        </Statusmeldung>
      ) : null}
    </aside>
  );
}
