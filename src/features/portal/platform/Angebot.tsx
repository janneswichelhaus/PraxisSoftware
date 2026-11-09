import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { schrittText } from '@/components/ui/abfolge';
import { formatEuro } from '@/lib/geld';
import {
  KONTEXT_SCHLUESSEL,
  trainingsangebotSchluessel,
  angebotAnnehmen,
  ladeTrainingsangebot,
  type Buchungsbestaetigung,
  type Plattformzugang,
  type Trainingsangebot,
} from './api';
import { EINWILLIGUNGSTEXTE, FREIWILLIG, OHNE_NACHTEIL } from './einwilligungstexte';
import { PAKETINHALT, steuerHinweis } from './paketbedingungen';
import { PLATTFORM_PFAD } from './pfade';
import {
  AKTE_ERFAEHRT,
  ANGEBOTSHINDERNIS,
  BUCHEN,
  FRUEHER_BEGINN,
  musterformular,
  VERTRAGSFASSUNG,
  widerrufsbelehrung,
} from './vertragstexte';
import { datum, uhrzeit } from './zeit';

/**
 * „Training nach Ihrer Behandlung" (KND-003, PROJECT_PRINCIPLES.md 4.10).
 *
 * Das Angebot aus dem Abschlussgespräch, im eigenen Konto: Paket, Zeitraum
 * und Gesamtpreis, die Bedingungen, die Widerrufsbelehrung, die eigene
 * Einwilligung und – einzeln zum Freigeben – was die Praxis aus der
 * Behandlung mitgeben würde. Ins Training kommt nur, was die Person hier
 * ankreuzt (ADR-021 Punkt 7). Der Vertrag entsteht mit „Zahlungspflichtig
 * buchen" (§ 312j Abs. 3 BGB); danach steht sofort die Bestätigung da.
 *
 * Annehmen kann nur die Person selbst (ANN-289); ob sie es gerade kann, sagt
 * der Server (`can_accept`, `blocker`).
 */
export function Angebot({ zugang }: { zugang: Plattformzugang }) {
  const angebot = useQuery({
    queryKey: trainingsangebotSchluessel(zugang.access_id),
    queryFn: () => ladeTrainingsangebot(zugang.access_id),
  });
  const [bestaetigung, setBestaetigung] = useState<Buchungsbestaetigung | null>(null);

  return (
    <>
      <Rueckweg standard={PLATTFORM_PFAD} beschriftung="Zur Übersicht" className="print:hidden" />
      <PageHeader title="Training nach Ihrer Behandlung" />
      {bestaetigung ? (
        <Bestaetigung bestaetigung={bestaetigung} />
      ) : (
        <>
          {angebot.isPending ? <LoadingState label="Das Angebot wird geladen …" inKarte /> : null}
          {angebot.isError ? (
            <div>
              <ErrorState title="Angebot nicht geladen." onErneut={() => angebot.refetch()} />
            </div>
          ) : null}
          {angebot.data === null ? <EmptyState markenform title="Zurzeit kein Angebot" /> : null}
          {angebot.data ? (
            <Formular zugang={zugang} angebot={angebot.data} onGebucht={setBestaetigung} />
          ) : null}
        </>
      )}
    </>
  );
}

type Abschlussseite = 'freigaben' | 'widerruf' | 'pruefen';

/**
 * Die Seite des Angebots: Paket und Preis, was enthalten ist, und der Weg in
 * den geführten Abschluss (ANN-857). Wer nicht buchen kann, liest hier trotzdem
 * alles, die Widerrufsbelehrung im Aufklapper.
 */
function Formular({
  zugang,
  angebot,
  onGebucht,
}: {
  zugang: Plattformzugang;
  angebot: Trainingsangebot;
  onGebucht: (bestaetigung: Buchungsbestaetigung) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [wahl, setWahl] = useState<Wahl>({
    freigaben: [],
    kontakt: false,
    einwilligung: false,
    frueh: false,
  });
  const annehmbar = angebot.can_accept;

  return (
    <>
      <p className="text-ink text-base leading-relaxed">
        Das Angebot gilt bis {datum(angebot.valid_until)}.
      </p>

      {angebot.blocker ? (
        <Statusmeldung className="mt-4" ton="neutral">
          {ANGEBOTSHINDERNIS[angebot.blocker] ??
            'Das Angebot kann gerade nicht angenommen werden. Bitte sprechen Sie die Praxis an.'}
        </Statusmeldung>
      ) : !angebot.can_accept ? (
        <Statusmeldung className="mt-4" ton="neutral">
          Den Vertrag schließt {zugang.represented_name ?? 'die Person'} selbst in ihrem Konto oder
          in der Praxis.
        </Statusmeldung>
      ) : null}

      <Section titel="Ihr Paket">
        <Paketkopf angebot={angebot} />
      </Section>

      <div className="mt-6">
        <Disclosure summary="Bedingungen">
          <ul className="text-ink flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed">
            {PAKETINHALT.map((satz) => (
              <li key={satz}>{satz}</li>
            ))}
          </ul>
        </Disclosure>
      </div>

      {annehmbar ? (
        <div className="mt-10 [[data-rechner]_&]:mt-12">
          <Button className="w-full sm:w-auto" onClick={() => setOffen(true)}>
            Angebot prüfen und buchen
          </Button>
        </div>
      ) : (
        <div className="mt-8">
          <Disclosure summary="Widerrufsbelehrung lesen">
            <Belehrung angebot={angebot} />
          </Disclosure>
        </div>
      )}

      {offen && annehmbar ? (
        <Abschluss
          zugang={zugang}
          angebot={angebot}
          wahl={wahl}
          setWahl={setWahl}
          onSchliessen={() => setOffen(false)}
          onGebucht={(bestaetigung) => {
            setOffen(false);
            onGebucht(bestaetigung);
          }}
        />
      ) : null}
    </>
  );
}

interface Wahl {
  freigaben: number[];
  kontakt: boolean;
  einwilligung: boolean;
  frueh: boolean;
}

function Paketkopf({ angebot }: { angebot: Trainingsangebot }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-ink text-liste font-semibold">{angebot.label}</p>
      <p className="text-ink text-gruss [[data-rechner]_&]:text-gruss-rechner tabular-nums">
        {formatEuro(angebot.price_cents, angebot.currency)}
      </p>
      <p className="text-ink-muted text-sm">
        {steuerHinweis(angebot.vat_included, angebot.tax_rate_permille)}, einmal zu Beginn
      </p>
      <p className="text-ink text-base">
        {datum(angebot.starts_on)} bis {datum(angebot.ends_on)}
      </p>
    </div>
  );
}

function Belehrung({ angebot }: { angebot: Trainingsangebot }) {
  return (
    <>
      {widerrufsbelehrung(angebot.practice).map((abschnitt) => (
        <div key={abschnitt.titel} className="mt-4 first:mt-0">
          <p className="text-ink text-base font-semibold">{abschnitt.titel}</p>
          {abschnitt.absaetze.map((absatz) => (
            <p key={absatz} className="text-ink mt-2 text-base leading-relaxed">
              {absatz}
            </p>
          ))}
        </div>
      ))}
      <div className="mt-4">
        <Disclosure summary="Muster-Widerrufsformular">
          {musterformular(angebot.practice).map((zeile) => (
            <p key={zeile} className="text-ink mt-1 text-base leading-relaxed">
              {zeile}
            </p>
          ))}
        </Disclosure>
      </div>
    </>
  );
}

/**
 * Der Abschluss als geführter Ablauf (ANN-857): eine Frage je Seite,
 * zuletzt die Übersicht mit Betrag direkt über „Zahlungspflichtig buchen“
 * (§ 312j Abs. 2 und 3 BGB). Die Wahl bleibt beim Schließen erhalten.
 */
function Abschluss({
  zugang,
  angebot,
  wahl,
  setWahl,
  onSchliessen,
  onGebucht,
}: {
  zugang: Plattformzugang;
  angebot: Trainingsangebot;
  wahl: Wahl;
  setWahl: (wahl: Wahl) => void;
  onSchliessen: () => void;
  onGebucht: (bestaetigung: Buchungsbestaetigung) => void;
}) {
  const queryClient = useQueryClient();
  const mitFreigaben = angebot.handover_items.length > 0 || angebot.contact !== null;
  // Freigaben und Einwilligung auf einer Seite: Die Meldung zur fehlenden Einwilligung zeigt
  // auf Häkchen, die man sieht.
  const folge: Abschlussseite[] = ['freigaben', 'widerruf', 'pruefen'];
  const [index, setIndex] = useState(0);
  const [geprueft, setGeprueft] = useState(false);
  const seite = folge[index]!;
  // Die Meldung unter dem Kästchen nicht hinter dem festen Fuß lassen.
  const meldung = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (geprueft) meldung.current?.scrollIntoView?.({ block: 'center' });
  }, [geprueft]);
  const buchen = useMutation({
    mutationFn: () =>
      angebotAnnehmen(zugang.access_id, {
        angebotId: angebot.id,
        freigaben: wahl.freigaben,
        kontakt: wahl.kontakt,
        einwilligung: wahl.einwilligung,
        fruehBeginnen: wahl.frueh,
        fassung: VERTRAGSFASSUNG,
      }),
    onSuccess: async (bestaetigung) => {
      onGebucht(bestaetigung);
      window.scrollTo?.({ top: 0 });
      // Der neue Bereich „Training" erscheint im Schalter (ADR-023 Punkt 4).
      await queryClient.invalidateQueries({ queryKey: KONTEXT_SCHLUESSEL });
      await queryClient.invalidateQueries({
        queryKey: trainingsangebotSchluessel(zugang.access_id),
      });
    },
  });

  const einwilligungFehlt = wahl.freigaben.length > 0 && !wahl.einwilligung;
  const fruehFehlt = angebot.early_start && !wahl.frueh;
  const text = EINWILLIGUNGSTEXTE.training_health_data;
  const uebernommen = [
    ...angebot.handover_items
      .filter((_, i) => wahl.freigaben.includes(i + 1))
      .map((angabe) => angabe.title),
    ...(wahl.kontakt ? ['Kontaktdaten'] : []),
  ];

  function aendern(ziel: number) {
    buchen.reset();
    setIndex(ziel);
  }

  function weiterGehen() {
    if ((seite === 'freigaben' && einwilligungFehlt) || (seite === 'widerruf' && fruehFehlt)) {
      setGeprueft(true);
      return;
    }
    setGeprueft(false);
    setIndex(index + 1);
  }

  const titel =
    seite === 'freigaben'
      ? mitFreigaben
        ? 'Was darf Ihre Trainer:in wissen?'
        : text.titel
      : seite === 'widerruf'
        ? 'Widerrufsbelehrung'
        : 'Ist alles richtig?';

  return (
    <GefuehrterAblauf
      titel={titel}
      objekt="Training buchen"
      schliessen="Schließen"
      onSchliessen={onSchliessen}
      seite={seite}
      stand={{ text: schrittText(index + 1, folge.length), wert: index + 1, von: folge.length }}
      onZurueck={
        index > 0
          ? () => {
              setGeprueft(false);
              buchen.reset();
              setIndex(index - 1);
            }
          : undefined
      }
      abschluss={seite === 'pruefen'}
      balkenJeSchritt
      plattform
      schmalesFenster
      fuss={
        seite === 'pruefen' ? (
          <Formularfuss
            dicht
            zusatz={
              <>
                {AKTE_ERFAEHRT}
                {buchen.isError ? (
                  <Statusmeldung ton="fehler" className="mt-3">
                    {buchen.error.message}
                  </Statusmeldung>
                ) : null}
              </>
            }
          >
            <Button className="w-full" disabled={buchen.isPending} onClick={() => buchen.mutate()}>
              {buchen.isPending ? 'Wird gebucht …' : BUCHEN}
            </Button>
          </Formularfuss>
        ) : (
          <Button className="w-full" onClick={weiterGehen}>
            Weiter
          </Button>
        )
      }
    >
      {seite === 'freigaben' ? (
        <>
          {mitFreigaben ? (
            <>
              <p className="text-ink text-base leading-relaxed">
                Nur was Sie ankreuzen, wird ins Training kopiert; alles andere bleibt in Ihrer
                Behandlungsakte.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {angebot.handover_items.map((angabe, i) => (
                  <Checkbox
                    key={angabe.title}
                    label={<span className="font-medium">{angabe.title}</span>}
                    hint={angabe.body}
                    checked={wahl.freigaben.includes(i + 1)}
                    onChange={(event) =>
                      setWahl({
                        ...wahl,
                        freigaben: event.target.checked
                          ? [...wahl.freigaben, i + 1].sort((x, y) => x - y)
                          : wahl.freigaben.filter((n) => n !== i + 1),
                      })
                    }
                  />
                ))}
                {angebot.contact ? (
                  <Checkbox
                    label={<span className="font-medium">Kontaktdaten</span>}
                    hint={kontaktZeile(angebot.contact)}
                    checked={wahl.kontakt}
                    onChange={(event) => setWahl({ ...wahl, kontakt: event.target.checked })}
                  />
                ) : null}
              </div>
              <div className="mt-8">
                <Zwischentitel stufe="abschnitt">{text.titel}</Zwischentitel>
              </div>
            </>
          ) : null}
          <p className={`text-ink text-base leading-relaxed ${mitFreigaben ? 'mt-2' : ''}`}>
            {text.text}
          </p>
          <p className="text-ink-muted mt-2 text-base leading-relaxed">
            {FREIWILLIG} {OHNE_NACHTEIL.training}
          </p>
          <div className="mt-4" ref={meldung}>
            <Checkbox
              label="Ich willige ein."
              checked={wahl.einwilligung}
              error={
                geprueft && einwilligungFehlt
                  ? 'Angaben aus Ihrer Behandlung gehen nur mit dieser Einwilligung ins Training. Bitte einwilligen oder die Häkchen oben entfernen.'
                  : undefined
              }
              onChange={(event) => setWahl({ ...wahl, einwilligung: event.target.checked })}
            />
          </div>
        </>
      ) : seite === 'widerruf' ? (
        <>
          <Belehrung angebot={angebot} />
          {angebot.early_start ? (
            <div className="mt-6" ref={meldung}>
              <Checkbox
                label={FRUEHER_BEGINN}
                checked={wahl.frueh}
                error={
                  geprueft && fruehFehlt
                    ? `Ihr Training beginnt am ${datum(angebot.starts_on)}, also innerhalb der Widerrufsfrist. Bitte bestätigen – oder die Praxis um einen späteren Beginn bitten.`
                    : undefined
                }
                onChange={(event) => setWahl({ ...wahl, frueh: event.target.checked })}
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <Paketkopf angebot={angebot} />
          <dl className="border-line mt-4 flex flex-col gap-3 border-y py-4 text-base">
            <Angabe titel="Ins Training übernommen" onAendern={() => aendern(0)}>
              {uebernommen.length > 0 ? uebernommen.join(', ') : 'nichts aus Ihrer Behandlung'}
            </Angabe>
            <Angabe titel="Einwilligung zu Gesundheitsangaben" onAendern={() => aendern(0)}>
              {wahl.einwilligung ? 'erteilt' : 'nicht erteilt'}
            </Angabe>
            <Angabe titel="Widerruf" onAendern={() => aendern(1)}>
              {angebot.withdrawal_days} Tage ab dem Buchen
              {wahl.frueh ? '; Beginn vor Ende der Frist verlangt' : ''}
            </Angabe>
          </dl>
          <ul className="text-ink mt-4 flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed">
            {PAKETINHALT.map((satz) => (
              <li key={satz}>{satz}</li>
            ))}
          </ul>
        </>
      )}
    </GefuehrterAblauf>
  );
}

function Angabe({
  titel,
  onAendern,
  children,
}: {
  titel: string;
  onAendern: () => void;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
      <div className="min-w-0">
        <dt className="text-ink-muted">{titel}</dt>
        <dd className="text-ink">{children}</dd>
      </div>
      <Button variant="quiet" groesse="kompakt" className="-mr-3" onClick={onAendern}>
        Ändern<span className="sr-only">: {titel}</span>
      </Button>
    </div>
  );
}

function kontaktZeile(kontakt: NonNullable<Trainingsangebot['contact']>): string {
  return [
    kontakt.date_of_birth ? `geboren ${datum(kontakt.date_of_birth)}` : null,
    [kontakt.street, kontakt.house_number].filter(Boolean).join(' ') || null,
    [kontakt.postal_code, kontakt.city].filter(Boolean).join(' ') || null,
    kontakt.phone,
    kontakt.email,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Die Bestätigung, sofort und zum Ausdrucken oder Speichern (§ 312f BGB, ANN-288). */
function Bestaetigung({ bestaetigung: b }: { bestaetigung: Buchungsbestaetigung }) {
  return (
    <div role="status">
      <Section titel="Ihr Trainingsvertrag ist geschlossen" rahmen>
        <p className="text-ink text-base leading-relaxed">
          Gebucht am {datum(b.concluded_at)} um {uhrzeit(b.concluded_at)} Uhr: {b.label},{' '}
          {datum(b.starts_on)} bis {datum(b.ends_on)}, {formatEuro(b.price_cents, b.currency)}.
        </p>
        <p className="text-ink mt-2 text-base leading-relaxed">
          Sie können diesen Vertrag bis zum <strong>{datum(b.withdrawal_ends_on)}</strong> ohne
          Angabe von Gründen widerrufen – unter „Ich“ → „Trainingsvertrag“.
          {b.early_start_requested
            ? ' Sie haben verlangt, dass das Training schon vorher beginnt.'
            : ''}
        </p>
        <p className="text-ink-muted mt-2 text-base leading-relaxed">
          {b.released_titles.length > 0 || b.contact_released
            ? `Ins Training übernommen: ${[...b.released_titles, ...(b.contact_released ? ['Kontaktdaten'] : [])].join(', ')}.`
            : 'Aus Ihrer Behandlung wurde nichts ins Training übernommen.'}{' '}
          {b.health_consent_granted
            ? 'Ihre Einwilligung zu Gesundheitsangaben im Training ist vermerkt.'
            : ''}
        </p>
        <p className="text-ink-muted mt-2 text-base leading-relaxed">
          Diese Bestätigung steht auch unter „Ich“ → „Trainingsvertrag“. Sie können sie ausdrucken
          oder als PDF speichern.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            Bestätigung drucken
          </Button>
          <Textlink alleinstehend to={`${PLATTFORM_PFAD}?bereich=training`}>
            Zum Training →
          </Textlink>
        </div>
      </Section>
    </div>
  );
}
