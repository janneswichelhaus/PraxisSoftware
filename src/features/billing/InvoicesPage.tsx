import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { formatEuro } from '@/lib/geld';
import { canManageInvoicing, type CurrentUser } from '@/features/core/session/types';
import {
  bereichLabels,
  WegHinweis,
  createEntwurf,
  erstelleKorrektur,
  fetchKandidaten,
  type Kandidat,
} from './api';
import { klammerText, zeitraumText } from './anzeige';
import { Abrechnungslauf } from './Abrechnungslauf';
import { laufstand, laufstandTexte } from './lauf';
import { OffenePosten } from './OffenePosten';
import { Rechnungsliste } from './Rechnungsliste';
import { todayInTimeZone } from '@/lib/datum';

/**
 * Rechnungen (ABR-003) - die Einstiegsseite der Abrechnung.
 *
 * Vier Fragen von oben nach unten:
 *
 *   1. **Was ist offen?** Die offenen Posten ohne einen Tipp (K14), mit
 *      Buchen an der Zeile und „Mehrere buchen“ für den Kontoauszug.
 *   2. **Ist ein Abrechnungslauf fällig?** Die Monatsabrechnung in einem
 *      Lauf (K13, ≤ 3 Tipps): Entwürfe anlegen, prüfen, alle ausstellen.
 *   3. **Was ist abzurechnen?** Die erfassten Leistungen, die auf keiner
 *      Rechnung stehen - je Verordnung, sonst je Person, Monat und Bereich.
 *      Ein Entwurf nimmt immer alle offenen Leistungen der Klammer auf; eine
 *      Auswahl einzelner Zeilen wäre die Gelegenheit, eine zu übersehen
 *      (ADR-009 Punkt 4). Was der Lauf noch nicht aufnimmt, sagt die Zeile.
 *   4. **Was ist abgerechnet?** Die Rechnungsliste mit Suche und Filter.
 *
 * Ein Entwurf trägt keine Nummer und lässt sich folgenlos verwerfen; eine
 * ausgestellte Rechnung ist unveränderlich (ADR-009 Punkte 8 und 9).
 */
export function InvoicesPage({ user }: { user: CurrentUser }) {
  const darfAusstellen = canManageInvoicing(user.roles);
  const zeitzone = user.organizationTimeZone;
  const heute = zeitzone ? todayInTimeZone(zeitzone) : null;
  const [sammeln, setSammeln] = useState(false);

  const kandidaten = useQuery({
    queryKey: ['rechnungs-kandidaten'],
    queryFn: fetchKandidaten,
    retry: false,
  });

  return (
    <>
      <PageHeader title="Rechnungen" description="Privatrechnungen aus erfassten Leistungen." />

      <OffenePosten darfBuchen={darfAusstellen} zeitzone={zeitzone} onSammeln={setSammeln} />

      {/* Ohne Zeitzone der Praxis ist „abgeschlossener Monat“ nicht zu sagen.
          Während der Sammelbuchung steht der Lauf zurück: eine Aufgabe, ein
          Hauptknopf (DESIGN.md Regel 4). */}
      {heute && kandidaten.data && !sammeln ? (
        <Abrechnungslauf
          kandidaten={kandidaten.data}
          heute={heute}
          darfAusstellen={darfAusstellen}
        />
      ) : null}

      {/* Ohne Hinweis: Die Zeilen sagen Person, Klammer und Leistungen selbst
          (UX-005i). */}
      <Section titel="Abzurechnen">
        <Abfragezustand
          abfrage={kandidaten}
          laden="Leistungen werden geladen …"
          fehler="Die abzurechnenden Leistungen konnten nicht geladen werden."
          leer={{
            wenn: (daten) => daten.length === 0,
            titel: 'Nichts abzurechnen',
            beschreibung: 'Jede erfasste Leistung steht auf einer Rechnung.',
          }}
          inKarte
        >
          {(daten) => (
            <ListRows beschriftung="Abzurechnende Leistungen">
              {daten.map((kandidat) => (
                <KandidatenZeile
                  key={`${kandidat.patient_id ?? kandidat.training_relationship_id}-${kandidat.treatment_basis_id ?? kandidat.period_month}-${kandidat.service_area}`}
                  kandidat={kandidat}
                  heute={heute}
                  darfAusstellen={darfAusstellen}
                />
              ))}
            </ListRows>
          )}
        </Abfragezustand>
      </Section>

      <Rechnungsliste />
    </>
  );
}

/**
 * Eine Klammer, die abzurechnen ist - eine Zeile der Liste (DESIGN.md Regel
 * 3; bis zur Bereichsüberholung 4 eine Karte je Klammer).
 *
 * „Entwurf anlegen“ ist die Aktion der Zeile und kein Hauptknopf (ABR-24);
 * der Hauptknopf der Seite ist der Lauf. Was der Lauf (noch) nicht aufnimmt,
 * steht als Wort in der Nebenzeile (ANN-544) - ein Grund, kein Warnzustand.
 */
function KandidatenZeile({
  kandidat,
  heute,
  darfAusstellen,
}: {
  kandidat: Kandidat;
  heute: string | null;
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

  const stand = heute ? laufstand(kandidat, heute) : null;
  const zeitraum =
    kandidat.treatment_basis_id && kandidat.first_performed_on && kandidat.last_performed_on
      ? zeitraumText({ from: kandidat.first_performed_on, to: kandidat.last_performed_on })
      : null;

  const meta = [
    // ABR-032: Mit Grundlage ist die Verordnung die Klammer, darunter der
    // Zeitraum ihrer Leistungen; ohne bleibt es der Monat.
    klammerText(kandidat),
    zeitraum,
    // ABR-009: Eine Rechnung trägt genau einen Bereich (ADR-009 Punkt 16).
    bereichLabels[kandidat.service_area],
    `${kandidat.service_count} ${kandidat.service_count === 1 ? 'Leistung' : 'Leistungen'}`,
    stand ? (laufstandTexte[stand] ?? null) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const aktion =
    darfAusstellen && !kandidat.has_draft ? (
      <Button
        type="button"
        variant="secondary"
        // Kurz sichtbar, ganz vorgelesen (wie „Erfassen“ an den Leistungen):
        // Neben Betrag und Name bleibt am Telefon so Platz für den Namen.
        aria-label={
          anlegen.isPending ? undefined : storno ? 'Korrekturrechnung erstellen' : 'Entwurf anlegen'
        }
        onClick={() => anlegen.mutate()}
        disabled={anlegen.isPending}
      >
        {anlegen.isPending ? 'Wird angelegt …' : storno ? 'Korrektur' : 'Entwurf'}
      </Button>
    ) : kandidat.has_draft && kandidat.draft_id ? (
      // BEF-018: Der Hinweis führt dorthin - als Aktion der Zeile.
      <ButtonLink to={`/abrechnung/rechnungen/${kandidat.draft_id}`} variant="secondary">
        Zum Entwurf
      </ButtonLink>
    ) : undefined;

  return (
    <ListRow
      titel={kandidat.patient_name}
      meta={meta}
      betrag={formatEuro(kandidat.total_cents, kandidat.currency)}
      aktion={aktion}
      darunter={
        storno || kandidat.has_draft || anlegen.isError ? (
          <div className="pb-4">
            {/* Die Herkunft steht an der Zeile (BEF-062): Wer die Leistungen sieht,
          sieht auch, welche Rechnung sie ersetzen. */}
            {storno ? (
              <p className="text-ink-muted text-sm">
                Aus der stornierten Rechnung{' '}
                <Textlink to={`/abrechnung/rechnungen/${storno}`}>
                  {kandidat.cancelled_invoice_number ?? 'ohne Nummer'}
                </Textlink>
                {kandidat.has_draft ? '' : ' – die neue Rechnung wird ihre Korrekturrechnung.'}
              </p>
            ) : null}

            {kandidat.has_draft ? (
              <Statusmeldung className={storno ? 'mt-2' : ''}>
                {storno
                  ? kandidat.draft_replaces_invoice_number
                    ? // Zwei Stornos in einer Klammer: Jede bekommt ihre eigene
                      // Korrektur, nacheinander (ANN-321).
                      `Für diesen Zeitraum steht die Korrektur zu ${kandidat.draft_replaces_invoice_number} als Entwurf. Ist sie ausgestellt, lässt sich hier die Korrekturrechnung zu ${kandidat.cancelled_invoice_number ?? 'der stornierten Rechnung'} erstellen.`
                    : 'Für diesen Zeitraum steht schon ein Entwurf ohne Bezug zur stornierten Rechnung. Bitte ihn verwerfen; danach lässt sich hier die Korrekturrechnung erstellen.'
                  : `${
                      kandidat.treatment_basis_id
                        ? 'Für diese Verordnung steht bereits ein Entwurf.'
                        : 'Für diesen Monat und Bereich steht bereits ein Entwurf.'
                    } Diese Leistungen sind später erfasst worden; sie kommen auf eine zweite Rechnung, sobald der Entwurf ausgestellt oder verworfen ist.`}
              </Statusmeldung>
            ) : null}

            {anlegen.isError ? (
              <Statusmeldung ton="fehler" className="mt-2">
                {/* Meldungen mit eigenem Weg sagen ihn selbst; nur eine Störung
              bekommt den Satz zur Verbindung. */}
                {anlegen.error instanceof WegHinweis
                  ? anlegen.error.message
                  : `${anlegen.error.message} Bitte die Verbindung prüfen und erneut versuchen.`}
              </Statusmeldung>
            ) : null}
          </div>
        ) : undefined
      }
    />
  );
}
