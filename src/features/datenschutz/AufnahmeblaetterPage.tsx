import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/session/types';
import {
  ausfallhonorarRegel,
  datenschutzinformation,
  DATENSCHUTZINFORMATION_FASSUNG,
  type Abschnitt,
} from './patienteninformation';

/**
 * Die Blätter für die Aufnahme zum Ausdrucken (PAT-006).
 *
 * Datenschutzinformation und Regel zum Ausfallhonorar — beide ohne einen
 * einzigen Patientenbezug. Die Seite hängt nur deshalb an der Akte, weil sie
 * von dort aus gedruckt wird und dorthin zurückführt; sie liest nichts aus
 * ihr und protokolliert deshalb auch nichts.
 *
 * Der Entwurfsvermerk steht auf dem Blatt, nicht nur am Bildschirm: Wer es
 * vor der Prüfung (B2, B4) aushändigt, soll es sehen.
 */
export function AufnahmeblaetterPage({ user }: { user: CurrentUser }) {
  const { patientId = '' } = useParams();
  const praxis = user.organizationName ?? 'die Praxis';

  return (
    <>
      <div className="nicht-drucken">
        <Rueckweg
          standard={`/patienten/${patientId}/datenschutz`}
          beschriftung="Zurück zum Datenschutz der Akte"
        />
      </div>

      <article className="text-ink mx-auto max-w-[210mm] text-[0.9375rem]">
        <p className="text-warnung border-line border-b pb-2 text-xs font-medium">
          Entwurf — vor der Verwendung mit echten Patient:innen durch die Datenschutzberatung zu
          prüfen.
        </p>

        <h1 className="mt-6 text-lg font-semibold">Datenschutzinformation</h1>
        <p className="text-ink-muted mt-1 text-sm">
          {praxis} · Fassung {DATENSCHUTZINFORMATION_FASSUNG} · nach Art. 13 DSGVO
        </p>
        {datenschutzinformation(praxis).map((abschnitt) => (
          <Blattabschnitt key={abschnitt.titel} abschnitt={abschnitt} />
        ))}

        <div className="border-line mt-10 border-t pt-6 print:break-before-page">
          <h2 className="text-lg font-semibold">{ausfallhonorarRegel().titel}</h2>
          <p className="text-ink-muted mt-1 text-sm">{praxis}</p>
          <Blattabschnitt abschnitt={{ ...ausfallhonorarRegel(), titel: '' }} />
        </div>
      </article>

      <div className="nicht-drucken mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          <Button type="button" onClick={() => window.print()}>
            Blätter drucken
          </Button>
        </div>
        <p className="text-ink-subtle max-w-prose text-xs leading-relaxed">
          Nach dem Aushändigen in der Akte vermerken — mit dem Datum und der Fassung, die oben
          steht.
        </p>
      </div>
    </>
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
