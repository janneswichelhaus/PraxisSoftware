import { Link } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { useEntwuerfe, useUnlesbare, zahlSatz } from './entwuerfe';
import { useEinrichtung } from './servicePhone';

/**
 * Die Zeile über der Kopfzeile auf dem Diensttelefon (OFF-003, ADR-024
 * Punkt 6): „Noch nicht übertragen" mit der Zahl, solange Entwürfe nur auf dem
 * Gerät liegen - auch an den folgenden Tagen (§ 630f BGB: zeitnah). Ohne
 * Verbindung sagt sie, wo Tagesplan und Schreibfeld jetzt sind. Niemand soll
 * glauben, gespeichert zu haben, was nur lokal liegt (ADR-001).
 */
export function Geraetehinweis({ besitzer }: { besitzer: string }) {
  const einrichtung = useEinrichtung(besitzer);
  const entwuerfe = useEntwuerfe(besitzer);
  // Unlesbare Einträge zählen mit (BEF-150): Auch sie hat die Praxis nicht.
  const unlesbar = useUnlesbare(besitzer);
  const verbunden = useIstVerbunden();
  const zahl = (entwuerfe?.length ?? 0) + unlesbar;

  if (zahl === 0 && (verbunden || !einrichtung)) return null;
  return (
    <div className="nicht-drucken bg-warnung-soft text-warnung px-5 py-2 text-sm">
      <span className="block max-w-prose">
        <span aria-hidden="true" className="mr-1.5 font-semibold">
          !
        </span>
        {zahl > 0 ? (
          <>
            <strong className="font-semibold">Noch nicht übertragen:</strong> {zahlSatz(zahl)} auf
            diesem Gerät.{' '}
          </>
        ) : (
          <>Tagesplan und Dokumentation ohne Verbindung liegen auf diesem Gerät. </>
        )}
        <Link to="/auf-dem-geraet" className="font-semibold underline">
          Auf dem Gerät ansehen
        </Link>
      </span>
    </div>
  );
}
