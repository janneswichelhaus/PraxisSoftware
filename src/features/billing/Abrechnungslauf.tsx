import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Card } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { formatEuro } from '@/lib/geld';
import {
  AnschriftUnvollstaendig,
  KeineStammdaten,
  WegHinweis,
  bereichLabels,
  createEntwurf,
  fetchOffeneTermine,
  fetchRechnungen,
  stelleRechnungAus,
  type Kandidat,
  type Rechnung,
} from './api';
import { empfaengerart, klammerText } from './anzeige';
import { jeKreis, laufKandidaten } from './lauf';

/**
 * Die Monatsabrechnung in einem Lauf (Bereichsüberholung 4, K13: ≤ 3 Tipps).
 *
 *   1. **„Abrechnungslauf starten“** legt zu jeder fertigen Zeile aus
 *      „Abzurechnen“ den Entwurf an (welche fertig ist, sagt `laufstand`,
 *      ANN-544) und zeigt alle stehenden Entwürfe als Prüfliste: Person,
 *      Empfänger, Betrag. Jede Zeile führt zum Entwurf.
 *   2. **„n Rechnungen ausstellen“** öffnet die Rückfrage mit den Werten, die
 *      vorher niemand noch einmal ansieht (BEF-063): Anzahl, Summe, Kreise.
 *   3. **„Ja, …“** stellt jede Rechnung einzeln über `issue_invoice` aus. Ein
 *      Fehlschlag - etwa eine unvollständige Anschrift - hält die übrigen
 *      nicht auf; er steht danach mit dem Weg zum Entwurf da.
 *
 * Danach „Alle drucken“: ein Blatt je Rechnung in einem Druckauftrag. Der
 * Stand ist der Server: Wer zwischendurch die Seite verlässt, findet die
 * Entwürfe beim nächsten Lauf wieder.
 */

/** Was nicht geklappt hat - je Rechnung ein Satz und, wo es ihn gibt, der Weg. */
interface Fehlschlag {
  name: string;
  text: string;
  entwurfId?: string;
}

interface Ausgestellt {
  id: string;
  nummer: string;
  name: string;
  betrag: number;
  waehrung: string;
}

type Phase =
  | { art: 'bereit' }
  | { art: 'anlegen'; fertig: number; gesamt: number }
  | { art: 'pruefen'; fehler: Fehlschlag[] }
  | { art: 'ausstellen'; fertig: number; gesamt: number }
  | { art: 'fertig'; ausgestellt: Ausgestellt[]; fehler: Fehlschlag[]; ohneStammdaten: boolean };

/** Die Entwürfe der Praxis - derselbe Schlüsselanfang wie die Rechnungsliste. */
const ENTWUERFE = ['rechnungen', 'lauf-entwuerfe'] as const;

function anzahlText(anzahl: number): string {
  return anzahl === 1 ? 'eine Rechnung' : `${anzahl} Rechnungen`;
}

function summe(betraege: readonly number[]): number {
  return betraege.reduce((a, b) => a + b, 0);
}

export function Abrechnungslauf({
  kandidaten,
  heute,
  darfAusstellen,
}: {
  kandidaten: readonly Kandidat[];
  /** Heute in der Zeitzone der Praxis (`JJJJ-MM-TT`). */
  heute: string;
  darfAusstellen: boolean;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ art: 'bereit' });
  const meldung = useRef<HTMLDivElement>(null);

  const entwuerfe = useQuery({
    queryKey: ENTWUERFE,
    queryFn: () => fetchRechnungen({ filter: 'draft' }),
    retry: false,
  });
  // Ein Termin ohne erfasste Leistung fehlt sonst stumm im Lauf.
  const ohneLeistung = useQuery({
    queryKey: ['abrechnung-offene-termine'],
    queryFn: fetchOffeneTermine,
    retry: false,
  });

  // Nach jedem Schritt steht der Fokus auf dem, was jetzt gilt - sonst fiele
  // er mit dem verschwundenen Knopf an den Seitenanfang.
  useEffect(() => {
    if (phase.art !== 'bereit') meldung.current?.focus();
  }, [phase.art]);

  if (!darfAusstellen) return null;

  const neu = laufKandidaten(kandidaten, heute);
  const stehend = entwuerfe.data ?? [];
  const bereit = neu.length + stehend.length;
  if (phase.art === 'bereit' && bereit === 0) return null;

  async function aktualisieren() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rechnungen'] }),
      queryClient.invalidateQueries({ queryKey: ['rechnungs-kandidaten'] }),
      queryClient.invalidateQueries({ queryKey: ['offene-posten'] }),
      queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] }),
    ]);
  }

  async function starten() {
    const fehler: Fehlschlag[] = [];
    setPhase({ art: 'anlegen', fertig: 0, gesamt: neu.length });
    for (const [index, kandidat] of neu.entries()) {
      try {
        await createEntwurf(kandidat);
      } catch (grund) {
        fehler.push({
          name: kandidat.patient_name,
          text:
            grund instanceof WegHinweis
              ? grund.message
              : 'Der Entwurf konnte nicht angelegt werden. Bitte die Verbindung prüfen.',
        });
      }
      setPhase({ art: 'anlegen', fertig: index + 1, gesamt: neu.length });
    }
    await aktualisieren();
    setPhase({ art: 'pruefen', fehler });
  }

  async function ausstellen(liste: readonly Rechnung[]) {
    const ausgestellt: Ausgestellt[] = [];
    const fehler: Fehlschlag[] = [];
    let ohneStammdaten = false;
    setPhase({ art: 'ausstellen', fertig: 0, gesamt: liste.length });
    for (const [index, rechnung] of liste.entries()) {
      if (ohneStammdaten) break;
      try {
        const nummer = await stelleRechnungAus(rechnung.id);
        ausgestellt.push({
          id: rechnung.id,
          nummer,
          name: rechnung.patient_name,
          betrag: rechnung.total_cents,
          waehrung: rechnung.currency,
        });
      } catch (grund) {
        // Ohne Praxisstammdaten scheitert jede weitere genauso - der Lauf
        // hält an, die Entwürfe bleiben stehen.
        if (grund instanceof KeineStammdaten) ohneStammdaten = true;
        else
          fehler.push({
            name: rechnung.patient_name,
            entwurfId: rechnung.id,
            text:
              grund instanceof AnschriftUnvollstaendig || grund instanceof Error
                ? grund.message
                : 'Die Rechnung konnte nicht ausgestellt werden.',
          });
      }
      setPhase({ art: 'ausstellen', fertig: index + 1, gesamt: liste.length });
    }
    await aktualisieren();
    setPhase({ art: 'fertig', ausgestellt, fehler, ohneStammdaten });
  }

  return (
    <Section titel="Monatsabrechnung">
      <Card>
        <div ref={meldung} tabIndex={-1} className="outline-none">
          {phase.art === 'bereit' ? (
            <Bereit
              anzahl={bereit}
              betrag={summe([
                ...neu.map((k) => k.total_cents),
                ...stehend.map((r) => r.total_cents),
              ])}
              ohneLeistung={ohneLeistung.data?.length ?? 0}
              laedt={entwuerfe.isPending}
              onStarten={() => void starten()}
            />
          ) : phase.art === 'anlegen' ? (
            <Statusmeldung>
              <span aria-live="polite">
                Entwürfe werden angelegt … {phase.fertig} von {phase.gesamt}
              </span>
            </Statusmeldung>
          ) : phase.art === 'pruefen' ? (
            <Pruefliste
              entwuerfe={entwuerfe}
              fehler={phase.fehler}
              onAusstellen={(liste) => ausstellen(liste)}
              onSpaeter={() => setPhase({ art: 'bereit' })}
            />
          ) : phase.art === 'ausstellen' ? (
            <Statusmeldung>
              <span aria-live="polite">
                Rechnungen werden ausgestellt … {phase.fertig} von {phase.gesamt}
              </span>
            </Statusmeldung>
          ) : (
            <Ergebnis phase={phase} onSchliessen={() => setPhase({ art: 'bereit' })} />
          )}
        </div>
      </Card>
    </Section>
  );
}

function Bereit({
  anzahl,
  betrag,
  ohneLeistung,
  laedt,
  onStarten,
}: {
  anzahl: number;
  betrag: number;
  ohneLeistung: number;
  laedt: boolean;
  onStarten: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-liste">
        <span className="font-semibold">
          {anzahl === 1 ? 'Eine Rechnung bereit' : `${anzahl} Rechnungen bereit`}
        </span>{' '}
        · <span className="tabular-nums">{formatEuro(betrag)}</span>
      </p>
      {ohneLeistung > 0 ? (
        <p className="text-ink-muted text-sm">
          {ohneLeistung === 1
            ? 'Ein Termin ist noch ohne Leistung'
            : `${ohneLeistung} Termine sind noch ohne Leistung`}{' '}
          – <Textlink to="/abrechnung/leistungen">erfassen</Textlink>
        </p>
      ) : null}
      <div>
        <Button type="button" onClick={onStarten} disabled={laedt} className="w-full sm:w-auto">
          Abrechnungslauf starten
        </Button>
      </div>
    </div>
  );
}

function Pruefliste({
  entwuerfe,
  fehler,
  onAusstellen,
  onSpaeter,
}: {
  entwuerfe: { data?: Rechnung[] | undefined; isPending: boolean; isError: boolean };
  fehler: Fehlschlag[];
  onAusstellen: (liste: readonly Rechnung[]) => Promise<void>;
  onSpaeter: () => void;
}) {
  if (entwuerfe.isPending) return <Statusmeldung>Entwürfe werden geladen …</Statusmeldung>;
  if (entwuerfe.isError) {
    return (
      <Statusmeldung ton="fehler">
        Die Entwürfe konnten nicht geladen werden. Bitte die Verbindung prüfen.
      </Statusmeldung>
    );
  }
  const liste = entwuerfe.data ?? [];
  const gesamt = summe(liste.map((r) => r.total_cents));
  const kreise = jeKreis(liste);

  return (
    <div className="flex flex-col gap-4">
      <Zwischentitel>
        {liste.length === 0
          ? 'Kein Entwurf steht'
          : `${liste.length === 1 ? 'Ein Entwurf' : `${liste.length} Entwürfe`} · ${formatEuro(gesamt)}`}
      </Zwischentitel>

      {liste.length > 0 ? (
        <ListRows rahmen={false}>
          {liste.map((rechnung) => (
            <ListRow
              key={rechnung.id}
              to={`/abrechnung/rechnungen/${rechnung.id}`}
              titel={rechnung.patient_name}
              meta={[
                `an ${rechnung.recipient_name} (${empfaengerart(rechnung.recipient_kind, rechnung.service_area)})`,
                klammerText(rechnung),
                bereichLabels[rechnung.service_area],
              ].join(' · ')}
              betrag={formatEuro(rechnung.total_cents, rechnung.currency)}
            />
          ))}
        </ListRows>
      ) : null}

      {fehler.length > 0 ? <Fehlschlaege fehler={fehler} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {liste.length > 0 ? (
          <Rueckfrage
            ausloeser={
              liste.length === 1
                ? 'Eine Rechnung ausstellen'
                : `${liste.length} Rechnungen ausstellen`
            }
            ausloeserVariante="primary"
            bezeichnung="Rechnungen ausstellen – Rückfrage"
            bestaetigen={`Ja, ${anzahlText(liste.length)} ausstellen`}
            bestaetigenLaeuft="Wird ausgestellt …"
            onBestaetigen={() => onAusstellen(liste)}
          >
            <p className="font-medium">
              {liste.length === 1
                ? 'Diese Rechnung jetzt ausstellen?'
                : `Diese ${liste.length} Rechnungen jetzt ausstellen?`}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-ink-muted">Summe</dt>
              <dd className="tabular-nums">{formatEuro(gesamt)}</dd>
              <dt className="text-ink-muted">Nummern</dt>
              <dd>
                {[
                  kreise.therapy > 0 ? `${kreise.therapy} aus dem Kreis Behandlung` : null,
                  kreise.training > 0 ? `${kreise.training} aus dem Kreis Training` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </dd>
            </dl>
            <p className="mt-2">
              Danach ist jede Rechnung unveränderlich; eine Korrektur geht nur über Storno und neue
              Rechnung.
            </p>
          </Rueckfrage>
        ) : null}
        <Button type="button" variant="quiet" onClick={onSpaeter}>
          Später
        </Button>
      </div>
    </div>
  );
}

function Fehlschlaege({ fehler }: { fehler: Fehlschlag[] }) {
  return (
    <Statusmeldung ton="fehler">
      <span className="block font-medium">
        {fehler.length === 1 ? 'Eine Rechnung fehlt:' : `${fehler.length} Rechnungen fehlen:`}
      </span>
      <ul className="mt-1 flex flex-col gap-1">
        {fehler.map((f, index) => (
          <li key={`${f.name}-${index}`}>
            {f.name}: {f.text}
            {f.entwurfId ? (
              <>
                {' '}
                <Textlink to={`/abrechnung/rechnungen/${f.entwurfId}`}>Zum Entwurf</Textlink>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </Statusmeldung>
  );
}

function Ergebnis({
  phase,
  onSchliessen,
}: {
  phase: Extract<Phase, { art: 'fertig' }>;
  onSchliessen: () => void;
}) {
  const { ausgestellt, fehler, ohneStammdaten } = phase;
  const ids = ausgestellt.map((r) => r.id).join(',');
  return (
    <div className="flex flex-col gap-4">
      {ausgestellt.length > 0 ? (
        <Statusmeldung ton="erfolg">
          {ausgestellt.length === 1
            ? 'Eine Rechnung ausgestellt'
            : `${ausgestellt.length} Rechnungen ausgestellt`}{' '}
          · {formatEuro(summe(ausgestellt.map((r) => r.betrag)))}
        </Statusmeldung>
      ) : null}
      {ohneStammdaten ? (
        <Statusmeldung ton="fehler">
          Es sind keine Praxisstammdaten erfasst; ohne sie lässt sich keine Rechnung ausstellen. Die
          Entwürfe bleiben stehen.{' '}
          <Textlink to="/abrechnung/stammdaten">Zu den Praxisstammdaten</Textlink>
        </Statusmeldung>
      ) : null}
      {fehler.length > 0 ? <Fehlschlaege fehler={fehler} /> : null}

      {ausgestellt.length > 0 ? (
        <ListRows rahmen={false}>
          {ausgestellt.map((rechnung) => (
            <ListRow
              key={rechnung.id}
              to={`/abrechnung/rechnungen/${rechnung.id}`}
              titel={rechnung.nummer}
              meta={rechnung.name}
              betrag={formatEuro(rechnung.betrag, rechnung.waehrung)}
            />
          ))}
        </ListRows>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {ausgestellt.length > 0 ? (
          <ButtonLink to={`/abrechnung/druck?rechnungen=${ids}`}>Alle drucken</ButtonLink>
        ) : null}
        <Button type="button" variant="quiet" onClick={onSchliessen}>
          Schließen
        </Button>
      </div>
    </div>
  );
}
