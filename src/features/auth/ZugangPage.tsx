import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { useFokusNachWechsel } from './fokus';
import { hinweisAngemeldet } from './fremdeSitzung';
import { useSession } from './sessionContext';
import {
  VerbindungError,
  einmalCodeAusAdresse,
  loeseLinkEin,
  traegtEinmalCode,
} from './linkEinloesen';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

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
  const navigate = useNavigate();
  const { session } = useSession();
  const ort = useLocation();
  // ANN-043, Fassung 2: einmal lesen, dann aus der Adresszeile nehmen.
  const [tokenHash] = useState(() => einmalCodeAusAdresse(ort));
  useEffect(() => {
    if (traegtEinmalCode(ort)) void navigate(ort.pathname, { replace: true });
  }, [ort, navigate]);
  const konto = session?.user.email;

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
  const auskunft = useRef<HTMLDivElement>(null);

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

  // Jeder Schritt ersetzt die Knöpfe des vorigen; der Fokus geht auf die neue
  // Auskunft (AUTH-06).
  useFokusNachWechsel(zustand, () => auskunft.current);

  function erneutVersuchen() {
    eingeloest.current = false;
    setZustand(tokenHash ? 'einloesen' : 'ungueltig');
  }

  return (
    // Eine Überschrift in jedem Zustand (AUTH-13): Bis UXR-002 hatte die Seite
    // keine, und Vorlesesoftware fand nichts zum Anspringen.
    <Vollseite titel="Mit Link anmelden">
      {zustand === 'fremde-sitzung' ? (
        <div ref={auskunft} tabIndex={-1}>
          <Statusmeldung ton="warnung">{hinweisAngemeldet(konto)}</Statusmeldung>
          <div className="mt-4 flex flex-col gap-3">
            <Button onClick={() => setZustand(tokenHash ? 'einloesen' : 'ungueltig')}>
              Trotzdem mit diesem Link anmelden
            </Button>
            <ButtonLink to="/" replace variant="secondary">
              Angemeldet bleiben
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {zustand === 'einloesen' ? (
        <div ref={auskunft} tabIndex={-1}>
          <LoadingState label="Der Link wird geprüft …" />
        </div>
      ) : null}

      {zustand === 'verbindung' ? (
        <div ref={auskunft} tabIndex={-1}>
          <ErrorState
            title="Der Anmeldedienst ist gerade nicht erreichbar."
            description="Ihr Link ist deswegen nicht verbraucht. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut."
          />
          <Button className="mt-4" onClick={erneutVersuchen}>
            Erneut versuchen
          </Button>
        </div>
      ) : null}

      {zustand === 'ungueltig' ? (
        <div ref={auskunft} tabIndex={-1}>
          {/* Eine neue Zugangsmail schickt, wer Zugänge verwaltet - die Rolle
              Praxisinhaber (canManageStaffAccounts, WRT-12). Besteht die
              bisherige Sitzung noch, führt der Weg zurück in sie (AUTH-04). */}
          <ErrorState
            title="Dieser Link lässt sich nicht mehr verwenden."
            description="Links aus der Mail gelten einmalig und nur für kurze Zeit. Die Praxisinhaber:in kann eine neue Zugangsmail schicken."
          />
          <ButtonLink to="/" variant="secondary" className="mt-4">
            {session ? 'Zurück zur Anwendung' : 'Zur Anmeldung'}
          </ButtonLink>
        </div>
      ) : null}

      {/* Solange die bisherige Sitzung besteht, im Präsens (AUTH-04): Der
          Link hat sie nicht ersetzt, sie ist weiter angemeldet. */}
      {fremdeSitzungBeimOeffnen.current && zustand !== 'fremde-sitzung' && session ? (
        <Kleingedrucktes className="mt-6">
          {konto
            ? `Hinweis: Auf diesem Gerät ist weiterhin ${konto} angemeldet.`
            : 'Hinweis: Auf diesem Gerät ist weiterhin das bisherige Konto angemeldet.'}
        </Kleingedrucktes>
      ) : null}
    </Vollseite>
  );
}
