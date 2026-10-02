import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { ladeDateiHerunter, ladeDateiZumAnzeigen } from '@/features/files/api';
import { istAnzeigbar } from '@/features/files/Dateiansicht';

/**
 * Das Foto der Verordnung neben dem Formular (PRX-011): Das Büro tippt ab,
 * was die Therapeut:in am Termin fotografiert hat.
 *
 * Das Bild erscheint erst auf Tipp - jeder Verweis ist ein Auditeintrag und
 * lebt 60 Sekunden (ADR-017 Punkte 15 und 20). Es wird in den Speicher der
 * Seite geladen und aus einer Objekt-URL gezeigt, ohne Downloadnamen (Punkt
 * 54); es bleibt stehen, solange die Seite offen ist. Ein PDF zeigt die
 * Anwendung noch nicht selbst (ANN-223): Dort steht „Herunterladen" (Punkt 55).
 */
export function ScanBesideForm({ fileId }: { fileId: string }) {
  const [bild, setBild] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Erst nach dem Laden bekannt: Der Scan ist ein PDF.
  const [nurHerunterladen, setNurHerunterladen] = useState(false);

  // Die Objekt-URL lebt so lange wie die Ansicht.
  useEffect(() => {
    if (!bild) return;
    return () => URL.revokeObjectURL(bild);
  }, [bild]);

  async function zeigen() {
    setFehler(null);
    setLaeuft(true);
    try {
      if (nurHerunterladen) {
        await ladeDateiHerunter(fileId);
        return;
      }
      const geladen = await ladeDateiZumAnzeigen(fileId);
      if (istAnzeigbar(geladen.mimeType)) setBild(URL.createObjectURL(geladen.bild));
      else setNurHerunterladen(true);
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
      {bild ? (
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
          {laeuft ? 'Wird geöffnet …' : nurHerunterladen ? 'Herunterladen' : 'Foto anzeigen'}
        </Button>
      )}
      {nurHerunterladen ? (
        <p className="text-ink-muted mt-2 text-sm">
          Der Scan ist ein PDF. Die Anwendung zeigt PDFs noch nicht selbst an; „Herunterladen“ holt
          ihn auf dieses Gerät.
        </p>
      ) : null}
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {fehler}
        </Statusmeldung>
      ) : null}
    </aside>
  );
}
