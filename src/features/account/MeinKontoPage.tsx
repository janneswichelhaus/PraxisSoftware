import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Field } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { isOwner, type CurrentUser } from '@/features/session/types';
import {
  beendeAlleSitzungen,
  bestaetigeZweitenFaktor,
  bestaetigeMfa,
  entferneMfa,
  ladeMfaFaktoren,
  starteMfaEinrichtung,
  type MfaEinrichtung,
} from './api';
import { PasskeyAbschnitt, PinAbschnitt } from '@/features/auth/einrichtung/AnmeldungVerwalten';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

/** Der nächste Schritt nach einem gescheiterten Vorgang (NAV-13, WRT-01). */
const ERNEUT = 'Bitte die Verbindung prüfen und erneut versuchen.';

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
    // Ein Satz als Hinweis; was es nicht gibt, steht nicht dran (UX-005i).
    <Section
      titel="Zweiter Faktor"
      hinweis="Ein Einmalkennwort aus einer App auf dem Telefon, zusätzlich zum Passkey."
    >
      {/* UI-002d, ANN-028: Die Auskunft steht ganz oben und unabhängig davon,
          ob schon ein Faktor eingerichtet ist - sie gilt in beiden Fällen. */}
      <Statusmeldung ton="warnung">
        Die Anmeldung fragt den zweiten Faktor <strong>derzeit nicht ab</strong>; der Passkey prüft
        schon Gerät und Person. Ist er eingerichtet, verlangt der Anmeldedienst ihn beim Einrichten
        und Entfernen eines Passkeys.
      </Statusmeldung>

      {faktoren.isPending ? <LoadingState label="Stand wird geladen …" /> : null}
      {/* Ein Lesefehler mit Ausweg (ZST-04, WRT-01): Die Abfrage wiederholt
          sich nicht von selbst, und ein Neuladen der Seite wäre der teurere
          Weg. */}
      {faktoren.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Der Stand des zweiten Faktors ließ sich nicht laden."
            description={ERNEUT}
            onErneut={() => faktoren.refetch()}
          />
        </div>
      ) : null}

      {faktoren.data && bestaetigt.length > 0 ? (
        <div>
          <Statusmeldung className="mt-4">
            Für dieses Konto ist ein zweiter Faktor eingerichtet.
          </Statusmeldung>
          <div className="mt-4">
            <Rueckfrage
              ausloeser="Zweiten Faktor entfernen"
              bestaetigen="Entfernen"
              bestaetigenLaeuft="Wird entfernt …"
              fehler={
                entfernen.isError
                  ? `Der zweite Faktor konnte nicht entfernt werden. ${ERNEUT}`
                  : undefined
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
        <div>
          {isOwner(user.roles) ? (
            <Statusmeldung className="mt-4">
              Dieses Konto darf Zugänge, Rollen und das Protokoll verwalten und hat noch keinen
              zweiten Faktor. Für diese Rechte ist er vorgesehen, sobald die Anmeldung ihn abfragt.
            </Statusmeldung>
          ) : (
            <Statusmeldung className="mt-4">
              Für dieses Konto ist kein zweiter Faktor eingerichtet.
            </Statusmeldung>
          )}

          {!einrichtung ? (
            // Sekundär: Auf der Seite bleibt „PIN festlegen" der eine
            // Hauptknopf (NAV-20, Bedienprinzip „ein Hauptknopf je Ansicht").
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              disabled={starten.isPending}
              onClick={() => starten.mutate()}
            >
              {starten.isPending ? 'Wird vorbereitet …' : 'Zweiten Faktor einrichten'}
            </Button>
          ) : (
            <div className="mt-5">
              <p className="text-ink-muted text-sm">
                Diesen QR-Code in einer Authenticator-App scannen und anschließend das dort
                angezeigte sechsstellige Einmalkennwort eintragen.
              </p>
              {/* Der QR-Code braucht einen hellen, ruhigen Grund, damit die
                  Kamera ihn liest: die Fläche `surface`, die Weiß ist (TOK-08).
                  Ein Bild rundet mit `rounded-image` (TOK-16). */}
              <img
                src={einrichtung.qrCode}
                alt="QR-Code zum Einrichten des zweiten Faktors"
                className="border-line rounded-image bg-surface mt-4 w-44 border p-2"
              />
              {/* 14 px in Festbreite (Runde 2, SKN-008): Wer abtippt, muss
                  0 und O, 1 und l auseinanderhalten - in 12 px Leise ging
                  das kaum. Der zweite Faktor bleibt einrichtbar (ANN-028). */}
              <p className="text-ink-muted mt-2 text-sm">
                Zum Abtippen:{' '}
                <code
                  data-testid="totp-geheimnis"
                  className="text-ink font-mono text-sm tracking-wide break-all"
                >
                  {einrichtung.secret}
                </code>
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
                      ? 'Das Einmalkennwort wurde nicht angenommen. Bitte das aktuelle aus der App eintragen.'
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
              Der zweite Faktor konnte nicht vorbereitet werden. {ERNEUT}
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
 * Sperre durch die Praxisinhaber:in. Das gehört an die Stelle der Entscheidung
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
        fehler={
          mutation.isError ? `Die Sitzungen konnten nicht beendet werden. ${ERNEUT}` : undefined
        }
        laeuft={mutation.isPending}
        onBestaetigen={() => mutation.mutateAsync()}
        onAbbrechen={() => mutation.reset()}
      >
        <p>
          Alle angemeldeten Geräte werden abgemeldet, dieses eingeschlossen. Sie melden sich danach
          neu an. Passkeys und PIN bleiben dabei bestehen – einen Passkey, der nicht mehr in Ihrer
          Hand ist, oben entfernen.
        </p>
        <p className="mt-3">
          Ein bereits geöffnetes Gerät kann noch bis zu einer Stunde weiterlesen, bevor es sich neu
          anmelden muss. Ist ein Gerät abhandengekommen und eilt es, lassen Sie den Zugang
          zusätzlich von der Praxisinhaber:in sperren – das wirkt sofort.
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
 * Was die Praxisinhaber:in darf — einladen, Rollen vergeben, sperren — steht
 * am Mitarbeiterdatensatz und nicht hier.
 *
 * **Eine Breite für die ganze Seite (NAV-20).** Bis UXR-002 standen hier vier:
 * der Zugang über die volle Fläche, das Kennwort schmal, der zweite Faktor
 * etwas breiter, die Sitzungen ohne Grenze - und die aufgeklappte Rückfrage
 * mit dem wichtigsten Warntext lief bei 1440 px über rund 150 Zeichen je
 * Zeile. Jetzt gilt die Formularbreite des Systems (`max-w-xl`) für alles.
 */
export function MeinKontoPage({ user }: { user: CurrentUser }) {
  return (
    <>
      <PageHeader
        title="Mein Konto"
        description="Anmeldung und Sicherheit dieses Kontos. Ihre Stammdaten pflegen Praxisinhaber:in und Praxismanagement."
      />

      <div className="mt-8 max-w-xl">
        {/* Eine Zeile braucht keinen Rahmen (Leitfaden L2). */}
        <Section titel="Zugang">
          {/* Name und Praxis stehen in der Kopfzeile der Anwendung; hier nur,
              was die Seite sonst nirgends sagt - die Rollen (UX-005i). */}
          <DetailList>
            <DetailRow label="Rollen">
              <span className="flex flex-wrap gap-1.5">
                {user.roles.map((rolle) => (
                  <RoleBadge key={rolle} role={rolle} />
                ))}
              </span>
            </DetailRow>
          </DetailList>
        </Section>

        <PasskeyAbschnitt bestaetigeZweitenFaktor={bestaetigeZweitenFaktor} />
        <PinAbschnitt />
        <ZweiterFaktor user={user} />
        <Sitzungen />

        <Kleingedrucktes className="mt-10">
          {/* Wer Rollen ändert, sagt der Kopf der Seite (UX-005i). */}
          Zweiter Faktor und das Beenden der Sitzungen werden protokolliert – ohne Einmalkennwort
          und ohne Gerätekennung. Einrichten und Entfernen eines Passkeys hält der Anmeldedienst in
          seinem eigenen Protokoll fest. Die PIN und ihre Verwendung werden nicht protokolliert.
        </Kleingedrucktes>
      </div>
    </>
  );
}
