import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { KENNWORT_MINDESTLAENGE, aendereKennwort } from '@/features/account/api';
import { kennwortFehler, type Kennwortfehler } from '@/features/account/kennwortFehler';
import { useFokusNachWechsel } from './fokus';
import { hinweisAngemeldet } from './fremdeSitzung';
import { useSession } from './sessionContext';
import {
  VerbindungError,
  einmalCodeAusAdresse,
  loeseLinkEin,
  traegtEinmalCode,
} from './linkEinloesen';

/**
 * Neues Kennwort über den Link aus der Mail setzen (FIX-001).
 *
 * Die einzige Seite neben der Anmeldemaske, die ohne Sitzung erreichbar ist.
 * Sie schließt die Lücke, die STAFF-004 offen ließ: Es wurden Mails verschickt,
 * aber es gab keinen Ort, an dem ein Link ankommen konnte. Der Abnahmeschritt
 * „Der Link führt zum Ziel" war nur deshalb unauffällig, weil er im selben
 * Browser geprüft wurde, in dem noch eine Sitzung stand — angemeldet öffnet
 * „Mein Konto" ja immer.
 *
 * Der Weg durch die Seite, und nur der zweite Schritt läuft von allein:
 *
 *   1. **Fragen, wenn schon jemand angemeldet ist.** Nur in diesem Fall —
 *      sonst wird der Schritt übersprungen.
 *   2. **Einlösen.** Der Hash aus der Adresszeile wird gegen eine Sitzung
 *      getauscht. Ohne diesen Schritt hätte die Person kein Recht, ein
 *      Kennwort zu setzen — das Formular kommt deshalb erst danach.
 *   3. **Setzen.** Dieselbe Prüfung wie auf „Mein Konto", aus derselben
 *      Funktion (ANN-027). Eine zweite Regel an zweiter Stelle wäre eine
 *      zweite Wahrheit.
 *   4. **Fertig.** Die Person ist angemeldet und geht weiter. Der Schritt ist
 *      ausdrücklich, damit die Bestätigung nicht im Seitenwechsel untergeht.
 *
 * Dazu zwei Abbrüche, die auseinandergehalten werden: ein Link, der nicht mehr
 * gilt, und ein Anmeldedienst, der nicht antwortet. Das zweite über das erste
 * zu berichten wäre eine Aussage, die die Anwendung nicht treffen kann — und
 * sie brächte jemanden dazu, einen gültigen Link wegzuwerfen.
 *
 * Was hier **nicht** passiert: andere Geräte abmelden. Wer das will, findet es
 * auf „Mein Konto"; der Text unten sagt es. Ungefragt alle Sitzungen zu
 * beenden wäre eine Nebenwirkung, die niemand angefordert hat.
 */
type Zustand = 'fremde-sitzung' | 'einloesen' | 'ungueltig' | 'verbindung' | 'formular' | 'fertig';

const FELD_KENNWORT = 'kennwort-neu';
const FELD_WIEDERHOLUNG = 'kennwort-neu-wiederholung';

export function KennwortNeuPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const ort = useLocation();
  // ANN-043, Fassung 2: einmal lesen, dann aus der Adresszeile nehmen.
  const [tokenHash] = useState(() => einmalCodeAusAdresse(ort));
  useEffect(() => {
    if (traegtEinmalCode(ort)) void navigate(ort.pathname, { replace: true });
  }, [ort, navigate]);
  // Das angemeldete Konto - vor dem Einlösen das bisherige, danach das des
  // Links (AUTH-04, AUTH-05).
  const konto = session?.user.email;

  /**
   * War beim Öffnen schon jemand angemeldet, wird erst gefragt.
   *
   * Auf dem Praxisrechner bleibt schnell eine Sitzung stehen. Diesen Link dort
   * stillschweigend einzulösen tauschte die fremde Sitzung aus und verwürfe
   * ihre nicht gespeicherten Verordnungsentwürfe — der `SessionProvider` räumt
   * bei jedem Wechsel der Kennung. §13: nicht unbemerkt.
   */
  const [zustand, setZustand] = useState<Zustand>(() => {
    if (session !== null) return 'fremde-sitzung';
    return tokenHash ? 'einloesen' : 'ungueltig';
  });
  const [kennwort, setKennwort] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [fehler, setFehler] = useState<Kennwortfehler | null>(null);
  const [serverfehler, setServerfehler] = useState(false);
  const [pending, setPending] = useState(false);
  const auskunft = useRef<HTMLDivElement>(null);

  /**
   * Der Hash ist einmalig — ein zweiter Versuch verbrennt ihn. In der
   * Entwicklung montiert React jede Komponente unter `StrictMode` zweimal,
   * deshalb dieser Riegel.
   *
   * **Und deshalb kein zusätzliches `aktiv`-Flag in der Aufräumfunktion.** Die
   * naheliegende Form — eine lokale Variable, die beim Aufräumen auf `false`
   * geht — verträgt sich mit diesem Riegel nicht: Der erste Durchlauf startet
   * den Aufruf und wird sofort aufgeräumt, der zweite kehrt am Riegel um, und
   * die eintreffende Antwort findet nur noch ein abgemeldetes `aktiv` vor. Die
   * Seite bliebe für immer bei „Der Link wird geprüft …". Ein `setState` nach
   * dem Abmelden ist seit React 18 folgenlos; der Riegel allein genügt.
   */
  const eingeloest = useRef(false);

  useEffect(() => {
    if (zustand !== 'einloesen' || !tokenHash || eingeloest.current) return;
    eingeloest.current = true;

    loeseLinkEin(tokenHash, 'recovery')
      .then(() => setZustand('formular'))
      .catch((fehler: unknown) =>
        setZustand(fehler instanceof VerbindungError ? 'verbindung' : 'ungueltig'),
      );
  }, [zustand, tokenHash]);

  // Jeder Schritt ersetzt die Knöpfe des vorigen; der Fokus geht dorthin, wo
  // es weitergeht - ins erste Feld oder auf die neue Auskunft (AUTH-06).
  useFokusNachWechsel(zustand, () =>
    zustand === 'formular' ? document.getElementById(FELD_KENNWORT) : auskunft.current,
  );

  function erneutVersuchen() {
    eingeloest.current = false;
    setZustand(tokenHash ? 'einloesen' : 'ungueltig');
  }

  async function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // Der Fehler steht an dem Feld, das ihn verursacht, und der Fokus geht
    // dorthin (AUTH-10, NAV-13).
    const problem = kennwortFehler(kennwort, wiederholung);
    if (problem) {
      setFehler(problem);
      document
        .getElementById(problem.feld === 'kennwort' ? FELD_KENNWORT : FELD_WIEDERHOLUNG)
        ?.focus();
      return;
    }

    setFehler(null);
    setServerfehler(false);
    setPending(true);
    try {
      await aendereKennwort(kennwort);
      setZustand('fertig');
    } catch {
      setServerfehler(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Vollseite
      titel="Neues Kennwort setzen"
      kleingedrucktes="Zugänge werden von der Praxis vergeben. Jede Person benötigt ein eigenes Konto; geteilte Konten sind nicht zulässig."
    >
      {zustand === 'fremde-sitzung' ? (
        <div ref={auskunft} tabIndex={-1}>
          <Statusmeldung ton="warnung">{hinweisAngemeldet(konto)}</Statusmeldung>
          <div className="mt-4 flex flex-col gap-3">
            <Button onClick={() => setZustand(tokenHash ? 'einloesen' : 'ungueltig')}>
              Trotzdem fortfahren
            </Button>
            <ButtonLink to="/" replace variant="secondary">
              Angemeldet bleiben
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {zustand === 'einloesen' ? (
        <div ref={auskunft} tabIndex={-1}>
          <LoadingState label="Der Link wird geprüft …" />
        </div>
      ) : null}

      {zustand === 'verbindung' ? (
        <div ref={auskunft} tabIndex={-1}>
          <ErrorState
            title="Der Anmeldedienst ist gerade nicht erreichbar."
            description="Ihr Link ist deswegen nicht verbraucht. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut."
          />
          <Button className="mt-4" onClick={erneutVersuchen}>
            Erneut versuchen
          </Button>
        </div>
      ) : null}

      {zustand === 'ungueltig' ? (
        <div ref={auskunft} tabIndex={-1}>
          {/* Besteht noch eine Sitzung, führt der Weg zurück in sie - eine
              neue Mail gibt es erst nach dem Abmelden (AUTH-04). */}
          <ErrorState
            title="Dieser Link lässt sich nicht mehr verwenden."
            description={
              session
                ? 'Links aus der Mail gelten einmalig und nur für kurze Zeit. Fordern Sie nach dem Abmelden auf der Anmeldeseite einen neuen an.'
                : 'Links aus der Mail gelten einmalig und nur für kurze Zeit. Fordern Sie auf der Anmeldeseite einen neuen an.'
            }
          />
          {session ? (
            <ButtonLink to="/" variant="secondary" className="mt-4">
              Zurück zur Anwendung
            </ButtonLink>
          ) : (
            // Ein Knopf, obwohl es ein Seitenwechsel ist:
            // `tests/e2e/login.spec.ts` prüft ihn als solchen (UXR-002).
            <Button variant="secondary" className="mt-4" onClick={() => void navigate('/')}>
              Zur Anmeldung
            </Button>
          )}
        </div>
      ) : null}

      {zustand === 'formular' ? (
        <form onSubmit={(event) => void absenden(event)} noValidate className="flex flex-col gap-4">
          {konto ? (
            <>
              {/* Das Konto zu den Kennwortfeldern (AUTH-05): Der
                  Passwortmanager ordnet das neue Kennwort sonst keinem
                  Eintrag zu und füllt beim nächsten Anmelden womöglich das
                  alte ein. Sichtbar steht es für alle mit mehreren Adressen. */}
              <input
                type="email"
                name="username"
                autoComplete="username"
                value={konto}
                readOnly
                hidden
              />
              <p className="text-ink-muted text-sm">
                Für das Konto <span className="text-ink font-medium">{konto}</span>
              </p>
            </>
          ) : null}
          <Field
            label="Neues Kennwort"
            feldId={FELD_KENNWORT}
            hint={`Mindestens ${KENNWORT_MINDESTLAENGE} Zeichen. Eine Wortfolge, die Sie sich merken können, ist besser als ein kurzes Kunstwort.`}
            type="password"
            name="new_password"
            autoComplete="new-password"
            required
            value={kennwort}
            error={fehler?.feld === 'kennwort' ? fehler.text : undefined}
            onChange={(event) => {
              setKennwort(event.target.value);
              setFehler(null);
            }}
          />
          <Field
            label="Neues Kennwort wiederholen"
            feldId={FELD_WIEDERHOLUNG}
            type="password"
            name="new_password_repeat"
            autoComplete="new-password"
            required
            error={fehler?.feld === 'wiederholung' ? fehler.text : undefined}
            value={wiederholung}
            onChange={(event) => {
              setWiederholung(event.target.value);
              setFehler(null);
            }}
          />
          {/* Ein Fehlschlag des Anmeldedienstes gehört keinem Feld, sondern
              steht über dem Knopf wie auf „Mein Konto" (AUTH-10). Welcher es
              war, sagt der Dienst hier nicht; der Satz nennt beide Auswege. */}
          {serverfehler ? (
            <Statusmeldung ton="fehler">
              Das Kennwort konnte nicht geändert werden. Bitte die Verbindung prüfen und erneut
              versuchen – das neue Kennwort muss sich vom bisherigen unterscheiden.
            </Statusmeldung>
          ) : null}
          <Button type="submit" disabled={pending} className="mt-2">
            {pending ? 'Wird gesetzt …' : 'Kennwort setzen'}
          </Button>
        </form>
      ) : null}

      {zustand === 'fertig' ? (
        <div ref={auskunft} tabIndex={-1}>
          <Statusmeldung ton="erfolg">
            Das Kennwort ist gesetzt. Sie sind auf diesem Gerät angemeldet.
          </Statusmeldung>
          <p className="text-ink-muted mt-3 text-sm leading-relaxed">
            Andere Geräte bleiben angemeldet. Wurde das bisherige Kennwort womöglich bekannt,
            beenden Sie unter „Mein Konto“ zusätzlich alle Sitzungen.
          </p>
          <ButtonLink to="/mein-konto" className="mt-4">
            Weiter zu „Mein Konto“
          </ButtonLink>
        </div>
      ) : null}
    </Vollseite>
  );
}
