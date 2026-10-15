import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
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
  recordCheckup,
  type BikeDetail,
  type Fleet,
} from './api';
import {
  CHECK_ITEMS,
  CHECK_ITEM_VIEWS,
  bikeTypeLabels,
  checkRatingLabels,
  raiseRating,
  ratingWithSpots,
  zoneCheckItem,
  zonesOfCheckItem,
  type CheckItemKey,
  type CheckRating,
} from './bike3d/zones';
import { montagDerWoche } from './format';
import { fotoText, uebertrageFotos, type Fotoauftrag } from './fotoauftraege';
import { Fotovormerkung } from './Fotovormerkung';
import { istMeinRad } from './rad';
import { Radwahl } from './Radwahl';
import { Stellenerfassung } from './Stellenerfassung';
import { nummerDerStelle, useStellenerfassung, type Stelle } from './stellen';

/**
 * Fahrrad-Check-Up (FLT-EPIC-001, Handoff Lastenrad 3D Abschnitt 4).
 *
 * Erst das Rad, dann die Prüfung: das 3D-Rad zum Markieren, die zwölf
 * Prüfpunkte der Bauart mit drei Bewertungen, Notiz, weitere Fotos und die
 * Bestätigung. Die Prüfpunkte stehen wie in der Vorlage auf „In Ordnung“;
 * getippt wird nur, was abweicht. Eine Stelle am Rad hebt die Bewertung
 * ihres Prüfpunkts an, nie ab (ANN-550) - die Seite setzt es, der Server
 * prüft es.
 *
 * **Bestätigung ohne Unterschrift (ANN-548).** Wer prüft, ist angemeldet und
 * steht am Check-Up; ein Kästchen mit dem eigenen Namen ersetzt die
 * gezeichnete Unterschrift der Vorlage, die nichts nachwiese, was die
 * Anmeldung nicht schon belegt.
 *
 * **Jeder Check-Up beginnt leer (VOR-03).** Das Formular lebt nur, solange es
 * zu sehen ist; ein anderes Rad baut es neu auf.
 *
 * Der Check-Up sperrt das Rad nicht - auch nicht mit „Problem“. Dafür ist die
 * Pannenmeldung da, und die Teamleitung kann es von Hand sperren.
 */
export function CheckupPage({ user }: { user: CurrentUser }) {
  const [parameter, setParameter] = useSearchParams();
  const radId = parameter.get('rad');
  const montag = montagDerWoche(todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin'));
  const flotte = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });
  const rad = useQuery({
    queryKey: radSchluessel(radId ?? ''),
    queryFn: () => fetchBike(radId ?? ''),
    enabled: Boolean(radId),
    retry: false,
  });
  const zurueck = leseRueckweg(parameter, '/betrieb/flotte');

  return (
    <>
      <Rueckweg standard="/betrieb/flotte" beschriftung="Zurück zur Radflotte" />
      {/* Unter dem Titel das Rad, sobald es gewählt ist (Regel 6). */}
      <PageHeader
        title="Fahrrad-Check-Up"
        description={
          radId && rad.data
            ? `${rad.data.bike.name} · ${bikeTypeLabels[rad.data.bike.bike_type].kurz}`
            : undefined
        }
      />
      {radId ? (
        <Abfragezustand
          abfrage={rad}
          laden="Rad wird geladen …"
          fehler="Das Rad konnte nicht geladen werden."
          inKarte
        >
          {(detail) => (
            // Ein anderes Rad, ein neues Formular (VOR-03).
            <Checkupformular key={detail.bike.id} detail={detail} user={user} zurueck={zurueck} />
          )}
        </Abfragezustand>
      ) : (
        <Abfragezustand
          abfrage={flotte}
          laden="Radflotte wird geladen …"
          fehler="Die Radflotte konnte nicht geladen werden."
          inKarte
        >
          {(daten) => (
            <Auswahl
              vorauswahl={
                daten.bikes.find((eintrag) => istMeinRad(eintrag, daten.my_staff_member_id))?.id ??
                ''
              }
              flotte={daten}
              onWeiter={(id) => {
                const neu = new URLSearchParams(parameter);
                neu.set('rad', id);
                setParameter(neu);
              }}
            />
          )}
        </Abfragezustand>
      )}
    </>
  );
}

function Auswahl({
  flotte,
  vorauswahl,
  onWeiter,
}: {
  flotte: Fleet;
  vorauswahl: string;
  onWeiter: (id: string) => void;
}) {
  const [wahl, setWahl] = useState(vorauswahl);
  return (
    <div className="max-w-formular">
      <Radwahl
        flotte={flotte}
        wert={wahl}
        onWahl={setWahl}
        hinweis="Die Nummer eines Rads steht am Sattelrohr, direkt unter dem Sattel."
      />
      <Formularfuss>
        <Button onClick={() => onWeiter(wahl)} disabled={!wahl}>
          Weiter
        </Button>
        <ButtonLink to="/betrieb/flotte" variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </div>
  );
}

type Bewertungen = Record<CheckItemKey, CheckRating>;

const START: Bewertungen = Object.fromEntries(
  CHECK_ITEMS.map((item) => [item.key, 'ok']),
) as Bewertungen;

const BEWERTUNGEN = (['ok', 'beobachten', 'problem'] as const).map((wert) => ({
  wert,
  text: checkRatingLabels[wert],
}));

function Checkupformular({
  detail,
  user,
  zurueck,
}: {
  detail: BikeDetail;
  user: CurrentUser;
  zurueck: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { bike } = detail;
  const offen = detail.spots.filter((spot) => spot.resolved_at === null);

  const [bewertungen, setBewertungen] = useState<Bewertungen>(START);
  const [notizen, setNotizen] = useState<Partial<Record<CheckItemKey, string>>>({});
  const [notiz, setNotiz] = useState('');
  const [weitereFotos, setWeitereFotos] = useState<Blob[]>([]);
  const [bestaetigt, setBestaetigt] = useState(false);
  // Nach dem Speichern: Fotos, die noch nicht übertragen sind.
  const [ausstehend, setAusstehend] = useState<{
    auftraege: Fotoauftrag[];
    grund: string | null;
  } | null>(null);

  const erfassung = useStellenerfassung({
    art: 'checkup',
    onGesetzt: (stelle) => {
      const punkt = zoneCheckItem(stelle.zone);
      if (punkt) {
        setBewertungen((vorher) => ({
          ...vorher,
          [punkt]: raiseRating(vorher[punkt], stelle.severity),
        }));
      }
    },
  });
  const { stellen } = erfassung;

  function bewerte(punkt: CheckItemKey, wert: CheckRating) {
    // Nie unter das, was eine Stelle am Rad schon sagt (ANN-550).
    setBewertungen((vorher) => ({ ...vorher, [punkt]: ratingWithSpots(punkt, wert, stellen) }));
  }

  const ungespeichert =
    ausstehend === null &&
    (stellen.length > 0 ||
      erfassung.entwurf !== null ||
      Object.values(bewertungen).some((wert) => wert !== 'ok') ||
      Object.values(notizen).some((text) => text?.trim()) ||
      notiz.trim() !== '' ||
      weitereFotos.length > 0 ||
      bestaetigt);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert,
    nichtSicherbar:
      ausstehend && ausstehend.auftraege.length > 0
        ? `${fotoText(ausstehend.auftraege.length)} sind noch nicht übertragen und gehen beim Weitergehen verloren.`
        : undefined,
    texte: { ...EINGABETEXTE, bezeichnung: 'Ungespeicherter Check-Up' },
  });

  function zumRad(meldung: string) {
    freigeben();
    void navigate(`/betrieb/flotte/rad/${bike.id}?bereich=stellen`, {
      replace: true,
      state: { meldung },
    });
  }

  const speichern = useMutation({
    mutationFn: async () => {
      const ergebnis = await recordCheckup({
        bikeId: bike.id,
        items: CHECK_ITEMS.map((item) => ({
          key: item.key,
          rating: bewertungen[item.key],
          note: bewertungen[item.key] === 'ok' ? '' : (notizen[item.key] ?? ''),
        })),
        note: notiz.trim(),
        spots: stellen.map((stelle) => ({
          zone: stelle.zone,
          severity: stelle.severity,
          point: stelle.point,
          note: stelle.note,
        })),
      });
      const auftraege: Fotoauftrag[] = [
        ...stellen.flatMap((stelle: Stelle, index) =>
          stelle.fotos.map((foto) => ({
            spotId: ergebnis.spotIds[index] ?? null,
            checkupId: null,
            foto,
          })),
        ),
        ...weitereFotos.map((foto) => ({ spotId: null, checkupId: ergebnis.checkupId, foto })),
      ].filter((auftrag) => auftrag.spotId !== null || auftrag.checkupId !== null);
      const uebertragung = await uebertrageFotos(auftraege);
      return { anzahl: auftraege.length, ...uebertragung };
    },
    onSuccess: async ({ anzahl, fehlgeschlagen, grund }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      if (fehlgeschlagen.length === 0) {
        zumRad(
          anzahl > 0 ? `Check-Up gespeichert, mit ${fotoText(anzahl)}.` : 'Check-Up gespeichert.',
        );
      } else {
        setAusstehend({ auftraege: fehlgeschlagen, grund });
      }
    },
  });

  const erneut = useMutation({
    mutationFn: () => uebertrageFotos(ausstehend?.auftraege ?? []),
    onSuccess: async ({ fehlgeschlagen, grund }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      if (fehlgeschlagen.length === 0) zumRad('Check-Up gespeichert, Fotos übertragen.');
      else setAusstehend({ auftraege: fehlgeschlagen, grund });
    },
  });

  if (ausstehend) {
    return (
      <div className="max-w-formular flex flex-col gap-4">
        <Rueckmeldung>Check-Up gespeichert.</Rueckmeldung>
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
            onClick={() => zumRad('Check-Up gespeichert, ohne die übrigen Fotos.')}
          >
            Ohne diese Fotos weiter
          </Button>
        </Formularfuss>
      </div>
    );
  }

  const offeneStelle = erfassung.entwurf !== null;
  const zusammenfassung = (() => {
    const probleme = CHECK_ITEMS.filter((item) => bewertungen[item.key] === 'problem').length;
    const beobachten = CHECK_ITEMS.filter((item) => bewertungen[item.key] === 'beobachten').length;
    const weitere = stellen.filter((stelle) => zoneCheckItem(stelle.zone) === null);
    const alleProbleme =
      probleme + weitere.filter((stelle) => stelle.severity === 'problem').length;
    const alleBeobachten =
      beobachten + weitere.filter((stelle) => stelle.severity === 'beobachten').length;
    return `${alleProbleme === 1 ? '1 Problem' : `${alleProbleme} Probleme`} · ${alleBeobachten} zu beobachten · ${
      stellen.length === 1 ? '1 Stelle' : `${stellen.length} Stellen`
    } am Rad markiert`;
  })();
  const fehlt = offeneStelle
    ? 'Eine Stelle ist noch offen. Setzen oder verwerfen Sie sie zuerst.'
    : !bestaetigt
      ? 'Die Bestätigung fehlt noch.'
      : undefined;

  return (
    <div className="max-w-formular">
      <Section titel="Am Rad markieren">
        <Stellenerfassung
          zustand={erfassung}
          bestehend={offen}
          bauart={bike.bike_type}
          hoehe={340}
        />
      </Section>

      <Section titel="Prüfpunkte">
        {/* Ohne Rahmen um die Gruppe (Formular, Leitfaden L2): die Prüfpunkte
            als Zeilen mit Linie dazwischen. */}
        <ul className="border-line border-y">
          {CHECK_ITEMS.map((item) => {
            const wert = bewertungen[item.key];
            const nummern = stellen
              .map((stelle, index) => ({ stelle, nummer: nummerDerStelle(index, offen.length) }))
              .filter(({ stelle }) => zoneCheckItem(stelle.zone) === item.key)
              .map(({ nummer }) => nummer);
            const imFokus =
              erfassung.hervorgehoben?.pruefpunkt === item.key && erfassung.entwurf === null;
            const zeigen = () =>
              erfassung.zeigeBauteile(
                zonesOfCheckItem(item.key),
                CHECK_ITEM_VIEWS[item.key],
                item.key,
              );
            return (
              <li key={item.key} className="border-line border-t py-3 first:border-t-0">
                <Wahlreihe
                  legende={item.label}
                  wahlen={BEWERTUNGEN}
                  gewaehlt={wert}
                  onWaehlen={(neu) => bewerte(item.key, neu)}
                  zusatz={
                    nummern.length > 0 || wert !== 'ok' ? (
                      <div className="flex flex-col items-start gap-2">
                        {nummern.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-ink-muted text-sm">
                              Am Rad markiert: {nummern.length === 1 ? 'Stelle' : 'Stellen'}{' '}
                              {nummern.join(', ')}
                            </span>
                            <Button
                              type="button"
                              variant="quiet"
                              groesse="kompakt"
                              onClick={zeigen}
                            >
                              Am Rad zeigen<span className="sr-only">: {item.label}</span>
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            groesse="kompakt"
                            onClick={zeigen}
                          >
                            Stelle am Rad markieren<span className="sr-only">: {item.label}</span>
                          </Button>
                        )}
                        {imFokus ? (
                          <p className="text-accent text-sm font-medium" role="status">
                            Oben am Rad hervorgehoben. Tippen Sie dort auf die betroffene Stelle.
                          </p>
                        ) : null}
                        {wert !== 'ok' ? (
                          <div className="w-full">
                            <Field
                              label={`Notiz zu ${item.label}`}
                              placeholder="Was ist aufgefallen?"
                              maxLength={300}
                              value={notizen[item.key] ?? ''}
                              onChange={(event) =>
                                setNotizen((vorher) => ({
                                  ...vorher,
                                  [item.key]: event.target.value,
                                }))
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section titel="Abschluss">
        <Feldgruppe>
          <TextArea
            rows={3}
            label="Notiz"
            placeholder="Weitere Auffälligkeiten"
            hint="Keine Angaben zu Patient:innen."
            maxLength={1000}
            value={notiz}
            onChange={(event) => setNotiz(event.target.value)}
          />
          <div>
            <p className="text-ink mb-2 text-sm font-medium">Weitere Fotos</p>
            <Fotovormerkung
              fotos={weitereFotos}
              onFotos={setWeitereFotos}
              titel="Foto vom ganzen Rad"
              bezug="vom ganzen Rad"
            />
          </div>
          <Checkbox
            label={`Ich, ${user.profile.display_name}, habe das ganze Rad gründlich auf Sicherheit geprüft.`}
            checked={bestaetigt}
            onChange={(event) => setBestaetigt(event.target.checked)}
          />
          <Statusmeldung>{zusammenfassung}</Statusmeldung>
        </Feldgruppe>
      </Section>

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      {schutz}

      <Formularfuss trenner zusatz={fehlt ? <span id="checkup-fehlt">{fehlt}</span> : undefined}>
        <Button
          onClick={() => speichern.mutate()}
          disabled={offeneStelle || !bestaetigt || speichern.isPending}
          aria-describedby={fehlt ? 'checkup-fehlt' : undefined}
        >
          {speichern.isPending ? 'Wird gespeichert …' : 'Check-Up speichern'}
        </Button>
        <ButtonLink to={zurueck} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </div>
  );
}
