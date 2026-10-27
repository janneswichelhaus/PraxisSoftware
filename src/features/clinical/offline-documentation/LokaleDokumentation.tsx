import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { AufDemGeraet } from './AufDemGeraet';

/**
 * Die lokale Ansicht nach der Freigabe ohne Netz. Übertragen wird hier nie;
 * das geschieht erst nach dem Entsperren mit Verbindung (Punkt 16).
 */
export function LokaleDokumentation({
  besitzer,
  onSperren,
}: {
  besitzer: string;
  onSperren: () => void;
}) {
  return (
    <div className="bg-canvas flex min-h-dvh flex-col">
      <header className="border-line flex items-center justify-between gap-3 border-b px-5 py-3">
        <Wortmarke hoehe={28} />
        <Button variant="quiet" onClick={onSperren}>
          Sperren
        </Button>
      </header>
      <main className="max-w-spalte mx-auto w-full flex-1 px-4 pt-4 pb-8 sm:px-6">
        <Statusmeldung ton="warnung">
          Ohne Verbindung. Hier ist nur, was auf diesem Gerät liegt.
        </Statusmeldung>
        <div className="mt-4">
          <AufDemGeraet besitzer={besitzer} ohneVerbindung />
        </div>
      </main>
    </div>
  );
}
