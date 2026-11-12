import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';

/** Rückfrage oder Meldung zur Pause, unten am Bildrand wie die Rückgängig-Leiste. */
export function PausenLeiste({
  text,
  frage,
  laeuft,
  onTrotzdem,
  onSchliessen,
}: {
  text: string;
  frage: boolean;
  laeuft: boolean;
  onTrotzdem: () => void;
  onSchliessen: () => void;
}) {
  return (
    <div
      role={frage ? 'alertdialog' : 'status'}
      aria-label="Pause"
      data-testid="pausen-leiste"
      className="border-line-strong bg-surface-sunken nicht-drucken rounded-card fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[28rem]"
    >
      <Statusmeldung ton={frage ? 'warnung' : 'fehler'} className="basis-full">
        {frage ? `Danach: ${text}` : text}
      </Statusmeldung>
      <div className="flex flex-wrap gap-2">
        {frage ? (
          <Button type="button" disabled={laeuft} onClick={onTrotzdem}>
            {laeuft ? 'Wird verschoben …' : 'Trotzdem verschieben'}
          </Button>
        ) : null}
        <Button type="button" variant="quiet" onClick={onSchliessen}>
          {frage ? 'Abbrechen' : 'Schließen'}
        </Button>
      </div>
    </div>
  );
}
