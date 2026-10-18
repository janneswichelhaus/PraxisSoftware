import { useEffect, useRef, useState } from 'react';
import { useAbmeldewache } from '@/app/abmeldeschutz';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { useAusgangsZahl, wiederholeWartende } from './ausgang';

/**
 * Fragt beim freiwilligen Abmelden, bevor ungesendete Nachrichten des
 * Teamchats verloren gehen (TEAM-002, ANN-641).
 *
 * Der Ausgang liegt nur im Arbeitsspeicher und fällt beim Abmelden mit allem
 * anderen des Teamchats (`teamchatLeeren`) - bis zur Praxis-Sichtung still.
 * Jetzt nennt die Abmeldung die Zahl und versucht es gleich noch einmal: Kommt
 * alles an, meldet sie ab; sonst bleibt man angemeldet oder verwirft
 * ausdrücklich. Die erzwungene Beendigung kommt hier nicht vorbei
 * (`abmeldeschutz.ts`).
 */
export function AusgangAbmeldewache({ kontoId }: { kontoId: string }) {
  const zahl = useAusgangsZahl(kontoId);
  const aktuell = useRef(zahl);
  aktuell.current = zahl;
  const [offen, setOffen] = useState(false);
  const abmelden = useAbmeldewache(() => {
    if (aktuell.current === 0) return false;
    wiederholeWartende();
    setOffen(true);
    return true;
  });

  // Schließen oder Neuladen des Tabs: Der Browser fragt (wie beim
  // Fotoverlustschutz); ein Beenden der App durch das Telefon sieht niemand.
  const wartet = zahl > 0;
  useEffect(() => {
    if (!wartet) return;
    const warnen = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [wartet]);

  if (!offen) return null;
  return (
    <Dialogfenster titel="Noch nicht gesendet" onSchliessen={() => setOffen(false)}>
      {zahl === 0 ? (
        <p className="text-ink text-sm">Inzwischen ist alles gesendet.</p>
      ) : (
        <p className="text-ink text-sm">
          {zahl === 1
            ? '1 Nachricht im Teamchat ist noch nicht beim Server. Beim Abmelden geht sie verloren.'
            : `${zahl} Nachrichten im Teamchat sind noch nicht beim Server. Beim Abmelden gehen sie verloren.`}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {zahl === 0 ? (
          <Button
            type="button"
            data-autofocus
            onClick={() => {
              setOffen(false);
              abmelden?.();
            }}
          >
            Abmelden
          </Button>
        ) : (
          <>
            <Button type="button" data-autofocus onClick={() => setOffen(false)}>
              Angemeldet bleiben
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOffen(false);
                abmelden?.();
              }}
            >
              Verwerfen und abmelden
            </Button>
          </>
        )}
      </div>
    </Dialogfenster>
  );
}
