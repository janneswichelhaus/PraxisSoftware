import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Inhaltsflaeche } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { SearchField } from '@/components/ui/SearchField';
import { Section } from '@/components/ui/Section';
import { TextArea } from '@/components/ui/TextArea';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import type { CurrentUser } from '@/features/session/types';
import {
  mitarbeiterName,
  useVorschau,
  type Protokolleintrag,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { vorschauidentitaet } from '@/features/preview/identitaet';
import { SimulationsMeldung } from '@/features/preview/ui';
import { formatZeitpunkt } from '@/features/preview/format';
import type { Nachricht } from '@/features/preview/types';

/**
 * Teamkommunikation.
 *
 * Erste Ausbaustufe im Sinne von PROJECT_PRINCIPLES.md 10: Kanäle,
 * Direktnachrichten, Antworten als Threads, Erwähnungen, ungelesene
 * Nachrichten und Suche. Anhänge, Konferenzen, externe Gäste und Bots folgen
 * daraus ausdrücklich nicht.
 *
 * Zwei Regeln prägen die Ansicht:
 *
 *   * Ein Gespräch darf einen Vorgang verlinken - der Link gewährt aber
 *     keinen zusätzlichen Zugriff. Er ist deshalb als Verweis dargestellt und
 *     nicht als Vorschau des Vorgangs.
 *   * Ein allgemeiner Teamkanal enthält keine Diagnosen und keine klinischen
 *     Freitexte. Patientenkommunikation gehört zum Patienten und nicht in den
 *     internen Chat.
 */

const bezugLabels: Record<string, string> = {
  termin: 'Termin',
  tour: 'Tour',
  panne: 'Panne',
  urlaub: 'Urlaub',
};

/** So viel der Ausgangsnachricht steht über einer Antwort im Entwurf. */
const ZITATLAENGE = 60;

export function TeamChatPage({ user }: { user: CurrentUser }) {
  const { zustand, simuliere } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);
  const zeitzone = user.organizationTimeZone;

  const [kanalId, setKanalId] = useState(zustand.kanaele[0]?.id ?? '');
  const [suche, setSuche] = useState('');
  const [entwurf, setEntwurf] = useState('');
  const [antwortAuf, setAntwortAuf] = useState<Nachricht | null>(null);
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);

  const kanal = zustand.kanaele.find((eintrag) => eintrag.id === kanalId);
  const nadel = suche.trim().toLowerCase();

  // Nach dem Augenblick sortiert, nicht nach dem Text des Zeitstempels
  // (VOR-06): Sonst konnte eine neue Nachricht vor älteren von heute landen.
  const nachrichtenImKanal = zustand.nachrichten
    .filter((nachricht) => nachricht.kanalId === kanalId)
    .sort((a, b) => Date.parse(a.zeitpunkt) - Date.parse(b.zeitpunkt));
  const ungelesenImKanal = nachrichtenImKanal.some((nachricht) => !nachricht.gelesen);

  const treffer = nadel
    ? zustand.nachrichten.filter((nachricht) => nachricht.text.toLowerCase().includes(nadel))
    : [];

  function senden() {
    if (!kanal || !identitaet) return;
    const eintrag = simuliere(
      {
        bereich: 'Kommunikation',
        vorgang: antwortAuf
          ? `Antwort verfasst (${kanal.name})`
          : `Nachricht verfasst (${kanal.name})`,
        folgen: ['Nachricht in der Vorschau des Kanals sichtbar'],
        nichtGeschehen: [
          'Nichts versendet – niemand im Team bekommt diese Nachricht',
          'Keine Benachrichtigung und keine Erwähnung zugestellt',
          'Keine Berechtigung erweitert, auch nicht durch einen verlinkten Vorgang',
        ],
      },
      (stand) => ({
        ...stand,
        nachrichten: [
          ...stand.nachrichten,
          {
            id: vorschauId('nachricht'),
            kanalId: kanal.id,
            autorId: identitaet.person.id,
            zeitpunkt: new Date().toISOString(),
            text: entwurf.trim(),
            threadVon: antwortAuf?.id ?? null,
            erwaehnungen: [],
            bezug: null,
            gelesen: true,
          },
        ],
      }),
    );
    setEntwurf('');
    setAntwortAuf(null);
    setMeldung(eintrag);
  }

  function alsGelesen() {
    const eintrag = simuliere(
      {
        bereich: 'Kommunikation',
        vorgang: `Kanal als gelesen markiert: ${kanal?.name ?? ''}`,
        folgen: ['Ungelesen-Markierung in der Vorschau entfernt'],
        nichtGeschehen: ['Kein Lesestatus gespeichert'],
      },
      (stand) => ({
        ...stand,
        nachrichten: stand.nachrichten.map((nachricht) =>
          nachricht.kanalId === kanalId ? { ...nachricht, gelesen: true } : nachricht,
        ),
      }),
    );
    setMeldung(eintrag);
  }

  return (
    <>
      <PageHeader
        title="Kommunikation"
        description="Kanäle, Direktnachrichten und Antworten für organisatorische Abstimmung."
      />

      <SimulationsMeldung eintrag={meldung} />

      <div className="max-w-spalte">
        <div className="max-w-formular mb-6">
          <SearchField
            label="Suche"
            placeholder="In Nachrichten suchen"
            value={suche}
            onChange={setSuche}
          />
        </div>

        {nadel ? (
          <div className="mb-8">
            <Section titel={`${treffer.length} Treffer`}>
              {/* Die Regel, nicht ihre Fundstelle in den Projektunterlagen
                  (WRT-03, VOR-25). */}
              <Kleingedrucktes className="mb-3">
                Eine echte Suche zeigt nur, was Sie sehen dürfen. In der Vorschau gibt es keine
                Berechtigungsprüfung.
              </Kleingedrucktes>
              {treffer.length > 0 ? (
                <ListRows>
                  {treffer.map((nachricht) => (
                    <ListRow
                      key={nachricht.id}
                      titel={<span className="font-normal">{nachricht.text}</span>}
                      meta={`${
                        zustand.kanaele.find((eintrag) => eintrag.id === nachricht.kanalId)?.name ??
                        ''
                      } · ${mitarbeiterName(zustand, nachricht.autorId)} · ${formatZeitpunkt(
                        nachricht.zeitpunkt,
                        zeitzone,
                      )}`}
                    />
                  ))}
                </ListRows>
              ) : (
                <EmptyState inKarte title="Nichts gefunden" />
              )}
            </Section>
          </div>
        ) : null}

        {/* Die Kanäle als Chips: am Telefon eine Reihe, die waagerecht
            rollt; ab 640 px brechen sie um. `min-w-0`, damit nur die Reihe
            rollt und nicht die Seite. */}
        <nav aria-label="Kanäle" className="mb-6 min-w-0">
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {zustand.kanaele.map((eintrag) => {
              const ungelesen = zustand.nachrichten.filter(
                (nachricht) => nachricht.kanalId === eintrag.id && !nachricht.gelesen,
              ).length;
              return (
                <li key={eintrag.id} className="shrink-0">
                  <Chip gewaehlt={eintrag.id === kanalId} onClick={() => setKanalId(eintrag.id)}>
                    {eintrag.art === 'kanal' ? `# ${eintrag.name}` : eintrag.name}
                    {ungelesen > 0 ? <Badge ton="akzent">{ungelesen}</Badge> : null}
                  </Chip>
                </li>
              );
            })}
          </ul>
        </nav>

        {kanal ? (
          <Section
            titel={kanal.art === 'kanal' ? `# ${kanal.name}` : kanal.name}
            hinweis={kanal.beschreibung}
            aktion={
              // Nur, wenn es Ungelesenes gibt (VOR-23) - sonst meldete der
              // Knopf einen Vorgang, der nichts tat.
              ungelesenImKanal ? (
                <Button variant="quiet" groesse="kompakt" onClick={alsGelesen}>
                  Als gelesen markieren
                </Button>
              ) : undefined
            }
          >
            {nachrichtenImKanal.length === 0 ? (
              <EmptyState inKarte title="Noch keine Nachrichten" />
            ) : (
              <Inhaltsflaeche>
                <ul>
                  {nachrichtenImKanal
                    .filter((nachricht) => nachricht.threadVon === null)
                    .map((nachricht) => (
                      <li key={nachricht.id} className="border-line border-t py-3 first:border-t-0">
                        <Nachrichtenblock
                          nachricht={nachricht}
                          zeitzone={zeitzone}
                          onAntworten={() => setAntwortAuf(nachricht)}
                        />
                        <ul className="border-line mt-2 ml-4 space-y-3 border-l pl-4 empty:hidden">
                          {nachrichtenImKanal
                            .filter((antwort) => antwort.threadVon === nachricht.id)
                            .map((antwort) => (
                              <li key={antwort.id}>
                                <Nachrichtenblock nachricht={antwort} zeitzone={zeitzone} />
                              </li>
                            ))}
                        </ul>
                      </li>
                    ))}
                </ul>
              </Inhaltsflaeche>
            )}

            <div className="mt-6">
              {/* Unter welchem Namen die eigene Nachricht erscheint, steht
                    dabei (VOR-07): In der Vorschau schreibt das Konto als
                    Demoperson, und ohne diesen Satz stand die eigene Nachricht
                    scheinbar unter fremdem Namen. */}
              {identitaet ? (
                <p className="text-ink-muted mb-2 text-sm">
                  Sie schreiben in der Vorschau als {identitaet.person.name}
                  {identitaet.ueberNamen ? '' : ' (Demoperson zur Rolle)'}.
                </p>
              ) : null}
              {antwortAuf ? (
                <div className="mb-2 flex flex-wrap items-center gap-x-3">
                  <p className="text-ink-muted min-w-0 text-sm">
                    Antwort auf: „{zitat(antwortAuf.text)}“
                  </p>
                  {/* 44 px statt einer Textzeile (VOR-11). */}
                  <Button variant="quiet" groesse="kompakt" onClick={() => setAntwortAuf(null)}>
                    Abbrechen
                  </Button>
                </div>
              ) : null}
              <TextArea
                rows={3}
                label={antwortAuf ? 'Antwort' : 'Neue Nachricht'}
                hint="Keine Diagnosen und keine klinischen Freitexte im Teamkanal."
                placeholder="Organisatorische Abstimmung"
                value={entwurf}
                onChange={(event) => setEntwurf(event.target.value)}
              />
              <div className="mt-3">
                <Button onClick={senden} disabled={entwurf.trim() === '' || !identitaet}>
                  In die Vorschau schreiben
                </Button>
              </div>
            </div>
          </Section>
        ) : null}
      </div>
    </>
  );
}

/** Anfang einer Nachricht; „…“ nur, wenn wirklich gekürzt wurde (VOR-23). */
function zitat(text: string): string {
  return text.length > ZITATLAENGE ? `${text.slice(0, ZITATLAENGE)}…` : text;
}

function Nachrichtenblock({
  nachricht,
  zeitzone,
  onAntworten,
}: {
  nachricht: Nachricht;
  zeitzone: string | null;
  onAntworten?: () => void;
}) {
  const { zustand } = useVorschau();

  return (
    <div>
      <p className="text-ink-muted text-sm">
        <span className="text-ink font-medium">{mitarbeiterName(zustand, nachricht.autorId)}</span>{' '}
        · {formatZeitpunkt(nachricht.zeitpunkt, zeitzone)}
        {!nachricht.gelesen ? (
          <>
            {' '}
            <Badge ton="akzent">neu</Badge>
          </>
        ) : null}
      </p>
      <p className="text-ink text-liste mt-0.5">{nachricht.text}</p>
      {nachricht.erwaehnungen.length > 0 ? (
        <p className="text-ink-muted mt-1 text-sm">
          Erwähnt: {nachricht.erwaehnungen.map((id) => mitarbeiterName(zustand, id)).join(', ')}
        </p>
      ) : null}
      {nachricht.bezug ? (
        <p className="text-ink-muted bg-surface-sunken rounded-card mt-2 inline-block px-3 py-1.5 text-sm">
          Bezug: {bezugLabels[nachricht.bezug.art] ?? nachricht.bezug.art} · {nachricht.bezug.label}
          <span className="text-ink-muted block text-xs">
            Der Verweis erweitert keine Berechtigung.
          </span>
        </p>
      ) : null}
      {onAntworten ? (
        // 44 px statt 36 (VOR-11).
        <Button variant="quiet" groesse="kompakt" className="mt-1" onClick={onAntworten}>
          Antworten
        </Button>
      ) : null}
    </div>
  );
}
