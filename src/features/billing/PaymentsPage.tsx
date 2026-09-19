import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Section';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { canManageInvoicing, type CurrentUser } from '@/features/session/types';
import {
  fetchZahlungen,
  richtungLabels,
  storniereZahlung,
  zahlungswegLabels,
  type ZahlungMitRechnung,
} from './api';

/**
 * Zahlungen (ABR-004).
 *
 * Bis ABR-EPIC-003 war diese Seite die letzte Vorschau des
 * Abrechnungsbereichs. Jetzt führt sie die erfassten Zahlungen: Eingänge,
 * Rückzahlungen und Stornos, jüngste zuerst.
 *
 * **Stornierte Buchungen bleiben stehen.** Eine Liste, aus der eine Buchung
 * verschwindet, erklärt nichts mehr — und genau das Erklären ist der Zweck
 * einer Zahlungsübersicht. Sie steht durchgestrichen da, mit ihrem Grund.
 *
 * Gebucht wird hier nicht: Eine Zahlung gehört zu einer Rechnung, und die
 * Vorgänge stehen dort, wo ihr Gegenstand steht — am offenen Posten auf der
 * Einstiegsseite und an der Rechnung selbst.
 */
export function PaymentsPage({ user }: { user: CurrentUser }) {
  const darfBuchen = canManageInvoicing(user.roles);

  const zahlungen = useQuery({
    queryKey: ['zahlungen'],
    queryFn: fetchZahlungen,
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Zahlungen"
        description="Eingänge, Teilzahlungen und Rückzahlungen zu ausgestellten Rechnungen."
      />

      <Section titel="Erfasste Zahlungen" rahmen>
        {zahlungen.isPending ? <LoadingState label="Zahlungen werden geladen …" /> : null}
        {zahlungen.isError ? (
          <ErrorState
            title="Die Zahlungen konnten nicht geladen werden."
            description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
          />
        ) : null}
        {zahlungen.data && zahlungen.data.length === 0 ? (
          <EmptyState
            title="Noch keine Zahlung"
            description="Zahlungen werden am offenen Posten oder an der Rechnung erfasst."
          />
        ) : null}

        <ul className="divide-line divide-y">
          {(zahlungen.data ?? []).map((zahlung) => (
            <li key={zahlung.id} className="py-3">
              <Zahlungszeile zahlung={zahlung} darfBuchen={darfBuchen} />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function Zahlungszeile({
  zahlung,
  darfBuchen,
}: {
  zahlung: ZahlungMitRechnung;
  darfBuchen: boolean;
}) {
  const storniert = zahlung.voided_at !== null;

  return (
    <>
      {/*
        Datum, Nummer und Betrag in einer Zeile, alles Weitere darunter: Bei
        375 px stand der Empfängername vorher neben der Nummer und hat sie
        mitten im Wort umgebrochen („RG-2026-" / „0001"). Eine Rechnungsnummer
        bricht nicht — sie ist die Kennung, nach der jemand sucht.
      */}
      <div className="flex items-baseline gap-x-3">
        <span className="text-ink-muted w-24 shrink-0 text-sm tabular-nums">
          {formatDate(zahlung.paid_on)}
        </span>
        <Link
          to={`/abrechnung/rechnungen/${zahlung.invoice_id}`}
          className="text-ink text-[0.9375rem] font-medium whitespace-nowrap underline-offset-2 hover:underline"
        >
          {zahlung.invoice_number ?? 'Rechnung'}
        </Link>
        <span
          className={`ml-auto shrink-0 text-[0.9375rem] font-medium tabular-nums ${
            storniert ? 'text-ink-subtle line-through' : 'text-ink'
          }`}
        >
          {zahlung.direction === 'refund' ? '−' : ''}
          {formatEuro(zahlung.amount_cents, zahlung.currency)}
        </span>
      </div>

      {zahlung.direction === 'refund' || storniert ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {zahlung.direction === 'refund' ? <Badge ton="warnung">Rückzahlung</Badge> : null}
          {storniert ? <Badge ton="neutral">Storniert</Badge> : null}
        </div>
      ) : null}

      <p className="text-ink-muted mt-1 text-sm">
        {zahlung.recipient_name} · {richtungLabels[zahlung.direction]} ·{' '}
        {zahlungswegLabels[zahlung.method] ?? zahlung.method}
        {zahlung.note ? ` · ${zahlung.note}` : ''}
        {storniert && zahlung.void_reason ? ` · storniert: ${zahlung.void_reason}` : ''}
      </p>

      {darfBuchen && !storniert ? (
        <div className="mt-2">
          <Stornoknopf zahlungId={zahlung.id} />
        </div>
      ) : null}
    </>
  );
}

/**
 * Eine Zahlung stornieren.
 *
 * Es gibt keinen Löschknopf, und das ist die Entscheidung: Eine falsch
 * erfasste Zahlung wird storniert und bleibt mit ihrem Grund sichtbar
 * (ADR-009 Punkt 9 sinngemäß). Der Grund ist deshalb Pflicht — ein Storno
 * ohne Grund wäre eine Buchung ohne Beleg.
 */
function Stornoknopf({ zahlungId }: { zahlungId: string }) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  const stornieren = useMutation({
    mutationFn: () => storniereZahlung(zahlungId, grund.trim()),
    onSuccess: async () => {
      setGrund('');
      await queryClient.invalidateQueries({ queryKey: ['zahlungen'] });
      await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
    },
  });

  return (
    <Rueckfrage
      ausloeser="Stornieren"
      ausloeserVariante="quiet"
      bestaetigen="Storno buchen"
      bestaetigenLaeuft="Wird storniert …"
      laeuft={stornieren.isPending}
      fehler={fehler ?? (stornieren.isError ? stornieren.error.message : undefined)}
      onBestaetigen={() => {
        if (grund.trim().length < 3) {
          setFehler('Bitte einen Grund angeben — das Storno bleibt dauerhaft sichtbar.');
          // Abgewiesen, nicht ausgeführt: Der Kasten muss offen bleiben,
          // damit der Hinweis am Feld steht, in dem er gilt.
          return Promise.reject(new Error('Grund fehlt'));
        }
        setFehler(undefined);
        return stornieren.mutateAsync();
      }}
      onAbbrechen={() => {
        setGrund('');
        setFehler(undefined);
      }}
    >
      <p className="text-ink-muted text-sm">
        Die Buchung bleibt sichtbar stehen und fällt aus der Summe. Geändert oder gelöscht wird eine
        Zahlung nie.
      </p>
      <div className="mt-2">
        <Field label="Grund" value={grund} onChange={(e) => setGrund(e.target.value)} />
      </div>
    </Rueckfrage>
  );
}
