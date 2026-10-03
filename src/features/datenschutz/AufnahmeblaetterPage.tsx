import { ANMELDEBOGEN_ANKER } from '@/features/patients/akte';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Textlink } from '@/components/ui/Textlink';
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
 *
 * **Drucken steht oben (UEB-15).** Der Knopf kam erst nach beiden Blättern -
 * am Telefon nach mehreren Bildschirmhöhen Rechtstext. Jetzt steht er
 * zusätzlich neben dem Rückweg, und Rückweg, Blatt und Knöpfe stehen am
 * Desktop auf einer Fluchtlinie statt auf zweien.
 */
export function AufnahmeblaetterPage({ user }: { user: CurrentUser }) {
  const { patientId = '' } = useParams();
  const praxis = user.organizationName ?? 'die Praxis';

  return (
    <>
      {/* Am Telefon rutscht der Knopf unter den Rückweg; der Abstand darunter
          trennt ihn vom Blatt. */}
      <div className="nicht-drucken mx-auto mb-4 flex max-w-[210mm] flex-wrap items-start justify-between gap-x-4">
        <Rueckweg
          standard={`/patienten/${patientId}/stammdaten`}
          beschriftung="Zurück zum Datenschutz der Akte"
        />
        <Button type="button" onClick={() => window.print()}>
          Blätter drucken
        </Button>
      </div>

      <article className="text-ink text-liste mx-auto max-w-[210mm]">
        <p className="text-warnung border-line border-b pb-2 text-sm font-medium">
          Entwurf – vor der Verwendung mit echten Patient:innen durch die Datenschutzberatung zu
          prüfen.
        </p>

        <h1 className="text-h4 mt-6 font-bold">Datenschutzinformation</h1>
        <p className="text-ink-muted mt-1 text-sm">
          {praxis} · Fassung {DATENSCHUTZINFORMATION_FASSUNG} · nach Art. 13 DSGVO
        </p>
        {datenschutzinformation(praxis).map((abschnitt) => (
          <Blattabschnitt key={abschnitt.titel} abschnitt={abschnitt} />
        ))}

        <div className="border-line mt-10 border-t pt-6 print:break-before-page">
          <h2 className="text-h4 font-bold">{ausfallhonorarRegel().titel}</h2>
          <p className="text-ink-muted mt-1 text-sm">{praxis}</p>
          <Blattabschnitt abschnitt={{ ...ausfallhonorarRegel(), titel: '' }} />
        </div>
      </article>

      <div className="nicht-drucken mx-auto mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Blätter drucken
          </Button>
        </div>
        {/* Der Hinweis führt dorthin, wo vermerkt wird, statt nur davon zu
            sprechen (UEB-15). */}
        <p className="text-ink-muted max-w-prose text-sm">
          Nach dem Aushändigen mit dem Datum und der Fassung, die oben steht,{' '}
          <Textlink to={`/patienten/${patientId}/stammdaten#${ANMELDEBOGEN_ANKER}`}>
            in der Akte vermerken
          </Textlink>
          .
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
