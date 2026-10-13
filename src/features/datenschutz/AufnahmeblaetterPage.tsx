import { ANMELDEBOGEN_ANKER } from '@/features/patients/akte';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Textlink } from '@/components/ui/Textlink';
import type { CurrentUser } from '@/features/session/types';
import { Aufnahmeblatt } from './Aufnahmeblatt';
import { useAbsender } from './useAbsender';

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
 *
 * **Absender (UX-009a, BEF-052).** Beide Blätter tragen oben Name, Anschrift,
 * Telefon und E-Mail der Praxis aus den Stammdaten (ANN-323) - auch wenn
 * therapist druckt. Die Datenschutzinformation nennt sie zusätzlich im Text.
 *
 * Das Blatt selbst steht seit Welle B in `Aufnahmeblatt.tsx`: Es folgt dem
 * Profil „Druckblatt“ (DESIGN.md) mit eigenen Überschriften; diese Seite
 * trägt nur die Bedienung drumherum.
 */
export function AufnahmeblaetterPage({ user }: { user: CurrentUser }) {
  const { patientId = '' } = useParams();
  const { absender, hinweis, laedt } = useAbsender(user.organizationName);

  return (
    <>
      {/* Am Telefon rutscht der Knopf unter den Rückweg; der Abstand darunter
          trennt ihn vom Blatt. */}
      <div className="nicht-drucken mx-auto mb-4 flex max-w-[210mm] flex-wrap items-start justify-between gap-x-4">
        <Rueckweg
          standard={`/patienten/${patientId}/stammdaten`}
          beschriftung="Zurück zum Datenschutz der Akte"
        />
        <Button type="button" disabled={laedt} onClick={() => window.print()}>
          Blätter drucken
        </Button>
      </div>

      <div className="mx-auto max-w-[210mm]">{hinweis}</div>

      <Aufnahmeblatt absender={absender} />

      <div className="nicht-drucken mx-auto mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          <Button type="button" variant="secondary" disabled={laedt} onClick={() => window.print()}>
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
