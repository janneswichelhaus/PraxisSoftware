import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Field } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { isOwner, type CurrentUser } from '@/features/session/types';
import {
  KENNWORT_MINDESTLAENGE,
  aendereKennwort,
  beendeAlleSitzungen,
  bestaetigeMfa,
  entferneMfa,
  kennwortProblem,
  ladeMfaFaktoren,
  starteMfaEinrichtung,
  type MfaEinrichtung,
} from './api';

/** Kennwort ändern — die Selbstbedienung für den Normalfall (STAFF-004a). */
function KennwortAendern() {
  const [kennwort, setKennwort] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => aendereKennwort(kennwort),
    onSuccess: () => {
      setKennwort('');
      setWiederholung('');
    },
  });

  function absenden() {
    if (mutation.isPending) return;
    const problem = kennwortProblem(kennwort, wiederholung);
    if (problem) {
      setFehler(problem);
      return;
    }
    setFehler(null);
    mutation.mutate();
  }

  return (
    <Section
      titel="Kennwort"
      hinweis={`Mindestens ${KENNWORT_MINDESTLAENGE} Zeichen. Ein langer Satz ist sicherer und leichter zu merken als ein kurzes Kennwort mit Sonderzeichen.`}
    >
      <div className="flex max-w-sm flex-col gap-4">
        <Field
          label="Neues Kennwort"
          type="password"
          name="new_password"
          autoComplete="new-password"
          value={kennwort}
          onChange={(event) => {
            setKennwort(event.target.value);
            setFehler(null);
          }}
        />
        <Field
          label="Neues Kennwort wiederholen"
          type="password"
          name="new_password_repeat"
          autoComplete="new-password"
          value={wiederholung}
          error={fehler ?? undefined}
          onChange={(event) => {
            setWiederholung(event.target.value);
            setFehler(null);
          }}
        />

        {mutation.isError ? (
          <Statusmeldung ton="fehler">Das Kennwort konnte nicht geändert werden.</Statusmeldung>
        ) : null}
        {mutation.isSuccess ? (
          <Statusmeldung>
            Das Kennwort wurde geändert. Angemeldete Geräte bleiben angemeldet — dafür gibt es unten
            „Alle Sitzungen beenden".
          </Statusmeldung>
        ) : null}

        <Button type="button" disabled={mutation.isPending} onClick={absenden}>
          {mutation.isPending ? 'Wird geändert …' : 'Kennwort ändern'}
        </Button>
      </div>
    </Section>
  );
}

/**
 * Zweiter Faktor (STAFF-004b).
 *
 * Für `owner` ist er nach ADR-010 Punkt 10 Pflicht bei privilegiertem Zugriff.
 * Diese Anwendung **fragt ihn heute beim Anmelden nicht ab** (ANN-028): Ein
 * Zwang, bevor irgendjemand einen Faktor eingerichtet hat, würde die einzige
 * Praxisinhaberin aussperren, und ein Weg zurück wäre genau der privilegierte
 * Produktionszugriff, den ADR-010 Punkt 9 ausschließt. Jannes hat am
 * 2026-09-12 entschieden, den zweiten Faktor erst nach dem Online-Schalten zu
 * integrieren (`FIX-EPIC-002`).
 *
 * Deshalb steht das hier, und zwar **vor** der Einrichtung (UI-002d): Wer
 * einen Faktor anlegt, soll nicht glauben, er schütze bereits etwas. Ein
 * Hinweis, der zum Einrichten rät, ohne die Wirkung zu nennen, wäre eine
 * Zusage ohne Deckung - genau die Klasse Fehler, die FIX-EPIC-001 abgeräumt
 * hat. Der Satz verschwindet, sobald die Anmeldung den Faktor prüft.
 */
function ZweiterFaktor({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const [einrichtung, setEinrichtung] = useState<MfaEinrichtung | null>(null);
  const [code, setCode] = useState('');

  const faktoren = useQuery({
    queryKey: ['mfa-faktoren'],
    queryFn: ladeMfaFaktoren,
    retry: false,
  });

  const bestaetigt = (faktoren.data ?? []).filter((faktor) => faktor.bestaetigt);

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: ['mfa-faktoren'] });
  }

  const starten = useMutation({
    mutationFn: starteMfaEinrichtung,
    onSuccess: (daten) => {
      setEinrichtung(daten);
      setCode('');
    },
  });

  const bestaetigen = useMutation({
    mutationFn: () => bestaetigeMfa(einrichtung!.factorId, code),
    onSuccess: async () => {
      setEinrichtung(null);
      setCode('');
      await neuLaden();
    },
  });

  const entfernen = useMutation({
    mutationFn: (factorId: string) => entferneMfa(factorId),
    onSuccess: neuLaden,
  });

  return (
    <Section
      titel="Zweiter Faktor"
      hinweis="Ein Einmalkennwort aus einer App auf dem Telefon, zusätzlich zum Kennwort. Kein SMS-Code - dafür bräuchte es einen weiteren Dienstleister."
    >
      {/* UI-002d, ANN-028: Die Auskunft steht ganz oben und unabhängig davon,
          ob schon ein Faktor eingerichtet ist - sie gilt in beiden Fällen. */}
      <Statusmeldung ton="warnung" className="max-w-md">
        Die Anmeldung fragt den zweiten Faktor <strong>derzeit noch nicht ab</strong>. Er lässt sich
        einrichten und bleibt gespeichert, schützt die Anmeldung aber erst, wenn die Anwendung
        online erreichbar ist. Bis dahin trägt allein das Kennwort.
      </Statusmeldung>

      {faktoren.isPending ? <LoadingState label="Stand wird geladen …" /> : null}
      {faktoren.isError ? (
        <Statusmeldung ton="fehler">
          Der Stand des zweiten Faktors ließ sich nicht laden.
        </Statusmeldung>
      ) : null}

      {faktoren.data && bestaetigt.length > 0 ? (
        <div className="max-w-md">
          <Statusmeldung className="mt-4">
            Für diesen Zugang ist ein zweiter Faktor eingerichtet.
          </Statusmeldung>
          <div className="mt-4">
            <Rueckfrage
              ausloeser="Zweiten Faktor entfernen"
              bestaetigen="Entfernen"
              bestaetigenLaeuft="Wird entfernt …"
              fehler={
                entfernen.isError ? 'Der zweite Faktor konnte nicht entfernt werden.' : undefined
              }
              laeuft={entfernen.isPending}
              onBestaetigen={() => entfernen.mutateAsync(bestaetigt[0]!.id)}
              onAbbrechen={() => entfernen.reset()}
            >
              <p>
                Der eingerichtete Faktor wird gelöscht. Die Anmeldung verlangt ihn ohnehin noch
                nicht; sobald sie es tut, müsste er neu eingerichtet werden. Der Vorgang wird
                protokolliert.
              </p>
            </Rueckfrage>
          </div>
        </div>
      ) : null}

      {faktoren.data && bestaetigt.length === 0 ? (
        <div className="max-w-md">
          {isOwner(user.roles) ? (
            <Statusmeldung className="mt-4">
              Dieser Zugang darf Zugänge, Rollen und das Auditlog verwalten und hat noch keinen
              zweiten Faktor. Für diese Rechte ist er vorgesehen, sobald die Anmeldung ihn abfragt.
            </Statusmeldung>
          ) : (
            <Statusmeldung className="mt-4">
              Für diesen Zugang ist kein zweiter Faktor eingerichtet.
            </Statusmeldung>
          )}

          {!einrichtung ? (
            <Button
              type="button"
              className="mt-4"
              disabled={starten.isPending}
              onClick={() => starten.mutate()}
            >
              {starten.isPending ? 'Wird vorbereitet …' : 'Zweiten Faktor einrichten'}
            </Button>
          ) : (
            <div className="mt-5">
              <p className="text-ink-muted text-sm">
                Diesen Code in einer Authenticator-App scannen und anschließend das dort angezeigte
                sechsstellige Einmalkennwort eintragen.
              </p>
              <img
                src={einrichtung.qrCode}
                alt="QR-Code zum Einrichten des zweiten Faktors"
                className="border-line rounded-card mt-4 w-44 border bg-white p-2"
              />
              <p className="text-ink-subtle mt-2 text-xs break-all">
                Zum Abtippen: <code>{einrichtung.secret}</code>
              </p>

              <div className="mt-4 flex max-w-xs flex-col gap-3">
                <Field
                  label="Einmalkennwort aus der App"
                  name="totp_code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  error={
                    bestaetigen.isError
                      ? 'Der Code wurde nicht angenommen. Bitte erneut versuchen.'
                      : undefined
                  }
                  onChange={(event) => setCode(event.target.value)}
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={code.trim().length < 6 || bestaetigen.isPending}
                    onClick={() => bestaetigen.mutate()}
                  >
                    {bestaetigen.isPending ? 'Wird geprüft …' : 'Einrichtung abschließen'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEinrichtung(null);
                      bestaetigen.reset();
                    }}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            </div>
          )}

          {starten.isError ? (
            <Statusmeldung ton="fehler" className="mt-3">
              Der zweite Faktor konnte nicht vorbereitet werden.
            </Statusmeldung>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

/**
 * Alle Sitzungen beenden — der Weg nach einem verlorenen Gerät (R10).
 *
 * Der Text sagt, was der Vorgang leistet **und wo er aufhört** (ANN-044,
 * Oberflächen-Checkliste Punkt 6). Ein verlorenes Telefon behält sein
 * Zugriffstoken bis zu einer Stunde; wer das nicht abwarten kann, braucht die
 * Sperre durch die Praxisleitung. Das gehört an die Stelle der Entscheidung
 * und nicht in eine Fußnote — sonst hält jemand ein gestohlenes Gerät für
 * ausgesperrt, das es noch nicht ist.
 */
function Sitzungen() {
  const mutation = useMutation({ mutationFn: beendeAlleSitzungen });

  return (
    <Section
      titel="Sitzungen"
      hinweis="Meldet dieses Konto auf allen Geräten ab und nimmt ihnen die Möglichkeit, sich zu verlängern."
    >
      <Rueckfrage
        ausloeser="Alle Sitzungen beenden"
        bestaetigen="Überall abmelden"
        bestaetigenLaeuft="Wird beendet …"
        fehler={mutation.isError ? 'Die Sitzungen konnten nicht beendet werden.' : undefined}
        laeuft={mutation.isPending}
        onBestaetigen={() => mutation.mutateAsync()}
        onAbbrechen={() => mutation.reset()}
      >
        <p>
          Alle angemeldeten Geräte werden abgemeldet, dieses eingeschlossen. Sie melden sich danach
          neu an. Das Kennwort ändert sich dadurch nicht — wurde es womöglich bekannt, zuerst oben
          ein neues setzen.
        </p>
        <p className="mt-3">
          Ein bereits geöffnetes Gerät kann noch bis zu einer Stunde weiterlesen, bevor es neu
          anmelden muss. Ist ein Gerät abhandengekommen und eilt es, lassen Sie den Zugang
          zusätzlich von der Praxisleitung sperren — das wirkt sofort.
        </p>
      </Rueckfrage>
    </Section>
  );
}

/**
 * Das eigene Konto (STAFF-004).
 *
 * Erreichbar für jedes angemeldete Konto, unabhängig von der Rolle: Kennwort,
 * zweiter Faktor und Sitzungen gehören der Person, nicht der Praxisleitung.
 * Was die Praxisleitung darf — einladen, Rollen vergeben, sperren — steht am
 * Mitarbeiterdatensatz und nicht hier.
 */
export function MeinKontoPage({ user }: { user: CurrentUser }) {
  return (
    <>
      <PageHeader
        title="Mein Konto"
        description="Anmeldung und Sicherheit dieses Zugangs. Ihre Stammdaten pflegt die Praxisleitung."
      />

      <Section titel="Zugang">
        <DetailList>
          <DetailRow label="Name">{user.profile.display_name}</DetailRow>
          <DetailRow label="Praxis">{user.organizationName ?? '—'}</DetailRow>
          <DetailRow label="Rollen">
            <span className="flex flex-wrap gap-1.5">
              {user.roles.map((rolle) => (
                <RoleBadge key={rolle} role={rolle} />
              ))}
            </span>
          </DetailRow>
        </DetailList>
      </Section>

      <KennwortAendern />
      <ZweiterFaktor user={user} />
      <Sitzungen />

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Kennwortänderung, zweiter Faktor und das Beenden der Sitzungen werden protokolliert — ohne
        Kennwort, ohne Code und ohne Gerätekennung. Rollen und Sperre ändert ausschließlich die
        Praxisleitung.
      </p>
    </>
  );
}
