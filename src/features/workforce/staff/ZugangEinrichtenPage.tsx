import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { useFokusNachWechsel } from '@/features/core/auth/fokus';
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
 * Liegt keine Einladung vor, bleibt das Konto zugriffslos (ANN-025). Die
 * Meldung dazu nennt keinen Grund, der Auskunft über die Praxis gäbe: Sie
 * unterscheidet nicht zwischen „nie eingeladen", „abgelaufen" und
 * „zurückgenommen". Sobald die Einladung steht, lässt sie sich von hier aus
 * erneut prüfen, ohne Abmelden und neue Mail (AUTH-08).
 *
 * Die Hülle ist die der übrigen Seiten außerhalb des Rahmens (AUTH-12).
 */
export function ZugangEinrichtenPage({
  onEingerichtet,
  onAbmelden,
}: {
  /**
   * Liefert sie ein Versprechen - das Nachladen des Profils -, bleibt der
   * Knopf bis zum Wechsel in die Anwendung bei „Zugang wird eingerichtet …"
   * (AUTH-08). Bis dahin sprang er zurück auf „Einladung annehmen".
   */
  onEingerichtet: () => void | Promise<unknown>;
  onAbmelden: () => void;
}) {
  const mutation = useMutation({
    mutationFn: nimmZugangAn,
    onSuccess: () => onEingerichtet(),
  });

  const ohneEinladung = mutation.error instanceof KeineEinladungError;
  const fehlerkasten = useRef<HTMLDivElement>(null);

  // Der Knopf verschwindet mit dem Zustand, den er auslöst; der Fokus geht auf
  // den Kasten, der an seine Stelle tritt (AUTH-06).
  useFokusNachWechsel(
    mutation.isError ? (ohneEinladung ? 'ohne-einladung' : 'fehler') : 'offen',
    () => fehlerkasten.current,
  );

  return (
    // Ein Satz unter dem Titel statt eines Absatzes (Regel 6, Welle B): wo
    // das Konto steht und was der Knopf bewirkt. Der Hinweis auf ein eigenes
    // Kennwort ist entfallen - in Produktion verlangt die Einrichtungspflicht
    // danach Passkey und PIN (ADR-025 Fassung 2), ein Kennwort gibt es nicht.
    <Vollseite
      titel="Zugang einrichten"
      einleitung="Ihr Konto ist noch keiner Praxis zugeordnet. Mit der Einladung erhalten Sie die vorgesehenen Rollen; danach richten Sie Passkey und PIN ein."
      kleingedrucktes="Jede Person benötigt ein eigenes Konto; geteilte Konten sind nicht zulässig. Der Beitritt wird protokolliert."
    >
      {ohneEinladung ? (
        <div ref={fehlerkasten} tabIndex={-1} className="outline-none">
          <ErrorState
            title="Für diesen Zugang liegt keine offene Einladung vor."
            description="Bitte wenden Sie sich an die Praxisinhaber:in. Dieses Konto hat keinen Zugriff auf Daten der Praxis."
          />
          <Button
            variant="secondary"
            className="mt-4 w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Erneut prüfen
          </Button>
        </div>
      ) : (
        <>
          {mutation.isError ? (
            <div ref={fehlerkasten} tabIndex={-1} className="mb-4 outline-none">
              <Statusmeldung ton="fehler">
                Der Zugang konnte nicht eingerichtet werden. Bitte die Verbindung prüfen und erneut
                versuchen.
              </Statusmeldung>
            </div>
          ) : null}

          <Button
            className="w-full"
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
    </Vollseite>
  );
}
