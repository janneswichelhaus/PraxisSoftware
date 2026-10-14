import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  BENACHRICHTIGUNGEN,
  BENACHRICHTIGUNGSARTEN,
  type Benachrichtigungsart,
} from '@/lib/begriffe';
import { eigenerEndpunkt, pushAbmelden, pushErlauben, pushStand, type PushStand } from '@/lib/push';
import {
  BEREICHSNAME,
  benachrichtigungSchluessel,
  type Benachrichtigungswahl,
  type Plattformzugang,
} from './api';
import { usePlattformApi } from './einsicht';
import { datum } from './zeit';

/**
 * „Ich → Einstellungen → Benachrichtigungen" (KOM-011, ADR-024 Punkte 10,
 * 11, 15; DSN-001 Abschnitt 2).
 *
 * Von Anfang an aus. Die Person wählt je Zugang, je Art und je Weg - E-Mail
 * ist der Regelweg, Push eine Wahl auf diesem Gerät - und ihre Ruhezeit.
 * Abschalten kostet nichts, und die Übersicht zeigt alles auch ohne
 * Benachrichtigung. Was die Praxis für alle abgeschaltet hat, steht da und
 * ist nicht wählbar.
 */

const ENDPUNKT_SCHLUESSEL = ['push-endpoint'] as const;
const STUNDEN = Array.from({ length: 24 }, (_, i) => i);
const stunde = (h: number) => `${String(h).padStart(2, '0')}:00 Uhr`;

export function Benachrichtigungen({
  zugaenge,
  einstieg = false,
}: {
  zugaenge: Plattformzugang[];
  /** Im Einstieg ohne eigenen Rahmen und ohne zweite Überschrift (POR-019). */
  einstieg?: boolean;
}) {
  const stand = pushStand();
  const { data: endpunkt = null, isPending } = useQuery({
    queryKey: ENDPUNKT_SCHLUESSEL,
    queryFn: eigenerEndpunkt,
    retry: false,
  });
  const lesbar = zugaenge.filter((z) => z.readable);
  if (lesbar.length === 0) return null;
  if (einstieg) {
    return (
      <div className="mt-6">
        <GeraetAbschnitt stand={stand} endpunkt={endpunkt} zugaenge={lesbar} />
        {isPending ? null : (
          <div className="mt-6 flex flex-col gap-8">
            {lesbar.map((z) => (
              <WahlFuerZugang key={z.access_id} zugang={z} endpunkt={endpunkt} />
            ))}
          </div>
        )}
      </div>
    );
  }
  // Unter „Einstellungen“ die Wahl je Zugang auf Abruf (ANN-468): Sechs
  // Arten mit Ruhezeit sind je Zugang eine Bildschirmlänge; offen standen
  // sie bei zwei Zugängen über 3.000 px untereinander.
  return (
    <Section
      titel="Benachrichtigungen"
      hinweis="Von Anfang an aus. Alles, was zu tun ist, sehen Sie auch ohne Benachrichtigung in Ihrer Übersicht."
    >
      <div className="flex flex-col gap-3">
        <div className="border-line bg-surface rounded-card border px-4 py-3">
          <GeraetAbschnitt stand={stand} endpunkt={endpunkt} zugaenge={lesbar} />
        </div>
        {isPending
          ? null
          : lesbar.map((z) => (
              <Disclosure
                key={z.access_id}
                inKarte
                kopf="betont"
                summary={lesbar.length > 1 ? zugangsname(z) : 'Benachrichtigungen wählen'}
              >
                <WahlFuerZugang zugang={z} endpunkt={endpunkt} />
              </Disclosure>
            ))}
      </div>
    </Section>
  );
}

function zugangsname(z: Plattformzugang): string {
  return z.access_kind === 'self'
    ? `Für ${z.relationship_kind === 'training' ? 'Ihr' : 'Ihre'} ${BEREICHSNAME[z.relationship_kind]}`
    : `Für ${z.represented_name ?? 'eine andere Person'}`;
}

/** Push auf diesem Gerät: erlauben oder ausschalten, oder sagen, warum nicht. */
function GeraetAbschnitt({
  stand,
  endpunkt,
  zugaenge,
}: {
  stand: PushStand;
  endpunkt: string | null;
  zugaenge: Plattformzugang[];
}) {
  const api = usePlattformApi();
  const queryClient = useQueryClient();
  const neuLaden = async () => {
    await queryClient.invalidateQueries({ queryKey: ENDPUNKT_SCHLUESSEL });
    await queryClient.invalidateQueries({ queryKey: ['platform-notifications'] });
  };
  const erlauben = useMutation({
    mutationFn: async () => {
      const geraet = await pushErlauben();
      await api.registriereGeraet(
        zugaenge.map((z) => z.access_id),
        geraet,
      );
    },
    onSettled: neuLaden,
  });
  const ausschalten = useMutation({
    mutationFn: async () => {
      if (endpunkt !== null) await api.entferneGeraet(endpunkt);
      await pushAbmelden();
    },
    onSettled: neuLaden,
  });

  return (
    <div>
      <Zwischentitel>Mitteilungen auf diesem Gerät</Zwischentitel>
      {endpunkt !== null ? (
        <>
          <p className="text-ink mt-1 text-base">
            Dieses Gerät ist eingetragen. Welche Mitteilungen es bekommt, wählen Sie unten.
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            disabled={ausschalten.isPending}
            onClick={() => ausschalten.mutate()}
          >
            Auf diesem Gerät ausschalten
          </Button>
        </>
      ) : stand.moeglich ? (
        <>
          <p className="text-ink mt-1 text-base">
            Ihr Telefon kann Sie zusätzlich zur E-Mail benachrichtigen. Der Browser fragt Sie
            einmal, ob Sie das erlauben.
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            disabled={erlauben.isPending}
            onClick={() => erlauben.mutate()}
          >
            Auf diesem Gerät erlauben
          </Button>
        </>
      ) : (
        <p className="text-ink-muted mt-1 text-base">
          {stand.grund === 'abgelehnt'
            ? 'Sie haben Mitteilungen für diese Seite im Browser abgelehnt. Ändern können Sie das in den Einstellungen Ihres Browsers.'
            : 'Auf diesem Gerät sind Mitteilungen nicht möglich. Benachrichtigungen per E-Mail gehen trotzdem.'}
        </p>
      )}
      {erlauben.error ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {erlauben.error.message}
        </Statusmeldung>
      ) : null}
      {ausschalten.error ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {ausschalten.error.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}

function WahlFuerZugang({
  zugang,
  endpunkt,
}: {
  zugang: Plattformzugang;
  endpunkt: string | null;
}) {
  const api = usePlattformApi();
  const schluessel = benachrichtigungSchluessel(zugang.access_id, endpunkt);
  const { data, isPending, isError } = useQuery({
    queryKey: schluessel,
    queryFn: () => api.ladeBenachrichtigungen(zugang.access_id, endpunkt),
    retry: false,
  });
  if (isPending) return <LoadingState label="Benachrichtigungen werden geladen …" />;
  if (isError || !data) {
    return <ErrorState title="Ihre Benachrichtigungen konnten nicht geladen werden." />;
  }
  return <Wahlformular zugang={zugang} gespeichert={data} />;
}

function umschalten(liste: Benachrichtigungsart[], art: Benachrichtigungsart) {
  return liste.includes(art) ? liste.filter((x) => x !== art) : [...liste, art];
}

function Wahlformular({
  zugang,
  gespeichert,
}: {
  zugang: Plattformzugang;
  gespeichert: Benachrichtigungswahl;
}) {
  const api = usePlattformApi();
  const queryClient = useQueryClient();
  const [mail, setMail] = useState(gespeichert.email_kinds);
  const [push, setPush] = useState(gespeichert.push_kinds);
  const [von, setVon] = useState(gespeichert.quiet_from);
  const [bis, setBis] = useState(gespeichert.quiet_until);
  const speichern = useMutation({
    mutationFn: () =>
      api.speichereBenachrichtigungen(zugang.access_id, {
        email_kinds: mail,
        push_kinds: push,
        quiet_from: von,
        quiet_until: bis,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-notifications'] }),
  });
  const geraet = gespeichert.device_registered;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        speichern.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <ul className="flex flex-col gap-4">
        {BENACHRICHTIGUNGSARTEN.map((art) => {
          const eintrag = BENACHRICHTIGUNGEN[art];
          const aus = gespeichert.disabled_kinds.includes(art);
          return (
            <li key={art} className="border-line border-b pb-4 last:border-b-0">
              <fieldset disabled={aus}>
                <legend className="text-ink text-base font-medium">{eintrag.name}</legend>
                <p className="text-ink-muted text-sm">
                  {aus
                    ? 'Die Praxis hat diese Benachrichtigung für alle abgeschaltet.'
                    : eintrag.hinweis}
                </p>
                {aus ? null : (
                  <div className="mt-1 flex flex-wrap gap-x-6">
                    <Checkbox
                      label="Per E-Mail"
                      checked={mail.includes(art)}
                      onChange={() => setMail(umschalten(mail, art))}
                    />
                    {geraet ? (
                      <Checkbox
                        label="Auf diesem Gerät"
                        checked={push.includes(art)}
                        onChange={() => setPush(umschalten(push, art))}
                      />
                    ) : null}
                  </div>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink text-base font-medium">Ruhezeit</legend>
        <p className="text-ink-muted text-sm">
          In dieser Zeit kommt nichts. Was hineinfiele, kommt danach oder entfällt, wenn es dann
          keinen Sinn mehr hat. Gleiche Uhrzeiten heißen: keine Ruhezeit.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Ab" value={von} onChange={(e) => setVon(Number(e.target.value))}>
            {STUNDEN.map((h) => (
              <option key={h} value={h}>
                {stunde(h)}
              </option>
            ))}
          </Select>
          <Select label="Bis" value={bis} onChange={(e) => setBis(Number(e.target.value))}>
            {STUNDEN.map((h) => (
              <option key={h} value={h}>
                {stunde(h)}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>
      <Kleingedrucktes>
        Höchstens eine Benachrichtigung je Art und Tag, höchstens zehn in der Woche. Bleibt eine
        Reaktion aus, kommt keine Erinnerung daran.
      </Kleingedrucktes>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          Speichern
        </Button>
        {speichern.isSuccess ? <Statusmeldung ton="erfolg">Gespeichert.</Statusmeldung> : null}
        {speichern.isError ? (
          <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
        ) : gespeichert.chosen_at && !speichern.isSuccess ? (
          <Statusmeldung>Zuletzt gewählt am {datum(gespeichert.chosen_at)}.</Statusmeldung>
        ) : null}
      </div>
    </form>
  );
}
