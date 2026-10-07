import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { formatEuro } from '@/lib/geld';
import {
  angebotAnnehmen,
  KONTEXT_SCHLUESSEL,
  ladeTrainingsangebot,
  trainingsangebotSchluessel,
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
      <Link
        to={PLATTFORM_PFAD}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm print:hidden"
      >
        ← Zur Übersicht
      </Link>
      <h1 className="text-accent text-h3 font-bold">Training nach Ihrer Behandlung</h1>
      {bestaetigung ? (
        <Bestaetigung bestaetigung={bestaetigung} />
      ) : (
        <>
          {angebot.isPending ? <LoadingState label="Das Angebot wird geladen …" /> : null}
          {angebot.isError ? (
            <div className="mt-4">
              <ErrorState
                title="Das Angebot konnte nicht geladen werden."
                description="Bitte die Verbindung prüfen und erneut versuchen."
                onErneut={() => angebot.refetch()}
              />
            </div>
          ) : null}
          {angebot.data === null ? (
            <p className="text-ink mt-4 text-base leading-relaxed">
              Zurzeit liegt kein Angebot der Praxis vor.
            </p>
          ) : null}
          {angebot.data ? (
            <Formular zugang={zugang} angebot={angebot.data} onGebucht={setBestaetigung} />
          ) : null}
        </>
      )}
    </>
  );
}

function Formular({
  zugang,
  angebot,
  onGebucht,
}: {
  zugang: Plattformzugang;
  angebot: Trainingsangebot;
  onGebucht: (bestaetigung: Buchungsbestaetigung) => void;
}) {
  const queryClient = useQueryClient();
  const [freigaben, setFreigaben] = useState<number[]>([]);
  const [kontakt, setKontakt] = useState(false);
  const [einwilligung, setEinwilligung] = useState(false);
  const [frueh, setFrueh] = useState(false);
  const [geprueft, setGeprueft] = useState(false);
  const buchen = useMutation({
    mutationFn: () =>
      angebotAnnehmen(zugang.access_id, {
        angebotId: angebot.id,
        freigaben,
        kontakt,
        einwilligung,
        fruehBeginnen: frueh,
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

  const einwilligungFehlt = geprueft && freigaben.length > 0 && !einwilligung;
  const fruehFehlt = geprueft && angebot.early_start && !frueh;
  const text = EINWILLIGUNGSTEXTE.training_health_data;

  return (
    <>
      <p className="text-ink mt-2 text-base leading-relaxed">
        Die Praxis bietet Ihnen an, nach Ihrer Behandlung mit einem Training weiterzumachen. Das
        Angebot gilt bis {datum(angebot.valid_until)}.
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

      <Section titel="Ihr Paket" rahmen>
        <p className="text-ink text-liste font-medium">{angebot.label}</p>
        <p className="text-ink mt-1 text-base">
          {datum(angebot.starts_on)} bis {datum(angebot.ends_on)}
        </p>
        <p className="text-ink mt-1 text-base">
          <strong>{formatEuro(angebot.price_cents, angebot.currency)}</strong>{' '}
          <span className="text-ink-muted text-sm">
            {steuerHinweis(angebot.vat_included, angebot.tax_rate_permille)}, einmal zu Beginn
          </span>
        </p>
        <ul className="text-ink mt-3 flex list-disc flex-col gap-1 pl-5 text-base leading-relaxed">
          {PAKETINHALT.map((satz) => (
            <li key={satz}>{satz}</li>
          ))}
        </ul>
      </Section>

      {angebot.handover_items.length > 0 || angebot.contact ? (
        <Section
          titel="Aus Ihrer Behandlung"
          rahmen
          hinweis="Kreuzen Sie an, was Ihre Trainer:in wissen darf. Nur das wird ins Training kopiert; alles andere bleibt in Ihrer Behandlungsakte."
        >
          <div className="flex flex-col gap-3">
            {angebot.handover_items.map((angabe, index) => (
              <Checkbox
                key={angabe.title}
                label={<span className="font-medium">{angabe.title}</span>}
                hint={angabe.body}
                checked={freigaben.includes(index + 1)}
                disabled={!angebot.can_accept}
                onChange={(event) =>
                  setFreigaben(
                    event.target.checked
                      ? [...freigaben, index + 1].sort((a, b) => a - b)
                      : freigaben.filter((n) => n !== index + 1),
                  )
                }
              />
            ))}
            {angebot.contact ? (
              <Checkbox
                label={<span className="font-medium">Kontaktdaten</span>}
                hint={kontaktZeile(angebot.contact)}
                checked={kontakt}
                disabled={!angebot.can_accept}
                onChange={(event) => setKontakt(event.target.checked)}
              />
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section titel={text.titel} rahmen>
        <p className="text-ink text-base leading-relaxed">{text.text}</p>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          {FREIWILLIG} {OHNE_NACHTEIL.training}
        </p>
        <div className="mt-3">
          <Checkbox
            label="Ich willige ein."
            checked={einwilligung}
            disabled={!angebot.can_accept}
            error={
              einwilligungFehlt
                ? 'Angaben aus Ihrer Behandlung gehen nur mit dieser Einwilligung ins Training. Bitte einwilligen oder die Häkchen oben entfernen.'
                : undefined
            }
            onChange={(event) => setEinwilligung(event.target.checked)}
          />
        </div>
      </Section>

      <Section titel="Widerrufsbelehrung" rahmen>
        {widerrufsbelehrung(angebot.practice).map((abschnitt) => (
          <div key={abschnitt.titel} className="mt-3 first:mt-0">
            <p className="text-ink text-base font-medium">{abschnitt.titel}</p>
            {abschnitt.absaetze.map((absatz) => (
              <p key={absatz} className="text-ink mt-1 text-sm leading-relaxed">
                {absatz}
              </p>
            ))}
          </div>
        ))}
        <details className="mt-3">
          <summary className="text-accent min-h-11 cursor-pointer py-2 text-base">
            Muster-Widerrufsformular
          </summary>
          {musterformular(angebot.practice).map((zeile) => (
            <p key={zeile} className="text-ink mt-1 text-sm leading-relaxed">
              {zeile}
            </p>
          ))}
        </details>
        {angebot.early_start ? (
          <div className="mt-4">
            <Checkbox
              label={FRUEHER_BEGINN}
              checked={frueh}
              disabled={!angebot.can_accept}
              error={
                fruehFehlt
                  ? `Ihr Training beginnt am ${datum(angebot.starts_on)}, also innerhalb der Widerrufsfrist. Bitte bestätigen – oder die Praxis um einen späteren Beginn bitten.`
                  : undefined
              }
              onChange={(event) => setFrueh(event.target.checked)}
            />
          </div>
        ) : null}
      </Section>

      {angebot.can_accept ? (
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-ink-muted max-w-prose text-sm leading-relaxed">{AKTE_ERFAEHRT}</p>
          {buchen.isError ? (
            <Statusmeldung ton="fehler">{buchen.error.message}</Statusmeldung>
          ) : null}
          <div>
            <Button
              disabled={buchen.isPending}
              onClick={() => {
                setGeprueft(true);
                if ((freigaben.length > 0 && !einwilligung) || (angebot.early_start && !frueh))
                  return;
                buchen.mutate();
              }}
            >
              {buchen.isPending ? 'Wird gebucht …' : BUCHEN}
            </Button>
          </div>
        </div>
      ) : null}
    </>
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
