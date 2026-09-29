import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { verweisMitArt } from '@/features/files/api';

/**
 * Das Foto der Verordnung neben dem Formular (PRX-011): Das Büro tippt ab,
 * was die Therapeut:in am Termin fotografiert hat.
 *
 * Das Bild erscheint erst auf Tipp - jeder Verweis ist ein Auditeintrag und
 * lebt 60 Sekunden (ADR-017 Punkte 15 und 20). Ein geladenes Bild bleibt
 * stehen, solange die Seite offen ist; ein PDF öffnet in einem neuen Fenster.
 */
export function ScanBesideForm({ fileId }: { fileId: string }) {
  const [bild, setBild] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function zeigen() {
    setFehler(null);
    setLaeuft(true);
    try {
      const { url, mimeType } = await verweisMitArt(fileId);
      if (mimeType === 'application/pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setBild(url);
      }
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
