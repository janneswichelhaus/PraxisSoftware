import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  KeinKatalog,
  KeinTerminhonorar,
  KontingentAusgeschoepft,
  artLabels,
  bereichLabels,
  deleteLeistungen,
  fetchLeistungen,
  fetchOffeneTermine,
  fetchVorschlag,
  nachTerminen,
  recordLeistungen,
  steuerLabels,
  type Leistungsbereich,
  type OffenerTermin,
  type Terminleistungen,
  type Vorschlag,
} from './api';
import { AbomonatZuruecknehmen, FaelligeAbomonate } from './Abomonate';

/**
 * Leistungen (ABR-002).
 *
 * Die Seite hat zwei Hälften, weil es zwei Fragen sind: **Was ist noch zu
 * erfassen** und **was ist erfasst**.
 *
 * Oben stehen die Termine, aus denen eine Leistung entstehen darf — nach
 * PROJECT_PRINCIPLES.md 19 sind das in der Behandlung ausschließlich
 * dokumentierte Termine und Vorgänge mit Gebührenanlass, im Training der
 * durchgeführte Termin (TRN-007, ANN-181). Es gibt keinen Override: Ein
 * Behandlungstermin ohne finalisierte Dokumentation erscheint hier gar nicht
 * erst, und die Seite bietet keinen Weg an ihm vorbei. Welcher Termin hier
 * steht, entscheidet der Server (`app.appointment_is_billable`).
 *
 * Vorgeschlagen sind die Heilmittel der Behandlungsgrundlage; auswählbar ist,
 * was die am **Leistungstag** geltende Preisliste für diesen Anlass hergibt.
 * Beides entscheidet der Server — die Seite zeigt nur, was er anbietet.
 */

/** Der Anlass eines Ausfallhonorars - mit denselben Wörtern wie am Termin (TER-10). */
const anlassLabels: Record<string, string> = {
  late_cancellation: 'Absage weniger als 24 Stunden vorher',
  no_show: 'Nicht angetroffen',
};

/** Die Leistungsakte der Person, dorthin und wieder zurück (ABR-17). */
const LEISTUNGEN = '/abrechnung/leistungen';

export function ServicesPage() {
  const offene = useQuery({
    queryKey: ['abrechnung-offene-termine'],
    queryFn: fetchOffeneTermine,
    retry: false,
  });

  const leistungen = useQuery({
    queryKey: ['abrechnung-leistungen'],
    queryFn: fetchLeistungen,
    retry: false,
  });

  const gruppen = nachTerminen(leistungen.data ?? []);
  // Die Liste liefert alle Stände. „Erfasst" verspricht aber, was noch keiner
  // Rechnung zugeordnet ist; das Abgerechnete steht deshalb eingeklappt
  // darunter (ABR-27). Getrennt wird nach dem Stand, den der Server liefert.
  const offen = gruppen.filter((gruppe) => !gruppe.abgerechnet);
  const abgerechnet = gruppen.filter((gruppe) => gruppe.abgerechnet);

  return (
    <>
      <PageHeader
        title="Leistungen"
        description="Erbrachte Leistungen aus durchgeführten Terminen, Ausfallhonorare und Abo-Monate."
      />

      <Section titel="Zu erfassen">
        {offene.isPending ? <LoadingState label="Termine werden geladen …" /> : null}
        {offene.isError ? (
          <ErrorState
            title="Die offenen Termine konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => offene.refetch()}
          />
        ) : null}
        {offene.data && offene.data.length === 0 ? (
          <EmptyState
            title="Nichts offen"
            description="Zu jedem abrechenbaren Termin sind Leistungen erfasst."
          />
        ) : null}

        <ul className="flex flex-col gap-3">
          {(offene.data ?? []).map((termin) => (
            <li key={termin.appointment_id}>
              <OffenerTerminKarte termin={termin} />
            </li>
          ))}
        </ul>

        {/* Die Regel, welche Termine hier stehen, erklärt das System - sie
            steht zugeklappt unter der Liste (UX-005i). */}
        <div className="max-w-prose">
          <Disclosure summary="Was steht hier?">
            <p className="text-ink-muted text-sm leading-relaxed">
              Dokumentierte Behandlungstermine, Termine mit Ausfallhonorar und durchgeführte
              Trainingstermine. Andere stehen hier nicht: Eine Behandlung ohne finalisierte
              Dokumentation wird nicht abgerechnet, und einen Weg daran vorbei gibt es nicht.
              Trainingstermine im Zeitraum eines Trainingspakets sind mit dem Paket bezahlt und
              stehen hier ebenfalls nicht.
            </p>
          </Disclosure>
        </div>
      </Section>

      {/* ANG-002: die fälligen Monate des Nachsorge-Abos; ohne Abo steht hier nichts. */}
      <FaelligeAbomonate />

      {/* Ein Satz: Was Zurücknehmen verhindert, sagt die Abweisung (UX-005i). */}
      <Section titel="Erfasst" hinweis="Noch nicht abgerechnet." rahmen>
        {leistungen.isPending ? <LoadingState label="Leistungen werden geladen …" /> : null}
        {leistungen.isError ? (
          <ErrorState
            title="Die Leistungen konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => leistungen.refetch()}
          />
        ) : null}
        {leistungen.data && gruppen.length === 0 ? (
          <EmptyState title="Noch keine Leistung erfasst" />
        ) : null}
        {leistungen.data && gruppen.length > 0 && offen.length === 0 ? (
          <EmptyState
            title="Alles abgerechnet"
            description="Jede erfasste Leistung steht auf einer ausgestellten Rechnung."
          />
        ) : null}

        {offen.length > 0 ? (
          <ul className="divide-line divide-y">
            {offen.map((gruppe) => (
              <Leistungsgruppe key={gruppe.schluessel} gruppe={gruppe}>
                <div className="mt-2">
                  {gruppe.appointmentId ? (
                    <Zuruecknehmen appointmentId={gruppe.appointmentId} bereich={gruppe.bereich} />
                  ) : gruppe.zeilen[0]?.item_kind === 'training_package' ? (
                    // ANG-006: Die Leistung gehört zum Paket; eine Fehlanlage
                    // entfernt das Paket mit ihr, am Trainingsverhältnis.
                    <p className="text-ink-muted text-sm">
                      Trainingspaket – eine Fehlanlage wird am Trainingsverhältnis entfernt.
                    </p>
                  ) : (
                    // ANG-002: Ein Abo-Monat hat keinen Termin; zurückgenommen
                    // wird die eine Leistung.
                    <AbomonatZuruecknehmen leistungId={gruppe.zeilen[0]?.id ?? ''} />
                  )}
                </div>
              </Leistungsgruppe>
            ))}
          </ul>
        ) : null}

        {abgerechnet.length > 0 ? (
          <Disclosure
            summary={`Abgerechnet (${abgerechnet.length} ${
              abgerechnet.length === 1 ? 'Termin' : 'Termine'
            })`}
          >
            <p className="text-ink-muted text-sm">
              Bereits abgerechnet. Eine Korrektur läuft über Storno und Neuausstellung.
            </p>
            <ul className="divide-line divide-y">
              {abgerechnet.map((gruppe) => (
                <Leistungsgruppe key={gruppe.schluessel} gruppe={gruppe} />
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </Section>
    </>
  );
}

/** Die Leistungen eines Termins mit ihrer Summe. */
function Leistungsgruppe({ gruppe, children }: { gruppe: Terminleistungen; children?: ReactNode }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ink text-liste font-medium">{gruppe.patientName}</span>
        <span className="text-ink-muted text-sm tabular-nums">
          {formatDate(gruppe.performedOn)}
        </span>
        {/* Der Bereich, nicht eine Warnung (TRN-007): Die Rechnung dazu läuft im
            eigenen Nummernkreis. */}
        {gruppe.bereich === 'training' ? (
          <Badge ton="neutral">{bereichLabels.training}</Badge>
        ) : null}
        <span className="text-ink text-liste ml-auto font-medium tabular-nums">
          {formatEuro(gruppe.summeCent)}
        </span>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {gruppe.zeilen.map((zeile) => (
          <li key={zeile.id} className="text-ink-muted flex flex-wrap gap-x-2 text-sm">
            <span className="tabular-nums">{zeile.quantity} ×</span>
            <span>{zeile.label}</span>
            <span>({zeile.code})</span>
            <span className="tabular-nums">
              {formatEuro(zeile.unit_price_cents, zeile.currency)}
            </span>
            {zeile.session_fee ? <span>· Anteil am Terminhonorar</span> : null}
            <span>· {steuerLabels[zeile.tax_treatment]}</span>
            {/* Eine Art, kein Warnzustand (ABR-16): ohne „!". */}
            {zeile.item_kind === 'absence_fee' ? (
              <Badge ton="neutral">{artLabels.absence_fee}</Badge>
            ) : null}
          </li>
        ))}
      </ul>

      {children}
    </li>
  );
}

/**
 * Eine Erfassung zurücknehmen.
 *
 * Mit Versprechen (ABR-03, ZST-06): Der Kasten bleibt offen, bis der Server
 * geantwortet hat, und zeigt einen Fehlschlag. Vorher schloss er sofort, und
 * eine Abweisung blieb unsichtbar.
 *
 * Der häufigste Grund einer Abweisung ist ein Rechnungsentwurf, auf dem die
 * Leistungen schon stehen - dann ist erst der Entwurf zu verwerfen (ABR-B02).
 * Die Liste sagt nicht, welche Leistungen auf einem Entwurf stehen; die
 * Meldung nennt deshalb beide Wege.
 */
function Zuruecknehmen({
  appointmentId,
  bereich,
}: {
  appointmentId: string;
  bereich: Leistungsbereich;
}) {
  const queryClient = useQueryClient();
  const entfernen = useMutation({
    mutationFn: () => deleteLeistungen(appointmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] });
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-offene-termine'] });
    },
  });

  return (
    <Rueckfrage
      ausloeser="Erfassung zurücknehmen"
      bestaetigen="Zurücknehmen"
      bestaetigenLaeuft="Wird zurückgenommen …"
      laeuft={entfernen.isPending}
      fehler={
        entfernen.isError
          ? `${entfernen.error.message} Stehen die Leistungen schon auf einem Rechnungsentwurf, bitte erst den Entwurf verwerfen; sonst die Verbindung prüfen und erneut versuchen.`
          : undefined
      }
      onBestaetigen={() => entfernen.mutateAsync()}
      onAbbrechen={() => entfernen.reset()}
    >
      {/* Ein Trainingstermin hat keine Behandlungsgrundlage (ADR-022 Punkt 4). */}
      <p>
        {bereich === 'training'
          ? 'Alle Leistungen dieses Termins werden entfernt.'
          : 'Alle Leistungen dieses Termins werden entfernt, und die genutzte Menge der Behandlungsgrundlage geht um denselben Betrag zurück.'}{' '}
        Der Termin steht danach wieder unter „Zu erfassen“.
      </p>
    </Rueckfrage>
  );
}

/**
 * Ein Termin, zu dem Leistungen zu erfassen sind - eine Karte wie jede andere
 * in einer Liste (ABR-33). „Leistungen erfassen" ist eine Kartenaktion und
 * kein Hauptknopf: Bei zehn offenen Terminen stünden sonst zehn gefüllte
 * Knöpfe untereinander (ABR-24).
 */
function OffenerTerminKarte({ termin }: { termin: OffenerTermin }) {
  const [offen, setOffen] = useState(false);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink text-liste font-medium">{termin.patient_name}</span>
        <span className="text-ink-muted text-sm tabular-nums">
          {formatDate(termin.performed_on)}
        </span>
        {termin.service_area === 'training' ? (
          <>
            <Badge ton="neutral">{bereichLabels.training}</Badge>
            <Badge ton="neutral">Durchgeführt</Badge>
          </>
        ) : termin.fee_basis ? (
          <Badge ton="neutral">{anlassLabels[termin.fee_basis] ?? 'Ausfallhonorar'}</Badge>
        ) : // „Dokumentiert" ist der Regelfall unter „Zu erfassen" und trägt
        // kein Abzeichen (UX-005i).
        null}
        {!offen ? (
          <span className="ml-auto">
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => setOffen(true)}
            >
              Leistungen erfassen
            </Button>
          </span>
        ) : null}
      </div>

      {offen ? <Erfassungsformular termin={termin} onFertig={() => setOffen(false)} /> : null}
    </Card>
  );
}

const MENGENFEHLER = 'Bitte eine Zahl von 1 bis 10 eingeben.';

/**
 * Die Menge als ganze Zahl von 1 bis 10 - oder `null`.
 *
 * Dieselbe Grenze wie in der Datenbank (`check quantity between 1 and 10`);
 * verbindlich bleibt die dort. Hier steht sie, damit eine falsche Menge am
 * Feld auffällt statt als „konnten nicht erfasst werden" (ABR-11).
 */
function alsMenge(text: string): number | null {
  const bereinigt = text.trim();
  if (!/^\d{1,2}$/.test(bereinigt)) return null;
  const menge = Number(bereinigt);
  return menge >= 1 && menge <= 10 ? menge : null;
}

function Erfassungsformular({ termin, onFertig }: { termin: OffenerTermin; onFertig: () => void }) {
  const queryClient = useQueryClient();
  const kennung = useId();
  // Die Menge als Text, wie sie im Feld steht (ABR-11). Vorher stand hier eine
  // Zahl mit `|| 1`: Wer die „1" löschte, bekam sofort wieder „1", und die
  // nächste Ziffer machte daraus „13".
  const [mengen, setMengen] = useState<Record<string, string>>({});
  const [mengenfehler, setMengenfehler] = useState<Record<string, string>>({});
  const [gewaehlt, setGewaehlt] = useState<Record<string, boolean> | null>(null);

  const vorschlag = useQuery({
    queryKey: ['abrechnung-vorschlag', termin.appointment_id],
    queryFn: () => fetchVorschlag(termin.appointment_id),
    retry: false,
  });

  // Die Vorbelegung kommt vom Server und wird genau einmal übernommen —
  // danach gehört die Auswahl der Bedienerin.
  const auswahl =
    gewaehlt ??
    Object.fromEntries(
      (vorschlag.data ?? []).map((zeile) => [zeile.catalog_item_id, zeile.suggested]),
    );

  const erfassen = useMutation({
    mutationFn: (positionen: { catalog_item_id: string; quantity: number }[]) =>
      recordLeistungen(termin.appointment_id, positionen),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-offene-termine'] });
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] });
      onFertig();
    },
  });

  if (vorschlag.isPending) return <LoadingState label="Preisliste wird geladen …" />;

  if (vorschlag.error instanceof KeinKatalog) {
    return (
      <div className="mt-3">
        <Statusmeldung ton="warnung">
          Für den {formatDate(termin.performed_on)} ist keine Preisliste in Kraft. Ohne sie steht
          kein Preis fest. Preislisten legt die Praxisinhaber:in an und setzt sie in Kraft – mit
          diesem oder einem früheren Beginn.
        </Statusmeldung>
        <Textlink to="/abrechnung/katalog" alleinstehend className="text-sm">
          Zum Leistungskatalog
        </Textlink>
      </div>
    );
  }

  if (vorschlag.isError) {
    return (
      <Statusmeldung ton="fehler" className="mt-3">
        {vorschlag.error.message} Bitte die Verbindung prüfen und erneut versuchen.
      </Statusmeldung>
    );
  }

  // Liefert die Preisliste für diesen Anlass nichts, stand hier ein
  // gesperrtes „0 Leistungen erfassen" ohne Erklärung (ABR-30).
  if (vorschlag.data.length === 0) {
    return (
      <EmptyState
        title="Die geltende Preisliste bietet für diesen Termin keine Position."
        aktion={
          <Button type="button" variant="secondary" groesse="kompakt" onClick={onFertig}>
            Schließen
          </Button>
        }
      />
    );
  }

  const gewaehlteZeilen = vorschlag.data.filter((zeile) => auswahl[zeile.catalog_item_id]);
  const anzahlGewaehlt = gewaehlteZeilen.length;
  const feldId = (katalogId: string) => `${kennung}-${katalogId}`;

  function absenden() {
    if (erfassen.isPending) return;
    const gefunden: Record<string, string> = {};
    const positionen: { catalog_item_id: string; quantity: number }[] = [];
    for (const zeile of gewaehlteZeilen) {
      // Unberührt heißt: die vorgeschlagene Menge 1 - wie bisher. Im
      // Terminhonorar ist jedes Heilmittel einmal da (ABR-031, ANN-232).
      const menge = zeile.in_session_fee ? 1 : alsMenge(mengen[zeile.catalog_item_id] ?? '1');
      if (menge === null) gefunden[zeile.catalog_item_id] = MENGENFEHLER;
      else positionen.push({ catalog_item_id: zeile.catalog_item_id, quantity: menge });
    }

    setMengenfehler(gefunden);
    const erster = gewaehlteZeilen.find((zeile) => gefunden[zeile.catalog_item_id]);
    if (erster) {
      document.getElementById(feldId(erster.catalog_item_id))?.focus();
      return;
    }
    erfassen.mutate(positionen);
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Die Menge steht neben ihrer Position, nicht 1000 px entfernt am
          rechten Rand (ABR-23). */}
      <ul className="flex max-w-xl flex-col gap-2">
        {vorschlag.data.map((zeile) => (
          <li key={zeile.catalog_item_id} className="grid grid-cols-[1fr_6rem] items-end gap-3">
            <div className="min-w-0">
              <Checkbox
                label={<Positionsbeschriftung zeile={zeile} />}
                checked={auswahl[zeile.catalog_item_id] ?? false}
                onChange={(event) =>
                  setGewaehlt({ ...auswahl, [zeile.catalog_item_id]: event.target.checked })
                }
              />
            </div>
            <Field
              label="Menge"
              // Jedes Feld heißt „Menge"; für Vorlesesoftware gehört es zu
              // seiner Position (ABR-11).
              aria-label={`Menge ${zeile.label} (${zeile.code})`}
              feldId={feldId(zeile.catalog_item_id)}
              inputMode="numeric"
              value={zeile.in_session_fee ? '1' : (mengen[zeile.catalog_item_id] ?? '1')}
              disabled={!auswahl[zeile.catalog_item_id] || zeile.in_session_fee}
              error={
                auswahl[zeile.catalog_item_id] ? mengenfehler[zeile.catalog_item_id] : undefined
              }
              onChange={(event) => {
                setMengen({ ...mengen, [zeile.catalog_item_id]: event.target.value });
                if (mengenfehler[zeile.catalog_item_id]) {
                  setMengenfehler({ ...mengenfehler, [zeile.catalog_item_id]: '' });
                }
              }}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={absenden}
          disabled={anzahlGewaehlt === 0 || erfassen.isPending}
        >
          {erfassen.isPending
            ? 'Wird erfasst …'
            : anzahlGewaehlt === 1
              ? 'Eine Leistung erfassen'
              : `${anzahlGewaehlt} Leistungen erfassen`}
        </Button>
        <Button type="button" variant="secondary" onClick={onFertig}>
          Abbrechen
        </Button>
      </div>

      {/* Wer die Menge an der Grundlage erhöht, darf das Office nicht: Die
          Meldung nennt die Rollen und führt zur Akte (ABR-17). */}
      {erfassen.error instanceof KontingentAusgeschoepft ? (
        <div>
          <Statusmeldung ton="fehler">
            Die Leistungsmenge der Behandlungsgrundlage ist ausgeschöpft. Die Grenze schützt die
            Abrechnung: Therapeut:in oder Praxisinhaber:in erhöht die Menge an der Grundlage, danach
            lässt sich erneut erfassen.
          </Statusmeldung>
          {termin.patient_id ? (
            <Textlink
              to={mitRueckweg(`/patienten/${termin.patient_id}/verordnungen`, LEISTUNGEN)}
              alleinstehend
              className="text-sm"
            >
              Zu den Behandlungsgrundlagen
            </Textlink>
          ) : null}
        </div>
      ) : null}
      {erfassen.error instanceof KeinTerminhonorar ? (
        <Statusmeldung ton="fehler">
          Für diesen Tag gilt kein Terminhonorar: Die Preisliste nennt keins, und mit der Person ist
          keins vereinbart. Die Praxisinhaber:in legt es in der Preisliste oder in der Akte fest.
        </Statusmeldung>
      ) : null}
      {erfassen.isError &&
      !(erfassen.error instanceof KontingentAusgeschoepft) &&
      !(erfassen.error instanceof KeinTerminhonorar) ? (
        <Statusmeldung ton="fehler">
          {erfassen.error.message} Bitte die Verbindung prüfen und erneut versuchen.
        </Statusmeldung>
      ) : null}
    </div>
  );
}

function Positionsbeschriftung({ zeile }: { zeile: Vorschlag }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-ink">{zeile.label}</span>
      <span className="text-ink-muted text-sm">({zeile.code})</span>
      {/* ABR-031: Ein Heilmittel kostet am Behandlungstermin nichts eigenes;
          es geht im Terminhonorar auf. */}
      {zeile.in_session_fee ? (
        <span className="text-ink-muted text-sm">im Terminhonorar</span>
      ) : (
        <span className="text-ink text-sm tabular-nums">
          {formatEuro(zeile.unit_price_cents, zeile.currency)}
        </span>
      )}
      <span className="text-ink-muted text-sm">· {steuerLabels[zeile.tax_treatment]}</span>
      {zeile.suggested ? <Badge ton="akzent">Aus der Grundlage</Badge> : null}
    </span>
  );
}
