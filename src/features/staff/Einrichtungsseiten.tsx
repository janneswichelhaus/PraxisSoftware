import type { ReactNode } from 'react';
import { Abfragezustand, type Abfrage } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { StatusMark } from '@/components/ui/StatusMark';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { roleLabel } from '@/components/ui/roleLabels';
import type { Ton } from '@/components/ui/Badge';
import type { Fleet } from '@/features/fleet/api';
import { standort } from '@/features/fleet/rad';
import type { RoleKey } from '@/features/session/types';
import {
  ARBEITSZEITVORLAGEN,
  vorlageZu,
  vorlagenText,
  type VorlageKey,
} from './arbeitszeitvorlagen';
import {
  ergebnisschritte,
  erscheint,
  freieRaeder,
  vollerName,
  type Antworten,
  type Ausgaenge,
  type Ergebnisart,
  type Frage,
  type Kontext,
  type Personangaben,
  type Stand,
} from './einrichtung';
import { STAFF_BESCHRIFTUNG, staffFeldId } from './mitarbeiterfelder';
import { ROLLENHINWEISE, WAEHLBARE_ROLLEN } from './rollenhinweise';
import { Zustellmeldung } from './StaffAccountSection';

/**
 * Die Seiten von „Neue:n Mitarbeiter:in einrichten“ (Überholung 6, G5) - nur
 * der Inhalt unter der Frage. Frage, Kopf, Fuß und Abfolge setzt
 * `NewStaffMemberPage` in den Baustein `GefuehrterAblauf`; welche Seite wem
 * erscheint, steht in `einrichtung.ts`.
 */

export type Personfehler = Partial<Record<keyof Personangaben, string>>;

/**
 * Wer kommt ins Team? Name und dienstlicher Kontakt, dieselben Felder,
 * Kennungen und Prüfung wie in den Stammdaten (`staffMasterDataSchema`).
 * Hauptstandort und Privates bleiben dem Bearbeiten vorbehalten.
 */
export function Personseite({
  werte,
  fehler,
  onChange,
}: {
  werte: Personangaben;
  fehler: Personfehler;
  onChange: (feld: keyof Personangaben, wert: string) => void;
}) {
  const feld = (name: keyof Personangaben, zusatz: { pflicht?: boolean; type?: string }) => (
    <Field
      key={name}
      label={`${STAFF_BESCHRIFTUNG[name]}${zusatz.pflicht ? ' *' : ''}`}
      name={name}
      feldId={staffFeldId(name)}
      autoComplete="off"
      required={zusatz.pflicht}
      type={zusatz.type}
      value={werte[name]}
      error={fehler[name]}
      onChange={(event) => onChange(name, event.target.value)}
      {...(name === 'given_name' ? { 'data-autofocus': true } : {})}
    />
  );
  return (
    <>
      {feld('given_name', { pflicht: true })}
      {feld('family_name', { pflicht: true })}
      {feld('work_email', { type: 'email' })}
      {feld('work_phone', { type: 'tel' })}
      {/* Wer die Angaben sieht - eine Aussage zum Datenfluss (Regel 6). */}
      <Kleingedrucktes>Dienstliches sehen alle Praxisrollen.</Kleingedrucktes>
    </>
  );
}

function rollenFeldId(rolle: RoleKey): string {
  return `einrichtung-rolle-${rolle}`;
}

/** Das erste Kästchen der Rollenwahl - dorthin geht der Fokus, wenn keine gewählt ist. */
export const ERSTE_ROLLE_ID = rollenFeldId(WAEHLBARE_ROLLEN[0]!);

/**
 * Welche Rolle? Keine vorgewählt - eine Rolle zu vergeben ist
 * Berechtigungsvergabe (ADR-004). Was eine Rolle darf, steht an ihr, sobald
 * sie gewählt ist (`ROLLENHINWEISE`): Alle fünf Sätze zugleich passten bei
 * 375 px nicht ohne Scrollen auf die Seite.
 */
export function Rollenseite({
  gewaehlt,
  fehler,
  onUmschalten,
}: {
  gewaehlt: readonly RoleKey[];
  fehler: string | undefined;
  onUmschalten: (rolle: RoleKey, an: boolean) => void;
}) {
  return (
    <fieldset aria-describedby={fehler ? 'einrichtung-rollen-fehler' : undefined}>
      <legend className="sr-only">Rollen</legend>
      <div className="flex flex-col">
        {WAEHLBARE_ROLLEN.map((rolle, index) => {
          const an = gewaehlt.includes(rolle);
          return (
            <Checkbox
              key={rolle}
              feldId={rollenFeldId(rolle)}
              label={roleLabel(rolle)}
              hint={an ? ROLLENHINWEISE[rolle] : undefined}
              checked={an}
              onChange={(event) => onUmschalten(rolle, event.target.checked)}
              {...(index === 0 ? { 'data-autofocus': true } : {})}
            />
          );
        })}
      </div>
      {fehler ? (
        <p id="einrichtung-rollen-fehler" className="text-danger mt-1 text-sm">
          {fehler}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Wo der Fokus einer Seite mit einer Liste beginnt: oben, direkt unter der
 * Frage, mit dem Namen der Liste für Vorlesesoftware. Nicht auf einer Antwort
 * und nicht auf dem Hauptknopf - ein gehaltenes Enter liefe sonst durch die
 * Seiten. Klein, weil der Baustein ohne `preventScroll` fokussiert: Ein hohes
 * Element rollte die Frage aus dem Bild.
 */
function Fokusanfang({ children }: { children: string }) {
  return (
    <p tabIndex={-1} data-autofocus className="sr-only">
      {children}
    </p>
  );
}

/** „✓ gewählt“ an der Zeile, die schon die Antwort ist - Zeichen und Wort (Regel 5). */
function Gewaehlt() {
  return <StatusMark ton="positiv">gewählt</StatusMark>;
}

/**
 * Wann arbeitet sie? Die Vorlagen als Zeilen (Startinhalt,
 * `arbeitszeitvorlagen.ts`), ein Tipp wählt. „Später festlegen“ steht im Fuß.
 */
export function Vorlagenwahl({
  gewaehlt,
  onWahl,
}: {
  gewaehlt: VorlageKey | null;
  onWahl: (vorlage: VorlageKey) => void;
}) {
  return (
    <>
      <Fokusanfang>Vorlagen für den Wochenplan</Fokusanfang>
      <ListRows beschriftung="Vorlagen für den Wochenplan">
        {ARBEITSZEITVORLAGEN.map((vorlage) => (
          <ListRow
            key={vorlage.key}
            titel={vorlage.titel}
            meta={vorlagenText(vorlage)}
            status={gewaehlt === vorlage.key ? <Gewaehlt /> : undefined}
            onClick={() => onWahl(vorlage.key)}
          />
        ))}
      </ListRows>
    </>
  );
}

/**
 * Fährt sie ein Lastenrad? Die Räder mit Schlüssel im Tresor als Zeilen; ein
 * Tipp trägt den Schlüssel beim Einrichten auf die Person ein. „Kein Rad“ und
 * „Später“ stehen im Fuß.
 */
export function Radliste({
  flotte,
  gewaehlt,
  onWahl,
}: {
  flotte: Abfrage<Fleet>;
  gewaehlt: string | null;
  onWahl: (radId: string) => void;
}) {
  return (
    <>
      {/* Vor dem Zustand der Abfrage: Auch beim Laden beginnt der Fokus hier. */}
      <Fokusanfang>Räder mit Schlüssel im Tresor</Fokusanfang>
      <Abfragezustand
        abfrage={flotte}
        laden="Radflotte wird geladen …"
        fehler="Die Radflotte konnte nicht geladen werden."
        leer={{
          wenn: (daten) => freieRaeder(daten).length === 0,
          titel: 'Kein Schlüssel liegt im Tresor.',
          beschreibung: 'Alle Räder sind unterwegs oder in Reparatur.',
        }}
        inKarte
      >
        {(daten) => (
          <ListRows beschriftung="Räder mit Schlüssel im Tresor">
            {freieRaeder(daten).map((rad) => (
              <ListRow
                key={rad.id}
                titel={rad.name}
                meta={[
                  standort(rad, daten.depots),
                  rad.is_spare ? 'Ersatzrad' : rad.regular_rider?.name,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                status={gewaehlt === rad.id ? <Gewaehlt /> : undefined}
                onClick={() => onWahl(rad.id)}
              />
            ))}
          </ListRows>
        )}
      </Abfragezustand>
    </>
  );
}

export const EINLADUNG_EMAIL_ID = 'einrichtung-einladung-email';

/** Zugang einladen? Die Adresse aus der dienstlichen vorbelegt, änderbar (wie `Einladungsformular`). */
export function Einladungsseite({
  email,
  fehler,
  onChange,
}: {
  email: string;
  fehler: string | undefined;
  onChange: (email: string) => void;
}) {
  return (
    <>
      <Field
        label="E-Mail-Adresse für den Zugang"
        feldId={EINLADUNG_EMAIL_ID}
        type="email"
        name="invite_email"
        autoComplete="off"
        value={email}
        error={fehler}
        onChange={(event) => onChange(event.target.value)}
        data-autofocus
      />
      {/* Was die Einladung bewirkt - und was nicht (ADR-004), wie am Zugang. */}
      <Kleingedrucktes>
        Mit dem Einrichten entsteht die Berechtigung, noch kein Konto. Wirksam wird sie, wenn die
        Person sich anmeldet und die Einladung annimmt.
      </Kleingedrucktes>
    </>
  );
}

/** Daten für die Zeilen des Abschlusses und des Ergebnisses. */
interface Beschreibung {
  kontext: Kontext;
  antworten: Antworten;
  /** Die Radflotte, falls geladen - für den Namen des gewählten Rads. */
  flotte: Fleet | undefined;
}

function radName(flotte: Fleet | undefined, radId: string): string {
  return flotte?.bikes.find((rad) => rad.id === radId)?.name ?? 'das gewählte Rad';
}

function rollenText(rollen: readonly RoleKey[]): string {
  return WAEHLBARE_ROLLEN.filter((rolle) => rollen.includes(rolle))
    .map(roleLabel)
    .join(', ');
}

/** Ein Satz je offenem Punkt - was noch zu tun bleibt und wer es tut. */
function offenText(art: Ergebnisart, kontext: Kontext): string {
  switch (art) {
    case 'arbeitszeit':
      return 'Sobald die Inhaber:in die Person in den Kalender nimmt';
    case 'stammrad':
      return kontext.zugang ? 'Am Rad unter Angaben zuteilen' : 'Teilt die Inhaber:in am Rad zu';
    case 'zugang':
      return 'Lädt die Inhaber:in ein';
    case 'schluessel':
      return 'Schlüssel eintragen';
  }
}

const TITEL: Record<Ergebnisart, string> = {
  arbeitszeit: 'Arbeitszeiten',
  schluessel: 'Lastenrad',
  stammrad: 'Stammrad',
  zugang: 'Zugang',
};

function Aendern({ was, onClick }: { was: string; onClick: () => void }) {
  return (
    <Button variant="secondary" groesse="kompakt" aria-label={`${was} ändern`} onClick={onClick}>
      Ändern
    </Button>
  );
}

/**
 * Alles richtig? Je Angabe eine Zeile mit „Ändern“, darunter, was danach
 * noch offen bleibt - mit dem, der es tut. Der Hauptknopf steht im Fuß.
 */
export function Abschlussliste({
  kontext,
  antworten,
  flotte,
  onAendern,
}: Beschreibung & { onAendern: (seite: Frage) => void }) {
  const { person, rolle, arbeitszeit, rad, einladung } = antworten;
  if (!person) return null;
  const im = (seite: Frage) => erscheint(seite, kontext, antworten);
  const offen = ergebnisschritte(kontext, antworten).filter((schritt) => schritt.stand === 'offen');
  const kontakt = [person.work_email.trim(), person.work_phone.trim()].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-4">
      <Fokusanfang>Angaben</Fokusanfang>
      <ListRows beschriftung="Angaben">
        <ListRow
          titel={vollerName(person)}
          meta={kontakt || 'Ohne dienstlichen Kontakt'}
          aktion={<Aendern was="Name und Kontakt" onClick={() => onAendern('person')} />}
        />
        {im('rolle') && rolle ? (
          <ListRow
            titel="Rolle"
            meta={rolle === 'spaeter' ? 'Später' : rollenText(rolle)}
            aktion={<Aendern was="Rolle" onClick={() => onAendern('rolle')} />}
          />
        ) : null}
        {im('arbeitszeit') && arbeitszeit ? (
          <ListRow
            titel="Arbeitszeiten"
            meta={
              arbeitszeit === 'spaeter' ? (
                'Später'
              ) : (
                <>
                  <span className="block">
                    {vorlageZu(arbeitszeit).titel}: {vorlagenText(vorlageZu(arbeitszeit))}
                  </span>
                  {/* Ohne das Merkmal nimmt der Server keinen Wochenplan an (ANN-226). */}
                  <span className="block">Steht damit im Kalender für Behandlungen</span>
                </>
              )
            }
            aktion={<Aendern was="Arbeitszeiten" onClick={() => onAendern('arbeitszeit')} />}
          />
        ) : null}
        {im('rad') && rad ? (
          <ListRow
            titel="Lastenrad"
            meta={
              rad === 'kein'
                ? 'Kein Rad'
                : rad === 'spaeter'
                  ? 'Später'
                  : `Schlüssel von ${radName(flotte, rad.radId)}`
            }
            aktion={<Aendern was="Lastenrad" onClick={() => onAendern('rad')} />}
          />
        ) : null}
        {im('einladung') && einladung ? (
          <ListRow
            titel="Zugang"
            meta={
              einladung === 'spaeter'
                ? 'Später – die Rolle kommt mit der Einladung'
                : `Einladung an ${einladung.email}`
            }
            aktion={<Aendern was="Zugang" onClick={() => onAendern('einladung')} />}
          />
        ) : null}
      </ListRows>

      {offen.length > 0 ? (
        <div>
          <Zwischentitel>Danach noch offen</Zwischentitel>
          <ListRows beschriftung="Danach noch offen">
            {offen.map((schritt) => (
              <ListRow
                key={schritt.art}
                titel={TITEL[schritt.art]}
                meta={offenText(schritt.art, kontext)}
                status={<Standzeichen stand="offen" />}
              />
            ))}
          </ListRows>
        </div>
      ) : null}
    </div>
  );
}

const STAND: Record<Stand, { ton: Ton; wort: string }> = {
  erledigt: { ton: 'positiv', wort: 'erledigt' },
  fehlt: { ton: 'kritisch', wort: 'fehlt' },
  offen: { ton: 'warnung', wort: 'offen' },
  spaeter: { ton: 'neutral', wort: 'später' },
};

/** Der Stand eines Schritts als Zeichen und Wort (DESIGN.md Regel 5). */
function Standzeichen({ stand }: { stand: Stand }) {
  return <StatusMark ton={STAND[stand].ton}>{STAND[stand].wort}</StatusMark>;
}

/** Ein Weg zur Stelle, an der ein Schritt nachgeholt oder geprüft wird. */
interface Weg {
  to: string;
  label: string;
  /** Wohin, für Vorlesesoftware: „Arbeitszeiten: Planung“. */
  beschriftung: string;
}

/**
 * Die Ergebnisseite „… ist angelegt“: je Schritt der Stand als Zeichen und
 * Wort, was geschah, und der Weg dorthin - nichts fällt still heraus (Spec
 * Überholung 6, Kriterium 7). Erscheint, wenn etwas anders ausging als
 * gewählt (`mitErgebnisseite`); die Person selbst ist dann schon angelegt.
 */
export function Ergebnisliste({
  kontext,
  antworten,
  flotte,
  staffId,
  ausgaenge,
}: Beschreibung & { staffId: string; ausgaenge: Ausgaenge }) {
  const person = `/praxis/team/${staffId}`;
  const radId = typeof antworten.rad === 'object' ? antworten.rad.radId : null;
  const einladung = typeof antworten.einladung === 'object' ? antworten.einladung : null;

  function zeile(art: Ergebnisart, stand: Stand): { text: ReactNode; weg: Weg | null } {
    // Kurz am Knopf, mit der Zeile im Namen: „Lastenrad: Schlüssel eintragen“.
    const zu = (to: string, label: string, ausfuehrlich = label): Weg => ({
      to,
      label,
      beschriftung: `${TITEL[art]}: ${ausfuehrlich}`,
    });
    // Der Satz folgt dem Stand, nie umgekehrt: Neben „fehlt“ steht nie ein Erfolg.
    switch (art) {
      case 'arbeitszeit': {
        const ausgang = ausgaenge.arbeitszeit;
        const planung = zu(`/praxis/planung?person=${staffId}`, 'Planung');
        // Ohne Kalender kein Wochenplan (ANN-226) - dorthin zuerst.
        const einsatz = zu(`${person}?bereich=einsatz`, 'Einsatz');
        if (stand === 'offen') return { text: offenText(art, kontext), weg: null };
        if (stand === 'spaeter') return { text: 'Später', weg: einsatz };
        if (stand === 'fehlt') {
          const grund = ausgang && !ausgang.ok ? ausgang : null;
          return {
            text: grund?.fehler ?? 'Nicht gespeichert.',
            weg: grund && !grund.amKalender ? planung : einsatz,
          };
        }
        const vorlage = antworten.arbeitszeit;
        return {
          text:
            vorlage && vorlage !== 'spaeter'
              ? `${vorlageZu(vorlage).titel}, im Kalender für Behandlungen`
              : 'Gespeichert',
          weg: planung,
        };
      }
      case 'schluessel': {
        const ausgang = ausgaenge.schluessel;
        const eintragen = zu(
          `/betrieb/flotte/schluessel${radId ? `?rad=${radId}` : ''}`,
          'Eintragen',
          'Schlüssel eintragen',
        );
        if (stand === 'spaeter') return { text: 'Später', weg: eintragen };
        if (stand === 'fehlt') {
          return {
            text: ausgang && !ausgang.ok ? ausgang.fehler : 'Nicht eingetragen.',
            weg: eintragen,
          };
        }
        return {
          text: radId ? `Schlüssel von ${radName(flotte, radId)}` : 'Eingetragen',
          weg: zu('/betrieb/flotte', 'Radflotte'),
        };
      }
      case 'stammrad':
        return {
          text: offenText(art, kontext),
          weg: radId ? zu(`/betrieb/flotte/rad/${radId}?bereich=angaben`, 'Zum Rad') : null,
        };
      case 'zugang': {
        // Den Zugang sieht nur, wer ihn vergibt (owner).
        if (!kontext.zugang) return { text: offenText(art, kontext), weg: null };
        const ausgang = ausgaenge.einladung;
        const zugang = zu(`${person}?bereich=zugang`, 'Öffnen');
        if (stand === 'spaeter') return { text: 'Später', weg: zugang };
        if (stand === 'fehlt') {
          return {
            text: ausgang && !ausgang.ok ? ausgang.fehler : 'Nicht eingeladen.',
            weg: zugang,
          };
        }
        if (stand === 'offen') {
          return { text: 'Eingeladen, die Anmeldemail ging nicht hinaus', weg: zugang };
        }
        return { text: `Eingeladen: ${einladung?.email ?? ''}`.trim(), weg: zugang };
      }
    }
  }

  const schritte = ergebnisschritte(kontext, antworten, ausgaenge);
  const zustellung = ausgaenge.einladung?.ok ? ausgaenge.einladung.zustellung : null;

  return (
    <div className="flex flex-col gap-4">
      <Fokusanfang>Schritte</Fokusanfang>
      <ListRows beschriftung="Schritte">
        {schritte.map((schritt) => {
          const { text, weg } = zeile(schritt.art, schritt.stand);
          return (
            <ListRow
              key={schritt.art}
              titel={TITEL[schritt.art]}
              meta={
                <>
                  <span className="block">
                    <Standzeichen stand={schritt.stand} />
                  </span>
                  <span className="block">{text}</span>
                </>
              }
              aktion={
                weg ? (
                  <ButtonLink
                    to={weg.to}
                    variant="secondary"
                    groesse="kompakt"
                    aria-label={weg.beschriftung}
                  >
                    {weg.label}
                  </ButtonLink>
                ) : undefined
              }
            />
          );
        })}
      </ListRows>
      {/* Die Antwort des Anmeldedienstes in denselben Sätzen wie am Zugang (ORG-10). */}
      {zustellung && einladung ? (
        <Zustellmeldung zustellung={zustellung} email={einladung.email} />
      ) : null}
    </div>
  );
}

/** Der Fuß einer Seite mit Antworten: volle Breite, untereinander (DESIGN.md „Geführter Ablauf“). */
export function Antwortknoepfe({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

/**
 * Eine Antwort im Fuß, in voller Breite - „Später“ leise, „Kein Rad“ sekundär.
 * Die schon gegebene trägt ✓ und `aria-pressed`, wenn man zurückkommt.
 */
export function Antwortknopf({
  variant = 'quiet',
  gewaehlt,
  onClick,
  children,
}: {
  variant?: 'secondary' | 'quiet';
  gewaehlt: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant={variant} className="w-full" aria-pressed={gewaehlt} onClick={onClick}>
      {gewaehlt ? <span aria-hidden="true">✓ </span> : null}
      {children}
    </Button>
  );
}
