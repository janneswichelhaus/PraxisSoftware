import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { beginne, kannZurueck, weiter, zurueck, type Abfolge } from '@/components/ui/abfolge';
import { formatLocalDate, todayInTimeZone } from '@/features/appointments/api';
import { DaysToReschedule } from '@/features/appointments/DaysToReschedule';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import type { CurrentUser } from '@/features/session/types';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  URLAUB_SCHLUESSEL,
  decideLeaveRequest,
  fetchUrlaub,
  urlaubSchluessel,
  type Entscheidung,
  type OffenerAntrag,
} from './api';
import { urlaubsfenster } from './fenster';
import { tagKurz, tage, urlaubstage, zeitraumText } from './zeitraum';

/**
 * Über einen Urlaubsantrag entscheiden (G7b, URL-001): je Antrag eine Seite
 * mit allem, was die Entscheidung braucht - Zeitraum und Tage, was der
 * Person danach bleibt, wer zur selben Zeit fehlt, wie viele Termine im
 * Zeitraum liegen. Genehmigen sind zwei Tipps (öffnen, Genehmigen), Ablehnen
 * drei und der Grund, der Pflicht ist (ANN-576).
 *
 * Die Notiz der Person steht hier nicht - sie sieht nur die Person selbst
 * (BEF-066, ANN-580); der Server liefert sie gar nicht erst aus.
 *
 * Nach dem Genehmigen sind die Tage im Kalender gesperrt (ANN-578). Termine
 * sagt niemand still ab: Die Tage mit Terminen stehen da, jeder mit dem Weg
 * zu „Tag umplanen“ (G2).
 */

type Seite = 'angaben' | 'ablehnen' | 'fertig';

const ABLEHNTEXTE = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht abgelehnt',
  zeile: {
    weitergehen: 'Der Antrag ist noch nicht abgelehnt.',
    abmelden: 'Der Antrag ist noch nicht abgelehnt – abmelden?',
    bleiben: 'Weiter',
  },
};

export function UrlaubEntscheidenPage({ user }: { user: CurrentUser }) {
  const { antragId } = useParams();
  const [suche] = useSearchParams();
  const rueckweg = leseRueckweg(suche, '/betrieb/urlaub');
  const heute = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  const fenster = urlaubsfenster(heute);
  const abfrage = useQuery({
    queryKey: urlaubSchluessel(fenster.von, fenster.bis),
    queryFn: () => fetchUrlaub(fenster.von, fenster.bis),
    retry: false,
  });
  // Die Entscheidung bleibt stehen, auch wenn der Antrag nach dem Neuladen
  // nicht mehr unter den offenen ist.
  const [entschieden, setEntschieden] = useState<{
    antrag: OffenerAntrag;
    ergebnis: Entscheidung;
  } | null>(null);

  if (entschieden) {
    return (
      <Ablauf
        antrag={entschieden.antrag}
        ergebnis={entschieden.ergebnis}
        heute={heute}
        user={user}
        rueckweg={rueckweg}
        onEntschieden={() => undefined}
      />
    );
  }

  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Antrag wird geladen …"
      fehler="Der Antrag konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Urlaubsantrag" />
          {zustand}
        </>
      )}
    >
      {(stand) => {
        const antrag = stand.to_decide.find((a) => a.id === antragId);
        if (!antrag) {
          // Entschieden, zurückgezogen, unbekannt oder nicht zu entscheiden -
          // die Seite unterscheidet das nicht (PROJECT_PRINCIPLES.md 13).
          return (
            <>
              <PageHeader title="Urlaubsantrag" />
              <EmptyState
                inKarte
                title="Kein offener Antrag"
                aktion={
                  <ButtonLink to={rueckweg} variant="secondary">
                    Zurück
                  </ButtonLink>
                }
              />
            </>
          );
        }
        return (
          <Ablauf
            antrag={antrag}
            ergebnis={null}
            heute={heute}
            user={user}
            rueckweg={rueckweg}
            onEntschieden={(ergebnis) => setEntschieden({ antrag, ergebnis })}
          />
        );
      }}
    </Abfragezustand>
  );
}

function Ablauf({
  antrag,
  ergebnis,
  heute,
  user,
  rueckweg,
  onEntschieden,
}: {
  antrag: OffenerAntrag;
  ergebnis: Entscheidung | null;
  heute: string;
  user: CurrentUser;
  rueckweg: string;
  onEntschieden: (ergebnis: Entscheidung) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jahr = Number(heute.slice(0, 4));
  const storno = antrag.kind === 'cancellation';
  const name = antrag.name ?? 'Unbekannte Person';

  const [abfolge, setAbfolge] = useState<Abfolge<Seite>>(() =>
    beginne<Seite>(ergebnis ? 'fertig' : 'angaben'),
  );
  const [grund, setGrund] = useState('');
  const seite = ergebnis ? 'fertig' : abfolge.seite;

  const zurueckGehen = () => {
    const vorher = zurueck(abfolge);
    if (vorher) setAbfolge(vorher);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: seite === 'ablehnen' && grund.trim() !== '',
    kompakt: true,
    texte: ABLEHNTEXTE,
    schrittZurueck: seite !== 'fertig' && kannZurueck(abfolge) ? zurueckGehen : undefined,
  });

  const entscheiden = useMutation({
    mutationFn: (genehmigen: boolean) =>
      decideLeaveRequest({
        antragId: antrag.id,
        genehmigen,
        grund: genehmigen ? null : grund.trim(),
      }),
    onSuccess: async (antwort) => {
      freigeben();
      onEntschieden(antwort);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: URLAUB_SCHLUESSEL }),
        // Genehmigter Urlaub sperrt die Tage im Kalender (ANN-578).
        queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] }),
      ]);
    },
  });

  const zeitraum = zeitraumText(antrag.starts_on, antrag.ends_on, jahr);
  const objekt = `${storno ? 'Storno' : 'Urlaub'} von ${name}`;

  if (seite === 'fertig' && ergebnis) {
    const genehmigt = ergebnis.status === 'approved';
    return (
      <GefuehrterAblauf
        titel={genehmigt ? (storno ? 'Storno genehmigt' : 'Genehmigt') : 'Abgelehnt'}
        objekt={objekt}
        schliessen="Schließen"
        onSchliessen={() => void navigate(rueckweg)}
        seite="fertig"
        abschluss
        fuss={
          <Button className="w-full" onClick={() => void navigate(rueckweg)} data-autofocus>
            Fertig
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <Statusmeldung ton="erfolg">
            {/* Ohne Genitiv: „Lukas Schulzs“ ginge schief (Design-Review). */}
            {genehmigt
              ? storno
                ? `Urlaub von ${name}, ${zeitraum}, ist storniert. Die Tage sind wieder frei.`
                : `Urlaub von ${name}, ${zeitraum}, ist genehmigt. Die Tage sind im Kalender gesperrt.`
              : `${name} sieht die Ablehnung mit Ihrem Grund.`}
          </Statusmeldung>
          {genehmigt ? (
            <DaysToReschedule
              staffMemberId={antrag.staff_member_id}
              days={ergebnis.appointment_days}
              user={user}
              returnTo={rueckweg}
            />
          ) : null}
        </div>
      </GefuehrterAblauf>
    );
  }

  if (seite === 'ablehnen') {
    return (
      <GefuehrterAblauf
        titel="Warum nicht?"
        objekt={objekt}
        schliessen="Schließen"
        onSchliessen={() => void navigate(rueckweg)}
        seite="ablehnen"
        onZurueck={zurueckGehen}
        schutz={schutz}
        fuss={
          <div className="flex flex-col gap-2">
            {entscheiden.isError ? (
              <Statusmeldung ton="fehler">
                {entscheiden.error instanceof Error
                  ? entscheiden.error.message
                  : 'Die Entscheidung konnte nicht gespeichert werden.'}
              </Statusmeldung>
            ) : null}
            <Button
              className="w-full"
              disabled={grund.trim() === '' || entscheiden.isPending}
              onClick={() => entscheiden.mutate(false)}
            >
              {entscheiden.isPending ? 'Wird gespeichert …' : 'Ablehnen'}
            </Button>
          </div>
        }
      >
        <TextArea
          label={`Grund – ${name} sieht ihn`}
          value={grund}
          maxLength={500}
          rows={4}
          required
          data-autofocus
          onChange={(e) => setGrund(e.target.value)}
        />
      </GefuehrterAblauf>
    );
  }

  const konto = antrag.balance;
  const anspruch = konto.entitlement === null ? null : konto.entitlement + (konto.carryover ?? 0);
  const imJahr = Number(antrag.starts_on.slice(0, 4)) === konto.year;
  // Ein Storno gibt die Tage zurück, ein Urlaub nimmt sie - das Konto des
  // Beginnjahrs nur dessen Tage, nicht die im Jahr danach (Praxis-Review).
  const tageImJahr = antrag.days - antrag.days_following_year;
  const danach =
    konto.rest === null ? null : storno ? konto.rest + tageImJahr : konto.rest - tageImJahr;
  // An abweichenden Arbeitszeiten hält das Genehmigen an: vorher nennen.
  const abweichend = antrag.exception_days;

  return (
    <GefuehrterAblauf
      titel={storno ? 'Storno genehmigen?' : 'Urlaub genehmigen?'}
      objekt={objekt}
      schliessen="Schließen"
      onSchliessen={() => void navigate(rueckweg)}
      seite="angaben"
      schutz={schutz}
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {abweichend.length > 0 ? (
            <>
              <Statusmeldung ton="fehler">
                {`Abweichende Arbeitszeiten am ${abweichend.map(tagKurz).join(', ')} – erst in der Planung ändern, dann genehmigen.`}
              </Statusmeldung>
              <ButtonLink
                variant="secondary"
                className="w-full"
                to={`/praxis/planung?person=${antrag.staff_member_id}`}
              >
                Zur Planung
              </ButtonLink>
            </>
          ) : null}
          {entscheiden.isError ? (
            <Statusmeldung ton="fehler">
              {entscheiden.error instanceof Error
                ? entscheiden.error.message
                : 'Die Entscheidung konnte nicht gespeichert werden.'}
            </Statusmeldung>
          ) : null}
          <Button
            className="w-full"
            disabled={entscheiden.isPending || abweichend.length > 0}
            onClick={() => entscheiden.mutate(true)}
          >
            {entscheiden.isPending
              ? 'Wird gespeichert …'
              : storno
                ? 'Storno genehmigen'
                : 'Genehmigen'}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={entscheiden.isPending}
            onClick={() => {
              entscheiden.reset();
              setAbfolge(weiter(abfolge, 'ablehnen'));
            }}
          >
            Ablehnen
          </Button>
        </div>
      }
    >
      <ListRows rahmen={false} beschriftung="Antrag">
        <ListRow
          titel={zeitraum}
          meta={storno ? `Storno · ${tage(antrag.days)} wieder frei` : urlaubstage(antrag.days)}
        />
        {imJahr ? (
          <ListRow
            titel={
              danach === null || anspruch === null
                ? 'Anspruch noch nicht eingetragen'
                : `Danach ${danach} von ${anspruch} Tagen übrig`
            }
            meta={
              konto.requested > (storno ? 0 : tageImJahr)
                ? `Dazu ${konto.requested - (storno ? 0 : tageImJahr)} weitere beantragt`
                : undefined
            }
          />
        ) : null}
        {storno ? null : (
          <>
            <ListRow
              titel={
                antrag.team.length === 0
                  ? 'Zur selben Zeit fehlt niemand'
                  : `Zur selben Zeit ${antrag.team.length === 1 ? 'fehlt' : 'fehlen'}`
              }
              meta={
                antrag.team.length === 0
                  ? undefined
                  : antrag.team
                      .map(
                        (t) =>
                          `${t.name ?? 'Unbekannt'} (${zeitraumText(t.starts_on, t.ends_on, jahr)})`,
                      )
                      .join(', ')
              }
            />
            <ListRow
              titel={
                antrag.appointments === 0
                  ? 'Keine Termine im Zeitraum'
                  : `${antrag.appointments} ${antrag.appointments === 1 ? 'Termin' : 'Termine'} im Zeitraum`
              }
              meta={antrag.appointments === 0 ? undefined : 'Nach dem Genehmigen umplanen'}
            />
          </>
        )}
        <ListRow
          titel="Beantragt"
          meta={formatLocalDate(antrag.requested_at, user.organizationTimeZone ?? 'Europe/Berlin')}
        />
      </ListRows>
    </GefuehrterAblauf>
  );
}
