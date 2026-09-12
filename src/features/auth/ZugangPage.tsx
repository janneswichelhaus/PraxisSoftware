import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { useSession } from './sessionContext';
import { VerbindungError, loeseLinkEin } from './linkEinloesen';

/**
 * Anmelden über den Link aus der Zugangsmail (FIX-002).
 *
 * Die Zugangsmail geht an ein Konto, dessen Einladung offen ist — sie ist der
 * Weg hinein, wenn jemand sein Kennwort nicht zur Hand hat oder noch keines
 * gesetzt hat. Bis FIX-002 zeigte sie auf die Wurzel der Anwendung, wo die
 * Kennung im Adressfragment ungelesen liegen blieb: Die Person sah die
 * Anmeldemaske, an der sie gerade vorbeikommen wollte.
 *
 * **Der Erfolg endet mit einem Sprung, nicht mit einer Seite.** Sobald der
 * Link eingelöst ist, besteht eine Sitzung, und die Anwendung weiß selbst, wo
 * die Person hingehört — bei offener Einladung „Zugang einrichten", sonst der
 * Tagesplan. Ein Zwischenschritt „Sie sind angemeldet, bitte weiterklicken"
 * wäre eine Tür, die niemand zumachen wollte. Der Sprung muss aber **hier**
 * ausgelöst werden: Das Gate hält diesen Pfad bewusst offen, solange man auf
 * ihm steht (siehe `istEinloesePfad`).
 */
type Zustand = 'fremde-sitzung' | 'einloesen' | 'ungueltig' | 'verbindung';

export function ZugangPage() {
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useSession();
  const tokenHash = suche.get('token_hash');

  /**
   * Ob beim Öffnen schon jemand angemeldet war — als Momentaufnahme, denn
   * gleich nach dem Einlösen ist es ohnehin jemand anderes.
   *
   * Das ist keine Kür: Auf dem Praxisrechner bleibt schnell eine Sitzung
   * stehen. Diesen Link dort stillschweigend einzulösen würde die fremde
   * Sitzung austauschen und ihre nicht gespeicherten Verordnungsentwürfe
   * verwerfen (`SessionProvider` räumt bei jedem Wechsel der Kennung).
   * `PROJECT_PRINCIPLES.md` §13: nicht unbemerkt.
   */
  const fremdeSitzungBeimOeffnen = useRef(session !== null);

  const [zustand, setZustand] = useState<Zustand>(() => {
    if (session !== null) return 'fremde-sitzung';
    return tokenHash ? 'einloesen' : 'ungueltig';
  });

  /** Einmalige Kennung, doppelte Montage unter `StrictMode` — siehe FIX-001b. */
  const eingeloest = useRef(false);

  useEffect(() => {
    if (zustand !== 'einloesen' || !tokenHash || eingeloest.current) return;
    eingeloest.current = true;

    loeseLinkEin(tokenHash, 'magiclink')
      .then(() => void navigate('/', { replace: true }))
      .catch((fehler: unknown) =>
        setZustand(fehler instanceof VerbindungError ? 'verbindung' : 'ungueltig'),
      );
  }, [zustand, tokenHash, navigate]);

  function erneutVersuchen() {
    eingeloest.current = false;
    setZustand(tokenHash ? 'einloesen' : 'ungueltig');
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8">
        <Wortmarke hoehe={40} />
      </div>

      {zustand === 'fremde-sitzung' ? (
        <>
          <Statusmeldung ton="warnung">
            Auf diesem Gerät ist bereits jemand angemeldet. Mit diesem Link melden Sie sich als
            andere Person an; nicht gespeicherte Eingaben der laufenden Sitzung gehen dabei
            verloren.
          </Statusmeldung>
          <div className="mt-4 flex flex-col gap-3">
            <Button onClick={() => setZustand(tokenHash ? 'einloesen' : 'ungueltig')}>
              Trotzdem mit diesem Link anmelden
            </Button>
            <Button variant="secondary" onClick={() => void navigate('/', { replace: true })}>
              Angemeldet bleiben
            </Button>
          </div>
        </>
      ) : null}

      {zustand === 'einloesen' ? <LoadingState label="Der Link wird geprüft …" /> : null}

      {zustand === 'verbindung' ? (
        <>
          <ErrorState
            title="Der Anmeldedienst ist gerade nicht erreichbar."
            description="Ihr Link ist deswegen nicht verbraucht. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut."
          />
          <Button className="mt-4" onClick={erneutVersuchen}>
            Erneut versuchen
          </Button>
        </>
      ) : null}

      {zustand === 'ungueltig' ? (
        <>
          <ErrorState
            title="Dieser Link lässt sich nicht mehr verwenden."
            description="Links aus der Mail gelten einmalig und nur für kurze Zeit. Die Praxisleitung kann eine neue Zugangsmail schicken."
          />
          <Button variant="secondary" className="mt-4" onClick={() => void navigate('/')}>
            Zur Anmeldung
          </Button>
        </>
      ) : null}

      {fremdeSitzungBeimOeffnen.current && zustand !== 'fremde-sitzung' ? (
        <p className="text-ink-subtle mt-6 text-xs leading-relaxed">
          Hinweis: Beim Öffnen dieser Seite war auf dem Gerät noch ein anderer Zugang angemeldet.
        </p>
      ) : null}
    </main>
  );
}
