import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { useVorschau } from './vorschauContext';
import { formatZeitpunkt } from './format';

/**
 * Was in dieser Sitzung simuliert wurde.
 *
 * Die Seite ist der Gegenentwurf zu einer Erfolgsmeldung: Sie zeigt für jede
 * ausgelöste Aktion, was die Vorschau übernommen hat und was ausdrücklich
 * nicht passiert ist. Sie ist kein Auditlog - echte Vorgänge werden
 * serverseitig protokolliert (ADR-010).
 */
export function ProtokollPage() {
  const { protokoll, zuruecksetzen } = useVorschau();

  return (
    <>
      <PageHeader
        title="Vorschau-Protokoll"
        description="Simulierte Vorgänge dieser Sitzung. Kein Auditlog."
        actions={
          <Button variant="secondary" onClick={zuruecksetzen}>
            Vorschau zurücksetzen
          </Button>
        }
      />

      <p className="text-ink-muted mb-6 max-w-prose text-sm">
        Der Vorschaustand liegt ausschließlich im Arbeitsspeicher dieser Sitzung. Ein Neuladen der
        Seite stellt die synthetischen Ausgangsdaten wieder her. Es wurden keine Daten gespeichert,
        keine Nachrichten versendet und keine Genehmigungen oder Zahlungen ausgelöst.
      </p>

      {protokoll.length === 0 ? (
        <EmptyState
          title="Noch nichts simuliert"
          description="Sobald Sie in einem Vorschaubereich eine Aktion auslösen, steht sie hier."
        />
      ) : (
        <ul className="space-y-3">
          {protokoll.map((eintrag) => (
            <li key={eintrag.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge ton="akzent">{eintrag.bereich}</Badge>
                  <span className="text-ink-subtle text-sm tabular-nums">
                    {formatZeitpunkt(eintrag.zeitpunkt)}
                  </span>
                </div>
                <p className="text-ink mt-2 text-[0.9375rem] font-medium">{eintrag.vorgang}</p>
                {eintrag.folgen.length > 0 ? (
                  <>
                    <p className="text-ink-muted mt-2 text-sm font-medium">
                      In der Vorschau übernommen:
                    </p>
                    <ul className="text-ink-muted mt-1 list-disc space-y-0.5 pl-5 text-sm">
                      {eintrag.folgen.map((folge) => (
                        <li key={folge}>{folge}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {eintrag.nichtGeschehen.length > 0 ? (
                  <>
                    <p className="text-ink-muted mt-2 text-sm font-medium">Nicht passiert:</p>
                    <ul className="text-ink-muted mt-1 list-disc space-y-0.5 pl-5 text-sm">
                      {eintrag.nichtGeschehen.map((punkt) => (
                        <li key={punkt}>{punkt}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
