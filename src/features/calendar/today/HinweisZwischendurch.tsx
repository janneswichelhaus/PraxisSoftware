import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { hinweisJetzt, merkeGezeigt, type EigenerTermin, type Hinweis } from './zwischendurch';

/**
 * Das Fenster „Hinweise zwischendurch“ in der Übersicht (ORG-005, ANN-603):
 * „Jetzt“ führt zum Hinweis, „Später“ schließt. Entschieden wird einmal,
 * sobald Hinweise und eigene Termine geladen sind - beim Öffnen der
 * Übersicht, nicht im Lauf der Zeit. Was erschien, merkt sich nur dieses
 * Gerät, für heute (`merkeGezeigt`); nichts geht an den Server.
 */
export function HinweisZwischendurch({
  hinweise,
  termine,
  heute,
}: {
  /** Die Hinweise der Bereiche; `null`, solange sie nicht geladen sind. */
  hinweise: readonly Hinweis[] | null;
  /** Die eigenen Termine des Tages; `null`, solange sie nicht geladen sind. */
  termine: readonly EigenerTermin[] | null;
  heute: string;
}) {
  const navigate = useNavigate();
  const entschieden = useRef(false);
  const [hinweis, setHinweis] = useState<Hinweis | null>(null);

  useEffect(() => {
    if (entschieden.current || hinweise === null || termine === null) return;
    entschieden.current = true;
    const jetzt = hinweisJetzt({ hinweise, heute, jetzt: Date.now(), termine });
    if (!jetzt) return;
    merkeGezeigt(jetzt.schluessel, heute);
    setHinweis(jetzt);
  }, [hinweise, termine, heute]);

  if (!hinweis) return null;
  const spaeter = () => setHinweis(null);
  return (
    <Dialogfenster titel={hinweis.titel} onSchliessen={spaeter}>
      <p className="text-ink text-liste">{hinweis.text}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button data-autofocus onClick={() => void navigate(hinweis.ziel)}>
          Jetzt
        </Button>
        <Button variant="secondary" onClick={spaeter}>
          Später
        </Button>
      </div>
    </Dialogfenster>
  );
}
