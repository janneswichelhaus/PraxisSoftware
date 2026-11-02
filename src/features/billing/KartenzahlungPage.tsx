import { useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
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
import {
  bucheKartenzahlungNach,
  kassiereMitKarte,
  useKartenterminal,
  type Kassierergebnis,
} from './kartenterminal-api';
import { offeneRechnungen } from './offeneRechnungen';

const STANDARD = '/abrechnung';

interface Bezahlt {
  cent: number;
  waehrung: string;
  nachbildung: boolean;
}

type Ausgang =
  | (Kassierergebnis & { ok: false })
  | { ok: false; art: 'nachbuchen_gescheitert'; satz: string; transaktion: string };

/** Am Terminal belastet, aber nicht gebucht: Rechnung und Betrag genau dieses Versuchs. */
interface Belastet {
  rechnung: RechnungDerAkte;
  cent: number;
  transaktion: string;
}

function Nachbildung({ vergangen = false }: { vergangen?: boolean }) {
  return (
    <Statusmeldung ton="warnung">
      {vergangen
        ? 'Nachbildung ohne Terminal: Es floss kein Geld.'
        : 'Nachbildung ohne Terminal: Es fließt kein Geld.'}
    </Statusmeldung>
  );
}

function rechnungText(r: RechnungDerAkte): string {
  const datum = r.issued_on ? ` · vom ${formatDate(r.issued_on)}` : '';
  return `${r.invoice_number ?? 'Rechnung'}${datum} · ${formatEuro(r.outstanding_cents, r.currency ?? 'EUR')} offen`;
}

/**
 * Kassieren am Hausbesuch (ANN-837), Seitentyp „Formular“: die offenen Rechnungen der Person, der Betrag
 * vorbelegt, ein Hauptknopf. Gebucht ist erst, was die Function bestätigt; die Bestätigung steht über der Liste.
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
  // Über der Liste: Nach dem Buchen lädt sie neu, und die Rechnung ist nicht mehr offen.
  const [bezahlt, setBezahlt] = useState<Bezahlt | null>(null);
  const weitere = offeneRechnungen(rechnungen.data ?? []).length;

  return (
    <div className="max-w-formular">
      <Rueckweg standard={STANDARD} />
      <PageHeader title="Mit Karte zahlen" />
      {bezahlt ? (
        <div className="flex flex-col gap-3">
          <Rueckmeldung>
            {formatEuro(bezahlt.cent, bezahlt.waehrung)} mit Karte bezahlt und gebucht.
          </Rueckmeldung>
          {bezahlt.nachbildung ? <Nachbildung vergangen /> : null}
          <Formularfuss>
            <ButtonLink to={zurueck}>Fertig</ButtonLink>
            {weitere > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setBezahlt(null)}>
                Nächste Rechnung kassieren
              </Button>
            ) : null}
          </Formularfuss>
        </div>
      ) : (
        <Abfragezustand
          abfrage={terminal}
          laden="Das Terminal wird gefragt …"
          fehler="Das Terminal konnte nicht gefragt werden."
          inKarte
          leer={{
            wenn: (t) => !t.verfuegbar,
            titel: 'Die Kartenzahlung ist hier nicht eingerichtet.',
          }}
        >
          {(t) => (
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
                  nachbildung={t.nachbildung}
                  onBezahlt={setBezahlt}
                />
              )}
            </Abfragezustand>
          )}
        </Abfragezustand>
      )}
    </div>
  );
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
  const [ausgang, setAusgang] = useState<Ausgang | null>(null);
  // Wer abgebucht hat, bucht nur noch nach; ein zweites Kassieren belastete die Karte doppelt.
  const [belastet, setBelastet] = useState<Belastet | null>(null);

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: ['patient-invoices', patientId] });
    await queryClient.invalidateQueries({ queryKey: ['appointment'] });
    await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
    await queryClient.invalidateQueries({ queryKey: ['zahlungen'] });
  }

  const kassieren = useMutation({
    mutationFn: ({ ziel, cent }: { ziel: RechnungDerAkte; cent: number }) =>
      kassiereMitKarte(ziel.id, cent),
    onSuccess: async (antwort, { ziel, cent }) => {
      if (antwort.ok) {
        onBezahlt({ cent, waehrung: ziel.currency ?? 'EUR', nachbildung: antwort.nachbildung });
        await neuLaden();
        return;
      }
      setAusgang(antwort);
      if (antwort.art === 'nicht_gebucht' && antwort.transaktion) {
        setBelastet({ rechnung: ziel, cent, transaktion: antwort.transaktion });
      }
      // Unklar: Vielleicht ist doch gebucht; die Liste sagt es nach dem Neuladen.
      if (antwort.art === 'unklar') await neuLaden();
    },
  });

  const nachbuchen = useMutation({
    mutationFn: (versuch: Belastet) =>
      bucheKartenzahlungNach(versuch.rechnung.id, versuch.cent, versuch.transaktion),
    onSuccess: async (gebucht, versuch) => {
      if (gebucht) {
        onBezahlt({
          cent: versuch.cent,
          waehrung: versuch.rechnung.currency ?? 'EUR',
          nachbildung,
        });
        await neuLaden();
        return;
      }
      setAusgang({
        ok: false,
        art: 'nachbuchen_gescheitert',
        satz: 'Die Buchung ging wieder nicht. Bitte im Büro mit dieser Kennung von Hand als Karte buchen.',
        transaktion: versuch.transaktion,
      });
    },
  });

  const beschaeftigt = kassieren.isPending || nachbuchen.isPending;
  // Am Terminal und danach stehen Rechnung und Betrag fest: Gebucht wird, was belastet wurde.
  const gesperrt = beschaeftigt || belastet !== null;
  const angezeigt = belastet?.rechnung ?? rechnung;

  function waehle(id: string) {
    if (gesperrt) return;
    setGewaehlt(id);
    const neu = rechnungen.find((r) => r.id === id);
    setBetrag(neu ? centZuEingabe(neu.outstanding_cents) : '');
    setFeldfehler(undefined);
    setAusgang(null);
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (beschaeftigt) return;
    if (belastet) {
      nachbuchen.mutate(belastet);
      return;
    }
    if (rechnung === null) return;
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
    setAusgang(null);
    kassieren.mutate({ ziel: rechnung, cent });
  }

  const knopf = kassieren.isPending
    ? 'Wird am Terminal bezahlt …'
    : nachbuchen.isPending
      ? 'Wird gebucht …'
      : belastet
        ? 'Buchung wiederholen'
        : ausgang?.art === 'unklar'
          ? 'Nicht bezahlt, erneut zahlen'
          : 'Am Terminal zahlen';

  return (
    <form onSubmit={absenden} noValidate className="flex flex-col gap-4">
      {nachbildung ? <Nachbildung /> : null}
      <Section titel="Rechnung">
        {angezeigt && (rechnungen.length === 1 || gesperrt) ? (
          <ListRows beschriftung="Offene Rechnung">
            <ListRow
              titel={angezeigt.invoice_number ?? 'Rechnung'}
              meta={angezeigt.issued_on ? `vom ${formatDate(angezeigt.issued_on)}` : undefined}
              betrag={`${formatEuro(angezeigt.outstanding_cents, angezeigt.currency ?? 'EUR')} offen`}
            />
          </ListRows>
        ) : (
          <Wahlreihe
            legende="Welche Rechnung?"
            wahlen={rechnungen.map((r) => ({ wert: r.id, text: rechnungText(r) }))}
            gewaehlt={gewaehlt}
            onWaehlen={waehle}
          />
        )}
        <div className="mt-4">
          <Field
            label="Betrag"
            inputMode="decimal"
            autoComplete="off"
            value={belastet ? centZuEingabe(belastet.cent) : betrag}
            disabled={angezeigt === null || gesperrt}
            onChange={(e) => setBetrag(e.target.value)}
            error={feldfehler}
          />
        </div>
      </Section>

      {ausgang ? (
        <Statusmeldung ton={ausgang.art === 'unklar' ? 'warnung' : 'fehler'}>
          {ausgang.satz}
          {ausgang.transaktion ? ` Kennung am Terminal: ${ausgang.transaktion}.` : ''}
        </Statusmeldung>
      ) : null}
      {kassieren.isPending ? (
        <Statusmeldung>Karte ans Terminal halten lassen …</Statusmeldung>
      ) : null}

      <Formularfuss>
        <Button type="submit" disabled={beschaeftigt || angezeigt === null}>
          {knopf}
        </Button>
        <ButtonLink to={zurueck} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </form>
  );
}
