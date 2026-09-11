import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { KeineEinladungError, nimmZugangAn } from './konto-api';

/**
 * Erstes Anmelden nach einer Einladung (STAFF-002b).
 *
 * Die Anwendung landet hier, wenn ein Konto angemeldet ist, aber keiner Praxis
 * zugeordnet - genau die Lage direkt nach der Anmeldung über die Einladungsmail.
 * Ein Tastendruck bindet das Konto an Organisation, Person und Rollen.
 *
 * Der Schritt ist bewusst ausdrücklich und läuft nicht beim Laden von selbst:
 * Wer eine Einladung annimmt, tritt einer Praxis mit Zugriff auf
 * Gesundheitsdaten bei. Das soll eine bewusste Handlung sein und im Auditlog
 * als solche stehen (ADR-010).
 *
 * Liegt keine Einladung vor, bleibt das Konto zugriffslos (ANN-023). Die
 * Meldung dazu nennt keinen Grund, der Auskunft über die Praxis gäbe: Sie
 * unterscheidet nicht zwischen „nie eingeladen", „abgelaufen" und
 * „zurückgenommen".
 */
export function ZugangEinrichtenPage({
  onEingerichtet,
  onAbmelden,
}: {
  onEingerichtet: () => void;
  onAbmelden: () => void;
}) {
  const mutation = useMutation({
    mutationFn: nimmZugangAn,
    onSuccess: onEingerichtet,
  });

  const ohneEinladung = mutation.error instanceof KeineEinladungError;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-ink text-2xl font-semibold tracking-[-0.01em]">Zugang einrichten</h1>

      {ohneEinladung ? (
        <div className="mt-6">
          <ErrorState
            title="Für diesen Zugang liegt keine offene Einladung vor."
            description="Bitte wenden Sie sich an die Praxisleitung. Dieses Konto hat keinen Zugriff auf Daten der Praxis."
          />
        </div>
      ) : (
        <>
          <p className="text-ink-muted mt-3 text-sm leading-relaxed">
            Ihr Konto ist angemeldet, aber noch keiner Praxis zugeordnet. Mit dem nächsten Schritt
            nehmen Sie die Einladung an und erhalten die dafür vorgesehenen Rollen.
          </p>

          {mutation.isError ? (
            <Statusmeldung ton="fehler" className="mt-4">
              Der Zugang konnte nicht eingerichtet werden. Bitte erneut versuchen.
            </Statusmeldung>
          ) : null}

          <Button
            className="mt-6 w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Zugang wird eingerichtet …' : 'Einladung annehmen'}
          </Button>
        </>
      )}

      <Button variant="secondary" className="mt-3 w-full" onClick={onAbmelden}>
        Abmelden
      </Button>

      <p className="text-ink-subtle mt-8 text-xs leading-relaxed">
        Jede Person benötigt ein eigenes Konto; geteilte Zugänge sind nicht zulässig. Der Beitritt
        wird protokolliert.
      </p>
    </main>
  );
}
