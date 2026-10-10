import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { canManageInvoicing, type CurrentUser } from '@/features/session/types';
import {
  bereichLabels,
  createEntwurf,
  erstelleKorrektur,
  fetchKandidaten,
  fetchOffenePosten,
  type Kandidat,
  type OffenerPosten,
} from './api';
import { klammerText, monatsname, zeitraumText } from './anzeige';
import { Zahlungsformular, type Buchung } from './Zahlungsformular';
import { Rechnungsliste } from './Rechnungsliste';

/**
 * Rechnungen (ABR-003).
 *
 * Die Seite hat zwei Hälften, weil es zwei Fragen sind: **Was ist
 * abzurechnen** und **was ist abgerechnet**.
 *
 * Oben stehen die erfassten Leistungen, die auf keiner Rechnung stehen —
 * gebündelt nach Person und Kalendermonat. Ein Entwurf nimmt immer alle
 * offenen Leistungen dieses Monats auf; eine Auswahl einzelner Zeilen wäre
 * die Gelegenheit, eine Leistung zu übersehen, und genau das schließt
 * ADR-009 Punkt 4 aus.
 *
 * Unten stehen die Rechnungen. Ein Entwurf trägt keine Nummer und lässt sich
 * folgenlos verwerfen; eine ausgestellte Rechnung ist unveränderlich, und
 * ihre Korrektur läuft über Storno und Neuausstellung — die baut
 * ABR-EPIC-002b.
 *
 * **Seit ABR-004 stehen die offenen Posten ganz oben**, vor allem anderen und
 * ohne einen einzigen Tap (`OPTIMIERUNG.md`: „Offene Posten sehen: 0 Taps auf
 * der Einstiegsseite"). Gebucht wird an derselben Zeile — die Rechnung, um
 * die es geht, steht dabei im Blick.
 */

/**
 * Anzahl und Summe der offenen Posten - beide vom Server, über alle Posten,
 * auch wenn die Liste gekürzt ist (ABR-033, BEF-061 Option 1). Bis hierher
 * stand die gekürzte Anzahl neben der ungekürzten Summe.
 */
function postenHinweis(posten: OffenerPosten[]): string {
  const erster = posten[0]!;
  const gesamt = erster.total_count ?? posten.length;
  const anzahl = gesamt === 1 ? 'Eine Rechnung' : `${gesamt} Rechnungen`;
  const summe = `${formatEuro(erster.open_total_cents, erster.currency)} offen`;
  return posten.length < gesamt
    ? `${anzahl} · ${summe} · die ${posten.length} am frühesten fälligen stehen hier`
    : `${anzahl} · ${summe}`;
}

/** Die Meldung nach einer Buchung am Posten - dort, wo das Formular stand. */
interface Buchungsmeldung {
  text: string;
  /** Zählt mit, damit auch eine gleichlautende zweite Meldung den Fokus holt. */
  nummer: number;
}

export function InvoicesPage({ user }: { user: CurrentUser }) {
  const darfAusstellen = canManageInvoicing(user.roles);
  const [buchung, setBuchung] = useState<Buchungsmeldung | null>(null);
  const meldung = useRef<HTMLDivElement>(null);

  const posten = useQuery({
    queryKey: ['offene-posten'],
    queryFn: fetchOffenePosten,
    retry: false,
  });

  const kandidaten = useQuery({
    queryKey: ['rechnungs-kandidaten'],
    queryFn: fetchKandidaten,
    retry: false,
  });

  // Nach der Buchung schließt das Formular, und ein vollständig bezahlter
  // Posten verschwindet ganz. Ohne Meldung am Ort fiele der Fokus an den
  // Seitenanfang, und ob die Buchung ankam, wäre zu erschließen (ABR-10).
  useEffect(() => {
    if (buchung) meldung.current?.focus();
  }, [buchung]);

  return (
    <>
      <PageHeader
        title="Rechnungen"
        description="Privatrechnungen aus erfassten Leistungen, je Person und Verordnung."
      />

      <Section
        titel="Offene Posten"
        hinweis={
          // Die Summe kommt vom Server und steht an jeder Zeile: Sie gilt für
          // alle offenen Posten, auch wenn die Liste gekürzt ist. Hier wird
          // deshalb nichts aufaddiert.
          posten.data && posten.data.length > 0
            ? postenHinweis(posten.data)
            : // Ohne offene Posten erklärt die Leermeldung den Abschnitt (UX-005i).
              undefined
        }
      >
        {buchung ? (
          <div ref={meldung} tabIndex={-1} className="mb-3 outline-none">
            <Statusmeldung ton="erfolg">{buchung.text}</Statusmeldung>
          </div>
        ) : null}

        {posten.isPending ? <LoadingState label="Offene Posten werden geladen …" /> : null}
        {posten.isError ? (
          <ErrorState
            title="Die offenen Posten konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => posten.refetch()}
          />
        ) : null}
        {posten.data && posten.data.length === 0 ? (
          <EmptyState title="Nichts offen" description="Jede ausgestellte Rechnung ist bezahlt." />
        ) : null}

        <ul className="flex flex-col gap-3">
          {(posten.data ?? []).map((eintrag) => (
            <li key={eintrag.id}>
              <PostenKarte
                posten={eintrag}
                darfBuchen={darfAusstellen}
                zeitzone={user.organizationTimeZone}
                onGebucht={(text) =>
                  setBuchung((alt) => ({ text, nummer: (alt?.nummer ?? 0) + 1 }))
                }
              />
            </li>
          ))}
        </ul>
      </Section>

      {/* Ohne Hinweis: Die Karten sagen Person, Monat und Leistungen selbst
          (UX-005i). */}
      <Section titel="Abzurechnen">
        {kandidaten.isPending ? <LoadingState label="Leistungen werden geladen …" /> : null}
        {kandidaten.isError ? (
          <ErrorState
            title="Die abzurechnenden Leistungen konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => kandidaten.refetch()}
          />
        ) : null}
        {kandidaten.data && kandidaten.data.length === 0 ? (
          <EmptyState
            title="Nichts abzurechnen"
            description="Jede erfasste Leistung steht auf einer Rechnung."
          />
        ) : null}

        <ul className="flex flex-col gap-3">
          {(kandidaten.data ?? []).map((kandidat) => (
            <li
              key={`${kandidat.patient_id ?? kandidat.training_relationship_id}-${kandidat.period_month}-${kandidat.service_area}`}
            >
              <KandidatenKarte kandidat={kandidat} darfAusstellen={darfAusstellen} />
            </li>
          ))}
        </ul>
      </Section>

      <Rechnungsliste />
    </>
  );
}

/**
 * Ein offener Posten mit dem Weg, ihn zu schließen.
 *
 * Das Formular klappt an der Zeile auf, nicht auf einer eigenen Seite: Damit
 * ist die Buchung drei Taps entfernt — aufklappen, Betrag stehen lassen oder
 * ändern, buchen — und die Rechnung, um die es geht, bleibt dabei im Blick
 * (`OPTIMIERUNG.md`, „Zahlung buchen: ≤ 3 Taps, Teilzahlung ohne Sonderweg").
 *
 * Eine Karte wie jede andere in einer Liste (ABR-33): weiß auf dem Seitengrund
 * statt eines durchsichtigen Eigenbaus. Ihre zwei Aktionen stehen kompakt
 * nebeneinander.
 */
function PostenKarte({
  posten,
  darfBuchen,
  zeitzone,
  onGebucht,
}: {
  posten: OffenerPosten;
  darfBuchen: boolean;
  zeitzone: string | null;
  onGebucht: (meldung: string) => void;
}) {
  const [offen, setOffen] = useState(false);

  function gebucht(buchung: Buchung) {
    setOffen(false);
    const betrag = formatEuro(buchung.betragCent, posten.currency);
    onGebucht(
      buchung.richtung === 'refund'
        ? `Rückzahlung über ${betrag} zu ${posten.invoice_number} gebucht.`
        : `${betrag} zu ${posten.invoice_number} gebucht.`,
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink text-liste font-medium">{posten.invoice_number}</span>
        {posten.overdue ? <Badge ton="kritisch">Überfällig</Badge> : null}
        <span className="text-ink-muted text-sm">{posten.recipient_name}</span>
        <span className="text-ink text-liste ml-auto font-medium tabular-nums">
          {formatEuro(posten.outstanding_cents, posten.currency)}
        </span>
      </div>

      <p className="text-ink-muted mt-1 text-sm">
        {monatsname(posten.period_month)} · zahlbar bis {formatDate(posten.due_on)}
        {posten.paid_cents > 0
          ? ` · ${formatEuro(posten.paid_cents, posten.currency)} von ${formatEuro(
              posten.total_cents,
              posten.currency,
            )} bezahlt`
          : ''}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink
          to={`/abrechnung/rechnungen/${posten.id}`}
          variant="secondary"
          groesse="kompakt"
        >
          Rechnung ansehen
        </ButtonLink>
        {darfBuchen && zeitzone !== null ? (
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => setOffen((wert) => !wert)}
          >
            {offen ? 'Abbrechen' : 'Zahlung buchen'}
          </Button>
        ) : null}
      </div>

      {offen && zeitzone !== null ? (
        <Zahlungsformular
          invoiceId={posten.id}
          offenCent={posten.outstanding_cents}
          eingegangenCent={posten.paid_cents}
          waehrung={posten.currency}
          zeitzone={zeitzone}
          onFertig={gebucht}
        />
      ) : null}
    </Card>
  );
}

/**
 * Ein Monat einer Person, der abzurechnen ist.
 *
 * „Entwurf anlegen" ist hier eine Kartenaktion und kein Hauptknopf (ABR-24):
 * Bei zehn offenen Monaten stünden sonst zehn gefüllte Knöpfe untereinander,
 * und keiner wäre mehr der nächste Schritt.
 */
function KandidatenKarte({
  kandidat,
  darfAusstellen,
}: {
  kandidat: Kandidat;
  darfAusstellen: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // UX-008b (BEF-062, ANN-321): Stammen die Leistungen aus einer stornierten
  // Rechnung, ist ihre Korrekturrechnung der einzige Weg - mit Bezug.
  const storno = kandidat.cancelled_invoice_id;

  const anlegen = useMutation({
    mutationFn: () => (storno ? erstelleKorrektur(storno) : createEntwurf(kandidat)),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['rechnungs-kandidaten'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await navigate(`/abrechnung/rechnungen/${id}`);
    },
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink text-liste font-medium">{kandidat.patient_name}</span>
        {/* ABR-032: Mit Grundlage ist die Verordnung die Klammer, darunter
            der Zeitraum ihrer Leistungen; ohne bleibt es der Monat. */}
        <span className="text-ink-muted text-sm">{klammerText(kandidat)}</span>
        {kandidat.treatment_basis_id &&
        kandidat.first_performed_on &&
        kandidat.last_performed_on ? (
          <span className="text-ink-muted text-sm tabular-nums">
            {zeitraumText({ from: kandidat.first_performed_on, to: kandidat.last_performed_on })}
          </span>
        ) : null}
        {/* ABR-009: Eine Rechnung trägt genau einen Bereich; die Zeile sagt,
            welchen sie meint (ADR-009 Punkt 16). */}
        <span className="text-ink-muted text-sm">{bereichLabels[kandidat.service_area]}</span>
        <span className="text-ink-muted text-sm tabular-nums">
          {kandidat.service_count} {kandidat.service_count === 1 ? 'Leistung' : 'Leistungen'} ·{' '}
          {formatEuro(kandidat.total_cents, kandidat.currency)}
        </span>
        {darfAusstellen && !kandidat.has_draft ? (
          <span className="ml-auto">
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => anlegen.mutate()}
              disabled={anlegen.isPending}
            >
              {anlegen.isPending
                ? 'Wird angelegt …'
                : storno
                  ? 'Korrekturrechnung erstellen'
                  : 'Entwurf anlegen'}
            </Button>
          </span>
        ) : null}
      </div>

      {/* Die Herkunft steht an der Zeile (BEF-062): Wer die Leistungen sieht,
          sieht auch, welche Rechnung sie ersetzen. */}
      {storno ? (
        <p className="text-ink-muted mt-1 text-sm">
          Aus der stornierten Rechnung{' '}
          <Textlink to={`/abrechnung/rechnungen/${storno}`}>
            {kandidat.cancelled_invoice_number ?? 'ohne Nummer'}
          </Textlink>
          {kandidat.has_draft ? '' : ' – die neue Rechnung wird ihre Korrekturrechnung.'}
        </p>
      ) : null}

      {kandidat.has_draft && storno ? (
        <>
          <Statusmeldung className="mt-2">
            Für diesen Zeitraum steht schon ein Entwurf ohne Bezug zur stornierten Rechnung. Bitte
            ihn verwerfen; danach lässt sich hier die Korrekturrechnung erstellen.
          </Statusmeldung>
          {kandidat.draft_id ? (
            <div className="mt-3">
              <ButtonLink
                to={`/abrechnung/rechnungen/${kandidat.draft_id}`}
                variant="secondary"
                groesse="kompakt"
              >
                Zum Entwurf
              </ButtonLink>
            </div>
          ) : null}
        </>
      ) : kandidat.has_draft ? (
        <>
          <Statusmeldung className="mt-2">
            {kandidat.treatment_basis_id
              ? 'Für diese Verordnung steht bereits ein Entwurf.'
              : 'Für diesen Monat und Bereich steht bereits ein Entwurf.'}{' '}
            Diese Leistungen sind später erfasst worden; sie kommen auf eine zweite Rechnung, sobald
            der Entwurf ausgestellt oder verworfen ist.
          </Statusmeldung>
          {/* BEF-018: Der Hinweis führt dorthin - seit UXR-010 als eigene
              Kartenaktion statt als graue Unterstreichung im Satz (ABR-25). */}
          {kandidat.draft_id ? (
            <div className="mt-3">
              <ButtonLink
                to={`/abrechnung/rechnungen/${kandidat.draft_id}`}
                variant="secondary"
                groesse="kompakt"
              >
                Zum Entwurf
              </ButtonLink>
            </div>
          ) : null}
        </>
      ) : null}

      {anlegen.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {/* Meldungen mit eigenem Weg sagen ihn selbst; nur eine Störung
              bekommt den Satz zur Verbindung. */}
          {anlegen.error.message.includes('Bitte')
            ? anlegen.error.message
            : `${anlegen.error.message} Bitte die Verbindung prüfen und erneut versuchen.`}
        </Statusmeldung>
      ) : null}
    </Card>
  );
}
