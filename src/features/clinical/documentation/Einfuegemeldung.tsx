import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { Einfuegung } from './einfuegen';

/**
 * Die Meldung unter dem Feld nach dem Einfügen eines Bausteins (DOK-10).
 *
 * „Rückgängig" ist leise und steht direkt daneben: Es ist der Weg zurück für
 * den versehentlichen Tipp, kein zweiter Hauptknopf. Solange die Seite
 * schreibt, ist das Feld festgehalten - dann bleibt auch das Rückgängig aus.
 */
export function Einfuegemeldung({
  einfuegung,
  gesperrt = false,
  onRueckgaengig,
}: {
  einfuegung: Einfuegung | null;
  gesperrt?: boolean;
  onRueckgaengig: () => void;
}) {
  if (!einfuegung) return null;

  return (
    <div className="nicht-drucken mt-2 flex flex-wrap items-center gap-x-3">
      <Statusmeldung ton="erfolg">„{einfuegung.titel}“ am Ende eingefügt.</Statusmeldung>
      <Button
        type="button"
        variant="quiet"
        groesse="kompakt"
        disabled={gesperrt}
        onClick={onRueckgaengig}
      >
        Rückgängig
      </Button>
    </div>
  );
}
