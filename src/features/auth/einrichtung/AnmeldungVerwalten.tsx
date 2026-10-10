import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { hatPin } from '../appPin';
import { EINRICHTUNG_SCHLUESSEL } from './einrichtungsstand';
import { PinFestlegen } from './PinFestlegen';
import {
  PASSKEY_SAETZE,
  PasskeyFehler,
  entfernePasskey,
  ladePasskeys,
  passkeyEinrichten,
  passkeyMoeglich,
} from '../passkey';

export const PASSKEYS_SCHLUESSEL = ['passkeys'] as const;
export const PIN_SCHLUESSEL = ['app-pin'] as const;

/** Ein Zeitpunkt des Anmeldedienstes als Kalendertag in der Zeitzone der Praxis. */
function tag(zeitpunkt: string): string {
  const datum = new Date(zeitpunkt);
  if (Number.isNaN(datum.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeZone: 'Europe/Berlin',
  }).format(datum);
}

function satzVon(fehler: unknown): string {
  return fehler instanceof PasskeyFehler ? fehler.message : PASSKEY_SAETZE.geraet;
}

/**
 * Mit eingerichtetem zweiten Faktor verlangt der Anmeldedienst ihn, bevor ein
 * Passkey eingerichtet oder entfernt wird. Hier wird er für diese Sitzung
 * bestätigt; danach versucht die Person es erneut.
 */
function ZweitenFaktorBestaetigen({
  bestaetige,
  onBestaetigt,
}: {
  bestaetige: (code: string) => Promise<void>;
  onBestaetigt: () => void;
}) {
  const [code, setCode] = useState('');
  const bestaetigen = useMutation({
    mutationFn: () => bestaetige(code),
    onSuccess: () => {
      setCode('');
      onBestaetigt();
    },
  });
  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim() !== '') bestaetigen.mutate();
  }
  return (
    <form onSubmit={absenden} noValidate className="mt-3 flex flex-col gap-3">
      <Field
        label="Code aus der App"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        error={bestaetigen.isError ? bestaetigen.error.message : undefined}
        onChange={(event) => setCode(event.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={bestaetigen.isPending}>
        {bestaetigen.isPending ? 'Wird geprüft …' : 'Zweiten Faktor bestätigen'}
      </Button>
    </form>
  );
}

function brauchtZweitenFaktor(fehler: unknown): boolean {
  return fehler instanceof PasskeyFehler && fehler.message === PASSKEY_SAETZE.zweiterFaktor;
}

/**
 * Die Passkeys des eigenen Kontos (ADR-025 Fassung 2, Punkte 10, 12 und 14).
 *
 * Einrichten auf diesem Gerät, die Liste mit Datum, Entfernen. Der letzte
 * Passkey lässt sich nicht entfernen: Ohne Kennwort sperrte sich das Konto
 * sonst selbst aus (ANN-327). Wer nur einen hat, sieht den Rat zum zweiten.
 *
 * Für Praxis- und Plattformkonten gleich (ADR-023 Punkt 17); den zweiten
 * Faktor kennt nur „Mein Konto“ der Praxis und reicht seine Bestätigung
 * herein.
 */
export function PasskeyAbschnitt({
  bestaetigeZweitenFaktor,
  rahmen = false,
}: {
  /** Nur, wo ein zweiter Faktor eingerichtet werden kann. */
  bestaetigeZweitenFaktor?: ((code: string) => Promise<void>) | undefined;
  /** Wie die übrigen Abschnitte der Seite (Plattform). */
  rahmen?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  const passkeys = useQuery({ queryKey: PASSKEYS_SCHLUESSEL, queryFn: ladePasskeys, retry: false });
  const geht = passkeyMoeglich();

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: PASSKEYS_SCHLUESSEL });
    await queryClient.invalidateQueries({ queryKey: EINRICHTUNG_SCHLUESSEL });
  }

  const einrichten = useMutation({ mutationFn: passkeyEinrichten, onSuccess: neuLaden });
  const entfernen = useMutation({
    mutationFn: (id: string) => entfernePasskey(id),
    onSuccess: neuLaden,
  });

  const liste = passkeys.data ?? [];

  return (
    <Section
      titel="Passkeys"
      rahmen={rahmen}
      hinweis="Damit melden Sie sich an und entsperren die Anwendung – mit Gesicht, Finger oder der Sperre des Geräts."
    >
      {passkeys.isPending ? <LoadingState label="Passkeys werden geladen …" /> : null}
      {passkeys.isError ? (
        <ErrorState title={satzVon(passkeys.error)} onErneut={() => void passkeys.refetch()} />
      ) : null}

      {passkeys.isSuccess && liste.length === 0 ? (
        <Statusmeldung ton="warnung">
          Für dieses Konto ist noch kein Passkey eingerichtet.
        </Statusmeldung>
      ) : null}
      {passkeys.isSuccess && liste.length === 1 ? (
        <Statusmeldung ton="warnung">
          Nur ein Passkey: Richten Sie einen zweiten ein, etwa auf dem Rechner. Geht der einzige
          verloren, braucht es eine neue Einladung der Praxis.
        </Statusmeldung>
      ) : null}

      {liste.length > 0 ? (
        <ul className="divide-line mt-3 divide-y">
          {liste.map((passkey) => (
            <li key={passkey.id} className="flex flex-col gap-2 py-3">
              <div>
                <p className="text-ink font-medium">{passkey.name ?? 'Passkey'}</p>
                <p className="text-ink-muted text-sm">
                  Eingerichtet am {tag(passkey.angelegtAm)}
                  {passkey.zuletztAm ? ` · zuletzt benutzt am ${tag(passkey.zuletztAm)}` : ''}
                </p>
              </div>
              {liste.length > 1 ? (
                <Rueckfrage
                  ausloeser="Entfernen"
                  ausloeserVariante="quiet"
                  ausloeserGroesse="kompakt"
                  bezeichnung={`${passkey.name ?? 'Passkey'} entfernen`}
                  bestaetigen="Passkey entfernen"
                  bestaetigenLaeuft="Wird entfernt …"
                  fehler={entfernen.isError ? satzVon(entfernen.error) : undefined}
                  laeuft={entfernen.isPending}
                  onBestaetigen={() => entfernen.mutateAsync(passkey.id)}
                  onAbbrechen={() => entfernen.reset()}
                >
                  <p>
                    Mit diesem Passkey kann sich danach niemand mehr anmelden. Das ist der Weg für
                    ein verlorenes oder weitergegebenes Gerät.
                  </p>
                </Rueckfrage>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {einrichten.isError ? (
        <div className="mt-3">
          <ErrorState title={satzVon(einrichten.error)} />
        </div>
      ) : null}
      {bestaetigeZweitenFaktor &&
      (brauchtZweitenFaktor(einrichten.error) || brauchtZweitenFaktor(entfernen.error)) ? (
        <ZweitenFaktorBestaetigen
          bestaetige={bestaetigeZweitenFaktor}
          onBestaetigt={() => {
            einrichten.reset();
            entfernen.reset();
          }}
        />
      ) : null}
      {einrichten.isSuccess ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Der Passkey ist eingerichtet.
        </Statusmeldung>
      ) : null}
      {geht ? (
        <Button
          variant="secondary"
          className="mt-4"
          disabled={einrichten.isPending}
          onClick={() => einrichten.mutate()}
        >
          {einrichten.isPending ? 'Wird eingerichtet …' : 'Passkey auf diesem Gerät einrichten'}
        </Button>
      ) : (
        <Statusmeldung ton="warnung" className="mt-3">
          {PASSKEY_SAETZE.nichtUnterstuetzt}
        </Statusmeldung>
      )}
    </Section>
  );
}

/**
 * Die App-PIN (ADR-025 Punkt 11): ob es eine gibt, und eine neue festlegen.
 * Festlegen geht nur kurz nach einer Anmeldung; `PinFestlegen` bestätigt
 * dafür mit dem Passkey (ANN-325).
 */
export function PinAbschnitt({ rahmen = false }: { rahmen?: boolean } = {}) {
  const queryClient = useQueryClient();
  const pin = useQuery({ queryKey: PIN_SCHLUESSEL, queryFn: hatPin, retry: false });
  const [gesetzt, setGesetzt] = useState(false);

  return (
    <Section
      titel="PIN"
      rahmen={rahmen}
      hinweis="Der Rückweg, wenn der Passkey einmal nicht klappt. Sie entsperrt nur eine laufende Sitzung auf diesem Gerät und meldet nie neu an."
    >
      {pin.isPending ? <LoadingState label="Stand wird geladen …" /> : null}
      {pin.isError ? (
        <ErrorState title={pin.error.message} onErneut={() => void pin.refetch()} />
      ) : null}
      {pin.isSuccess ? (
        <Statusmeldung ton={pin.data ? 'neutral' : 'warnung'} className="mb-4">
          {pin.data ? 'Eine PIN ist festgelegt.' : 'Noch keine PIN festgelegt.'}
        </Statusmeldung>
      ) : null}
      {gesetzt ? (
        <Statusmeldung ton="erfolg" className="mb-4">
          Die neue PIN gilt ab sofort.
        </Statusmeldung>
      ) : null}
      <PinFestlegen
        knopf={pin.data ? 'PIN ändern' : 'PIN festlegen'}
        onGesetzt={() => {
          setGesetzt(true);
          void queryClient.invalidateQueries({ queryKey: PIN_SCHLUESSEL });
          void queryClient.invalidateQueries({ queryKey: EINRICHTUNG_SCHLUESSEL });
        }}
      />
    </Section>
  );
}
