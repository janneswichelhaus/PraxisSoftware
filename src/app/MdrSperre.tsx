import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Inhaltsflaeche } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
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
 *
 * **Praxissprache (UX-009b, BEF-065, Entscheidung Jannes 2026-10-09).** Der
 * Haupttext sagt, was gilt, ohne Projektwörter; die Kennung
 * `MDR_REVIEW_REQUIRED` steht als Fußzeile - auffindbar für ADR-006 und das
 * Register, aber nicht als erster Satz. Der E2E-Test prüft Kennung und neuen
 * Satz gleich streng (freigegeben von Jannes am 2026-10-09).
 */
export function MdrSperre({ eintrag }: { eintrag: MdrEintrag }) {
  return (
    <>
      <PageHeader
        title={eintrag.bezeichnung}
        description="Diese Funktion bleibt gesperrt, bis eine Prüfung nach dem Medizinprodukterecht dokumentiert ist."
      />

      <Inhaltsflaeche className="max-w-prose">
        <p className="text-ink text-liste">{eintrag.keineAusgabe}</p>

        <p className="text-ink-muted mt-4 text-sm">
          Die Funktion liegt an der Grenze zu einem Medizinprodukt. Einen Schalter, der sie vor der
          Prüfung freigibt, gibt es bewusst nicht – deshalb steht hier nur diese Auskunft.
        </p>

        {/* Die Fundstellen als beschriftete Angabe wie auf jeder Detailseite
            (NAV-24): Bis UXR-002 stand hier eine eigene `dl` mit eigener
            Gestaltung. */}
        <div className="mt-2">
          <DetailList>
            <DetailRow label="Grundlage">
              <ul className="list-inside list-disc">
                {eintrag.grundlage.map((fundstelle) => (
                  <li key={fundstelle}>{fundstelle}</li>
                ))}
              </ul>
            </DetailRow>
          </DetailList>
        </div>

        <Kleingedrucktes className="mt-4">Kennung: MDR_REVIEW_REQUIRED (ADR-006)</Kleingedrucktes>
      </Inhaltsflaeche>

      <div className="mt-6">
        <ButtonLink to="/" variant="secondary">
          Zur Übersicht
        </ButtonLink>
      </div>
    </>
  );
}
