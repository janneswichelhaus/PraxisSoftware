import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, DataList, DataRow, Disclosure } from '@/components/ui/Card';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { bibliothek } from './bibliothek';
import { optionKennung, type Lizenzstatus, type ScoreDefinition, type ScoreItem } from './schema';

/**
 * Die Instrumentenbibliothek zum Nachlesen (FRB-010).
 *
 * Eine Leseseite ohne Eingabe und ohne Server: Die Bibliothek ist Produktinhalt
 * im Release (ANN-083), für alle Praxen gleich, und enthält keine Angabe zu
 * einer Person. Sie zeigt, was die Definition sagt — Version, Lizenz, Quelle,
 * Rechenvorschrift und Wortlaut.
 *
 * **Was sie nicht zeigt, ist Absicht (ADR-006 Punkt 11, `cutoff-anzeige` in
 * `src/app/mdr.ts`):** Cut-off, MCID und MDC stehen in der Definition, aber
 * nicht hier. Ob ein veröffentlichter Schwellenwert neben einem Wert stehen
 * darf, klärt die externe Prüfung B1; eine Leseseite, die ihn schon heute
 * zeigt, wäre der erste Schritt zu genau dieser Anzeige.
 */

const LIZENZ_TEXT: Record<Lizenzstatus, string> = {
  freigegeben: 'frei verwendbar',
  lizenz_erforderlich: 'Lizenz erforderlich',
  ungeklaert: 'ungeklärt',
};

const AUSGEFUELLT_VON: Record<ScoreDefinition['meta']['ausgefuellt_von'], string> = {
  patient: 'Patient:in',
  therapeut: 'Therapeut:in',
  beide: 'Patient:in und Therapeut:in',
};

function datum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-');
  return `${tag}.${monat}.${jahr}`;
}

function Antwortform({ item }: { item: ScoreItem }) {
  if (item.typ === 'freitext') {
    return <p className="text-ink-muted text-sm">Freitext, geht in keine Rechnung ein</p>;
  }
  if (item.typ === 'koerperschema') {
    return (
      <p className="text-ink-muted text-sm">
        Körperschema: Bereiche auf Vorder- und Rückansicht, geht in keine Rechnung ein
      </p>
    );
  }
  if (item.typ === 'skala' && item.skala) {
    return (
      <p className="text-ink-muted text-sm">
        Skala {item.skala.min} bis {item.skala.max}
        {item.anker ? (
          <>
            {' '}
            — {item.skala.min} = „{item.anker.min}“, {item.skala.max} = „{item.anker.max}“
          </>
        ) : null}
      </p>
    );
  }
  if (item.optionen) {
    return (
      <ul className="text-ink-muted text-sm">
        {item.optionen.map((option) => (
          <li key={optionKennung(option)}>
            {option.label}
            {option.wert === undefined ? null : (
              <>
                {' '}
                <span className="tabular-nums">({option.wert})</span>
              </>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-ink-muted text-sm">{item.einheit ? `Zahl in ${item.einheit}` : 'Zahl'}</p>
  );
}

function Zustand({ score }: { score: ScoreDefinition }) {
  if (score.meta.aktiv) return <Badge ton="positiv">aktiv</Badge>;
  if (score.meta.quelle.datei === undefined) {
    return <Badge ton="warnung">inaktiv · Wortlaut vorläufig</Badge>;
  }
  return <Badge>inaktiv</Badge>;
}

function Instrument({ score }: { score: ScoreDefinition }) {
  const { meta, scoring, items } = score;
  const gewertet = items.filter((item) => item.gewertet).length;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-ink text-h4 font-bold">{meta.name_de}</h2>
        <Zustand score={score} />
      </div>
      <p className="text-ink-muted mt-1 text-sm">{meta.konstrukt}</p>

      <DataList>
        <DataRow label="Version">{meta.version}</DataRow>
        <DataRow label="Ausgefüllt von">{AUSGEFUELLT_VON[meta.ausgefuellt_von]}</DataRow>
        <DataRow label="Lizenz">
          {LIZENZ_TEXT[meta.lizenzstatus.status]}, Stand {datum(meta.lizenzstatus.stand)}
        </DataRow>
        <DataRow label="Quelle">{meta.quelle.datei ?? meta.quelle.literatur ?? '—'}</DataRow>
        <DataRow label="Items">
          {items.length === gewertet ? items.length : `${items.length}, davon ${gewertet} gewertet`}
        </DataRow>
      </DataList>

      {meta.quelle.datei === undefined ? (
        <p className="text-ink-muted mt-3 text-sm">
          Für dieses Instrument liegt noch kein Bogen als Vorlage vor. Bis dahin ist der Wortlaut
          vorläufig, und das Instrument wird nicht eingesetzt.
        </p>
      ) : null}

      <Disclosure summary="Rechenvorschrift">
        <p className="text-ink text-sm">{scoring.regel_wortlaut}</p>
        {scoring.gesamt ? (
          <p className="text-ink-muted mt-1 text-sm">
            Wertebereich {scoring.gesamt.wertebereich.min} bis {scoring.gesamt.wertebereich.max}
          </p>
        ) : null}
        <p className="text-ink-muted mt-1 text-sm">
          Fehlende Antworten: {scoring.missing_value_regel}
        </p>
      </Disclosure>

      <Disclosure summary={`Wortlaut (${items.length} ${items.length === 1 ? 'Item' : 'Items'})`}>
        <ol className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <p className="text-ink text-sm">{item.text}</p>
              <Antwortform item={item} />
            </li>
          ))}
        </ol>
      </Disclosure>
    </Card>
  );
}

export function InstrumentePage({
  scores = bibliothek.scores,
}: {
  /** Nur für Tests; die Anwendung zeigt immer die Bibliothek des Releases. */
  scores?: ScoreDefinition[];
}) {
  const sortiert = [...scores].sort((a, b) => a.meta.name_de.localeCompare(b.meta.name_de, 'de'));

  return (
    <>
      <PageHeader
        title="Instrumente"
        description="Die Fragebögen und Skalen der Praxis, je mit Version, Lizenz und Quelle. Erhoben wird in der Akte unter „Befund“."
      />
      {sortiert.length === 0 ? (
        <Statusmeldung>Noch liegt kein Instrument vor.</Statusmeldung>
      ) : (
        <div className="flex flex-col gap-3">
          {sortiert.map((score) => (
            <Instrument key={score.meta.id} score={score} />
          ))}
        </div>
      )}
    </>
  );
}
