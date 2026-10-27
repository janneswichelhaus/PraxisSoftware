import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Tile, TileGrid } from '@/components/ui/Tile';
import type { CurrentUser } from '@/features/core/session/types';
import { useMeldungAusVerlauf } from '@/lib/meldung';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  TIME_ACCOUNT_KEY,
  fetchTimeAccount,
  timeAccountKey,
  withdrawEntry,
  type Entry,
  type TimeAccount,
} from './api';
import { PERSON_PARAM, TIME_ACCOUNT_HOME, entryDate, personPath } from './paths';
import { KIND_TITLE, signedHours } from './rules';
import { todayInTimeZone } from '@/lib/datum';

/**
 * Zeitkonto (ZK-001, Überholung 9).
 *
 * Eine Seite für alle Rollen; was jemand sieht, entscheidet der Server
 * (ANN-596): das eigene Konto mit Saldo und allen Einträgen, für owner und
 * Büro dazu die Konten aller je Person - ohne Summe über alle (§20). Die Zeile
 * einer Person öffnet ihr Konto auf derselben Route (`?person=…`).
 *
 * Bewusst ein eigenes Konto und keine Ableitung aus Kalender oder Touren:
 * geplante Behandlungsstunden sind keine geleistete Arbeitszeit (§20).
 * Eintragen und Zurückweisen sind geführte Abläufe auf eigenen Seiten (G9,
 * G9b).
 */

export function TimeAccountPage({ user }: { user: CurrentUser }) {
  const [search] = useSearchParams();
  const today = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  const person = search.get(PERSON_PARAM);
  // Die Bestätigung einmal - nach Neuladen oder „Zurück“ nicht wieder.
  const { meldung: notice, verwerfen } = useMeldungAusVerlauf();
  const query = useQuery({
    queryKey: timeAccountKey(person),
    queryFn: () => fetchTimeAccount(person),
    retry: false,
  });
  const own = !person || person === query.data?.my_staff_member_id;
  const name = query.data?.account?.name ?? 'Unbekannte Person';
  const here = personPath(own ? null : person);
  const recordTo = own
    ? `${TIME_ACCOUNT_HOME}/eintragen`
    : `${TIME_ACCOUNT_HOME}/eintragen?${PERSON_PARAM}=${person}`;

  return (
    <>
      {own ? null : (
        <Rueckweg standard={TIME_ACCOUNT_HOME} beschriftung="Zurück zu den Zeitkonten" />
      )}
      <PageHeader
        title={own ? 'Zeitkonto' : `Zeitkonto von ${name}`}
        actions={
          query.data?.account ? (
            <ButtonLink to={mitRueckweg(recordTo, here)}>Eintragen</ButtonLink>
          ) : null
        }
      />
      {notice ? (
        <Rueckmeldung key={notice.schluessel} className="mb-6">
          {notice.text}
        </Rueckmeldung>
      ) : null}
      <Abfragezustand
        abfrage={query}
        laden="Zeitkonto wird geladen …"
        fehler="Das Zeitkonto konnte nicht geladen werden."
        inKarte
      >
        {(state) => (
          <Content state={state} own={own} here={here} today={today} onChanged={verwerfen} />
        )}
      </Abfragezustand>
    </>
  );
}

function Content({
  state,
  own,
  here,
  today,
  onChanged,
}: {
  state: TimeAccount;
  own: boolean;
  here: string;
  today: string;
  /** Ein Vorgang auf der Seite hat die Bestätigung oben überholt. */
  onChanged: () => void;
}) {
  const account = state.account;
  const entries = account?.entries.filter((entry) => entry.status !== 'withdrawn') ?? [];
  // Die Konten der anderen nur auf der eigenen Seite - je Person, ohne Summe.
  const others = own
    ? state.accounts.filter((a) => a.staff_member_id !== state.my_staff_member_id)
    : [];

  return (
    // Abschnitt zu Abschnitt 32 px: der Abstand der Spalte, nicht dazu der
    // eigene Rand jedes Abschnitts (Design-Review Überholung 7).
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      {account ? (
        <>
          <Section titel={own ? 'Mein Saldo' : 'Saldo'}>
            <TileGrid>
              <Tile label="Saldo">{signedHours(account.balance_minutes)}</Tile>
            </TileGrid>
          </Section>
          <Listenabschnitt
            titel="Einträge"
            anzahl={entries.length}
            leer={{ titel: 'Noch nichts eingetragen' }}
          >
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                staffMemberId={account.staff_member_id}
                here={here}
                today={today}
                onChanged={onChanged}
              />
            ))}
          </Listenabschnitt>
        </>
      ) : (
        <EmptyState
          inKarte
          title="Kein eigenes Zeitkonto"
          description="Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz."
        />
      )}

      {state.can_book_others && own ? (
        <Listenabschnitt
          titel="Zeitkonten"
          anzahl={others.length}
          leer={{ titel: 'Keine weiteren Zeitkonten' }}
        >
          {others.map((a) => (
            <ListRow
              key={a.staff_member_id}
              titel={a.name ?? 'Unbekannte Person'}
              betrag={signedHours(a.balance_minutes)}
              to={personPath(a.staff_member_id)}
            />
          ))}
        </Listenabschnitt>
      ) : null}
    </div>
  );
}

function EntryRow({
  entry,
  staffMemberId,
  here,
  today,
  onChanged,
}: {
  entry: Entry;
  staffMemberId: string;
  here: string;
  today: string;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => withdrawEntry(entry.id),
    onSuccess: async () => {
      // Die Bestätigung oben nennt einen Saldo, der jetzt nicht mehr gilt
      // (Praxis-Review Überholung 9, Runde 2).
      onChanged();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TIME_ACCOUNT_KEY }),
        // Ein Freizeitausgleich gibt die Zeit wieder als Arbeitszeit frei.
        queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] }),
      ]);
    },
  });
  const rejected = entry.status === 'rejected';
  const meta = [
    entry.starts_at && entry.ends_at ? `${entry.starts_at}–${entry.ends_at}` : null,
    entry.note,
    entry.entered_by_name ? `eingetragen von ${entry.entered_by_name}` : null,
    rejected && entry.rejection_note
      ? `Zurückgewiesen${entry.rejected_by_name ? ` von ${entry.rejected_by_name}` : ''}: ${
          entry.rejection_note
        }`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      titel={
        // Der Übertrag steht für die gelöschten Einträge eines Jahres (ANN-597).
        entry.kind === 'carryover'
          ? `${KIND_TITLE.carryover} aus ${entry.on_date.slice(0, 4)}`
          : `${KIND_TITLE[entry.kind]} · ${entryDate(entry.on_date, today)}`
      }
      meta={meta}
      betrag={signedHours(entry.minutes)}
      gedaempft={rejected}
      status={rejected ? <Badge ton="kritisch">Zurückgewiesen</Badge> : null}
      darunter={
        entry.can_withdraw || entry.can_reject ? (
          // Unter der Zeile in voller Breite: in der Zeile bräche die
          // Rückfrage bei 375 px (Design-Review Überholung 7). Zurückweisen ist
          // selten und folgenreich - leise am Ende wie Zurücknehmen
          // (Design-Review Überholung 9, DESIGN.md 9.16).
          <BelowRow>
            {entry.can_reject ? (
              <ButtonLink
                variant="quiet"
                groesse="kompakt"
                to={mitRueckweg(
                  `${TIME_ACCOUNT_HOME}/zurueckweisen/${entry.id}?${PERSON_PARAM}=${staffMemberId}`,
                  here,
                )}
              >
                Zurückweisen
              </ButtonLink>
            ) : null}
            {entry.can_withdraw ? (
              <Rueckfrage
                ausloeser="Zurücknehmen"
                ausloeserVariante="quiet"
                ausloeserGroesse="kompakt"
                bezeichnung="Eintrag zurücknehmen"
                bestaetigen="Ja, zurücknehmen"
                bestaetigenLaeuft="Wird zurückgenommen …"
                fehler={withdraw.isError ? withdraw.error.message : undefined}
                onBestaetigen={() => withdraw.mutateAsync()}
              >
                {entry.kind === 'time_off'
                  ? 'Der Saldo zählt ihn nicht mehr; die Zeit ist wieder Arbeitszeit.'
                  : 'Der Saldo zählt ihn nicht mehr.'}
              </Rueckfrage>
            ) : null}
          </BelowRow>
        ) : undefined
      }
    />
  );
}

function BelowRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-x-3 pb-2">{children}</div>;
}
