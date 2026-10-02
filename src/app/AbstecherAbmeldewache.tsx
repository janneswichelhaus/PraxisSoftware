import { useState } from 'react';
import { useAbmeldewache } from '@/app/abmeldeschutz';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { abstecherOffen, abstecherVerwerfenFuer } from '@/lib/abstecher';

/**
 * Fragt beim freiwilligen Abmelden, bevor ein Abstecher-Entwurf verloren geht
 * (ABN-019, BEF-110, ANN-019 Fassung 2).
 *
 * Ein Abstecher hält das halb ausgefüllte Formular im Arbeitsspeicher, bis
 * die Person zurückkommt (`@/lib/abstecher`). Bis hierher räumte jede
 * Abmeldung ihn still ab. Jetzt fragt die Anwendung: zurück zum Formular
 * oder verwerfen und abmelden. Die erzwungene Beendigung kommt hier nicht
 * vorbei (`abmeldeschutz.ts`) - sie lässt den Entwurf liegen, gebunden an
 * das Konto, das ihn begonnen hat.
 */
export function AbstecherAbmeldewache({ userId }: { userId: string }) {
  const [offen, setOffen] = useState(false);
  const abmelden = useAbmeldewache(() => {
    if (!abstecherOffen(userId)) return false;
    setOffen(true);
    return true;
  });

  if (!offen) return null;
  return (
    <Dialogfenster titel="Angefangenes Formular" onSchliessen={() => setOffen(false)}>
      <p className="text-ink text-sm">
        Ein Formular wartet noch auf Ihre Rückkehr – Sie haben es für einen Abstecher verlassen.
        Beim Abmelden geht es verloren.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" data-autofocus onClick={() => setOffen(false)}>
          Zurück
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            abstecherVerwerfenFuer(userId);
            setOffen(false);
            abmelden?.();
          }}
        >
          Verwerfen und abmelden
        </Button>
      </div>
    </Dialogfenster>
  );
}
