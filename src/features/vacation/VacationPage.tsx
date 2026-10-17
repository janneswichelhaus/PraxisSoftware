import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { todayInTimeZone } from '@/features/appointments/api';
import { isOwner, type CurrentUser } from '@/features/session/types';
import {
  URLAUB_SCHLUESSEL,
  fetchUrlaub,
  requestLeaveCancellation,
  urlaubSchluessel,
  withdrawLeaveRequest,
  type EigenerAntrag,
  type Urlaubskonto,
  type Urlaubsstand,
} from './api';
import { useMeldungAusVerlauf } from '@/lib/meldung';
import { urlaubsfenster } from './fenster';
import { statusAnzeige, tage, urlaubstage, zeitraumText } from './zeitraum';

/**
 * Urlaub (URL-001, Überholung 7) - ersetzt die Vorschau.
 *
 * Eine Seite für alle Rollen; was jemand sieht, entscheidet der Server
 * (BEF-066, ANN-580): eigene Anträge mit allem, wer im Team genehmigt fehlt
 * nur mit Name und Zeitraum ab heute, offene Anträge anderer für owner (ohne
 * Notiz), die Urlaubskonten je Person nur für owner. Keine Summe über alle
 * Personen (§20).
 *
 * Reihenfolge: was jemand warten lässt (zu entscheiden), dann das eigene
 * Konto und die eigenen Anträge, dann eingeklappt das Team, zuletzt für
 * owner die Konten. Beantragen und Entscheiden sind geführte Abläufe auf
 * eigenen Seiten (G7, G7b).
 */
export function VacationPage({ user }: { user: CurrentUser }) {
  const heute = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  const fenster = urlaubsfenster(heute);
  // Die Bestätigung einmal - nach Neuladen oder „Zurück“ nicht wieder.
  const { meldung } = useMeldungAusVerlauf();
  const abfrage = useQuery({
    queryKey: urlaubSchluessel(fenster.von, fenster.bis),
    queryFn: () => fetchUrlaub(fenster.von, fenster.bis),
    retry: false,
  });
  const beantragen = isOwner(user.roles) ? 'Urlaub eintragen' : 'Urlaub beantragen';

  return (
    <>
      <PageHeader
        title="Urlaub"
        actions={
          abfrage.data?.my_staff_member_id ? (
            <ButtonLink to="/betrieb/urlaub/beantragen">{beantragen}</ButtonLink>
          ) : null
        }
      />
      {meldung ? (
        <Rueckmeldung key={meldung.schluessel} className="mb-6">
          {meldung.text}
        </Rueckmeldung>
      ) : null}
      <Abfragezustand
        abfrage={abfrage}
        laden="Urlaub wird geladen …"
        fehler="Der Urlaub konnte nicht geladen werden."
        inKarte
      >
        {(stand) => <Inhalt stand={stand} heute={heute} />}
      </Abfragezustand>
    </>
  );
}

function Inhalt({ stand, heute }: { stand: Urlaubsstand; heute: string }) {
  const jahr = Number(heute.slice(0, 4));
  const eigene = stand.own.filter(sichtbar);

  return (
    // Abschnitt zu Abschnitt 32 px: der Abstand der Spalte, nicht dazu der
    // eigene Rand jedes Abschnitts (Design-Review, DESIGN.md Rhythmus).
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      {stand.can_decide && stand.to_decide.length > 0 ? (
        <Listenabschnitt titel="Zu entscheiden" anzahl={stand.to_decide.length}>
          {stand.to_decide.map((antrag) => (
            <ListRow
              key={antrag.id}
              titel={antrag.name ?? 'Unbekannte Person'}
              meta={`${antrag.kind === 'cancellation' ? 'Storno · ' : ''}${zeitraumText(
                antrag.starts_on,
                antrag.ends_on,
                jahr,
              )} · ${urlaubstage(antrag.days)}`}
              to={`/betrieb/urlaub/entscheiden/${antrag.id}`}
            />
          ))}
        </Listenabschnitt>
      ) : null}

      {stand.my_staff_member_id && stand.balance ? (
        <Section titel={`Mein Urlaub ${stand.balance.year}`}>
          <Konto konto={stand.balance} />
        </Section>
      ) : null}

      {stand.my_staff_member_id ? (
        <Listenabschnitt
          titel="Meine Anträge"
          anzahl={eigene.length}
          leer={{ titel: 'Noch kein Urlaub beantragt' }}
        >
          {eigene.map((antrag) => (
            <EigeneZeile
              key={antrag.id}
              antrag={antrag}
              heute={heute}
              jahr={jahr}
              selbst={stand.self_entered}
            />
          ))}
        </Listenabschnitt>
      ) : null}

      {stand.team.length > 0 ? (
        <Disclosure summary="Abwesend im Team" anzahl={stand.team.length} kopf="betont">
          <Listenabschnitt titel="Genehmigter Urlaub" ebene={3}>
            {stand.team.map((t) => (
              <ListRow
                key={`${t.staff_member_id}-${t.starts_on}`}
                titel={t.name ?? 'Unbekannt'}
                meta={zeitraumText(t.starts_on, t.ends_on, jahr)}
              />
            ))}
          </Listenabschnitt>
        </Disclosure>
      ) : null}

      {stand.can_manage_entitlements && stand.balances.length > 0 ? (
        <Listenabschnitt titel={`Urlaubskonten ${jahr}`} anzahl={stand.balances.length}>
          {stand.balances.map((k) => (
            <ListRow
              key={k.staff_member_id}
              titel={k.name ?? 'Unbekannt'}
              meta={kontoZeile(k.balance)}
              status={
                k.balance.entitlement === null ? <Badge ton="warnung">Anspruch fehlt</Badge> : null
              }
              betrag={k.balance.rest === null ? null : `${k.balance.rest} übrig`}
              to={`/betrieb/urlaub/anspruch/${k.staff_member_id}`}
            />
          ))}
        </Listenabschnitt>
      ) : null}
    </div>
  );
}

/**
 * Die Rückfrage einer Zeile steht darunter in voller Breite: In der Zeile
 * neben Zeitraum und Abzeichen bräche sie bei 375 px (Design-Review).
 */
function unterDerZeile(inhalt: ReactNode): ReactNode {
  if (inhalt === null) return null;
  return <div className="flex flex-wrap items-center justify-end gap-x-3 pb-2">{inhalt}</div>;
}

/** Zurückgezogenes und erledigte Stornos stehen nicht mehr da. */
function sichtbar(antrag: EigenerAntrag): boolean {
  if (antrag.status === 'withdrawn') return false;
  if (antrag.kind === 'cancellation') return antrag.status !== 'approved';
  return true;
}

function kontoZeile(konto: Urlaubskonto): string {
  const teile = [
    konto.entitlement === null
      ? null
      : `Anspruch ${konto.entitlement}${konto.carryover ? ` + ${konto.carryover}` : ''}`,
    `genehmigt ${konto.approved}`,
    konto.requested > 0 ? `beantragt ${konto.requested}` : null,
  ];
  return teile.filter(Boolean).join(' · ');
}

function Konto({ konto }: { konto: Urlaubskonto }) {
  return (
    <TileGrid>
      {konto.rest === null ? (
        <Tile label="Übrig" ton="warnung" zusatz="Anspruch fehlt noch">
          –
        </Tile>
      ) : (
        <Tile
          label="Übrig"
          zusatz={`von ${(konto.entitlement ?? 0) + (konto.carryover ?? 0)} Tagen`}
        >
          {tage(konto.rest)}
        </Tile>
      )}
      <Tile label="Genehmigt">{tage(konto.approved)}</Tile>
      {konto.requested > 0 ? <Tile label="Beantragt">{tage(konto.requested)}</Tile> : null}
    </TileGrid>
  );
}

function EigeneZeile({
  antrag,
  heute,
  jahr,
  selbst,
}: {
  antrag: EigenerAntrag;
  heute: string;
  jahr: number;
  selbst: boolean;
}) {
  const queryClient = useQueryClient();
  const neuLaden = () => queryClient.invalidateQueries({ queryKey: URLAUB_SCHLUESSEL });
  const zurueckziehen = useMutation({
    mutationFn: () => withdrawLeaveRequest(antrag.id),
    onSuccess: neuLaden,
  });
  const stornieren = useMutation({
    mutationFn: () => requestLeaveCancellation(antrag.id),
    onSuccess: async () => {
      await Promise.all([
        neuLaden(),
        queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] }),
      ]);
    },
  });

  const storno = antrag.kind === 'cancellation';
  const anzeige = statusAnzeige(antrag.status, antrag.open_cancellation);
  const zeitraum = zeitraumText(antrag.starts_on, antrag.ends_on, jahr);
  const stornierbar =
    !storno &&
    antrag.status === 'approved' &&
    !antrag.open_cancellation &&
    antrag.starts_on >= heute;

  const meta = [
    storno ? `Storno · ${tage(antrag.days)}` : urlaubstage(antrag.days),
    antrag.status === 'rejected' && antrag.decision_note ? `Grund: ${antrag.decision_note}` : null,
    antrag.message ? `Notiz: ${antrag.message}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      titel={storno ? `Storno: ${zeitraum}` : zeitraum}
      meta={meta}
      status={
        anzeige ? (
          <Badge ton={anzeige.ton} eigenesZeichen={anzeige.zeichen}>
            {anzeige.text}
          </Badge>
        ) : null
      }
      darunter={unterDerZeile(
        antrag.status === 'requested' ? (
          <Rueckfrage
            ausloeser="Zurückziehen"
            ausloeserVariante="quiet"
            ausloeserGroesse="kompakt"
            bezeichnung={storno ? 'Storno zurückziehen' : 'Antrag zurückziehen'}
            bestaetigen="Ja, zurückziehen"
            bestaetigenLaeuft="Wird zurückgezogen …"
            fehler={zurueckziehen.isError ? zurueckziehen.error.message : undefined}
            onBestaetigen={() => zurueckziehen.mutateAsync()}
          >
            {storno ? 'Der Urlaub bleibt dann genehmigt.' : 'Der Antrag wird zurückgezogen.'}
          </Rueckfrage>
        ) : stornierbar ? (
          <Rueckfrage
            ausloeser="Stornieren"
            ausloeserVariante="quiet"
            ausloeserGroesse="kompakt"
            bezeichnung="Urlaub stornieren"
            bestaetigen={selbst ? 'Ja, stornieren' : 'Storno beantragen'}
            bestaetigenLaeuft="Wird gesendet …"
            fehler={stornieren.isError ? stornieren.error.message : undefined}
            onBestaetigen={() => stornieren.mutateAsync()}
          >
            {selbst
              ? 'Der Urlaub wird storniert, die Tage sind wieder frei.'
              : 'Bis zur Entscheidung bleibt der Urlaub genehmigt.'}
          </Rueckfrage>
        ) : null,
      )}
    />
  );
}
