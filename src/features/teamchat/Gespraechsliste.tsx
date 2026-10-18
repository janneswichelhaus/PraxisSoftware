import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMatch, useNavigate } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import type { CurrentUser } from '@/features/session/types';
import {
  KANAELE_KEY,
  NACHSEHEN_MS,
  TEAMCHAT_KEY,
  ZAEHLER_KEY,
  ZAEHLER_MS,
  fetchKanaele,
  fetchZaehler,
  istFett,
  kanalTitel,
  markiereAllesGelesen,
  ordneKanaele,
  type Kanal,
} from './api';
import { useEntwuerfe } from './entwuerfe';
import type { Spalten } from './flaeche';
import { ENTWUERFE, GEMERKT, NEU, SUCHE, TEAMCHAT, THREADS, gespraechPfad } from './pfade';
import { standardGespraech } from './speicher';
import { LEERE_SUCHE, sucheSetzen } from './suche';
import { Schloss } from './Zeichen';

/**
 * Die Gespräche (TEAM-002) - am Telefon die Seite `/team`, ab 900 px die
 * Spalte links neben dem offenen Gespräch, wie die Seitenleiste bei Slack:
 * oben die Suche und „Neu“, darunter Threads, Für später und Entwürfe, dann
 * Favoriten, Kanäle und Direktnachrichten, Archiviertes eingeklappt.
 *
 * Was nach der eigenen Stufe zählt (ANN-647), trägt Zeichen und Wort
 * (DESIGN.md Regel 5): Erwähnungen „für dich“, sonst „n neu“ - nicht nur
 * fette Schrift wie bei Slack, die in der Sonne nicht trägt. Am Telefon ist
 * die Liste die Seite (Zeilen 56 px), daneben eine schmale Spalte (`dicht`).
 * Kanäle legen owner und Teamleitung an, das prüft der Server; „Neu“ steht
 * allen offen (Direkt- und Gruppennachrichten).
 */
export function Gespraechsliste({ user, spalten }: { user: CurrentUser; spalten: Spalten }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche, setSuche] = useState('');
  const kanaele = useQuery({
    queryKey: KANAELE_KEY,
    queryFn: fetchKanaele,
    refetchInterval: NACHSEHEN_MS,
  });
  const zaehler = useQuery({
    queryKey: ZAEHLER_KEY,
    queryFn: fetchZaehler,
    refetchInterval: ZAEHLER_MS,
  });
  const entwuerfe = useEntwuerfe(user.profile.id);
  const allesGelesen = useMutation({
    mutationFn: markiereAllesGelesen,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });
  const gewaehlt = useMatch(`${TEAMCHAT}/:kanalId/*`)?.params.kanalId ?? null;
  // Rechts steht die Suche mit ihrem eigenen Feld - kein zweites daneben.
  const sucheOffen = useMatch(SUCHE) !== null;
  const telefon = spalten === 1;

  function suchen(e: FormEvent) {
    e.preventDefault();
    const text = suche.trim();
    if (text.length < 2) return;
    sucheSetzen({ ...LEERE_SUCHE, text });
    void navigate(SUCHE);
  }

  const z = zaehler.data;
  // Neben einem Gespräch ist „Senden“ der Hauptknopf (Regel 4).
  const neu = (
    <ButtonLink to={NEU} groesse="kompakt" variant={telefon ? 'primary' : 'secondary'}>
      Neu
    </ButtonLink>
  );

  return (
    <div className={telefon ? 'px-4 pt-4 pb-6 sm:px-6' : 'px-4 pt-4 pb-6'}>
      {telefon ? <PageHeader title="Teamchat" actions={neu} /> : null}
      <div className="flex items-end gap-2">
        {sucheOffen && !telefon ? (
          <div className="min-w-0 flex-1" />
        ) : (
          <form role="search" onSubmit={suchen} className="min-w-0 flex-1">
            <SearchField
              label="In Nachrichten suchen"
              placeholder="Suchen"
              maxLength={100}
              value={suche}
              onChange={setSuche}
            />
          </form>
        )}
        {telefon ? null : neu}
      </div>

      <ListRows beschriftung="Ansichten" className="mt-4">
        <ListRow
          dicht={!telefon}
          to={THREADS}
          uebergang={telefon}
          titel="Threads"
          status={
            z && z.threads_new > 0 ? (
              <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.neu}>
                {z.threads_new} neu
              </Badge>
            ) : undefined
          }
        />
        <ListRow
          dicht={!telefon}
          to={GEMERKT}
          uebergang={telefon}
          titel="Für später"
          status={
            z && z.reminders_due > 0 ? (
              <Badge ton="warnung">{z.reminders_due} fällig</Badge>
            ) : z && z.saved_open > 0 ? (
              <span className="text-ink-muted text-sm tabular-nums">{z.saved_open}</span>
            ) : undefined
          }
        />
        <ListRow
          dicht={!telefon}
          to={ENTWUERFE}
          uebergang={telefon}
          titel="Entwürfe und Geplantes"
          status={
            entwuerfe.length + (z?.scheduled ?? 0) > 0 ? (
              <span className="text-ink-muted text-sm tabular-nums">
                {entwuerfe.length + (z?.scheduled ?? 0)}
              </span>
            ) : undefined
          }
        />
      </ListRows>

      <Abfragezustand
        abfrage={kanaele}
        laden="Gespräche werden geladen …"
        fehler="Die Gespräche konnten nicht geladen werden."
      >
        {(daten) => {
          const { favoriten, kanaele: offene, direkt, archiviert } = ordneKanaele(daten);
          // Auf `/team` steht am Rechner das Standardgespräch rechts daneben.
          const offen =
            gewaehlt ?? (telefon ? null : (standardGespraech(daten, user.profile.id)?.id ?? null));
          const ungelesen = [...favoriten, ...offene, ...direkt].some((k) => istFett(k));
          const zeile = (kanal: Kanal) => (
            <Gespraechszeile
              key={kanal.id}
              kanal={kanal}
              aktiv={kanal.id === offen}
              telefon={telefon}
            />
          );
          return (
            <>
              {favoriten.length > 0 ? (
                <Listenabschnitt titel="Favoriten">{favoriten.map(zeile)}</Listenabschnitt>
              ) : null}
              <Listenabschnitt
                titel="Kanäle"
                aktion={
                  ungelesen ? (
                    <Button
                      variant="quiet"
                      groesse="kompakt"
                      disabled={allesGelesen.isPending}
                      onClick={() => allesGelesen.mutate()}
                    >
                      Alle gelesen
                    </Button>
                  ) : undefined
                }
                leer={{ titel: 'Noch kein Kanal' }}
              >
                {offene.map(zeile)}
              </Listenabschnitt>
              <Listenabschnitt
                titel="Direktnachrichten"
                leer={{ titel: 'Noch keine Direktnachricht', aktion: neu }}
              >
                {direkt.map(zeile)}
              </Listenabschnitt>
              {archiviert.length > 0 ? (
                <div className="mt-8">
                  <Disclosure summary="Archiv" anzahl={archiviert.length}>
                    <ListRows beschriftung="Archivierte Kanäle" rahmen={false}>
                      {archiviert.map(zeile)}
                    </ListRows>
                  </Disclosure>
                </div>
              ) : null}
            </>
          );
        }}
      </Abfragezustand>
    </div>
  );
}

function Gespraechszeile({
  kanal,
  aktiv,
  telefon,
}: {
  kanal: Kanal;
  aktiv: boolean;
  /** Am Telefon ist die Liste die Seite; daneben eine schmale Spalte. */
  telefon: boolean;
}) {
  const zaehlt = istFett(kanal);
  const meta =
    kanal.kind === 'direct' && kanal.partner_active === false
      ? 'Nicht mehr im Team'
      : kanal.notify === 'none'
        ? 'Stumm'
        : undefined;
  return (
    <ListRow
      dicht={!telefon}
      to={gespraechPfad(kanal)}
      aktiv={aktiv}
      uebergang={telefon}
      titel={
        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
          {kanal.kind === 'private' ? <Schloss /> : null}
          <span className="truncate">{kanalTitel(kanal)}</span>
        </span>
      }
      meta={meta}
      status={
        kanal.mentions > 0 ? (
          <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.erwaehnt}>
            {kanal.mentions} für dich
          </Badge>
        ) : zaehlt && kanal.unread > 0 ? (
          <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.neu}>
            {kanal.unread} neu
          </Badge>
        ) : undefined
      }
    />
  );
}
