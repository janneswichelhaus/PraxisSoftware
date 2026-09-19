import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import {
  KeinKatalog,
  KontingentAusgeschoepft,
  artLabels,
  deleteLeistungen,
  fetchLeistungen,
  fetchOffeneTermine,
  fetchVorschlag,
  nachTerminen,
  recordLeistungen,
  steuerLabels,
  type OffenerTermin,
  type Vorschlag,
} from './api';

/**
 * Leistungen (ABR-002).
 *
 * Die Seite hat zwei Hälften, weil es zwei Fragen sind: **Was ist noch zu
 * erfassen** und **was ist erfasst**.
 *
 * Oben stehen die Termine, aus denen eine Leistung entstehen darf — nach
 * PROJECT_PRINCIPLES.md 19 sind das ausschließlich dokumentierte Termine und
 * Vorgänge mit Gebührenanlass. Es gibt keinen Override: Ein Termin ohne
 * finalisierte Dokumentation erscheint hier gar nicht erst, und die Seite
 * bietet keinen Weg an ihm vorbei.
 *
 * Vorgeschlagen sind die Heilmittel der Behandlungsgrundlage; auswählbar ist,
 * was die am **Leistungstag** geltende Preisliste für diesen Anlass hergibt.
 * Beides entscheidet der Server — die Seite zeigt nur, was er anbietet.
 */

const anlassLabels: Record<string, string> = {
  late_cancellation: 'Absage innerhalb der Frist',
  no_show: 'Nicht angetroffen',
};

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

  return (
    <>
      <PageHeader
        title="Leistungen"
        description="Erbrachte Leistungen aus durchgeführten Terminen und Ausfallhonorare."
      />

      <Section
        titel="Zu erfassen"
        hinweis="Dokumentierte Termine und Vorgänge mit Gebührenanlass. Andere stehen hier nicht — ohne finalisierte Dokumentation wird nicht fakturiert (PROJECT_PRINCIPLES.md 19)."
      >
        {offene.isPending ? <LoadingState label="Termine werden geladen …" /> : null}
        {offene.isError ? (
          <ErrorState
            title="Die offenen Termine konnten nicht geladen werden."
            description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
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
      </Section>

      <Section titel="Erfasst" hinweis="Noch keiner Rechnung zugeordnet." rahmen>
        {leistungen.isPending ? <LoadingState label="Leistungen werden geladen …" /> : null}
        {leistungen.isError ? (
          <ErrorState
            title="Die Leistungen konnten nicht geladen werden."
            description="Bitte später erneut versuchen."
          />
        ) : null}
        {leistungen.data && gruppen.length === 0 ? (
          <EmptyState title="Noch keine Leistung erfasst" />
        ) : null}

        <ul className="divide-line divide-y">
          {gruppen.map((gruppe) => (
            <li key={gruppe.appointmentId} className="py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-ink text-[0.9375rem] font-medium">{gruppe.patientName}</span>
                <span className="text-ink-muted text-sm tabular-nums">
                  {formatDate(gruppe.performedOn)}
                </span>
                <span className="text-ink ml-auto text-[0.9375rem] font-medium tabular-nums">
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
                    <span>· {steuerLabels[zeile.tax_treatment]}</span>
                    {zeile.item_kind === 'absence_fee' ? (
                      <Badge ton="warnung">{artLabels.absence_fee}</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>

              {gruppe.abgerechnet ? (
                <Statusmeldung className="mt-2">
                  Bereits abgerechnet. Eine Korrektur läuft über Storno und Neuausstellung.
                </Statusmeldung>
              ) : (
                <div className="mt-2">
                  <Zuruecknehmen appointmentId={gruppe.appointmentId} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function Zuruecknehmen({ appointmentId }: { appointmentId: string }) {
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
      fehler={entfernen.isError ? entfernen.error.message : undefined}
      onBestaetigen={() => entfernen.mutate()}
    >
      <p>
        Alle Leistungen dieses Termins werden entfernt, und die genutzte Menge der
        Behandlungsgrundlage geht um denselben Betrag zurück. Der Termin steht danach wieder unter
        „Zu erfassen".
      </p>
    </Rueckfrage>
  );
}

function OffenerTerminKarte({ termin }: { termin: OffenerTermin }) {
  const [offen, setOffen] = useState(false);

  return (
    <div className="border-line rounded-card border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink text-[0.9375rem] font-medium">{termin.patient_name}</span>
        <span className="text-ink-muted text-sm tabular-nums">
          {formatDate(termin.performed_on)}
        </span>
        {termin.fee_basis ? (
          <Badge ton="warnung">{anlassLabels[termin.fee_basis] ?? 'Gebührenanlass'}</Badge>
        ) : (
          <Badge ton="neutral">Dokumentiert</Badge>
        )}
        {!offen ? (
          <span className="ml-auto">
            <Button type="button" onClick={() => setOffen(true)}>
              Leistungen erfassen
            </Button>
          </span>
        ) : null}
      </div>

      {offen ? <Erfassungsformular termin={termin} onFertig={() => setOffen(false)} /> : null}
    </div>
  );
}

function Erfassungsformular({ termin, onFertig }: { termin: OffenerTermin; onFertig: () => void }) {
  const queryClient = useQueryClient();
  const [mengen, setMengen] = useState<Record<string, number>>({});
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
    mutationFn: () =>
      recordLeistungen(
        termin.appointment_id,
        (vorschlag.data ?? [])
          .filter((zeile) => auswahl[zeile.catalog_item_id])
          .map((zeile) => ({
            catalog_item_id: zeile.catalog_item_id,
            quantity: mengen[zeile.catalog_item_id] ?? 1,
          })),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-offene-termine'] });
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] });
      onFertig();
    },
  });

  if (vorschlag.isPending) return <LoadingState label="Preisliste wird geladen …" />;

  if (vorschlag.error instanceof KeinKatalog) {
    return (
      <Statusmeldung ton="warnung" className="mt-3">
        Für den {formatDate(termin.performed_on)} ist keine Preisliste in Kraft. Ohne sie steht kein
        Preis fest — erst eine Preisliste mit diesem oder einem früheren Beginn anlegen und in Kraft
        setzen.
      </Statusmeldung>
    );
  }

  if (vorschlag.isError) {
    return (
      <Statusmeldung ton="fehler" className="mt-3">
        {vorschlag.error.message}
      </Statusmeldung>
    );
  }

  const anzahlGewaehlt = (vorschlag.data ?? []).filter(
    (zeile) => auswahl[zeile.catalog_item_id],
  ).length;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {vorschlag.data.map((zeile) => (
          <li key={zeile.catalog_item_id} className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Checkbox
                label={<Positionsbeschriftung zeile={zeile} />}
                checked={auswahl[zeile.catalog_item_id] ?? false}
                onChange={(event) =>
                  setGewaehlt({ ...auswahl, [zeile.catalog_item_id]: event.target.checked })
                }
              />
            </div>
            <div className="w-24">
              <Field
                label="Menge"
                type="number"
                min={1}
                max={10}
                value={String(mengen[zeile.catalog_item_id] ?? 1)}
                disabled={!auswahl[zeile.catalog_item_id]}
                onChange={(event) =>
                  setMengen({
                    ...mengen,
                    [zeile.catalog_item_id]: Number(event.target.value) || 1,
                  })
                }
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => erfassen.mutate()}
          disabled={anzahlGewaehlt === 0 || erfassen.isPending}
        >
          {anzahlGewaehlt === 1
            ? 'Eine Leistung erfassen'
            : `${anzahlGewaehlt} Leistungen erfassen`}
        </Button>
        <Button type="button" variant="secondary" onClick={onFertig}>
          Abbrechen
        </Button>
      </div>

      {erfassen.error instanceof KontingentAusgeschoepft ? (
        <Statusmeldung ton="fehler">
          Die Leistungsmenge der Behandlungsgrundlage ist ausgeschöpft. Die Grenze schützt die
          Abrechnung: Erst die Menge an der Grundlage erhöhen, dann erneut erfassen.
        </Statusmeldung>
      ) : null}
      {erfassen.isError && !(erfassen.error instanceof KontingentAusgeschoepft) ? (
        <Statusmeldung ton="fehler">{erfassen.error.message}</Statusmeldung>
      ) : null}
    </div>
  );
}

function Positionsbeschriftung({ zeile }: { zeile: Vorschlag }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-ink">{zeile.label}</span>
      <span className="text-ink-muted text-sm">({zeile.code})</span>
      <span className="text-ink text-sm tabular-nums">
        {formatEuro(zeile.unit_price_cents, zeile.currency)}
      </span>
      <span className="text-ink-muted text-sm">· {steuerLabels[zeile.tax_treatment]}</span>
      {zeile.suggested ? <Badge ton="akzent">Aus der Grundlage</Badge> : null}
    </span>
  );
}
