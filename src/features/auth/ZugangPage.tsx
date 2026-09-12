import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { loeseLinkEin } from './linkEinloesen';

/**
 * Anmelden über den Link aus der Zugangsmail (FIX-002).
 *
 * Die Zugangsmail geht an ein Konto, dessen Einladung offen ist — sie ist der
 * Weg hinein, wenn jemand sein Kennwort nicht zur Hand hat oder noch keines
 * gesetzt hat. Bis FIX-002 zeigte sie auf die Wurzel der Anwendung, wo die
 * Kennung im Adressfragment ungelesen liegen blieb: Die Person sah die
 * Anmeldemaske, an der sie gerade vorbeikommen wollte.
 *
 * Die Seite hat bewusst keinen eigenen Inhalt für den Erfolgsfall. Sobald der
 * Link eingelöst ist, besteht eine Sitzung, und die Anwendung übernimmt von
 * selbst — bei einer offenen Einladung ist das „Zugang einrichten", sonst der
 * Tagesplan. Ein Zwischenschritt „Sie sind angemeldet, bitte weiterklicken"
 * wäre eine Tür, die niemand zumachen wollte.
 */
export function ZugangPage() {
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const tokenHash = suche.get('token_hash');
  const [ungueltig, setUngueltig] = useState(!tokenHash);

  /**
   * Einmalige Kennung, doppelte Montage unter `StrictMode` — und deshalb ohne
   * `aktiv`-Flag in einer Aufräumfunktion. Die Begründung steht ausführlich in
   * `KennwortNeuPage`: Riegel und Flag zusammen verwerfen die Antwort des
   * einzigen Aufrufs, und die Seite bliebe für immer beim Ladezustand.
   */
  const eingeloest = useRef(false);

  useEffect(() => {
    if (!tokenHash || eingeloest.current) return;
    eingeloest.current = true;

    loeseLinkEin(tokenHash, 'magiclink').catch(() => setUngueltig(true));
  }, [tokenHash]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8">
        <Wortmarke hoehe={40} />
      </div>

      {ungueltig ? (
        <>
          <ErrorState
            title="Dieser Link lässt sich nicht mehr verwenden."
            description="Links aus der Mail gelten einmalig und nur für kurze Zeit. Die Praxisleitung kann eine neue Zugangsmail schicken."
          />
          <Button variant="secondary" className="mt-4" onClick={() => void navigate('/')}>
            Zur Anmeldung
          </Button>
        </>
      ) : (
        <LoadingState label="Der Link wird geprüft …" />
      )}
    </main>
  );
}
