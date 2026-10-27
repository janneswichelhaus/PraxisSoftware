import { useRef, useState } from 'react';
import { useAbmeldewache } from '@/app/abmeldeschutz';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  alleEntwuerfeVerwerfen,
  entwuerfeLesen,
  entwuerfeUebertragen,
  unlesbareZaehlen,
  unlesbarSatz,
  useEntwuerfe,
  useUnlesbare,
  zahlSatz,
} from './entwuerfe';

/**
 * Abmelden mit Entwürfen auf dem Gerät (OFF-003, ADR-024 Punkt 6, ANN-363): Die Person
 * bekommt die Zahl und die Wahl, erst zu übertragen. Verwirft sie, ist das
 * ausdrücklich - mit einer zweiten Bestätigung, denn verworfen ist der Text
 * auch für die Praxis weg (BEF-150). Einträge, die diese Fassung nicht lesen
 * kann, zählen mit und werden genannt, statt ungenannt mitzufallen.
 * Die erzwungene Beendigung der Sitzung kommt hier nicht vorbei
 * (`abmeldeschutz.ts`) - dann bleiben die Entwürfe in der Dauerablage des
 * Kontos liegen und gehen beim nächsten Anmelden hinaus.
 */
export function EntwurfAbmeldewache({ besitzer }: { besitzer: string }) {
  const entwuerfe = useEntwuerfe(besitzer);
  const unlesbar = useUnlesbare(besitzer);
  const zahl = useRef(0);
  zahl.current = (entwuerfe?.length ?? 0) + unlesbar;
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const abmelden = useAbmeldewache(() => {
    if (zahl.current === 0) return false;
    setHinweis(null);
    setOffen(true);
    return true;
  });

  async function erstUebertragen() {
    setLaeuft(true);
    setHinweis(null);
    try {
      await entwuerfeUebertragen(besitzer);
    } catch {
      // Was nicht ankam, liegt weiter auf dem Gerät.
    }
    const rest =
      (await entwuerfeLesen(besitzer).catch(() => [1])).length +
      (await unlesbareZaehlen(besitzer).catch(() => 0));
    setLaeuft(false);
    if (rest === 0) {
      setOffen(false);
      abmelden?.();
    } else {
      setHinweis(
        'Nicht alles ist angekommen. Bitte unter „Auf dem Gerät“ nachsehen oder später erneut versuchen.',
      );
    }
  }

  if (!offen) return null;
  return (
    <Dialogfenster titel="Noch nicht übertragen" onSchliessen={() => setOffen(false)}>
      <p className="text-ink text-sm">
        Auf diesem Gerät {zahl.current === 1 ? 'liegt' : 'liegen'} noch {zahlSatz(zahl.current)},
        die die Praxis nicht hat. Beim Abmelden bleiben sie auf dem Gerät und gehen beim nächsten
        Anmelden hinaus – es sei denn, Sie verwerfen sie.
        {unlesbar > 0 ? ` Darunter ${unlesbarSatz(unlesbar)}.` : null}
      </p>
      {hinweis ? (
        <Statusmeldung ton="warnung" className="mt-3">
          {hinweis}
        </Statusmeldung>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          data-autofocus
          disabled={laeuft}
          onClick={() => void erstUebertragen()}
        >
          {laeuft ? 'Wird übertragen …' : 'Erst übertragen'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setOffen(false);
            abmelden?.();
          }}
        >
          Auf dem Gerät lassen und abmelden
        </Button>
      </div>
      {/* Leise am Ende und nur nach Rückfrage (DESIGN.md Regel 10, BEF-150). */}
      <div className="mt-3">
        <Rueckfrage
          ausloeser="Verwerfen und abmelden"
          ausloeserVariante="quiet"
          bestaetigen="Endgültig verwerfen und abmelden"
          onBestaetigen={async () => {
            await alleEntwuerfeVerwerfen(besitzer);
            setOffen(false);
            abmelden?.();
          }}
        >
          <p>
            {zahl.current === 1 ? 'Der Text liegt' : 'Die Texte liegen'} nur auf diesem Gerät.
            Verworfen {zahl.current === 1 ? 'ist er' : 'sind sie'} weg – auch für die Praxis.
          </p>
        </Rueckfrage>
      </div>
    </Dialogfenster>
  );
}
