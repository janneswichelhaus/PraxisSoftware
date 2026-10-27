import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  aendern,
  beginne,
  imAendern,
  schrittText,
  weiter,
  type Abfolge,
} from '@/components/ui/abfolge';
import { RUECKWEG_PARAM, leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { FLOTTE_SCHLUESSEL, fetchFleet, flotteSchluessel, takeKey } from '@/features/fleet';
import { saveWorkingHours } from '@/features/calendar';
import { canManageStaffPrivateDetails, type CurrentUser, type RoleKey } from '@/features/core';
import { createStaffMember, leereStammdaten, setzeKalender, staffMasterDataSchema } from './api';
import { vorlageZu, wochenplanDer, type VorlageKey } from './arbeitszeitvorlagen';
import {
  PERSONFELDER,
  einrichtung,
  kontextFuer,
  mitErgebnisseite,
  naechste,
  schritt,
  vollerName,
  vollstaendig,
  zurueckIm,
  type Antworten,
  type Ausgaenge,
  type Einrichtung,
  type Personangaben,
  type Seite,
} from './einrichtung';
import {
  Abschlussliste,
  Antwortknoepfe,
  Antwortknopf,
  EINLADUNG_EMAIL_ID,
  ERSTE_ROLLE_ID,
  Einladungsseite,
  Ergebnisliste,
  Personseite,
  Radliste,
  Rollenseite,
  Vorlagenwahl,
  type Personfehler,
} from './Einrichtungsseiten';
import { EinladungsError, ladeZugangEin } from './konto-api';
import { staffFeldId } from './mitarbeiterfelder';
import { problemTexte } from './zugangstexte';
import { todayInTimeZone, wochenBeginn } from '@/lib/datum';

const LEER: Personangaben = { given_name: '', family_name: '', work_email: '', work_phone: '' };

/** Dieselbe Prüfung wie beim Einladen am Zugang (`Einladungsformular`). */
const ADRESSE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Die Person ist angelegt, und es bleibt bei der Ergebnisseite. */
interface Angelegt {
  staffId: string;
  antworten: Antworten;
  ausgaenge: Ausgaenge;
}

/**
 * Neue:n Mitarbeiter:in einrichten (Überholung 6, G5): ein geführter Ablauf
 * statt drei Seiten - Name und Kontakt, (owner) Rolle, Wochenplan aus einer
 * Vorlage, Schlüssel eines Rads, (owner) Einladung, Abschluss. Welche Seite
 * wem erscheint, steht in `einrichtung.ts`; verbindlich prüft der Server
 * jeden Schreibweg (ADR-004), die Rollen hier steuern nur die Seiten.
 *
 * **Erst „… einrichten“ schreibt**, der Reihe nach: `createStaffMember`,
 * dann der Wochenplan (die Person dafür in den Kalender: `setzeKalender`,
 * dann `saveWorkingHours` je Tag), der Schlüssel (`takeKey`), die Einladung
 * (`ladeZugangEin`). Scheitert das Anlegen, steht ein Fenster da und nichts
 * ist geschrieben. Scheitert ein späterer Schritt oder geht die Anmeldemail
 * nicht hinaus, ist die Person trotzdem angelegt: Die Ergebnisseite nennt je
 * Schritt den Stand und den Weg dorthin - nichts wird still übersprungen.
 * Sonst geht es zur Seite der Person, mit Rückmeldung.
 *
 * Wie bisher entsteht hier kein Konto: Person, Mitarbeiterdatensatz und Zugang
 * bleiben getrennte Konzepte (ADR-014); die Einladung legt die Berechtigung
 * an (ANN-025). Privatangaben und Hauptstandort bleiben dem Bearbeiten
 * vorbehalten (ANN-024).
 *
 * **Eingaben gehen nicht still verloren (ORG-03, ZST-05):** Der Schutz der
 * Formulare fragt vor jedem Weg hinaus - ohne Entwurf nur mit „Verwerfen und
 * weitergehen" und „Hier bleiben" (ANN-046); das Zurück des Telefons geht
 * einen Schritt zurück. **Der Rückweg reist mit (ORG-24):** ✕ führt dorthin,
 * woher die Anlage kam (`?zurueck=`), und die neue Person nimmt ihn mit.
 */
export function NewStaffMemberPage({ user }: { user: CurrentUser }) {
  const kontext = kontextFuer(user.roles);
  const privat = canManageStaffPrivateDetails(user.roles);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const zurueck = leseRueckweg(suche, '/praxis/team');

  const [abfolge, setAbfolge] = useState(() => beginne<Seite>('person'));
  const [antworten, setAntworten] = useState<Antworten>({});
  const [werte, setWerte] = useState<Personangaben>(LEER);
  const [personFehler, setPersonFehler] = useState<Personfehler>({});
  const [rollen, setRollen] = useState<RoleKey[]>([]);
  const [rollenFehler, setRollenFehler] = useState<string | undefined>(undefined);
  // `null`: noch die dienstliche Adresse - sie folgt dem Feld der ersten Seite.
  const [email, setEmail] = useState<string | null>(null);
  const [emailFehler, setEmailFehler] = useState<string | undefined>(undefined);
  const [angelegt, setAngelegt] = useState<Angelegt | null>(null);
  const einrichtenRef = useRef<HTMLButtonElement>(null);
  const [fokusAufEinrichten, setFokusAufEinrichten] = useState(false);

  // Gleich zu Beginn geladen: Auf der Seite zum Rad steht die Liste dann schon.
  const montag = wochenBeginn(todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin'));
  const flotte = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    enabled: kontext.radflotte,
    retry: false,
  });

  const ungespeichert =
    angelegt === null &&
    (PERSONFELDER.some((feld) => werte[feld].trim() !== '') || Object.keys(antworten).length > 0);
  const vorher = angelegt ? null : zurueckIm(kontext, antworten, abfolge);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert,
    texte: EINGABETEXTE,
    // Das Zurück des Telefons geht einen Schritt zurück, nicht aus dem Ablauf.
    schrittZurueck: vorher ? () => zurueckGehen(vorher) : undefined,
  });

  const einrichten = useMutation({
    mutationFn: async ({ plan }: { plan: Einrichtung; antworten: Antworten }) => {
      const staffId = await createStaffMember(
        staffMasterDataSchema.parse({ ...leereStammdaten, ...plan.person }),
        privat,
      );
      // Ab hier ist die Person angelegt. Jeder weitere Schritt läuft für sich
      // und meldet seinen Ausgang, statt den Rest abzubrechen.
      const ausgaenge: Ausgaenge = {};
      if (plan.vorlage) ausgaenge.arbeitszeit = await wochenplanSetzen(staffId, plan.vorlage);
      if (plan.radId) ausgaenge.schluessel = await schluesselEintragen(plan.radId, staffId);
      if (plan.einladung) ausgaenge.einladung = await zugangEinladen(staffId, plan.einladung);
      return { staffId, ausgaenge };
    },
    onSuccess: async ({ staffId, ausgaenge }, { plan, antworten: gewaehlt }) => {
      await queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      if (plan.vorlage) {
        for (const queryKey of [['assignable-therapists'], ['calendar-staff'], ['working-hours']]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }
      if (plan.radId) void queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      if (mitErgebnisseite(kontext, gewaehlt, ausgaenge)) {
        setAngelegt({ staffId, antworten: gewaehlt, ausgaenge });
        return;
      }
      // Alles wie gewählt: Der eigene Weg hinaus ist kein Verlust (ANN-046).
      freigeben();
      void navigate(mitRueckweg(`/praxis/team/${staffId}`, suche.get(RUECKWEG_PARAM)), {
        replace: true,
        state: { meldung: `${vollerName(plan.person)} ist eingerichtet.` },
      });
    },
  });

  // Nach dem Fehlerfenster steht der Fokus wieder auf dem Knopf, mit dem es
  // weitergeht - erst nach dem Schließen, solange das Fenster offen ist, ist
  // alles darunter gesperrt.
  useEffect(() => {
    if (!fokusAufEinrichten) return;
    einrichtenRef.current?.focus();
    setFokusAufEinrichten(false);
  }, [fokusAufEinrichten]);

  /**
   * „← Zurück“ und die Zurückgeste: Was auf dieser Seite nicht mit „Weiter“
   * bestätigt war, gilt nicht (wie beim Check-Up) - kommt man wieder, steht
   * dort die gegebene Antwort.
   */
  function zurueckGehen(ziel: Abfolge<Seite>) {
    if (abfolge.seite === 'person' && antworten.person) setWerte(antworten.person);
    if (abfolge.seite === 'rolle') {
      setRollen(typeof antworten.rolle === 'object' ? [...antworten.rolle] : []);
    }
    if (abfolge.seite === 'einladung') {
      setEmail(typeof antworten.einladung === 'object' ? antworten.einladung.email : null);
    }
    setPersonFehler({});
    setRollenFehler(undefined);
    setEmailFehler(undefined);
    setAbfolge(ziel);
  }

  /** Die Antwort steht; weiter zur nächsten Seite - oder zurück zum Abschluss. */
  function beantworte(neu: Antworten) {
    setAntworten(neu);
    setAbfolge((stand) =>
      weiter(
        stand,
        naechste(kontext, neu, stand.seite, imAendern(stand)),
        vollstaendig(kontext, neu),
      ),
    );
  }

  function personWeiter() {
    const pruefung = staffMasterDataSchema.safeParse({ ...leereStammdaten, ...werte });
    if (!pruefung.success) {
      const gefunden: Personfehler = {};
      for (const problem of pruefung.error.issues) {
        const feld = PERSONFELDER.find((name) => name === problem.path[0]);
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
      setPersonFehler(gefunden);
      // Der Fokus geht ins erste Feld mit Fehler; Vorlesesoftware liest ihn mit.
      const erstes = PERSONFELDER.find((name) => gefunden[name]);
      if (erstes) document.getElementById(staffFeldId(erstes))?.focus();
      return;
    }
    setPersonFehler({});
    beantworte({ ...antworten, person: { ...werte } });
  }

  function rollenWeiter() {
    if (rollen.length === 0) {
      setRollenFehler('Bitte mindestens eine Rolle wählen.');
      document.getElementById(ERSTE_ROLLE_ID)?.focus();
      return;
    }
    beantworte({ ...antworten, rolle: [...rollen] });
  }

  const einladungsadresse = email ?? werte.work_email;
  function einladen() {
    const adresse = einladungsadresse.trim();
    if (!ADRESSE.test(adresse)) {
      setEmailFehler('Bitte eine gültige E-Mail-Adresse angeben.');
      document.getElementById(EINLADUNG_EMAIL_ID)?.focus();
      return;
    }
    beantworte({ ...antworten, einladung: { email: adresse } });
  }

  const seite = abfolge.seite;
  const person = antworten.person;
  const name = person ? vollerName(person) : '';
  const vorname = person?.given_name.trim() ?? '';
  const plan = einrichtung(kontext, antworten);
  const { nummer, von } = schritt(kontext, antworten, seite);
  const zurPerson = angelegt
    ? mitRueckweg(`/praxis/team/${angelegt.staffId}`, suche.get(RUECKWEG_PARAM))
    : null;

  let titel: string;
  let inhalt: ReactNode = null;
  let fuss: ReactNode;
  if (angelegt && zurPerson) {
    titel = `${name} ist angelegt`;
    inhalt = (
      <Ergebnisliste
        kontext={kontext}
        antworten={angelegt.antworten}
        flotte={flotte.data}
        staffId={angelegt.staffId}
        ausgaenge={angelegt.ausgaenge}
      />
    );
    fuss = (
      <ButtonLink to={zurPerson} replace className="w-full">
        Zur Mitarbeiterseite
      </ButtonLink>
    );
  } else {
    switch (seite) {
      case 'person':
        titel = 'Wer kommt ins Team?';
        inhalt = (
          <Personseite
            werte={werte}
            fehler={personFehler}
            onChange={(feld, wert) => {
              setWerte((bisher) => ({ ...bisher, [feld]: wert }));
              if (personFehler[feld])
                setPersonFehler((bisher) => ({ ...bisher, [feld]: undefined }));
            }}
          />
        );
        fuss = (
          <Button className="w-full" onClick={personWeiter}>
            Weiter
          </Button>
        );
        break;
      case 'rolle':
        titel = 'Welche Rolle?';
        inhalt = (
          <Rollenseite
            gewaehlt={rollen}
            fehler={rollenFehler}
            onUmschalten={(rolle, an) => {
              setRollen((bisher) =>
                an ? [...bisher, rolle] : bisher.filter((eintrag) => eintrag !== rolle),
              );
              setRollenFehler(undefined);
            }}
          />
        );
        fuss = (
          <Antwortknoepfe>
            <Button className="w-full" onClick={rollenWeiter}>
              Weiter
            </Button>
            <Antwortknopf
              gewaehlt={antworten.rolle === 'spaeter'}
              onClick={() => {
                setRollen([]);
                setRollenFehler(undefined);
                beantworte({ ...antworten, rolle: 'spaeter' });
              }}
            >
              Später
            </Antwortknopf>
          </Antwortknoepfe>
        );
        break;
      case 'arbeitszeit':
        titel = `Wann arbeitet ${vorname}?`;
        inhalt = (
          <Vorlagenwahl
            gewaehlt={
              antworten.arbeitszeit && antworten.arbeitszeit !== 'spaeter'
                ? antworten.arbeitszeit
                : null
            }
            onWahl={(vorlage) => beantworte({ ...antworten, arbeitszeit: vorlage })}
          />
        );
        fuss = (
          <Antwortknopf
            gewaehlt={antworten.arbeitszeit === 'spaeter'}
            onClick={() => beantworte({ ...antworten, arbeitszeit: 'spaeter' })}
          >
            Später festlegen
          </Antwortknopf>
        );
        break;
      case 'rad':
        titel = `Fährt ${vorname} ein Lastenrad?`;
        inhalt = (
          <Radliste
            flotte={flotte}
            gewaehlt={typeof antworten.rad === 'object' ? antworten.rad.radId : null}
            onWahl={(radId) => beantworte({ ...antworten, rad: { radId } })}
          />
        );
        fuss = (
          <Antwortknoepfe>
            <Antwortknopf
              variant="secondary"
              gewaehlt={antworten.rad === 'kein'}
              onClick={() => beantworte({ ...antworten, rad: 'kein' })}
            >
              Kein Rad
            </Antwortknopf>
            <Antwortknopf
              gewaehlt={antworten.rad === 'spaeter'}
              onClick={() => beantworte({ ...antworten, rad: 'spaeter' })}
            >
              Später
            </Antwortknopf>
          </Antwortknoepfe>
        );
        break;
      case 'einladung':
        titel = 'Zugang einladen?';
        inhalt = (
          <Einladungsseite
            email={einladungsadresse}
            fehler={emailFehler}
            onChange={(wert) => {
              setEmail(wert);
              setEmailFehler(undefined);
            }}
          />
        );
        fuss = (
          <Antwortknoepfe>
            <Button className="w-full" onClick={einladen}>
              Einladung senden
            </Button>
            <Antwortknopf
              gewaehlt={antworten.einladung === 'spaeter'}
              onClick={() => beantworte({ ...antworten, einladung: 'spaeter' })}
            >
              Später
            </Antwortknopf>
          </Antwortknoepfe>
        );
        break;
      case 'abschluss':
        titel = 'Alles richtig?';
        inhalt = (
          <Abschlussliste
            kontext={kontext}
            antworten={antworten}
            flotte={flotte.data}
            onAendern={(ziel) => setAbfolge((stand) => aendern(stand, ziel))}
          />
        );
        fuss = (
          <Button
            ref={einrichtenRef}
            className="w-full"
            disabled={!plan || einrichten.isPending}
            onClick={() => {
              // Kein zweiter Vorgang, solange einer läuft; der Knopf ist zudem gesperrt.
              if (plan && !einrichten.isPending) einrichten.mutate({ plan, antworten });
            }}
          >
            {einrichten.isPending ? 'Wird eingerichtet …' : `${vorname} einrichten`}
          </Button>
        );
        break;
    }
  }

  return (
    <>
      {/* Unter dem Fenster, am Rechner abgedunkelt sichtbar: wo man ist. */}
      <PageHeader title="Mitarbeiter:in einrichten" />
      <GefuehrterAblauf
        titel={titel}
        objekt={name || 'Neu im Team'}
        schliessen={angelegt ? 'Schließen' : 'Einrichten abbrechen'}
        onSchliessen={() => {
          if (zurPerson) void navigate(zurPerson, { replace: true });
          else void navigate(zurueck);
        }}
        seite={angelegt ? 'ergebnis' : seite}
        stand={angelegt ? undefined : { text: schrittText(nummer, von), wert: nummer, von }}
        onZurueck={vorher ? () => zurueckGehen(vorher) : undefined}
        schutz={schutz}
        abschluss={angelegt !== null || seite === 'abschluss'}
        fuss={fuss}
      >
        {inhalt}
      </GefuehrterAblauf>

      {/* Scheitert das Anlegen selbst, ist nichts geschrieben - als Fenster,
          damit es niemand übersieht (ORG-15, ANN-058), ohne Einzelheiten aus
          der Datenbank. */}
      {einrichten.isError ? (
        <Hinweisfenster
          titel="Die Mitarbeiter:in konnte nicht angelegt werden."
          schliessen="Zurück zum Abschluss"
          onSchliessen={() => {
            einrichten.reset();
            setFokusAufEinrichten(true);
          }}
        >
          Es ist nichts gespeichert, die Angaben stehen noch da. Bitte die Verbindung prüfen und
          erneut versuchen.
        </Hinweisfenster>
      ) : null}
    </>
  );
}

function fehlertext(fehler: unknown, rest: string): string {
  return fehler instanceof Error && fehler.message ? fehler.message : rest;
}

/**
 * Der Wochenplan aus der Vorlage. Erst in den Kalender für Behandlungen:
 * Ohne das Merkmal nimmt `set_staff_working_hours` für eine neue Person
 * nichts an (ANN-226) - dann der Plan, Tag für Tag.
 */
async function wochenplanSetzen(
  staffId: string,
  vorlage: VorlageKey,
): Promise<NonNullable<Ausgaenge['arbeitszeit']>> {
  try {
    await setzeKalender(staffId, { behandlung: true, training: false });
  } catch (fehler) {
    return {
      ok: false,
      fehler: fehlertext(fehler, 'Die Angabe zum Kalender konnte nicht gespeichert werden.'),
      amKalender: true,
    };
  }
  try {
    for (const [tag, bloecke] of wochenplanDer(vorlageZu(vorlage))) {
      await saveWorkingHours(staffId, tag, bloecke);
    }
    return { ok: true };
  } catch (fehler) {
    return {
      ok: false,
      fehler: fehlertext(fehler, 'Die Arbeitszeit konnte nicht gespeichert werden.'),
      amKalender: false,
    };
  }
}

async function schluesselEintragen(
  radId: string,
  staffId: string,
): Promise<NonNullable<Ausgaenge['schluessel']>> {
  try {
    await takeKey(radId, staffId);
    return { ok: true };
  } catch (fehler) {
    return {
      ok: false,
      fehler: fehlertext(fehler, 'Der Schlüssel konnte nicht eingetragen werden.'),
    };
  }
}

async function zugangEinladen(
  staffId: string,
  einladung: { email: string; rollen: readonly RoleKey[] },
): Promise<NonNullable<Ausgaenge['einladung']>> {
  try {
    return {
      ok: true,
      zustellung: await ladeZugangEin(staffId, einladung.email, einladung.rollen),
    };
  } catch (fehler) {
    const text = fehler instanceof EinladungsError ? problemTexte[fehler.problem] : undefined;
    return {
      ok: false,
      fehler: text ?? problemTexte.unbekannt ?? 'Die Einladung konnte nicht angelegt werden.',
    };
  }
}
