import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { EINLADUNG_TITEL } from '@/app/tabtitel';
import { ANGEMELDET, BRIEF, SCHLUESSEL } from '@/app/tuerzeichen';
import { kennwortTestzugang } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { hatPin } from '@/features/auth/appPin';
import { AnmeldungEinrichten } from '@/features/auth/einrichtung/AnmeldungEinrichten';
import { useFokusNachWechsel } from '@/features/auth/fokus';
import { meldeSelbstAb } from '@/features/auth/eigeneAbmeldung';
import { loeseLinkEin } from '@/features/auth/linkEinloesen';
import { PasskeyFehler, anmeldenMitPasskey } from '@/features/auth/passkey';
import { useSession } from '@/features/auth/sessionContext';
import { EinloeseError, codeAusFragment, loeseEinladungEin } from './einladung';
import { NACH_DER_EINRICHTUNG } from './pfade';

/**
 * Eine Einladung zur Plattform einlösen (POR-003; ADR-023 Fassung 4, Punkte 7
 * und 8; ADR-025 Fassung 2, Punkt 13).
 *
 * Die Person kommt über den QR-Code auf ihrem eigenen Telefon hierher oder
 * über den Link aus der Mail. **Es gibt kein Kennwort.** Sie gibt ihre
 * Adresse an; der Zugangsdienst legt das Konto an und meldet sie einmalig an.
 * Danach richtet sie hier einen Passkey auf diesem Gerät und eine PIN ein.
 * Wer schon ein Konto hat, meldet sich zuerst mit dem Passkey an und löst den
 * Code dann für dieses Konto ein - ein bestehendes Konto wird nie über seine
 * Adresse übernommen.
 *
 * **Der Code verlässt die Adresszeile sofort.** Er wird beim Öffnen gelesen
 * und aus dem Verlaufseintrag genommen; danach steht er nur noch im Speicher
 * dieser Seite. Für unbekannte, abgelaufene und benutzte Codes gibt es
 * dieselbe Auskunft (Punkt 8, §13).
 *
 * Seit Schritt 1c (Handoff 2026-10-22, Abschnitt 5.2) sprechen alle Zustände
 * von „Zugang“, nie von „Konto“ oder „Sitzung“. Eine abgelaufene Einladung
 * nennt keine Rufnummer: Vor der Anmeldung gibt es keinen Plattformkontext,
 * aus dem sie käme (ANN-691).
 */
type Zustand =
  | 'angemeldet'
  | 'formular'
  | 'vorhanden'
  | 'ungueltig'
  | 'anmelden'
  | 'einrichten'
  | 'nicht-angemeldet';

const FELD_EMAIL = 'einladung-email';

const DIENST_FEHLT =
  'Der Zugang lässt sich gerade nicht einrichten. Ihre Einladung ist deswegen nicht verbraucht – bitte in ein paar Minuten erneut versuchen.';

/** Die drei Schritte; die Einladung ist der erste, die Einrichtung die beiden anderen. */
const SCHRITTE = ['Ihre E-Mail-Adresse', 'Gesicht oder Finger bestätigen', 'Eine PIN festlegen'];

/** Tippt hier ein Finger? Dann öffnet ein Feld die Bildschirmtastatur (ANN-676). */
function fingerbedienung(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export function EinladungPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [code] = useState(() => codeAusFragment(window.location.hash));

  // Der Code verlässt die Adresszeile und den Verlaufseintrag, sobald er
  // gelesen ist. Als Effekt und nicht beim Lesen: Unter `StrictMode` liest
  // React den Anfangswert zweimal, und der zweite Lauf fände sonst nichts mehr.
  useEffect(() => {
    if (window.location.hash !== '') {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);
  const [zustand, setZustand] = useState<Zustand>(() => {
    if (code === null) return 'ungueltig';
    return session !== null ? 'angemeldet' : 'formular';
  });
  const [email, setEmail] = useState('');
  const [emailFehler, setEmailFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [dienstFehlt, setDienstFehlt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [pinDa, setPinDa] = useState(false);
  // Bei Fingerbedienung treten die Schritte zurück, sobald das Feld den Fokus
  // hat - und bleiben weg: Kämen sie beim Verlassen des Felds wieder, rückte
  // „Weiter“ unter dem Finger nach unten, und der Tipp ginge daneben (ANN-681).
  const [tippt, setTippt] = useState(false);
  const titel = useRef<HTMLHeadingElement>(null);
  const meldekasten = useRef<HTMLDivElement>(null);

  useFokusNachWechsel(zustand, () =>
    zustand === 'formular' ? document.getElementById(FELD_EMAIL) : titel.current,
  );
  useFokusNachWechsel(meldung, () => (meldung ? meldekasten.current : null));

  /** Die Fehler des Einlösens als Zustand oder Satz - ohne Auskunft über fremde Zugänge. */
  function fehlschlag(fehler: unknown) {
    const art = fehler instanceof EinloeseError ? fehler.art : 'unavailable';
    setDienstFehlt(false);
    if (art === 'invitation_invalid') {
      setZustand('ungueltig');
    } else if (art === 'email_taken') {
      setZustand('vorhanden');
    } else if (art === 'account_conflict') {
      setMeldung(
        'Mit diesem Zugang lässt sich die Einladung nicht einlösen. Bitte melden Sie sich ab und nehmen Sie eine andere Adresse.',
      );
    } else if (art === 'sign_in_not_created') {
      setZustand('nicht-angemeldet');
    } else if (art === 'session_invalid') {
      setMeldung(
        'Own Motion ist auf diesem Gerät gesperrt. Bitte zuerst dort entsperren – oder abmelden und einen neuen Zugang einrichten.',
      );
    } else {
      setDienstFehlt(true);
      setMeldung(DIENST_FEHLT);
    }
  }

  /** Mit der Einmal-Anmeldung anmelden, dann Passkey und PIN einrichten. */
  async function anmeldenUndEinrichten(tokenHash: string) {
    setZustand('anmelden');
    try {
      await loeseLinkEin(tokenHash, 'magiclink');
    } catch {
      setZustand('nicht-angemeldet');
      return;
    }
    try {
      setPinDa(await hatPin());
    } catch {
      setPinDa(false);
    }
    setZustand('einrichten');
  }

  async function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (laeuft || code === null) return;
    setMeldung(null);
    setEmailFehler(null);
    const adresse = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
      setEmailFehler('Bitte eine E-Mail-Adresse eingeben, etwa name@beispiel.de.');
      document.getElementById(FELD_EMAIL)?.focus();
      return;
    }
    setLaeuft(true);
    try {
      const ergebnis = await loeseEinladungEin(code, adresse);
      if (ergebnis.tokenHash === null) {
        void navigate('/', { replace: true });
        return;
      }
      await anmeldenUndEinrichten(ergebnis.tokenHash);
    } catch (fehler) {
      fehlschlag(fehler);
    } finally {
      setLaeuft(false);
    }
  }

  /** Für den angemeldeten Zugang einlösen - die Anmeldung steht im Kopf des Aufrufs. */
  async function mitAnmeldungEinloesen() {
    if (code === null) return;
    setMeldung(null);
    setLaeuft(true);
    try {
      await loeseEinladungEin(code, '');
      void navigate('/', { replace: true });
    } catch (fehler) {
      fehlschlag(fehler);
    } finally {
      setLaeuft(false);
    }
  }

  async function mitPasskeyAnmeldenUndEinloesen() {
    setMeldung(null);
    setLaeuft(true);
    try {
      await anmeldenMitPasskey();
    } catch (fehler) {
      setLaeuft(false);
      setMeldung(fehler instanceof PasskeyFehler ? fehler.message : 'Die Anmeldung gelang nicht.');
      return;
    }
    await mitAnmeldungEinloesen();
  }

  function abmeldenUnd(danach: () => void) {
    // Selbst ausgelöst (BEF-047): kein Hinweis auf eine Abmeldung von außen.
    void meldeSelbstAb(() => getSupabase().auth.signOut({ scope: 'local' })).then(danach);
  }

  if (zustand === 'einrichten') {
    return (
      <AnmeldungEinrichten
        // Ein Passkey entsteht auf diesem Gerät, auch wenn der Zugang schon
        // einen hat (verlorenes Telefon, Punkt 12).
        stand={{ passkeys: 0, pin: pinDa }}
        ausEinladung
        adresse={email.trim().toLowerCase()}
        // Keine eigene Fertig-Seite: „Willkommen“ sagt es einmal (ANN-685).
        onFertig={() => void navigate(NACH_DER_EINRICHTUNG, { replace: true })}
        onAbmelden={() => abmeldenUnd(() => void navigate('/', { replace: true }))}
        onSpaeter={kennwortTestzugang() ? () => void navigate('/', { replace: true }) : undefined}
      />
    );
  }

  const meldekastenElement = meldung ? (
    <div ref={meldekasten} tabIndex={-1} className="mb-4 focus:outline-none">
      <Statusmeldung ton="warnung">{meldung}</Statusmeldung>
    </div>
  ) : null;

  if (zustand === 'anmelden') {
    return (
      <Vollseite tabtitel={EINLADUNG_TITEL}>
        <LoadingState label="Sie werden angemeldet …" />
      </Vollseite>
    );
  }

  if (zustand === 'ungueltig') {
    // Ohne „Praxis anrufen“: Vor der Anmeldung gibt es keine Rufnummer (ANN-688).
    return (
      <Vollseite
        tabtitel={EINLADUNG_TITEL}
        titelRef={titel}
        zeichen={BRIEF}
        titel="Diese Einladung lässt sich nicht verwenden"
        einleitung="Einladungen gelten 14 Tage und nur einmal. Die Praxis stellt Ihnen gern eine neue aus."
      >
        <ButtonLink to="/">Zur Anmeldung</ButtonLink>
      </Vollseite>
    );
  }

  if (zustand === 'nicht-angemeldet') {
    return (
      <Vollseite
        tabtitel={EINLADUNG_TITEL}
        titelRef={titel}
        zeichen={BRIEF}
        titel="Die Anmeldung gelang nicht"
        einleitung="Ihr Zugang ist eingerichtet, die Einladung damit verbraucht. Bitte lassen Sie sich von der Praxis eine neue geben – damit melden Sie sich an und richten Ihren Passkey ein."
      >
        <ButtonLink to="/">Zur Anmeldung</ButtonLink>
      </Vollseite>
    );
  }

  if (zustand === 'vorhanden') {
    return (
      <Vollseite
        tabtitel={EINLADUNG_TITEL}
        titelRef={titel}
        zeichen={SCHLUESSEL}
        titel="Für diese Adresse gibt es schon einen Zugang"
        einleitung="Melden Sie sich mit dem Passkey dieses Zugangs an – dann gilt die Einladung dafür."
      >
        {meldekastenElement}
        <p className="text-ink-muted mb-6 text-base wrap-anywhere">{email.trim().toLowerCase()}</p>
        <div className="flex flex-col gap-3">
          <Button disabled={laeuft} onClick={() => void mitPasskeyAnmeldenUndEinloesen()}>
            {laeuft ? 'Wird geprüft …' : 'Mit Passkey anmelden und einlösen'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setMeldung(null);
              setZustand('formular');
            }}
          >
            Andere Adresse eingeben
          </Button>
        </div>
      </Vollseite>
    );
  }

  if (zustand === 'angemeldet') {
    return (
      // Ohne Adresse: Die Seite liegt vor der Sitzungssperre, und eine
      // gesperrte Anmeldung zeigt keine Angaben zum Zugang (ADR-025 Punkt 3).
      <Vollseite
        tabtitel={EINLADUNG_TITEL}
        titelRef={titel}
        zeichen={ANGEMELDET}
        titel="Sie sind schon angemeldet"
        einleitung="Soll die Einladung für diesen Zugang gelten? Das passt etwa, wenn Sie selbst in Behandlung sind und jetzt auch jemanden begleiten."
      >
        {meldekastenElement}
        <div className="flex flex-col gap-3">
          <Button disabled={laeuft} onClick={() => void mitAnmeldungEinloesen()}>
            {laeuft ? 'Wird eingelöst …' : 'Für diesen Zugang einlösen'}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              abmeldenUnd(() => {
                setMeldung(null);
                setZustand('formular');
              })
            }
          >
            Abmelden und neuen Zugang einrichten
          </Button>
        </div>
      </Vollseite>
    );
  }

  return (
    <Vollseite
      gross
      tabtitel={EINLADUNG_TITEL}
      titelRef={titel}
      titel="Own Motion lädt Sie ein"
      einleitung="Für Ihre Termine, Übungen und Nachrichten an die Praxis."
      kleingedrucktes="Die Einladung gilt 14 Tage und nur einmal. Der Zugang gehört nur Ihnen; Angehörige bekommen auf Wunsch einen eigenen von der Praxis."
    >
      {meldekastenElement}
      {/* Bei offener Tastatur treten die Schritte zurück; Titel, Feld und
          „Weiter“ bleiben über ihr (ANN-681). */}
      <div hidden={tippt} data-testid="einladung-schritte" className="mb-8">
        <Section titel="Drei Schritte, etwa 2 Minuten">
          <ol className="flex flex-col gap-3">
            {SCHRITTE.map((schritt, index) => (
              <li key={schritt} className="text-ink flex items-center gap-3 text-base">
                <span
                  aria-hidden="true"
                  className="bg-accent-soft text-accent rounded-pill inline-flex size-9 shrink-0 items-center justify-center font-bold"
                >
                  {index + 1}
                </span>
                {/* Die Nummer sagt die Liste selbst an (`ol`). */}
                <span>{schritt}</span>
              </li>
            ))}
          </ol>
          <p className="text-ink-muted mt-4 text-base">Ein Kennwort brauchen Sie nicht.</p>
        </Section>
      </div>
      <form onSubmit={(event) => void absenden(event)} noValidate className="flex flex-col gap-4">
        <Field
          label="E-Mail-Adresse"
          feldId={FELD_EMAIL}
          type="email"
          name="username"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          error={emailFehler ?? undefined}
          onFocus={() => {
            if (fingerbedienung()) setTippt(true);
          }}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailFehler(null);
          }}
        />
        <Button type="submit" disabled={laeuft} className="mt-2">
          {laeuft ? 'Wird eingerichtet …' : dienstFehlt ? 'Erneut versuchen' : 'Weiter'}
        </Button>
      </form>
    </Vollseite>
  );
}
