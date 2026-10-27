import type { PraxisAbsender } from './absender';
import {
  ausfallhonorarRegel,
  datenschutzinformation,
  DATENSCHUTZINFORMATION_FASSUNG,
  type Abschnitt,
} from './patienteninformation';
import { AbsenderBlock } from './AbsenderBlock';

/**
 * Die beiden Aufnahmeblätter als Druckblatt (PAT-006): Datenschutzinformation
 * und Regel zum Ausfallhonorar, jedes mit dem Absender der Praxis.
 *
 * Profil „Druckblatt“ (DESIGN.md): eigene Überschriften für das Papier, der
 * Entwurfsvermerk steht auf dem Blatt, nicht nur am Bildschirm - wer es vor
 * der Prüfung (B2, B4) aushändigt, soll es sehen. Inhalt und Wortlaut stehen
 * in `patienteninformation.ts`; hier nur die Gestalt. Herausgelöst aus
 * `AufnahmeblaetterPage.tsx` (Welle B, B7), die nur noch die Bedienung trägt.
 */
export function Aufnahmeblatt({ absender }: { absender: PraxisAbsender }) {
  return (
    <article className="text-ink text-liste mx-auto max-w-[210mm]">
      <p className="text-warnung border-line border-b pb-2 text-sm font-medium">
        Entwurf – vor der Verwendung mit echten Patient:innen durch die Datenschutzberatung zu
        prüfen.
      </p>

      <AbsenderBlock absender={absender} className="mt-4" />
      <h1 className="text-h4 mt-6 font-bold">Datenschutzinformation</h1>
      <p className="text-ink-muted mt-1 text-sm">
        Fassung {DATENSCHUTZINFORMATION_FASSUNG} · nach Art. 13 DSGVO
      </p>
      {datenschutzinformation(absender).map((abschnitt) => (
        <Blattabschnitt key={abschnitt.titel} abschnitt={abschnitt} />
      ))}

      <div className="border-line mt-10 border-t pt-6 print:break-before-page">
        <AbsenderBlock absender={absender} />
        <h2 className="text-h4 mt-6 font-bold">{ausfallhonorarRegel().titel}</h2>
        <Blattabschnitt abschnitt={{ ...ausfallhonorarRegel(), titel: '' }} />
      </div>
    </article>
  );
}

function Blattabschnitt({ abschnitt }: { abschnitt: Abschnitt }) {
  return (
    <section className="mt-5">
      {abschnitt.titel ? <h2 className="text-sm font-semibold">{abschnitt.titel}</h2> : null}
      {abschnitt.absaetze.map((absatz) => (
        <p key={absatz} className="mt-2 leading-relaxed">
          {absatz}
        </p>
      ))}
    </section>
  );
}
