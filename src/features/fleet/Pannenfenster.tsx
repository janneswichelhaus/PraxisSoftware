import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { schrittText } from '@/components/ui/abfolge';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { FLOTTE_SCHLUESSEL, recordBreakdown, type BikeDetail, type Fleet } from './api';
import { antriebsriss, zoneLabel } from './bike3d/zones';
import { fotoText, uebertrageFotos, type Fotoauftrag } from './fotoauftraege';
import {
  ablaufStarten,
  abschluss,
  frage,
  zusammenfassungspunkte,
  type Ablaufzustand,
  type Abschlussart,
} from './pannenablauf';
import {
  fussknoepfe,
  istAbschluss,
  schrittnummer,
  vorigeSeite,
  weiterMit,
  type Fussknopf,
} from './pannenseiten';
import { ersatzradName } from './rad';
import { Stellenbuehne, Stellenflaeche } from './Stellenerfassung';
import { useStellenerfassung, type Stelle } from './stellen';
import { aktiveStandortvorlage } from './standortvorlage';

/**
 * Die Panne im Fenster des geführten Ablaufs (Überholung 6, G3; vorher eine
 * gewöhnliche Seite je Schritt, FLT-EPIC-001).
 *
 * **Zuerst „Wo ist der Schaden?“** am 3D-Rad als Bühne: Jede getippte Stelle
 * ist ein Schaden (rot, ohne Einstufung); „Weiter“ geht auch ohne Stelle,
 * nur nicht, solange eine offen ist. **Dann je Frage der Vorlage eine Seite**
 * (`pannenablauf.ts`, unverändert verzweigt): die Frage oben, Hinweise und
 * Texte des Schritts darunter, die Antworten - oder der eine Knopf, der
 * meldet - im festen Fuß (`pannenseiten.ts`). Kein Balken, der Weg verzweigt.
 * Im Zweig „weiter fahrbar“ steht der Text aus den markierten Stellen schon
 * da.
 *
 * „← Zurück“ und die Zurückgeste gehen einen Schritt zurück; ✕ fragt, sobald
 * etwas eingegeben ist (Textverlustschutz). Gespeichert wird mit dem
 * Abschluss wie bisher: Meldung, Stellen, Fotos; ein sperrender Abschluss
 * sperrt das Rad („In Reparatur“). Der Ort eines zurückgelassenen Rads steht
 * für das Team daneben, nie im Abschlusstext und nie in der Unterlage für die
 * Werkstatt, und geht mit der Freigabe (ANN-558). **Versendet wird nichts:**
 * keine E-Mail, keine Push-Nachricht, keine Meldung an eine Werkstatt.
 */
export function Pannenfenster({
  flotte,
  detail,
  zurueck,
}: {
  flotte: Fleet;
  detail: BikeDetail;
  /** Wohin ✕ führt: dorthin, woher die Panne geöffnet wurde. */
  zurueck: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const vorlage = aktiveStandortvorlage;
  const { bike } = detail;
  const ersatzrad = ersatzradName(flotte);
  const offen = detail.spots.filter((spot) => spot.resolved_at === null);

  const [ablauf, setAblauf] = useState<Ablaufzustand>(() => ablaufStarten(bike.id));
  // „Wo ist der Schaden?“ liegt vor dem Ablauf der Vorlage.
  const [amRad, setAmRad] = useState(true);
  const erfassung = useStellenerfassung({ art: 'panne' });
  const { stellen, entwurf } = erfassung;
  const [ausstehend, setAusstehend] = useState<{
    auftraege: Fotoauftrag[];
    grund: string | null;
    meldung: string;
  } | null>(null);

  const melden = useMutation({
    mutationFn: async (art: Abschlussart) => {
      // Der Abschluss so, wie er angezeigt wurde - ohne den Ort, der steht
      // daneben (ANN-558).
      const ergebnis = abschluss(art, {
        vorlage,
        ersatzrad,
        zustand: { ...ablauf, standort: '' },
      });
      const zurueckgelassen = art === 'transportFortsetzung' && ablauf.herkunft === 'zuruecklassen';
      const meldung = await recordBreakdown({
        bikeId: bike.id,
        outcome: art,
        summary: ergebnis.text,
        remark: '',
        locationNote: zurueckgelassen ? ablauf.standort.trim() : '',
        transport:
          ablauf.transport === 'carsharing' || ablauf.transport === 'fahrdienst'
            ? ablauf.transport
            : null,
        spots: stellen.map((stelle) => ({
          zone: stelle.zone,
          severity: 'problem',
          point: stelle.point,
          note: stelle.note,
        })),
      });
      const auftraege: Fotoauftrag[] = stellen
        .flatMap((stelle, index) =>
          stelle.fotos.map((foto) => ({
            spotId: meldung.spotIds[index] ?? null,
            checkupId: null,
            foto,
          })),
        )
        .filter((auftrag) => auftrag.spotId !== null);
      const uebertragung = await uebertrageFotos(auftraege);
      const satz = meldung.blocked
        ? `Panne gemeldet. ${bike.name} ist in Reparatur und steht nicht mehr in der Planung.`
        : `Panne gemeldet. ${bike.name} bleibt in der Planung.`;
      return { satz, anzahl: auftraege.length, ...uebertragung };
    },
    onSuccess: async ({ satz, anzahl, fehlgeschlagen, grund }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      if (fehlgeschlagen.length === 0) {
        zumRad(anzahl > 0 ? `${satz} ${fotoText(anzahl)} angehängt.` : satz);
      } else {
        setAusstehend({ auftraege: fehlgeschlagen, grund, meldung: satz });
      }
    },
  });

  const erneut = useMutation({
    mutationFn: () => uebertrageFotos(ausstehend?.auftraege ?? []),
    onSuccess: async ({ fehlgeschlagen, grund }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      if (!ausstehend) return;
      if (fehlgeschlagen.length === 0) zumRad(`${ausstehend.meldung} Fotos übertragen.`);
      else setAusstehend({ ...ausstehend, auftraege: fehlgeschlagen, grund });
    },
  });

  const laeuft = melden.isPending;
  const zurueckMoeglich = !ausstehend && !laeuft && vorigeSeite(ablauf, amRad) !== null;

  // Wer schon über „Wo ist der Schaden?“ hinaus ist, hat eine Panne begonnen:
  // ✕ fragt, und die Zurückgeste geht einen Schritt zurück, statt das Fenster
  // samt allen Angaben zu schließen.
  const ungespeichert =
    ausstehend === null &&
    (!amRad ||
      stellen.length > 0 ||
      entwurf !== null ||
      ablauf.freitext.trim() !== '' ||
      ablauf.standort.trim() !== '' ||
      ablauf.verlauf.length > 0);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert,
    kompakt: true,
    nichtSicherbar:
      ausstehend && ausstehend.auftraege.length > 0
        ? `${fotoText(ausstehend.auftraege.length)} sind noch nicht übertragen und gehen beim Weitergehen verloren.`
        : undefined,
    texte: PANNENTEXTE,
    // Das Fenster hängt an `?rad=`: Fällt der Parameter weg - mit der
    // Zurückgeste zur Radwahl -, gingen sonst alle Angaben mit.
    auchSuchparameter: true,
    schrittZurueck: zurueckMoeglich ? () => zurueckGehen() : undefined,
  });

  function zumRad(meldung: string) {
    freigeben();
    void navigate(`/betrieb/flotte/rad/${bike.id}?bereich=stellen`, {
      replace: true,
      state: { meldung },
    });
  }

  function zurueckGehen() {
    const ziel = vorigeSeite(ablauf, amRad);
    if (ziel === null) return;
    // Ein Fehler beim Melden gehört zu der Seite, auf der gemeldet wurde.
    melden.reset();
    if (ziel === 'schaden') setAmRad(true);
    else setAblauf(ziel);
  }

  function wirke(knopf: Fussknopf) {
    if (laeuft) return;
    const { wirkung } = knopf;
    if (wirkung.art === 'melden') {
      melden.mutate(wirkung.abschlussart);
      return;
    }
    melden.reset();
    setAblauf((aktuell) => weiterMit(aktuell, wirkung, textAusStellen(stellen)));
  }

  const kopf = {
    objekt: `Panne melden · ${bike.name}`,
    schliessen: 'Panne abbrechen',
    onSchliessen: () => void navigate(zurueck),
    schutz,
  };

  // ---------------------------------------------------------------------------
  // Gemeldet, aber Fotos fehlen noch
  // ---------------------------------------------------------------------------
  if (ausstehend) {
    return (
      <GefuehrterAblauf
        {...kopf}
        titel="Panne gemeldet"
        seite="ausstehend"
        fuss={
          <div className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => erneut.mutate()} disabled={erneut.isPending}>
              {erneut.isPending ? 'Wird übertragen …' : 'Erneut versuchen'}
            </Button>
            <Button
              variant="quiet"
              className="w-full"
              onClick={() => zumRad(`${ausstehend.meldung} Ohne die übrigen Fotos.`)}
            >
              Ohne diese Fotos weiter
            </Button>
          </div>
        }
      >
        <Rueckmeldung>{ausstehend.meldung}</Rueckmeldung>
        <Statusmeldung ton="fehler">
          {`${fotoText(ausstehend.auftraege.length)} konnte${ausstehend.auftraege.length === 1 ? '' : 'n'} nicht übertragen werden.`}
          {ausstehend.grund ? ` ${ausstehend.grund}` : ''}
        </Statusmeldung>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  // Wo ist der Schaden?
  // ---------------------------------------------------------------------------
  if (amRad) {
    return (
      <GefuehrterAblauf
        {...kopf}
        titel="Wo ist der Schaden?"
        // Mit offener Stelle eine eigene Seite: Ein zweiter Tipp auf
        // „Stelle setzen“ trifft nicht gleich „Weiter“.
        seite={entwurf ? 'schaden-stelle' : 'schaden'}
        stand={{ text: schrittText(1) }}
        buehne={<Stellenbuehne zustand={erfassung} bestehend={offen} bauart={bike.bike_type} />}
        // Höchstens 60 % hoch: Eine offene Stelle oder viele Schäden rollen
        // unter dem Rad, statt „Weiter“ aus dem Fenster zu schieben.
        flaecheKnapp
      >
        <div className="flex flex-col gap-3">
          <Stellenflaeche zustand={erfassung} bestehend={offen} bauart={bike.bike_type} />
          {/* Weiter geht es auch ohne Stelle - nur nicht mit einer offenen. */}
          {entwurf ? null : (
            <Button className="w-full" onClick={() => setAmRad(false)} data-autofocus>
              Weiter
            </Button>
          )}
        </div>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  // Eine Seite je Schritt der Vorlage
  // ---------------------------------------------------------------------------
  const { schritt } = ablauf;
  const knoepfe = fussknoepfe(schritt);
  const endet = istAbschluss(schritt);
  // Wohin der Fokus auf der neuen Seite geht: Ohne Text gibt es nichts zu
  // melden, dann ins Feld; auf einer Seite, die meldet, an den Anfang des
  // Inhalts - nicht auf den Knopf, damit ein zweites Enter nicht ungelesen
  // meldet; sonst auf die erste Antwort.
  const ohneText = schritt === 'weiterfahrtMoeglich' && ablauf.freitext.trim() === '';
  const fokus: Fokus = ohneText ? 'feld' : endet ? 'anfang' : 'antwort';

  return (
    <GefuehrterAblauf
      {...kopf}
      titel={frage(schritt, vorlage)}
      seite={schritt}
      stand={{ text: schrittText(schrittnummer(ablauf, amRad)) }}
      onZurueck={zurueckMoeglich ? zurueckGehen : undefined}
      abschluss={endet}
      fuss={
        <div className="flex flex-col gap-2">
          {melden.isError ? (
            <Statusmeldung ton="fehler">{melden.error.message}</Statusmeldung>
          ) : null}
          {schritt === 'weiterfahrtMoeglich' ? (
            <p className="text-ink-muted text-sm">
              Diese Meldung sperrt das Rad nicht. Es bleibt in der Planung verfügbar.
            </p>
          ) : null}
          {knoepfe.map((knopf, index) => (
            <Button
              key={knopf.text}
              variant={knopf.haupt ? 'primary' : 'secondary'}
              // Ein langer Knopf darf umbrechen, statt im Rand zu stehen.
              className="h-auto min-h-12 w-full py-2"
              disabled={laeuft || (knopf.haupt && ohneText)}
              onClick={() => wirke(knopf)}
              {...(index === 0 && fokus === 'antwort' ? { 'data-autofocus': true } : {})}
            >
              {laeuft && knopf.wirkung.art === 'melden' ? 'Wird gemeldet …' : knopf.text}
            </Button>
          ))}
        </div>
      }
    >
      {/* Auf einer Seite, die meldet, ist der Inhalt ein Halt für die Tastatur:
          Rollt er, erreicht sie ihn so auch ohne Feld darin (axe,
          „scrollable-region-focusable“). */}
      <div className="flex flex-col gap-3" {...(endet ? { tabIndex: 0 } : {})}>
        <Schrittinhalt
          ablauf={ablauf}
          setAblauf={setAblauf}
          riss={antriebsriss[bike.bike_type]}
          ersatzrad={ersatzrad}
          vorbelegt={stellen.length > 0}
          fokus={fokus}
          punkte={zusammenfassungspunkte({ vorlage, ersatzrad, zustand: ablauf })}
        />
        {/* Die Herkunft der Vorlage, knapp: Sie ist für Tübingen ungeprüft
            (§15.2, ANN-554). */}
        <Kleingedrucktes>{`${vorlage.herkunft}-Vorlage · Für Tübingen noch zu prüfen`}</Kleingedrucktes>
      </div>
    </GefuehrterAblauf>
  );
}

/** Die Rückfrage vor dem Weggehen spricht von der Panne, nicht von „Text“. */
const PANNENTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungemeldete Panne',
  zeile: {
    weitergehen: 'Panne noch nicht gemeldet.',
    abmelden: 'Panne noch nicht gemeldet – abmelden?',
    bleiben: 'Weiter melden',
  },
};

/** „Was ist auffällig?“ aus den markierten Stellen (Handoff, Abschnitt 4). */
function textAusStellen(stellen: readonly Stelle[]): string {
  return stellen
    .map((stelle) =>
      stelle.note.trim()
        ? `${zoneLabel(stelle.zone)}: ${stelle.note.trim()}`
        : zoneLabel(stelle.zone),
    )
    .join('; ');
}

const wochentagNamen = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

/** Wo der Fokus auf einer Seite der Vorlage beginnt. */
type Fokus = 'feld' | 'anfang' | 'antwort';

/**
 * Der Anfang einer Seite, die meldet: Dort beginnt der Fokus. Ein kleines
 * Stück oben im Inhalt, damit der Fokus die Fläche nicht rollt und die Frage
 * nicht aus dem Bild schiebt.
 */
const ANFANG = { tabIndex: -1, 'data-autofocus': true } as const;

/** Ein Hinweis im Schritt als Zeile auf Fläche, ohne Rahmen (Leitfaden L2). */
function Hinweiskasten({ anfang = false, children }: { anfang?: boolean; children: ReactNode }) {
  return (
    <div
      {...(anfang ? ANFANG : {})}
      className="rounded-card bg-accent-soft text-accent px-4 py-3 text-sm focus:outline-none"
    >
      {children}
    </div>
  );
}

/** Hinweise und Texte eines Schritts, unter der Frage. */
function Schrittinhalt({
  ablauf,
  setAblauf,
  riss,
  ersatzrad,
  vorbelegt,
  fokus,
  punkte,
}: {
  ablauf: Ablaufzustand;
  setAblauf: (aktualisierung: (aktuell: Ablaufzustand) => Ablaufzustand) => void;
  riss: string;
  ersatzrad: string;
  /** Stammt der Text aus markierten Stellen? */
  vorbelegt: boolean;
  fokus: Fokus;
  punkte: string[];
}) {
  const vorlage = aktiveStandortvorlage;
  const anfang = fokus === 'anfang';
  const heuteName = wochentagNamen[new Date().getDay()] ?? '';

  switch (ablauf.schritt) {
    case 'weiterfahrtMoeglich':
      // Steht schon Text da, beginnt der Fokus am Feld, nicht in ihm - sonst
      // ginge am Telefon die Tastatur über den Knopf.
      return (
        <div {...(anfang ? ANFANG : {})} className="focus:outline-none">
          <TextArea
            rows={3}
            label="Was ist auffällig?"
            placeholder="z. B. Klingel klemmt, Licht flackert"
            hint={vorbelegt ? 'Aus den markierten Stellen. Sie können den Text ändern.' : undefined}
            maxLength={900}
            value={ablauf.freitext}
            onChange={(event) =>
              setAblauf((aktuell) => ({ ...aktuell, freitext: event.target.value }))
            }
            {...(fokus === 'feld' ? { 'data-autofocus': true } : {})}
          />
        </div>
      );

    case 'schadensgroesse':
      return (
        <p className="text-ink-muted text-sm">
          Klein: Reifen, Gangschaltung. Groß: Elektronik, {riss}, Ausfall beider Bremsen.
        </p>
      );

    case 'werkstattReparieren':
      return (
        <div className="flex flex-col gap-3">
          <Hinweiskasten anfang={anfang}>Rad bitte vor Ort reparieren lassen.</Hinweiskasten>
          <p className="text-ink text-liste">
            Behandlung, die nicht mehr zu schaffen ist, telefonisch absagen. Eintrag im Kalender und
            kurze Information an Praxismanagement und {vorlage.zustaendigeRolle}.
          </p>
        </div>
      );

    case 'ruhetag':
      return (
        <p className="text-ink-muted text-sm">
          {vorlage.werkstatt.name} hat {vorlage.werkstatt.ruhetag}s geschlossen.
          {heuteName ? ` Heute ist ${heuteName}.` : ''}
        </p>
      );

    case 'depotBringen':
      return (
        <div className="flex flex-col gap-3">
          <Hinweiskasten anfang={anfang}>
            {vorlage.depot.bezeichnung}: {vorlage.depot.zugangHinweis}
          </Hinweiskasten>
          <p className="text-ink text-liste">
            {vorlage.zustaendigeRolle} kurz über den Schaden informieren, damit die Reparatur
            koordiniert werden kann.
          </p>
          <p className="text-ink text-liste">
            Bis auf Weiteres bitte <strong>{ersatzrad}</strong> nutzen – so lange, bis das defekte
            Rad wieder freigegeben ist.
          </p>
        </div>
      );

    case 'radZuruecklassen':
      return (
        <div className="flex flex-col gap-3">
          <Field
            label="Standort / Adresse"
            placeholder="Wo genau steht das Rad?"
            hint="Nur für das Team, nicht für die Werkstatt. Wird mit der Freigabe des Rads gelöscht."
            maxLength={200}
            value={ablauf.standort}
            onChange={(event) =>
              setAblauf((aktuell) => ({ ...aktuell, standort: event.target.value }))
            }
          />
          {/* Fließend statt mit Umbruch und ein Absatz statt zwei: So steht
              der längste Schritt bei 375 × 667 ohne Rollen. */}
          <Hinweiskasten>
            Standort telefonisch an {vorlage.werkstatt.name} durchgeben. Telefon:{' '}
            {vorlage.werkstatt.telefon} · Mobil: {vorlage.werkstatt.mobil}
          </Hinweiskasten>
          <p className="text-ink text-liste">
            Zusätzlich kurze Nachricht an die {vorlage.zustaendigeRolle} über {vorlage.meldeweg}.{' '}
            {vorlage.mitnehmen.join(' und ')} vom Rad entfernen und mitnehmen. Rad an einem festen
            Gegenstand anketten.
          </p>
        </div>
      );

    case 'zusammenfassung':
      return (
        <ListRows rahmen={false} beschriftung="Zusammenfassung">
          {punkte.map((punkt, index) => (
            <ListRow
              key={punkt}
              titel={
                index === 0 && anfang ? (
                  <span {...ANFANG} className="focus:outline-none">
                    {punkt}
                  </span>
                ) : (
                  punkt
                )
              }
            />
          ))}
        </ListRows>
      );

    case 'vertragswerkstattKontakt':
      return (
        <div className="flex flex-col gap-3">
          <p className="text-ink text-liste">
            Kontakt zu {vorlage.werkstatt.name} aufnehmen: Bescheid geben, dass Sie aus der Praxis
            kommen und in etwa 15 Minuten mit einem Schaden vorbeikommen.
          </p>
          <Hinweiskasten>
            {vorlage.werkstatt.name}
            <br />
            Telefon: {vorlage.werkstatt.telefon} · Mobil: {vorlage.werkstatt.mobil}
          </Hinweiskasten>
        </div>
      );

    case 'vertragswerkstattReparieren':
      return <Hinweiskasten anfang={anfang}>Reparatur durchführen lassen.</Hinweiskasten>;

    case 'vertragswerkstattUebergabe':
      return (
        <div className="flex flex-col gap-3">
          <p className="text-ink text-liste">{vorlage.zustaendigeRolle} Bescheid geben.</p>
          <p className="text-ink text-liste">
            Am nächsten Werktag <strong>{ersatzrad}</strong> nutzen, so lange, bis das andere Rad
            wieder freigegeben ist.
          </p>
        </div>
      );

    default:
      return null;
  }
}
