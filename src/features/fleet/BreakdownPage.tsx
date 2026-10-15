import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { todayInTimeZone } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { leseRueckweg } from '@/lib/rueckweg';
import type { CurrentUser } from '@/features/session/types';
import {
  FLOTTE_SCHLUESSEL,
  fetchBike,
  fetchFleet,
  flotteSchluessel,
  radSchluessel,
  recordBreakdown,
  type Bike,
  type Fleet,
} from './api';
import { antriebsriss, zoneLabel } from './bike3d/zones';
import { montagDerWoche } from './format';
import { fotoText, uebertrageFotos, type Fotoauftrag } from './fotoauftraege';
import {
  ablaufStarten,
  abschluss,
  antworten,
  frage,
  gehe,
  kannZurueck,
  zurueck,
  zusammenfassungspunkte,
  type Ablaufzustand,
  type Abschlussart,
  type SchrittId,
} from './pannenablauf';
import { ersatzradName, istMeinRad } from './rad';
import { Radwahl } from './Radwahl';
import { Stellenerfassung } from './Stellenerfassung';
import { useStellenerfassung, type Stelle } from './stellen';
import { aktiveStandortvorlage } from './standortvorlage';

/**
 * Panne melden (FLT-EPIC-001, Handoff Lastenrad 3D Abschnitt 4).
 *
 * **Neu davor: „Wo ist der Schaden?“** Das 3D-Rad, an dem jede getippte Stelle
 * ein Schaden ist (rot, ohne Einstufung). „Weiter“ geht auch ohne Stelle;
 * gesperrt ist es nur, solange eine Stelle offen ist. Danach der Ablauf der
 * Team-App unverändert aus `pannenablauf.ts`; standortabhängige Angaben
 * kommen aus der Standortvorlage. Im Zweig „weiter fahrbar“ steht der Text
 * aus den markierten Stellen schon da.
 *
 * Gespeichert wird mit dem Abschluss: Meldung, Stellen, Fotos; ein sperrender
 * Abschluss sperrt das Rad („In Reparatur“). Der Ort eines zurückgelassenen
 * Rads steht für das Team daneben, nie im Abschlusstext und nie in der
 * Unterlage für die Werkstatt, und geht mit der Freigabe (ANN-558).
 * **Versendet wird nichts:** keine E-Mail, keine Push-Nachricht, keine
 * Meldung an eine Werkstatt.
 */
export function BreakdownPage({ user }: { user: CurrentUser }) {
  const [parameter] = useSearchParams();
  const vorgabe = parameter.get('rad');
  const montag = montagDerWoche(todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin'));
  const flotte = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });
  const ziel = leseRueckweg(parameter, '/betrieb/flotte');

  return (
    <>
      <Rueckweg standard="/betrieb/flotte" beschriftung="Zurück zur Radflotte" />
      <Abfragezustand
        abfrage={flotte}
        laden="Radflotte wird geladen …"
        fehler="Die Radflotte konnte nicht geladen werden."
        inKarte
        rahmen={(zustand) => (
          <>
            {/* Auch ohne Daten trägt die Seite einen Titel (UIK-16). */}
            <PageHeader title="Panne melden" />
            {zustand}
          </>
        )}
      >
        {(daten) => (
          <Pannenassistent key={vorgabe ?? ''} flotte={daten} vorgabe={vorgabe} ziel={ziel} />
        )}
      </Abfragezustand>
    </>
  );
}

/** Ein Hinweis im Schritt als Zeile auf Fläche, ohne Rahmen (Leitfaden L2). */
function Hinweiskasten({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card bg-accent-soft text-accent mb-4 px-4 py-3 text-sm">{children}</div>
  );
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

function Pannenassistent({
  flotte,
  vorgabe,
  ziel,
}: {
  flotte: Fleet;
  vorgabe: string | null;
  ziel: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const vorlage = aktiveStandortvorlage;
  const ersatzrad = ersatzradName(flotte);
  const meinRad =
    flotte.bikes.find((rad) => istMeinRad(rad, flotte.my_staff_member_id) && !rad.block)?.id ??
    null;

  const [ablauf, setAblauf] = useState<Ablaufzustand>(() => ablaufStarten(vorgabe, meinRad));
  // Der Schritt „Wo ist der Schaden?“ liegt vor dem Ablauf der Vorlage.
  const [amRad, setAmRad] = useState(() => vorgabe !== null);
  const erfassung = useStellenerfassung({ art: 'panne' });
  const { stellen } = erfassung;

  const rad = flotte.bikes.find((eintrag) => eintrag.id === ablauf.radId) ?? null;
  const imAblauf = ablauf.schritt !== 'radwahl';
  const detail = useQuery({
    queryKey: radSchluessel(ablauf.radId ?? ''),
    queryFn: () => fetchBike(ablauf.radId ?? ''),
    enabled: Boolean(rad) && imAblauf,
    retry: false,
  });

  const [ausstehend, setAusstehend] = useState<{
    auftraege: Fotoauftrag[];
    grund: string | null;
    meldung: string;
  } | null>(null);

  const ungespeichert =
    ausstehend === null &&
    (stellen.length > 0 ||
      erfassung.entwurf !== null ||
      ablauf.freitext.trim() !== '' ||
      ablauf.standort.trim() !== '' ||
      ablauf.verlauf.length > 0);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert,
    nichtSicherbar:
      ausstehend && ausstehend.auftraege.length > 0
        ? `${fotoText(ausstehend.auftraege.length)} sind noch nicht übertragen und gehen beim Weitergehen verloren.`
        : undefined,
    texte: { ...EINGABETEXTE, bezeichnung: 'Ungemeldete Panne' },
  });

  function zumRad(meldung: string) {
    freigeben();
    void navigate(`/betrieb/flotte/rad/${ablauf.radId ?? ''}?bereich=stellen`, {
      replace: true,
      state: { meldung },
    });
  }

  const melden = useMutation({
    mutationFn: async ({ art, bike }: { art: Abschlussart; bike: Bike }) => {
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

  if (ausstehend) {
    return (
      <>
        <PageHeader title="Panne melden" />
        <div className="max-w-formular flex flex-col gap-4">
          <Rueckmeldung>{ausstehend.meldung}</Rueckmeldung>
          <Statusmeldung ton="fehler">
            {`${fotoText(ausstehend.auftraege.length)} konnte${ausstehend.auftraege.length === 1 ? '' : 'n'} nicht übertragen werden.`}
            {ausstehend.grund ? ` ${ausstehend.grund}` : ''}
          </Statusmeldung>
          {schutz}
          <Formularfuss>
            <Button onClick={() => erneut.mutate()} disabled={erneut.isPending}>
              {erneut.isPending ? 'Wird übertragen …' : 'Erneut versuchen'}
            </Button>
            <Button
              variant="quiet"
              onClick={() => zumRad(`${ausstehend.meldung} Ohne die übrigen Fotos.`)}
            >
              Ohne diese Fotos weiter
            </Button>
          </Formularfuss>
        </div>
      </>
    );
  }

  if (imAblauf && !rad) {
    return (
      <>
        <PageHeader title="Panne melden" />
        <ErrorState
          title="Dieses Rad gibt es nicht mehr."
          description="Bitte das Rad in der Radflotte neu wählen."
        />
      </>
    );
  }

  const kicker =
    rad && imAblauf ? `Panne melden · ${rad.name}` : 'Panne melden · Rad noch nicht ausgewählt';

  function beenden(art: Abschlussart) {
    if (!rad || melden.isPending) return;
    melden.mutate({ art, bike: rad });
  }

  function weiter(schritt: SchrittId) {
    setAblauf((aktuell) => {
      // Im Zweig „weiter fahrbar“ steht der Text aus den Stellen schon da.
      if (schritt === 'weiterfahrtMoeglich' && aktuell.freitext.trim() === '') {
        return gehe({ ...aktuell, freitext: textAusStellen(stellen) }, schritt);
      }
      return gehe(aktuell, schritt);
    });
  }

  // ---------------------------------------------------------------------------
  // Wo ist der Schaden?
  // ---------------------------------------------------------------------------
  if (amRad && rad) {
    const offen = erfassung.entwurf !== null;
    return (
      <>
        <PageHeader kicker={kicker} title="Wo ist der Schaden?" />
        <div className="max-w-formular">
          <Abfragezustand
            abfrage={detail}
            laden="Rad wird geladen …"
            fehler="Das Rad konnte nicht geladen werden."
            inKarte
          >
            {(daten) => (
              <Stellenerfassung
                zustand={erfassung}
                bestehend={daten.spots.filter((spot) => spot.resolved_at === null)}
                bauart={daten.bike.bike_type}
                hoehe={300}
              />
            )}
          </Abfragezustand>
          {schutz}
          <Formularfuss
            zusatz={offen ? 'Setzen oder verwerfen Sie zuerst die offene Stelle.' : undefined}
          >
            <Button onClick={() => setAmRad(false)} disabled={offen}>
              Weiter
            </Button>
            {kannZurueck(ablauf) ? (
              <Button
                variant="quiet"
                onClick={() => {
                  setAblauf((aktuell) => zurueck(aktuell));
                  setAmRad(false);
                }}
              >
                ← Zurück
              </Button>
            ) : null}
            <ButtonLink to={ziel} variant="quiet">
              Abbrechen
            </ButtonLink>
          </Formularfuss>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Der Ablauf der Vorlage
  // ---------------------------------------------------------------------------
  const kontext = { vorlage, ersatzrad, zustand: ablauf };
  const auswahl = antworten(ablauf.schritt);
  const laeuft = melden.isPending;

  return (
    <>
      {/* Eine Frage je Schritt, und die Frage ist der Titel (Welle B). */}
      <PageHeader kicker={kicker} title={frage(ablauf.schritt, vorlage)} />

      <div className="max-w-formular">
        {/* Herkunft als Abzeichen und ein kurzer Satz (R2-O1): Die Vorlage
            ist für Tübingen ungeprüft (§15.2). */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Badge ton="warnung">{vorlage.herkunft}-Vorlage</Badge>
          <span className="text-ink-muted text-sm">Für Tübingen noch zu prüfen.</span>
        </div>

        <Schrittinhalt
          ablauf={ablauf}
          setAblauf={setAblauf}
          flotte={flotte}
          riss={rad ? antriebsriss[rad.bike_type] : 'Riemenriss'}
          ersatzrad={ersatzrad}
          vorbelegt={stellen.length > 0}
          punkte={zusammenfassungspunkte(kontext)}
        />

        {auswahl.length > 0 ? (
          <div className="flex flex-col gap-2">
            {auswahl.map((antwort) => (
              <Button
                key={antwort.label}
                variant="secondary"
                className="justify-start"
                disabled={laeuft}
                onClick={() => weiter(antwort.ziel)}
              >
                {antwort.label}
              </Button>
            ))}
            {/* Antworten, die direkt zu einem Abschluss oder in einen anderen
                Zweig führen, stehen bewusst neben der Tabelle. */}
            {ablauf.schritt === 'werkstattVorOrt' ? (
              <Button
                variant="secondary"
                className="justify-start"
                disabled={laeuft}
                onClick={() => beenden('lokalNichtMoeglich')}
              >
                Nein
              </Button>
            ) : null}
            {ablauf.schritt === 'fuehrerschein' ? (
              <Button
                variant="secondary"
                className="justify-start"
                onClick={() =>
                  setAblauf((aktuell) =>
                    gehe({ ...aktuell, transport: 'fahrdienst' }, 'zusammenfassung'),
                  )
                }
              >
                Nein
              </Button>
            ) : null}
          </div>
        ) : null}

        {melden.isError ? (
          <Statusmeldung ton="fehler" className="mt-4">
            {melden.error.message}
          </Statusmeldung>
        ) : null}

        {schutz}

        <Formularfuss
          zusatz={
            ablauf.schritt === 'weiterfahrtMoeglich'
              ? 'Diese Meldung sperrt das Rad nicht. Es bleibt in der Planung verfügbar.'
              : undefined
          }
        >
          {hauptaktion(ablauf, setAblauf, () => setAmRad(true), beenden, laeuft)}
          {ablauf.schritt === 'weiterfahrt' ? (
            // Vor der ersten Frage der Vorlage liegt „Wo ist der Schaden?“.
            <Button variant="quiet" disabled={laeuft} onClick={() => setAmRad(true)}>
              ← Zurück
            </Button>
          ) : kannZurueck(ablauf) ? (
            <Button
              variant="quiet"
              disabled={laeuft}
              onClick={() => setAblauf((aktuell) => zurueck(aktuell))}
            >
              ← Zurück
            </Button>
          ) : null}
          <ButtonLink to={ziel} variant="quiet">
            Abbrechen
          </ButtonLink>
        </Formularfuss>
      </div>
    </>
  );
}

/**
 * Der Hauptknopf eines Schritts, wenn er einen hat - Schritte mit Antworten
 * haben keinen, dort ist jede Antwort ein Knopf.
 */
function hauptaktion(
  ablauf: Ablaufzustand,
  setAblauf: (aktualisierung: (aktuell: Ablaufzustand) => Ablaufzustand) => void,
  zumRad: () => void,
  beenden: (art: Abschlussart) => void,
  laeuft: boolean,
): ReactNode {
  const wird = 'Wird gemeldet …';
  switch (ablauf.schritt) {
    case 'radwahl':
      return (
        <Button
          onClick={() => {
            setAblauf((aktuell) => gehe(aktuell, 'weiterfahrt'));
            zumRad();
          }}
          disabled={!ablauf.radId}
        >
          Weiter
        </Button>
      );
    case 'weiterfahrtMoeglich':
      return (
        <Button
          onClick={() => beenden('meldungOhneSperre')}
          disabled={ablauf.freitext.trim() === '' || laeuft}
        >
          {laeuft ? wird : 'Melden'}
        </Button>
      );
    case 'werkstattReparieren':
      return (
        <Button onClick={() => beenden('lokalRepariert')} disabled={laeuft}>
          {laeuft ? wird : 'Erledigt – Rad als „In Reparatur“ markieren'}
        </Button>
      );
    case 'depotBringen':
      return (
        <Button onClick={() => beenden('depotAbgestellt')} disabled={laeuft}>
          {laeuft ? wird : 'Rad als „In Reparatur“ markieren'}
        </Button>
      );
    case 'radZuruecklassen':
      return (
        <Button
          onClick={() =>
            setAblauf((aktuell) => gehe({ ...aktuell, herkunft: 'zuruecklassen' }, 'fuehrerschein'))
          }
        >
          Weiter
        </Button>
      );
    case 'zusammenfassung':
      return (
        <Button onClick={() => beenden('transportFortsetzung')} disabled={laeuft}>
          {laeuft ? wird : 'Bestätigen – Rad als „In Reparatur“ markieren'}
        </Button>
      );
    case 'vertragswerkstattReparieren':
      return (
        <Button onClick={() => beenden('vertragswerkstattRepariert')} disabled={laeuft}>
          {laeuft ? wird : 'Erledigt – Rad als „In Reparatur“ markieren'}
        </Button>
      );
    case 'vertragswerkstattUebergabe':
      return (
        <Button
          onClick={() =>
            setAblauf((aktuell) => gehe({ ...aktuell, herkunft: 'uebergabe' }, 'fuehrerschein'))
          }
        >
          Weiter
        </Button>
      );
    default:
      return null;
  }
}

function Schrittinhalt({
  ablauf,
  setAblauf,
  flotte,
  riss,
  ersatzrad,
  vorbelegt,
  punkte,
}: {
  ablauf: Ablaufzustand;
  setAblauf: (aktualisierung: (aktuell: Ablaufzustand) => Ablaufzustand) => void;
  flotte: Fleet;
  riss: string;
  ersatzrad: string;
  /** Stammt der Text aus markierten Stellen? */
  vorbelegt: boolean;
  punkte: string[];
}) {
  const vorlage = aktiveStandortvorlage;
  const heuteName = wochentagNamen[new Date().getDay()] ?? '';

  switch (ablauf.schritt) {
    case 'radwahl':
      return (
        <div className="mb-4">
          <Radwahl
            flotte={flotte}
            wert={ablauf.radId ?? ''}
            onWahl={(id) => setAblauf((aktuell) => ({ ...aktuell, radId: id || null }))}
          />
        </div>
      );

    case 'weiterfahrtMoeglich':
      return (
        <div className="mb-4">
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
          />
        </div>
      );

    case 'schadensgroesse':
      return (
        <p className="text-ink-muted mb-4 text-sm">
          Klein: Reifen, Gangschaltung. Groß: Elektronik, {riss}, Ausfall beider Bremsen.
        </p>
      );

    case 'werkstattReparieren':
      return (
        <div className="mb-4">
          <Hinweiskasten>Rad bitte vor Ort reparieren lassen.</Hinweiskasten>
          <p className="text-ink text-liste">
            Behandlung, die nicht mehr zu schaffen ist, telefonisch absagen. Eintrag im Kalender und
            kurze Information an Praxismanagement und {vorlage.zustaendigeRolle}.
          </p>
        </div>
      );

    case 'ruhetag':
      return (
        <p className="text-ink-muted mb-4 text-sm">
          {vorlage.werkstatt.name} hat {vorlage.werkstatt.ruhetag}s geschlossen.
          {heuteName ? ` Heute ist ${heuteName}.` : ''}
        </p>
      );

    case 'depotBringen':
      return (
        <div className="mb-4">
          <Hinweiskasten>
            {vorlage.depot.bezeichnung}: {vorlage.depot.zugangHinweis}
          </Hinweiskasten>
          <p className="text-ink text-liste mb-2">
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
        <div className="mb-4 flex flex-col gap-4">
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
          <Hinweiskasten>
            Standort telefonisch an {vorlage.werkstatt.name} durchgeben.
            <br />
            Telefon: {vorlage.werkstatt.telefon} · Mobil: {vorlage.werkstatt.mobil}
          </Hinweiskasten>
          <p className="text-ink text-liste">
            Zusätzlich kurze Nachricht an die {vorlage.zustaendigeRolle} über {vorlage.meldeweg}.
          </p>
          <p className="text-ink text-liste">
            {vorlage.mitnehmen.join(' und ')} vom Rad entfernen und mitnehmen. Rad an einem festen
            Gegenstand anketten.
          </p>
        </div>
      );

    case 'fahrzeugErreichbar':
      return (
        <div className="mb-4 flex flex-col gap-2">
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              setAblauf((aktuell) =>
                gehe({ ...aktuell, transport: 'carsharing' }, 'zusammenfassung'),
              )
            }
          >
            Ja
          </Button>
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              setAblauf((aktuell) =>
                gehe({ ...aktuell, transport: 'fahrdienst' }, 'zusammenfassung'),
              )
            }
          >
            Nein
          </Button>
        </div>
      );

    case 'zusammenfassung':
      return (
        <ul className="text-ink text-liste mb-4 list-disc space-y-1 pl-5">
          {punkte.map((punkt) => (
            <li key={punkt}>{punkt}</li>
          ))}
        </ul>
      );

    case 'vertragswerkstattKontakt':
      return (
        <div className="mb-4">
          <p className="text-ink text-liste mb-3">
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
      return <Hinweiskasten>Reparatur durchführen lassen.</Hinweiskasten>;

    case 'vertragswerkstattUebergabe':
      return (
        <div className="mb-4">
          <p className="text-ink text-liste mb-2">{vorlage.zustaendigeRolle} Bescheid geben.</p>
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
