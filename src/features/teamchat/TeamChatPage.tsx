import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
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

      <div className="mb-5 max-w-sm">
        <Field
          label="Suche"
          type="search"
          placeholder="In Nachrichten suchen"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
        />
      </div>

      {nadel ? (
        <section className="mb-6">
          <h2 className="text-ink mb-2 text-[1.0625rem] font-semibold">{treffer.length} Treffer</h2>
          {/* Die Regel, nicht ihre Fundstelle in den Projektunterlagen
              (WRT-03, VOR-25). */}
          <p className="text-ink-muted mb-3 text-sm">
            Eine echte Suche zeigt nur, was Sie sehen dürfen. In der Vorschau gibt es keine
            Berechtigungsprüfung.
          </p>
          <ul className="divide-line border-line divide-y border-y">
            {treffer.map((nachricht) => (
              <li key={nachricht.id} className="py-3">
                <p className="text-ink-muted text-sm">
                  {zustand.kanaele.find((eintrag) => eintrag.id === nachricht.kanalId)?.name} ·{' '}
                  {mitarbeiterName(zustand, nachricht.autorId)} ·{' '}
                  {formatZeitpunkt(nachricht.zeitpunkt, zeitzone)}
                </p>
                <p className="text-ink text-liste mt-0.5">{nachricht.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        {/* min-w-0: Ohne das waechst der Rasterbereich auf die Breite der
            Kanalliste, und die ganze Seite scrollt waagerecht statt nur die
            Leiste selbst. */}
        <nav aria-label="Kanäle" className="min-w-0">
          <ul className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {zustand.kanaele.map((eintrag) => {
              const ungelesen = zustand.nachrichten.filter(
                (nachricht) => nachricht.kanalId === eintrag.id && !nachricht.gelesen,
              ).length;
              const aktiv = eintrag.id === kanalId;
              return (
                <li key={eintrag.id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => setKanalId(eintrag.id)}
                    aria-current={aktiv ? 'true' : undefined}
                    className={`rounded-button text-liste flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left transition-colors ${
                      aktiv
                        ? 'bg-accent-soft text-accent font-medium'
                        : 'text-ink-muted hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="truncate">
                      {eintrag.art === 'kanal' ? `# ${eintrag.name}` : eintrag.name}
                    </span>
                    {ungelesen > 0 ? <Badge ton="akzent">{ungelesen}</Badge> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="min-w-0">
          {kanal ? (
            <>
              <div className="border-line mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                <div className="min-w-0">
                  <h2 className="text-ink text-[1.0625rem] font-semibold">
                    {kanal.art === 'kanal' ? `# ${kanal.name}` : kanal.name}
                  </h2>
                  <p className="text-ink-muted mt-0.5 text-sm">{kanal.beschreibung}</p>
                </div>
                {/* Nur, wenn es Ungelesenes gibt (VOR-23) - sonst meldete der
                    Knopf einen Vorgang, der nichts tat. */}
                {ungelesenImKanal ? (
                  <Button variant="quiet" onClick={alsGelesen}>
                    Als gelesen markieren
                  </Button>
                ) : null}
              </div>

              {nachrichtenImKanal.length === 0 ? (
                <EmptyState title="Noch keine Nachrichten" />
              ) : (
                <ul className="space-y-4">
                  {nachrichtenImKanal
                    .filter((nachricht) => nachricht.threadVon === null)
                    .map((nachricht) => (
                      <li key={nachricht.id}>
                        <Nachrichtenblock
                          nachricht={nachricht}
                          zeitzone={zeitzone}
                          onAntworten={() => setAntwortAuf(nachricht)}
                        />
                        <ul className="border-line mt-2 ml-4 space-y-3 border-l pl-4">
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
              )}

              <div className="border-line mt-6 border-t pt-4">
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
            </>
          ) : null}
        </section>
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
