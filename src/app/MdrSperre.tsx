import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Inhaltsflaeche } from '@/components/ui/Card';
import type { MdrEintrag } from './mdr';

/**
 * Was statt einer gesperrten Funktion erscheint.
 *
 * Die Seite ist bewusst keine Fehlermeldung: Hier ist nichts kaputt und nichts
 * fehlt: Die Funktion ist nach ADR-006 Punkt 6 klassifiziert und darf ohne
 * dokumentierte regulatorische Prüfung nicht erreichbar sein. Wer die Adresse
 * aufruft, soll das erfahren und nicht auf die Übersicht geworfen werden — eine
 * stille Weiterleitung sähe aus wie ein Tippfehler und wäre die schlechtere
 * Auskunft.
 *
 * Sie nennt aus demselben Grund die Fundstelle und den Satz, welche Ausgabe
 * nicht entsteht. Beides steht im Eintrag; die Seite erfindet nichts dazu.
 */
export function MdrSperre({ eintrag }: { eintrag: MdrEintrag }) {
  return (
    <>
      <PageHeader
        title={eintrag.bezeichnung}
        description="Diese Funktion ist nicht erreichbar. Sie ist als MDR_REVIEW_REQUIRED klassifiziert."
      />

      <Inhaltsflaeche className="max-w-prose">
        <p className="text-ink text-[0.9375rem]">{eintrag.keineAusgabe}</p>

        <p className="text-ink-muted mt-4 text-sm">
          Features an der Grenze zur Medizinprodukte-Software dürfen vor einer dokumentierten
          regulatorischen Prüfung nicht produktiv aktiviert werden. Ein Feature-Flag ersetzt diese
          Prüfung nicht — deshalb gibt es hier keinen Schalter, sondern nur diese Auskunft.
        </p>

        <dl className="mt-4 text-sm">
          <dt className="text-ink-subtle">Grundlage</dt>
          <dd className="text-ink-muted mt-1">
            <ul className="list-inside list-disc">
              {eintrag.grundlage.map((fundstelle) => (
                <li key={fundstelle}>{fundstelle}</li>
              ))}
            </ul>
          </dd>
        </dl>
      </Inhaltsflaeche>

      <div className="mt-6">
        <ButtonLink to="/" variant="secondary">
          Zur Übersicht
        </ButtonLink>
      </div>
    </>
  );
}
