import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Datenliste, type Datenspalte } from '@/components/ui/Datenliste';
import { Field } from '@/components/ui/Field';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { SearchField } from '@/components/ui/SearchField';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import {
  RECHNUNGEN_JE_SEITE,
  bereichLabels,
  empfaengerartLabels,
  fetchRechnungen,
  rechnungsfilterLabels,
  zahlungsstandLabels,
  type Rechnung,
  type Rechnungsfilter,
} from './api';
import { klammerText, zahlungsTon } from './anzeige';

/**
 * Die Rechnungen der Praxis mit Suche, Filter und „Weitere laden“ (ABR-034,
 * BEF-061 Option 1 und 3).
 *
 * Bis hierher endete die Liste stumm bei 100 Rechnungen. Jetzt sagt sie, wie
 * viele es sind, sucht auf dem Server nach Nummer und Name, filtert nach
 * Zustand und Monat und lädt weitere Seiten nach. Am Rechner (ab 1024 px)
 * stehen die Rechnungen als Zeilen mit Spalten: Nummer, Person und Empfänger,
 * Zustand, Betrag rechtsbündig - nicht als gestreckte Handy-Karten.
 */

/** So lang darf die Suche sein; der Server weist längere ab (ANN-259). */
const SUCHE_HOECHSTENS = 100;

/** Getippte Suche geht erst nach einer kurzen Pause an den Server. */
const SUCHPAUSE_MS = 300;

function useVerzoegert(wert: string, ms: number): string {
  const [verzoegert, setVerzoegert] = useState(wert);
  useEffect(() => {
    const uhr = setTimeout(() => setVerzoegert(wert), ms);
    return () => clearTimeout(uhr);
  }, [wert, ms]);
  return verzoegert;
}

export function Rechnungsliste() {
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState<Rechnungsfilter | ''>('');
  const [monat, setMonat] = useState('');
  const suchbegriff = useVerzoegert(suche, SUCHPAUSE_MS);

  const rechnungen = useInfiniteQuery({
    queryKey: ['rechnungen', suchbegriff.trim(), filter, monat],
    queryFn: ({ pageParam }) =>
      fetchRechnungen({
        suche: suchbegriff,
        filter: filter === '' ? null : filter,
        monat: monat === '' ? null : monat,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (letzte, alle) => {
      const geladen = alle.reduce((summe, seite) => summe + seite.length, 0);
      const gesamt = letzte[0]?.total_count ?? geladen;
      return letzte.length === RECHNUNGEN_JE_SEITE && geladen < gesamt ? geladen : undefined;
    },
    retry: false,
  });

  const zeilen = rechnungen.data?.pages.flat() ?? [];
  const gesamt = rechnungen.data?.pages[0]?.[0]?.total_count ?? zeilen.length;
  const eingeschraenkt = suchbegriff.trim() !== '' || filter !== '' || monat !== '';

  return (
    <Section
      titel="Rechnungen"
      rahmen
      hinweis={
        rechnungen.data && gesamt > 0
          ? zeilen.length < gesamt
            ? `${zeilen.length} von ${gesamt} ${eingeschraenkt ? 'Treffern' : 'Rechnungen'} gezeigt`
            : `${gesamt} ${gesamt === 1 ? (eingeschraenkt ? 'Treffer' : 'Rechnung') : eingeschraenkt ? 'Treffer' : 'Rechnungen'}`
          : undefined
      }
    >
      {/* Die Suche offen, Zustand und Monat am Telefon hinter „Filter (n)“
          (Filterleiste, R2-O2); ab 640 px stehen sie offen daneben. */}
      <Filterleiste
        beschriftung="Rechnungen suchen"
        suche={
          <SearchField
            label="Suche"
            placeholder="Nummer oder Name"
            value={suche}
            maxLength={SUCHE_HOECHSTENS}
            onChange={setSuche}
          />
        }
        gesetzt={(filter === '' ? 0 : 1) + (monat === '' ? 0 : 1)}
        onZuruecksetzen={() => {
          setFilter('');
          setMonat('');
        }}
      >
        <Select
          label="Zustand"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Rechnungsfilter | '')}
        >
          <option value="">Alle</option>
          {(Object.keys(rechnungsfilterLabels) as Rechnungsfilter[]).map((wert) => (
            <option key={wert} value={wert}>
              {rechnungsfilterLabels[wert]}
            </option>
          ))}
        </Select>
        <Field
          label="Monat"
          type="month"
          value={monat}
          onChange={(e) => setMonat(e.target.value)}
        />
      </Filterleiste>

      <Abfragezustand
        abfrage={rechnungen}
        laden="Rechnungen werden geladen …"
        fehler="Die Rechnungen konnten nicht geladen werden."
        leer={{
          wenn: (daten) => daten.pages.every((seite) => seite.length === 0),
          ...(eingeschraenkt
            ? {
                titel: 'Keine passende Rechnung',
                beschreibung:
                  'Suche oder Filter ändern - gesucht wird in Nummer, Name und Empfänger:in.',
              }
            : { titel: 'Noch keine Rechnung' }),
        }}
      >
        {() => (
          // Als Datenliste (DESIGN.md Regel 3, R2-neu5): ab 1024 px Spalten
          // mit Kopfzeile, darunter jede Rechnung als Zeile, die alles selbst
          // sagt - Nummer oben links, Betrag oben rechts, darunter Person und
          // Zustand. In der Karte des Abschnitts ohne eigenen Rahmen.
          <Datenliste
            beschriftung="Rechnungen"
            rahmen={false}
            zeilen={zeilen}
            schluessel={(rechnung) => rechnung.id}
            spalten={RECHNUNGSSPALTEN}
          />
        )}
      </Abfragezustand>

      {rechnungen.hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={rechnungen.isFetchingNextPage}
          onClick={() => void rechnungen.fetchNextPage()}
        >
          {rechnungen.isFetchingNextPage ? 'Wird geladen …' : 'Weitere laden'}
        </Button>
      ) : null}
    </Section>
  );
}

/**
 * Die Spalten einer Rechnung: am Handy drei Zeilen untereinander, ab 1024 px
 * vier Spalten. Die Nummer ist der Weg zur Rechnung; ein eigener Knopf je
 * Zeile entfällt (UX-005i).
 */
const RECHNUNGSSPALTEN: readonly Datenspalte<Rechnung>[] = [
  {
    titel: 'Nummer',
    breite: '10rem',
    inhalt: (rechnung) => (
      <div className="flex flex-wrap items-baseline gap-2">
        <Textlink
          to={`/abrechnung/rechnungen/${rechnung.id}`}
          alleinstehend
          className="text-liste font-medium"
          aria-label={
            rechnung.invoice_number
              ? `Rechnung ${rechnung.invoice_number} ansehen`
              : 'Entwurf ohne Nummer öffnen'
          }
        >
          {rechnung.invoice_number ?? 'Ohne Nummer'}
        </Textlink>
        {/* „Ausgestellt" ist der Regelfall und trägt kein Abzeichen; nur der
            Entwurf steht dran (UX-005i). Storniert steht neben dem Zustand:
            Die Rechnung ist ausgestellt gewesen (ABR-003c, ANN-079). */}
        {rechnung.status === 'draft' ? <Badge ton="neutral">Entwurf</Badge> : null}
        {rechnung.cancelled ? <Badge ton="neutral">Storniert</Badge> : null}
      </div>
    ),
  },
  {
    titel: 'Person und Empfänger:in',
    inhalt: (rechnung) => (
      <>
        <p className="text-ink text-sm">
          {rechnung.patient_name}
          <span className="text-ink-muted">
            {' '}
            · {klammerText(rechnung)} · {bereichLabels[rechnung.service_area]}
          </span>
        </p>
        <p className="text-ink-muted mt-0.5 text-sm">
          An {rechnung.recipient_name}
          {rechnung.recipient_kind === 'self'
            ? ''
            : ` (${empfaengerartLabels[rechnung.recipient_kind] ?? 'Kostenträger'})`}
          {rechnung.issued_on ? ` · ausgestellt am ${formatDate(rechnung.issued_on)}` : null}
          {/* Eine stornierte Rechnung ist keine Forderung mehr; eine
              Zahlungsfrist an ihr wäre eine falsche Aussage (ABR-06). */}
          {rechnung.due_on && !rechnung.cancelled
            ? ` · zahlbar bis ${formatDate(rechnung.due_on)}`
            : null}
        </p>
      </>
    ),
  },
  {
    titel: 'Zustand',
    breite: '12rem',
    inhalt: (rechnung) => <Zahlungszustand rechnung={rechnung} />,
  },
  {
    titel: 'Betrag',
    breite: '8rem',
    rechts: true,
    telefon: 'ende',
    inhalt: (rechnung) => formatEuro(rechnung.total_cents, rechnung.currency),
  },
];

/** Zahlungsstand einer offenen Rechnung; an Entwurf und Storno nichts. */
function Zahlungszustand({ rechnung }: { rechnung: Rechnung }) {
  if (rechnung.status !== 'issued' || rechnung.cancelled) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge ton={zahlungsTon[rechnung.payment_state]}>
        {zahlungsstandLabels[rechnung.payment_state]}
      </Badge>
      {rechnung.overdue ? <Badge ton="kritisch">Überfällig</Badge> : null}
      {/* An einer bezahlten Rechnung sagt „Bezahlt" alles (UX-005i). */}
      {rechnung.payment_state === 'paid' ? null : (
        <span className="text-ink-muted tabular-nums">
          {formatEuro(rechnung.paid_cents, rechnung.currency)} bezahlt
          {rechnung.outstanding_cents > 0
            ? ` · ${formatEuro(rechnung.outstanding_cents, rechnung.currency)} offen`
            : ''}
          {rechnung.outstanding_cents < 0
            ? ` · ${formatEuro(-rechnung.outstanding_cents, rechnung.currency)} zu viel`
            : ''}
        </span>
      )}
    </div>
  );
}
