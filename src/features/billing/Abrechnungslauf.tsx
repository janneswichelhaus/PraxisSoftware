import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Card } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
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
import { entwurfImLauf, jeKreis, laufKandidaten } from './lauf';

/**
 * Die Monatsabrechnung in einem Lauf (Bereichsüberholung 4, K13: ≤ 3 Tipps).
 *
 *   1. **„Abrechnungslauf starten“** legt zu jeder fertigen Zeile aus
 *      „Abzurechnen“ den Entwurf an und zeigt die fertigen Entwürfe als
 *      Prüfliste: Person, Empfänger, Betrag. Was fertig ist, sagt `lauf.ts`
 *      (ANN-544) - an der Zeile wie am Entwurf: Ein von Hand angelegter
 *      Entwurf zu einer laufenden Verordnung und eine Korrektur bleiben
 *      einzeln.
 *   2. **„n Rechnungen ausstellen“** öffnet die Rückfrage mit den Werten, die
 *      vorher niemand noch einmal ansieht (BEF-063): Anzahl, Summe, Nummern.
 *   3. **„Ja, …“** stellt jede Rechnung einzeln über `issue_invoice` aus. Ein
 *      Fehlschlag - etwa eine unvollständige Anschrift - hält die übrigen
 *      nicht auf; er steht danach mit dem Weg dorthin, wo es zu ergänzen ist.
 *
 * Danach „Alle drucken“: ein Blatt je Rechnung in einem Druckauftrag. Der
 * Stand ist der Server: Wer zwischendurch die Seite verlässt, findet die
 * Entwürfe beim nächsten Lauf wieder.
 */

/** Was nicht geklappt hat - je Rechnung ein Satz und, wo es ihn gibt, der Weg. */
interface Fehlschlag {
  name: string;
  text: string;
  weg?: { to: string; text: string } | undefined;
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

function summe(betraege: readonly number[]): number {
  return betraege.reduce((a, b) => a + b, 0);
}

function rechnungenText(anzahl: number): string {
  return anzahl === 1 ? 'Eine Rechnung' : `${anzahl} Rechnungen`;
}

/**
 * Wohin ein Fehlschlag beim Ausstellen führt: Fehlt die Anschrift der Person
 * selbst, zu ihren Stammdaten - sonst zum Entwurf, an dem der Empfänger hängt.
 */
function wegZu(rechnung: Rechnung, grund: unknown): Fehlschlag['weg'] {
  if (grund instanceof AnschriftUnvollstaendig && rechnung.recipient_kind === 'self') {
    if (rechnung.patient_id) {
      return { to: `/patienten/${rechnung.patient_id}/stammdaten`, text: 'Zu den Stammdaten' };
    }
    if (rechnung.training_relationship_id) {
      return { to: `/training/${rechnung.training_relationship_id}`, text: 'Zum Training' };
    }
  }
  return { to: `/abrechnung/rechnungen/${rechnung.id}`, text: 'Zum Entwurf' };
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
    // ANN-544 auch am Entwurf: nur Fertiges in den Lauf.
    select: (liste: Rechnung[]) => liste.filter((r) => entwurfImLauf(r, heute)),
    enabled: darfAusstellen,
  });
  // Ein Termin ohne erfasste Leistung fehlt sonst stumm im Lauf.
  const ohneLeistung = useQuery({
    queryKey: ['abrechnung-offene-termine'],
    queryFn: fetchOffeneTermine,
    retry: false,
    enabled: darfAusstellen,
  });

  // Nach jedem Schritt steht der Fokus auf dem, was jetzt gilt - sonst fiele
  // er mit dem verschwundenen Knopf an den Seitenanfang.
  useEffect(() => {
    if (phase.art !== 'bereit') meldung.current?.focus();
  }, [phase.art]);

  if (!darfAusstellen) return null;

  const neu = laufKandidaten(kandidaten, heute);
  // Ohne Fertiges kein Abschnitt - es sei denn, die Entwürfe ließen sich
  // nicht laden: Das sagt der Abschnitt, statt stumm zu fehlen.
  if (
    phase.art === 'bereit' &&
    neu.length === 0 &&
    !entwuerfe.isError &&
    (entwuerfe.isPending || (entwuerfe.data ?? []).length === 0)
  ) {
    return null;
  }

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
            text:
              grund instanceof Error
                ? grund.message
                : 'Die Rechnung konnte nicht ausgestellt werden.',
            weg: wegZu(rechnung, grund),
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
            <Abfragezustand
              abfrage={entwuerfe}
              laden="Entwürfe werden geladen …"
              fehler="Die Entwürfe konnten nicht geladen werden."
            >
              {(stehend) => (
                <Bereit
                  anzahl={neu.length + stehend.length}
                  betrag={summe([
                    ...neu.map((k) => k.total_cents),
                    ...stehend.map((r) => r.total_cents),
                  ])}
                  ohneLeistung={ohneLeistung.data?.length ?? 0}
                  onStarten={() => void starten()}
                />
              )}
            </Abfragezustand>
          ) : phase.art === 'anlegen' ? (
            <Statusmeldung>
              <span aria-live="polite">
                Entwürfe werden angelegt … {phase.fertig} von {phase.gesamt}
              </span>
            </Statusmeldung>
          ) : phase.art === 'pruefen' ? (
            <Abfragezustand
              abfrage={entwuerfe}
              laden="Entwürfe werden geladen …"
              fehler="Die Entwürfe konnten nicht geladen werden."
            >
              {(liste) => (
                <Pruefliste
                  liste={liste}
                  fehler={phase.fehler}
                  onAusstellen={(auswahl) => ausstellen(auswahl)}
                />
              )}
            </Abfragezustand>
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
  onStarten,
}: {
  anzahl: number;
  betrag: number;
  ohneLeistung: number;
  onStarten: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-liste">
        <span className="font-semibold">{rechnungenText(anzahl)} bereit</span> ·{' '}
        <span className="tabular-nums">{formatEuro(betrag)}</span>
      </p>
      {ohneLeistung > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-ink-muted text-sm">
            {ohneLeistung === 1
              ? 'Ein Termin ist noch ohne Leistung.'
              : `${ohneLeistung} Termine sind noch ohne Leistung.`}
          </p>
          <ButtonLink to="/abrechnung/leistungen" variant="quiet" groesse="kompakt">
            Erfassen
          </ButtonLink>
        </div>
      ) : null}
      <div>
        <Button type="button" onClick={onStarten} className="w-full sm:w-auto">
          Abrechnungslauf starten
        </Button>
      </div>
    </div>
  );
}

function Pruefliste({
  liste,
  fehler,
  onAusstellen,
}: {
  liste: Rechnung[];
  fehler: Fehlschlag[];
  onAusstellen: (liste: readonly Rechnung[]) => Promise<void>;
}) {
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
        <ListRows rahmen={false} beschriftung="Entwürfe des Laufs">
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

      {liste.length > 0 ? (
        <div>
          <Rueckfrage
            ausloeser={`${rechnungenText(liste.length)} ausstellen`}
            ausloeserVariante="primary"
            bezeichnung="Rechnungen ausstellen – Rückfrage"
            bestaetigen={`Ja, ${liste.length === 1 ? 'eine Rechnung' : `${liste.length} Rechnungen`} ausstellen`}
            bestaetigenLaeuft="Wird ausgestellt …"
            abbrechen="Noch nicht ausstellen"
            onBestaetigen={() => onAusstellen(liste)}
          >
            <p className="font-medium">
              {liste.length === 1
                ? 'Diese Rechnung jetzt ausstellen?'
                : `Diese ${liste.length} Rechnungen jetzt ausstellen?`}
            </p>
            <DetailList schmal>
              <DetailRow label="Summe">{formatEuro(gesamt)}</DetailRow>
              <DetailRow label="Rechnungsnummern">
                {[
                  kreise.therapy > 0 ? `${kreise.therapy} für Behandlung` : null,
                  kreise.training > 0 ? `${kreise.training} für Training` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </DetailRow>
            </DetailList>
            <p className="mt-2">
              Danach ist jede Rechnung unveränderlich; eine Korrektur geht nur über Storno und neue
              Rechnung. Ohne Ausstellen bleiben die Entwürfe stehen.
            </p>
          </Rueckfrage>
        </div>
      ) : null}
    </div>
  );
}

/** Was nicht geklappt hat: je Person eine Zeile, der Weg als Aktion daneben. */
function Fehlschlaege({ fehler }: { fehler: Fehlschlag[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Statusmeldung ton="fehler">
        {fehler.length === 1 ? 'Eine Rechnung fehlt.' : `${fehler.length} Rechnungen fehlen.`}
      </Statusmeldung>
      <ListRows rahmen={false} beschriftung="Nicht ausgestellt">
        {fehler.map((f, index) => (
          <ListRow
            key={`${f.name}-${index}`}
            titel={f.name}
            meta={f.text}
            aktion={
              f.weg ? (
                <ButtonLink to={f.weg.to} variant="secondary">
                  {f.weg.text}
                </ButtonLink>
              ) : undefined
            }
          />
        ))}
      </ListRows>
    </div>
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
          {rechnungenText(ausgestellt.length)} ausgestellt ·{' '}
          {formatEuro(summe(ausgestellt.map((r) => r.betrag)))}
        </Statusmeldung>
      ) : null}
      {ohneStammdaten ? (
        <div className="flex flex-col gap-2">
          <Statusmeldung ton="fehler">
            Es sind keine Praxisstammdaten erfasst; ohne sie lässt sich keine Rechnung ausstellen.
            Die Entwürfe bleiben stehen.
          </Statusmeldung>
          <div>
            <ButtonLink to="/abrechnung/stammdaten" variant="secondary">
              Zu den Praxisstammdaten
            </ButtonLink>
          </div>
        </div>
      ) : null}
      {fehler.length > 0 ? <Fehlschlaege fehler={fehler} /> : null}

      {ausgestellt.length > 0 ? (
        <ListRows rahmen={false} beschriftung="Ausgestellt">
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
