import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { useVorschau } from './vorschauContext';
import { formatZeitpunkt } from './format';

/**
 * Was in dieser Sitzung simuliert wurde.
 *
 * Die Seite ist der Gegenentwurf zu einer Erfolgsmeldung: Sie zeigt für jede
 * ausgelöste Aktion, was die Vorschau übernommen hat und was ausdrücklich
 * nicht passiert ist. Sie ist kein Auditlog - echte Vorgänge werden
 * serverseitig protokolliert (ADR-010).
 *
 * Die Zeiten stehen in der Praxiszeitzone (VOR-06, UEB-19). Die Seite kennt
 * das angemeldete Konto nicht; es gilt deshalb `VORSCHAU_ZEITZONE`.
 *
 * Seit Welle B (B7) eine Liste in einer Karte statt einer Karte je Vorgang
 * (Leitfaden L2): je Vorgang eine Zeile mit Bereich und Zeit, darunter, was
 * übernommen wurde und was nicht passiert ist - vollständig, wie in der
 * Zustandsmeldung. Das Zurücksetzen steht leise am Ende (DESIGN.md,
 * Zerstörendes), der Satz zum Arbeitsspeicher im Kleingedruckten.
 */
export function ProtokollPage() {
  const { protokoll, zuruecksetzen } = useVorschau();

  return (
    <>
      <PageHeader
        title="Vorschau-Protokoll"
        description="Simulierte Vorgänge dieser Sitzung. Nicht das Protokoll der Praxis."
      />

      {protokoll.length === 0 ? (
        <EmptyState
          inKarte
          title="Noch nichts simuliert"
          description="Sobald Sie in einem Vorschaubereich eine Aktion auslösen, steht sie hier."
        />
      ) : (
        <ListRows>
          {protokoll.map((eintrag) => (
            <li key={eintrag.id} className="border-line border-t py-3 first:border-t-0">
              <p className="text-ink-muted text-sm">
                {eintrag.bereich} ·{' '}
                <span className="tabular-nums">{formatZeitpunkt(eintrag.zeitpunkt)}</span>
              </p>
              <p className="text-ink mt-0.5 text-base font-semibold">{eintrag.vorgang}</p>
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
            </li>
          ))}
        </ListRows>
      )}

      {/* Zurücksetzen verwirft alles auf einmal - nur mit Rückfrage, nur,
          wenn es etwas zu verwerfen gibt (VOR-10, UEB-19), und leise am Ende. */}
      {protokoll.length > 0 ? (
        <div className="mt-8">
          <Rueckfrage
            ausloeser="Vorschau zurücksetzen"
            ausloeserVariante="quiet"
            bestaetigen="Ja, zurücksetzen"
            onBestaetigen={zuruecksetzen}
          >
            <p>
              Alle simulierten Vorgänge dieser Sitzung werden verworfen, und die Vorschaubereiche
              zeigen wieder die synthetischen Ausgangsdaten. Echte Daten sind davon nicht betroffen.
            </p>
          </Rueckfrage>
        </div>
      ) : null}

      <Kleingedrucktes className="mt-8">
        Der Vorschaustand liegt ausschließlich im Arbeitsspeicher dieser Sitzung. Ein Neuladen der
        Seite stellt die synthetischen Ausgangsdaten wieder her. Es wurden keine Daten gespeichert,
        keine Nachrichten versendet und keine Genehmigungen oder Zahlungen ausgelöst.
      </Kleingedrucktes>
    </>
  );
}
