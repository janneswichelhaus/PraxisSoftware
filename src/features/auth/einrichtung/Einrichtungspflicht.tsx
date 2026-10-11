import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Vollseite } from '@/app/Vollseite';
import { kennwortTestzugang } from '@/lib/env';
import { useSession } from '../sessionContext';
import { AnmeldungEinrichten } from './AnmeldungEinrichten';
import {
  EINRICHTUNG_SCHLUESSEL,
  istEingerichtet,
  ladeEinrichtungsstand,
} from './einrichtungsstand';

/**
 * In Produktion kommt niemand ohne Passkey und PIN in die Anwendung
 * (ADR-025 Fassung 2, Punkte 9 und 13).
 *
 * Steht innerhalb der Sitzungssperre: Eine PIN lässt sich nur in offener
 * Sitzung festlegen. Wer die Einrichtung nach dem Einladungslink abbricht,
 * landet beim nächsten Öffnen wieder hier, solange die Sitzung lebt; danach
 * braucht es eine neue Einladung.
 *
 * Außerhalb der Produktion ist die Einrichtung freiwillig (Punkt 15, ANN-327):
 * Testkonten melden sich mit Kennwort an, und automatisierte Tests haben
 * keinen Passkey. Eingerichtet wird dort über „Mein Konto“.
 */
export function Einrichtungspflicht({
  children,
  pflicht = !kennwortTestzugang(),
}: {
  children: ReactNode;
  /** Für Tests; sonst entscheidet die Umgebung (ANN-326). */
  pflicht?: boolean;
}) {
  const { signOut } = useSession();
  const stand = useQuery({
    queryKey: EINRICHTUNG_SCHLUESSEL,
    queryFn: ladeEinrichtungsstand,
    enabled: pflicht,
    staleTime: Infinity,
    retry: false,
  });

  if (!pflicht) return <>{children}</>;

  if (stand.isPending) {
    return (
      <Vollseite>
        <LoadingState label="Anmeldung wird geprüft …" />
      </Vollseite>
    );
  }
  if (stand.data === undefined) {
    // Ohne Antwort kein Durchlass: Sonst öffnete ein Funkloch die Anwendung
    // für ein Konto, das nicht eingerichtet ist.
    return (
      <Vollseite titel="Anmeldung nicht geprüft">
        <ErrorState
          title="Die Anmeldung dieses Kontos konnte nicht geprüft werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void stand.refetch()}
        />
        <Button variant="secondary" className="mt-4 w-full" onClick={() => void signOut()}>
          Abmelden
        </Button>
      </Vollseite>
    );
  }
  if (istEingerichtet(stand.data)) return <>{children}</>;

  return (
    <AnmeldungEinrichten
      stand={stand.data}
      onFertig={() => void stand.refetch()}
      onAbmelden={() => void signOut()}
    />
  );
}
