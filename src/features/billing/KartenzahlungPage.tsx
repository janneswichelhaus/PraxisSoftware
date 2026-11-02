import { useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { formatDate } from '@/lib/datum';
import { centZuEingabe, formatEuro, parseEuroZuCent } from '@/lib/geld';
import { leseRueckweg } from '@/lib/rueckweg';
import { fetchRechnungenDerAkte, type RechnungDerAkte } from './api';
import { kassiereMitKarte, useKartenterminal, type Kassierergebnis } from './kartenterminal-api';

const STANDARD = '/abrechnung';

/** Was sich jetzt mit Karte bezahlen lässt: ausgestellt, nicht storniert, mit offenem Betrag. */
export function offeneRechnungen(rechnungen: readonly RechnungDerAkte[]): RechnungDerAkte[] {
  return rechnungen
    .filter((r) => r.status === 'issued' && !r.cancelled && r.outstanding_cents > 0)
    .sort((a, b) => (a.issued_on ?? '').localeCompare(b.issued_on ?? ''));
}

/**
 * Kassieren am Hausbesuch (ANN-837), Seitentyp „Formular“: die offenen Rechnungen der Person, der Betrag
 * vorbelegt, ein Hauptknopf. Das Terminal fragt die Function; gebucht ist erst, was sie bestätigt.
 */
export function KartenzahlungPage() {
  const { patientId = '' } = useParams();
  const [suche] = useSearchParams();
  const zurueck = leseRueckweg(suche, STANDARD);
  const terminal = useKartenterminal(true);
  const rechnungen = useQuery({
    queryKey: ['patient-invoices', patientId],
    queryFn: () => fetchRechnungenDerAkte(patientId),
    retry: false,
    enabled: terminal.data?.verfuegbar === true,
  });
  // Über der Liste: Nach dem Buchen lädt sie neu, die Rechnung ist nicht mehr offen.
  const [bezahlt, setBezahlt] = useState<Bezahlt | null>(null);

  return (
    <>
      <Rueckweg standard={STANDARD} />
      <PageHeader title="Mit Karte zahlen" />
      {bezahlt ? (
        <div className="max-w-formular">
          <Rueckmeldung>
            {formatEuro(bezahlt.cent, bezahlt.waehrung)} mit Karte bezahlt und gebucht.
          </Rueckmeldung>
          {bezahlt.nachbildung ? (
            <p className="text-ink-muted mt-3 text-sm">
              Nachbildung ohne Terminal: Es floss kein Geld.
            </p>
          ) : null}
          <Formularfuss>
            <ButtonLink to={zurueck}>Fertig</ButtonLink>
          </Formularfuss>
        </div>
      ) : terminal.isPending ? (
        <LoadingState label="Das Terminal wird gefragt …" />
      ) : terminal.data?.verfuegbar !== true ? (
        <EmptyState inKarte title="Die Kartenzahlung ist hier nicht eingerichtet." />
      ) : (
        <Abfragezustand
          abfrage={rechnungen}
          laden="Die Rechnungen werden geladen …"
          fehler="Die Rechnungen konnten nicht geladen werden."
          inKarte
          leer={{
            wenn: (liste) => offeneRechnungen(liste).length === 0,
            titel: 'Keine offene Rechnung',
          }}
        >
          {(liste) => (
            <Kassieren
              rechnungen={offeneRechnungen(liste)}
              patientId={patientId}
              zurueck={zurueck}
              nachbildung={terminal.data?.nachbildung === true}
              onBezahlt={setBezahlt}
            />
          )}
        </Abfragezustand>
      )}
    </>
  );
}

interface Bezahlt {
  cent: number;
  waehrung: string;
  nachbildung: boolean;
}

function Kassieren({
  rechnungen,
  patientId,
  zurueck,
  nachbildung,
  onBezahlt,
}: {
  rechnungen: readonly RechnungDerAkte[];
  patientId: string;
  zurueck: string;
  nachbildung: boolean;
  onBezahlt: (bezahlt: Bezahlt) => void;
}) {
  const queryClient = useQueryClient();
  const [gewaehlt, setGewaehlt] = useState<string | null>(
    rechnungen.length === 1 ? rechnungen[0]!.id : null,
  );
  const rechnung = rechnungen.find((r) => r.id === gewaehlt) ?? null;
  const [betrag, setBetrag] = useState(rechnung ? centZuEingabe(rechnung.outstanding_cents) : '');
  const [feldfehler, setFeldfehler] = useState<string | undefined>();
  const [ergebnis, setErgebnis] = useState<{ antwort: Kassierergebnis } | null>(null);

  const kassieren = useMutation({
    mutationFn: ({ id, cent }: { id: string; cent: number }) => kassiereMitKarte(id, cent),
    onSuccess: async (antwort, { cent }) => {
      setErgebnis({ antwort });
      if (!antwort.ok) return;
      onBezahlt({ cent, waehrung: rechnung?.currency ?? 'EUR', nachbildung: antwort.nachbildung });
      await queryClient.invalidateQueries({ queryKey: ['patient-invoices', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['appointment'] });
      await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
      await queryClient.invalidateQueries({ queryKey: ['zahlungen'] });
    },
  });

  function waehle(id: string) {
    setGewaehlt(id);
    const neu = rechnungen.find((r) => r.id === id);
    setBetrag(neu ? centZuEingabe(neu.outstanding_cents) : '');
    setFeldfehler(undefined);
    setErgebnis(null);
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (kassieren.isPending || rechnung === null) return;
    const cent = parseEuroZuCent(betrag);
    if (cent === null || cent <= 0) {
      setFeldfehler('Bitte einen Betrag über null angeben, etwa 140,00.');
      return;
    }
    if (cent > rechnung.outstanding_cents) {
      setFeldfehler(
        `Höchstens ${formatEuro(rechnung.outstanding_cents, rechnung.currency ?? 'EUR')}.`,
      );
      return;
    }
    setFeldfehler(undefined);
    setErgebnis(null);
    kassieren.mutate({ id: rechnung.id, cent });
  }

  const fehlschlag = ergebnis && !ergebnis.antwort.ok ? ergebnis.antwort : null;

  return (
    <form onSubmit={absenden} noValidate className="max-w-formular">
      <Section titel="Rechnung">
        {rechnungen.length === 1 && rechnung ? (
          <ListRows beschriftung="Offene Rechnung">
            <ListRow
              titel={rechnung.invoice_number ?? 'Rechnung'}
              meta={rechnung.issued_on ? `vom ${formatDate(rechnung.issued_on)}` : undefined}
              betrag={`${formatEuro(rechnung.outstanding_cents, rechnung.currency ?? 'EUR')} offen`}
            />
          </ListRows>
        ) : (
          <Wahlreihe
            legende="Welche Rechnung?"
            legendeSichtbar={false}
            wahlen={rechnungen.map((r) => ({
              wert: r.id,
              text: `${r.invoice_number ?? 'Rechnung'} · ${formatEuro(r.outstanding_cents, r.currency ?? 'EUR')} offen`,
            }))}
            gewaehlt={gewaehlt}
            onWaehlen={waehle}
          />
        )}
        <div className="mt-4">
          <Field
            label="Betrag"
            inputMode="decimal"
            autoComplete="off"
            value={betrag}
            disabled={rechnung === null}
            onChange={(e) => setBetrag(e.target.value)}
            error={feldfehler}
          />
        </div>
      </Section>

      {fehlschlag ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {fehlschlag.satz}
          {fehlschlag.transaktion ? ` Kennung am Terminal: ${fehlschlag.transaktion}.` : ''}
        </Statusmeldung>
      ) : null}
      {kassieren.isPending ? (
        <p role="status" className="text-ink mt-4 text-sm">
          Karte ans Terminal halten lassen …
        </p>
      ) : null}

      <Formularfuss>
        <Button type="submit" disabled={kassieren.isPending || rechnung === null}>
          {kassieren.isPending ? 'Wird am Terminal bezahlt …' : 'Am Terminal zahlen'}
        </Button>
        <ButtonLink to={zurueck} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
      {nachbildung ? (
        <Kleingedrucktes className="mt-6">
          Nachbildung ohne Terminal: Es fließt kein Geld. Ein Betrag auf 13 Cent wird abgelehnt.
        </Kleingedrucktes>
      ) : null}
    </form>
  );
}
