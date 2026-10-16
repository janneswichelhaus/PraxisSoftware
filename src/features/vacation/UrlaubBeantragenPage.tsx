import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { roleLabels } from '@/components/ui/roleLabels';
import {
  aendern,
  beginne,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { todayInTimeZone } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import type { CurrentUser } from '@/features/session/types';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  URLAUB_SCHLUESSEL,
  fetchUrlaub,
  previewLeave,
  requestLeave,
  urlaubSchluessel,
  type Urlaubsstand,
  type Urlaubsvorschau,
} from './api';
import { Zeitraumkalender, type EigenerZeitraum } from './Zeitraumkalender';
import { urlaubsfenster } from './fenster';
import {
  KEINE_WAHL,
  urlaubstage,
  vollstaendig,
  waehleTag,
  zeitraumText,
  type Zeitraumwahl,
} from './zeitraum';

/**
 * Urlaub beantragen, geführt (G7, URL-001, Budget ≤ 6 Tipps, Ziel 5):
 * „Urlaub beantragen“ → erster Tag → letzter Tag → Weiter → Absenden.
 *
 * Seite 1 ist der Kalender. Sobald der Zeitraum steht, zählt der Server die
 * Urlaubstage nach dem Wochenplan ohne Feiertage (ANN-577) und die Zeile im
 * Fuß nennt sie samt Rest - ein Zeitraum ohne Arbeitstag oder über eigenem
 * Urlaub kommt gar nicht erst weiter. Seite 2 fasst zusammen: Zeitraum
 * (ändern), Tage, was danach übrig ist, wer zur selben Zeit fehlt (nur Name
 * und Zeitraum, BEF-066) und wer entscheidet. Die Notiz ist eingeklappt und
 * nur für die Person selbst (ANN-580).
 *
 * owner trägt den eigenen Urlaub direkt ein (ANN-576): dieselben Seiten,
 * der Hauptknopf heißt „Urlaub eintragen“.
 */

type Seite = 'zeitraum' | 'abschluss';

const URLAUBTEXTE = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht beantragt',
  zeile: {
    weitergehen: 'Der Urlaub ist noch nicht beantragt.',
    abmelden: 'Der Urlaub ist noch nicht beantragt – abmelden?',
    bleiben: 'Weiter',
  },
};

export function UrlaubBeantragenPage({ user }: { user: CurrentUser }) {
  const heute = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  const fenster = urlaubsfenster(heute);
  const abfrage = useQuery({
    queryKey: urlaubSchluessel(fenster.von, fenster.bis),
    queryFn: () => fetchUrlaub(fenster.von, fenster.bis),
    retry: false,
  });

  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Urlaub wird geladen …"
      fehler="Der Urlaub konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Urlaub beantragen" />
          {zustand}
        </>
      )}
    >
      {(stand) => <Antrag stand={stand} heute={heute} />}
    </Abfragezustand>
  );
}

function eigeneZeitraeume(stand: Urlaubsstand): EigenerZeitraum[] {
  return stand.own
    .filter((a) => a.kind === 'leave' && (a.status === 'requested' || a.status === 'approved'))
    .map((a) => ({
      starts_on: a.starts_on,
      ends_on: a.ends_on,
      stand: a.status === 'approved' ? 'genehmigt' : 'beantragt',
    }));
}

/** Die Zeile im Fuß des Kalenders: was gewählt ist und was der Server zählt. */
function Wahlzeile({
  wahl,
  vorschau,
  jahr,
}: {
  wahl: Zeitraumwahl;
  vorschau: { data?: Urlaubsvorschau | undefined; isError: boolean; error: unknown };
  jahr: number;
}) {
  if (!wahl.von) return <>Ersten Urlaubstag wählen.</>;
  if (!wahl.bis) return <>Ab {zeitraumText(wahl.von, wahl.von, jahr)} – letzten Tag wählen.</>;
  const zeitraum = zeitraumText(wahl.von, wahl.bis, jahr);
  if (vorschau.isError) {
    return (
      <>
        {zeitraum} ·{' '}
        <span className="text-danger">
          {vorschau.error instanceof Error ? vorschau.error.message : 'Nicht gezählt.'}
        </span>
      </>
    );
  }
  if (!vorschau.data) return <>{zeitraum} · Tage werden gezählt …</>;
  if (vorschau.data.overlaps_own) {
    return (
      <>
        {zeitraum} · <span className="text-danger">überschneidet sich mit Ihrem Urlaub</span>
      </>
    );
  }
  if (vorschau.data.days === 0) {
    return (
      <>
        {zeitraum} · <span className="text-danger">kein Arbeitstag</span>
      </>
    );
  }
  const rest = restDanach(vorschau.data);
  return (
    <>
      {zeitraum} · <strong>{urlaubstage(vorschau.data.days)}</strong>
      {rest === null ? null : <> · danach {rest} übrig</>}
    </>
  );
}

/** Was im Jahr des Beginns danach übrig bleibt; ohne Anspruch `null`. */
function restDanach(vorschau: Urlaubsvorschau): number | null {
  if (vorschau.balance.rest === null) return null;
  return vorschau.balance.rest - (vorschau.days - vorschau.days_following_year);
}

function Antrag({ stand, heute }: { stand: Urlaubsstand; heute: string }) {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const rueckweg = leseRueckweg(suche, '/betrieb/urlaub');
  const queryClient = useQueryClient();
  const jahr = Number(heute.slice(0, 4));
  const selbst = stand.self_entered;

  const [abfolge, setAbfolge] = useState<Abfolge<Seite>>(() => beginne<Seite>('zeitraum'));
  const [wahl, setWahl] = useState<Zeitraumwahl>(KEINE_WAHL);
  const [notiz, setNotiz] = useState('');
  const seite = abfolge.seite;

  const komplett = vollstaendig(wahl);
  const vorschau = useQuery({
    queryKey: [...URLAUB_SCHLUESSEL, 'preview', wahl.von, wahl.bis],
    queryFn: () => previewLeave(wahl.von!, wahl.bis!),
    enabled: komplett,
    retry: false,
    staleTime: 60_000,
  });
  const ergebnis = komplett ? vorschau.data : undefined;
  const kannWeiter = !!ergebnis && ergebnis.days > 0 && !ergebnis.overlaps_own;

  const zurueckGehen = () => {
    const vorher = zurueck(abfolge);
    if (vorher) setAbfolge(vorher);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: komplett || notiz.trim() !== '',
    kompakt: true,
    texte: URLAUBTEXTE,
    schrittZurueck: kannZurueck(abfolge) ? zurueckGehen : undefined,
  });

  const absenden = useMutation({
    mutationFn: () =>
      requestLeave({
        von: wahl.von!,
        bis: wahl.bis!,
        notiz: notiz.trim() === '' ? null : notiz.trim(),
      }),
    onSuccess: async () => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: URLAUB_SCHLUESSEL });
      const zeitraum = zeitraumText(wahl.von!, wahl.bis!, jahr);
      const tageText = ergebnis ? ` (${urlaubstage(ergebnis.days)})` : '';
      void navigate(rueckweg, {
        state: {
          meldung: selbst
            ? `Urlaub eingetragen: ${zeitraum}${tageText}.`
            : `Urlaub beantragt: ${zeitraum}${tageText}. Es entscheidet: ${roleLabels.owner}.`,
        },
      });
    },
  });

  const hauptknopf = selbst ? 'Urlaub eintragen' : 'Urlaub beantragen';

  return (
    <GefuehrterAblauf
      titel={seite === 'zeitraum' ? 'Welche Tage?' : `${hauptknopf}?`}
      objekt={hauptknopf}
      schliessen="Schließen"
      onSchliessen={() => void navigate(rueckweg)}
      seite={seite}
      stand={{
        text: `Schritt ${seite === 'zeitraum' ? 1 : 2} von 2`,
        wert: seite === 'zeitraum' ? 1 : 2,
        von: 2,
      }}
      onZurueck={kannZurueck(abfolge) ? zurueckGehen : undefined}
      schutz={schutz}
      abschluss={seite === 'abschluss'}
      fuss={
        seite === 'zeitraum' ? (
          <div className="flex flex-col gap-2">
            <p className="text-ink text-sm" aria-live="polite">
              <Wahlzeile wahl={wahl} vorschau={vorschau} jahr={jahr} />
            </p>
            <Button
              className="w-full"
              disabled={!kannWeiter}
              onClick={() => setAbfolge(weiter(abfolge, 'abschluss', true))}
            >
              Weiter
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {absenden.isError ? (
              <Statusmeldung ton="fehler">
                {absenden.error instanceof Error
                  ? absenden.error.message
                  : 'Der Urlaub konnte nicht beantragt werden.'}
              </Statusmeldung>
            ) : null}
            <Button
              className="w-full"
              disabled={absenden.isPending || !kannWeiter}
              onClick={() => absenden.mutate()}
            >
              {absenden.isPending ? 'Wird gesendet …' : hauptknopf}
            </Button>
          </div>
        )
      }
    >
      {seite === 'zeitraum' ? (
        <Zeitraumkalender
          heute={heute}
          land={stand.federal_state}
          wahl={wahl}
          eigene={eigeneZeitraeume(stand)}
          onWaehlen={(tag) => setWahl((bisher) => waehleTag(bisher, tag))}
        />
      ) : ergebnis && komplett ? (
        <Zusammenfassung
          wahl={wahl}
          ergebnis={ergebnis}
          jahr={jahr}
          selbst={selbst}
          notiz={notiz}
          onNotiz={setNotiz}
          onAendern={() => setAbfolge(aendern(abfolge, 'zeitraum'))}
        />
      ) : null}
    </GefuehrterAblauf>
  );
}

function Zusammenfassung({
  wahl,
  ergebnis,
  jahr,
  selbst,
  notiz,
  onNotiz,
  onAendern,
}: {
  wahl: { von: string; bis: string };
  ergebnis: Urlaubsvorschau;
  jahr: number;
  selbst: boolean;
  notiz: string;
  onNotiz: (text: string) => void;
  onAendern: () => void;
}) {
  const rest = restDanach(ergebnis);
  const konto = ergebnis.balance;
  const anspruch = konto.entitlement === null ? null : konto.entitlement + (konto.carryover ?? 0);
  const folgejahr = ergebnis.days_following_year;
  return (
    <div className="flex flex-col gap-4">
      <ListRows rahmen={false} beschriftung="Urlaub">
        <ListRow
          titel={zeitraumText(wahl.von, wahl.bis, jahr)}
          meta={
            folgejahr > 0
              ? `${urlaubstage(ergebnis.days)}, davon ${folgejahr} im Jahr ${Number(wahl.bis.slice(0, 4))}`
              : urlaubstage(ergebnis.days)
          }
          aktion={
            <Button
              variant="secondary"
              groesse="kompakt"
              aria-label="Zeitraum ändern"
              onClick={onAendern}
            >
              Ändern
            </Button>
          }
        />
        <ListRow
          titel={
            rest === null || anspruch === null
              ? 'Anspruch noch nicht eingetragen'
              : `Danach ${rest} von ${anspruch} Tagen übrig`
          }
          meta={konto.requested > 0 ? `Dazu ${konto.requested} weitere beantragt` : undefined}
        />
        <ListRow
          titel={
            ergebnis.team.length === 0
              ? 'Zur selben Zeit fehlt niemand'
              : `Zur selben Zeit ${ergebnis.team.length === 1 ? 'fehlt' : 'fehlen'}`
          }
          meta={
            ergebnis.team.length === 0
              ? undefined
              : ergebnis.team
                  .map(
                    (t) =>
                      `${t.name ?? 'Unbekannt'} (${zeitraumText(t.starts_on, t.ends_on, jahr)})`,
                  )
                  .join(', ')
          }
        />
        <ListRow
          titel={selbst ? 'Sie tragen den Urlaub selbst ein' : 'Entscheidet'}
          meta={selbst ? 'Er gilt sofort als genehmigt.' : roleLabels.owner}
        />
      </ListRows>
      <Disclosure summary="Notiz hinzufügen" offen={notiz !== ''}>
        <TextArea
          label="Notiz – nur für Sie sichtbar"
          value={notiz}
          maxLength={500}
          rows={3}
          onChange={(e) => onNotiz(e.target.value)}
        />
      </Disclosure>
    </div>
  );
}
