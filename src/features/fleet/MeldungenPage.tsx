import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { EmptyState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Textlink } from '@/components/ui/Textlink';
import type { CurrentUser } from '@/features/session/types';
import { fetchFleetReports, meldungenSchluessel, type FleetReport } from './api';
import { checkItemLabels, checkRatingLabels, zoneLabel, type CheckItemKey } from './bike3d/zones';
import { formatTag, formatZeitpunkt } from './format';
import { Fotoreihe } from './Fotoreihe';
import {
  ARTEN,
  STANDARD_ZEITRAUM,
  ZEITRAEUME,
  abTag,
  ergebnis,
  fehlendeSeiten,
  filtere,
  istArtfilter,
  istZeitraum,
  meldungsPfad,
  meldungstitel,
  raederDerMeldungen,
  werbeflaechen,
  type Artfilter,
  type Zeitraum,
} from './meldungen';
import { Einstufung } from './Einstufung';
import { todayInTimeZone } from '@/lib/datum';

const ZUR_FLOTTE = '/betrieb/flotte';
const ZU_DEN_MELDUNGEN = '/betrieb/flotte/meldungen';

/**
 * Die Meldungen der Flotte für den Arbeitgeber (FLT-008, ANN-569): alle
 * Check-Ups und Pannen aller Räder, neueste zuerst, mit Ergebnis,
 * Werbeflächen und Seitenfotos an der Zeile; die Zeile öffnet die Meldung mit
 * allen Prüfpunkten, Stellen und Fotos (DESIGN.md „Liste“).
 *
 * Lesen dürfen owner und team_lead - das entscheidet der Server
 * (`list_fleet_reports`); die Radflotte zeigt den Weg nur ihnen. Filter nach
 * Art, Rad und Zeitraum, nie nach Person (PROJECT_PRINCIPLES.md 20).
 */
export function MeldungenPage({ user }: { user: CurrentUser }) {
  const zone = user.organizationTimeZone;
  const heute = todayInTimeZone(zone ?? 'Europe/Berlin');
  const [parameter, setParameter] = useSearchParams();
  const zeitraumRoh = parameter.get('zeitraum');
  const zeitraum: Zeitraum = istZeitraum(zeitraumRoh) ? zeitraumRoh : STANDARD_ZEITRAUM;
  const artRoh = parameter.get('art');
  const art: Artfilter = istArtfilter(artRoh) ? artRoh : 'alle';
  const rad = parameter.get('rad');
  const ab = abTag(heute, zeitraum);

  const abfrage = useQuery({
    queryKey: meldungenSchluessel(ab),
    queryFn: () => fetchFleetReports(ab),
    retry: false,
  });

  function setze(naechste: { zeitraum?: Zeitraum; art?: Artfilter; rad?: string | null }) {
    const neu = new URLSearchParams(parameter);
    const z = naechste.zeitraum ?? zeitraum;
    const a = naechste.art ?? art;
    const r = naechste.rad === undefined ? rad : naechste.rad;
    if (z !== STANDARD_ZEITRAUM) neu.set('zeitraum', z);
    else neu.delete('zeitraum');
    if (a !== 'alle') neu.set('art', a);
    else neu.delete('art');
    if (r) neu.set('rad', r);
    else neu.delete('rad');
    setParameter(neu, { replace: true });
  }

  return (
    <>
      <Rueckweg standard={ZUR_FLOTTE} beschriftung="Zurück zur Radflotte" />
      <PageHeader title="Meldungen" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Meldungen werden geladen …"
        fehler="Die Meldungen konnten nicht geladen werden."
        inKarte
      >
        {(meldungen) => {
          const raeder = raederDerMeldungen(meldungen);
          const sichtbar = filtere(meldungen, { art, rad });
          const checkups = sichtbar.filter((m) => m.kind === 'checkup').length;
          return (
            <>
              <Filterleiste
                gesetzt={(art === 'alle' ? 0 : 1) + (rad ? 1 : 0)}
                onZuruecksetzen={() => setze({ art: 'alle', rad: null })}
                beschriftung="Meldungen filtern"
                ergebnis={`${checkups} ${checkups === 1 ? 'Check-Up' : 'Check-Ups'} · ${
                  sichtbar.length - checkups
                } ${sichtbar.length - checkups === 1 ? 'Panne' : 'Pannen'}`}
              >
                <Select
                  label="Zeitraum"
                  value={zeitraum}
                  onChange={(event) =>
                    setze({
                      zeitraum: istZeitraum(event.target.value)
                        ? event.target.value
                        : STANDARD_ZEITRAUM,
                    })
                  }
                >
                  {ZEITRAEUME.map((eintrag) => (
                    <option key={eintrag.wert} value={eintrag.wert}>
                      {eintrag.text}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Art"
                  value={art}
                  onChange={(event) =>
                    setze({ art: istArtfilter(event.target.value) ? event.target.value : 'alle' })
                  }
                >
                  {ARTEN.map((eintrag) => (
                    <option key={eintrag.wert} value={eintrag.wert}>
                      {eintrag.text}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Rad"
                  value={rad ?? ''}
                  onChange={(event) => setze({ rad: event.target.value || null })}
                >
                  <option value="">Alle Räder</option>
                  {raeder.map((eintrag) => (
                    <option key={eintrag.id} value={eintrag.id}>
                      {eintrag.name}
                    </option>
                  ))}
                </Select>
              </Filterleiste>

              {meldungen.length === 0 ? (
                <EmptyState inKarte title="Keine Meldungen in diesem Zeitraum" />
              ) : sichtbar.length === 0 ? (
                <EmptyState inKarte title="Keine Treffer" description="Filter anpassen." />
              ) : (
                <ListRows beschriftung="Meldungen">
                  {sichtbar.map((meldung) => (
                    <Meldungszeile key={meldung.id} meldung={meldung} zone={zone} />
                  ))}
                </ListRows>
              )}
            </>
          );
        }}
      </Abfragezustand>
    </>
  );
}

/** Eine Meldung als Zeile: Was, wann, wer; das Ergebnis; Abweichungen mit „!“ (Regel 5). */
function Meldungszeile({ meldung, zone }: { meldung: FleetReport; zone: string | null }) {
  const warnung = (text: string) => (
    <span className="text-warnung block font-medium">
      <span aria-hidden="true">! </span>
      {text}
    </span>
  );
  return (
    <ListRow
      to={meldungsPfad(meldung)}
      titel={meldungstitel(meldung)}
      meta={
        <>
          <span className="block">
            {[formatZeitpunkt(meldung.at, zone), meldung.by_name].filter(Boolean).join(' · ')}
          </span>
          {meldung.kind === 'checkup' ? (
            <CheckupZeilen meldung={meldung} warnung={warnung} />
          ) : (
            <>
              {meldung.blocks ? warnung('Rad gesperrt') : null}
              <span className="line-clamp-2 block">{meldung.summary}</span>
            </>
          )}
        </>
      }
    />
  );
}

function CheckupZeilen({
  meldung,
  warnung,
}: {
  meldung: Extract<FleetReport, { kind: 'checkup' }>;
  warnung: (text: string) => ReactNode;
}) {
  const fehlend = fehlendeSeiten(meldung);
  const werbung = werbeflaechen(meldung);
  return (
    <>
      {ergebnis(meldung).map((zeile) =>
        zeile.startsWith('Problem') ? (
          <span key={zeile} className="text-danger block font-medium">
            <span aria-hidden="true">× </span>
            {zeile}
          </span>
        ) : zeile.startsWith('Beobachten') ? (
          <span key={zeile}>{warnung(zeile)}</span>
        ) : (
          <span key={zeile} className="block">
            {zeile}
          </span>
        ),
      )}
      {werbung === null ? null : meldung.ad_surfaces === 'wiped' ? (
        <span className="block">{werbung}</span>
      ) : (
        warnung(werbung)
      )}
      {meldung.ad_surfaces === null ? null : fehlend.length > 0 ? (
        warnung(`Seitenfotos: ${4 - fehlend.length} von 4`)
      ) : (
        <span className="block">Seitenfotos: alle vier</span>
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// Eine Meldung
// -----------------------------------------------------------------------------

/**
 * Eine Meldung im Ganzen (FLT-008): beim Check-Up alle Prüfpunkte, die
 * Werbeflächen, die Seitenfotos, Stellen und Notiz; bei der Panne der
 * Abschluss des Assistenten, Standort und Stellen. Gelesen aus derselben
 * Liste, ein Jahr zurück - das, was der Server höchstens liefert.
 */
export function MeldungPage({ user }: { user: CurrentUser }) {
  const { art = '', meldungId = '' } = useParams<{ art: string; meldungId: string }>();
  const zone = user.organizationTimeZone;
  const ab = abTag(todayInTimeZone(zone ?? 'Europe/Berlin'), '365');
  const abfrage = useQuery({
    queryKey: meldungenSchluessel(ab),
    queryFn: () => fetchFleetReports(ab),
    retry: false,
  });
  const kind = art === 'checkup' ? 'checkup' : art === 'panne' ? 'breakdown' : null;

  return (
    <>
      <Rueckweg standard={ZU_DEN_MELDUNGEN} beschriftung="Zurück zu den Meldungen" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Meldung wird geladen …"
        fehler="Die Meldung konnte nicht geladen werden."
        inKarte
        rahmen={(zustand) => (
          <>
            <PageHeader title="Meldung" />
            {zustand}
          </>
        )}
      >
        {(meldungen) => {
          const meldung = meldungen.find((m) => m.id === meldungId && m.kind === kind);
          if (!meldung) {
            return (
              <>
                <PageHeader title="Meldung" />
                <EmptyState
                  inKarte
                  title="Diese Meldung gibt es hier nicht."
                  description="Älter als ein Jahr oder das Rad ist ausgemustert."
                />
              </>
            );
          }
          return (
            <>
              <PageHeader
                title={meldungstitel(meldung)}
                description={[formatZeitpunkt(meldung.at, zone), meldung.by_name]
                  .filter(Boolean)
                  .join(' · ')}
              />
              {meldung.kind === 'checkup' ? (
                <CheckupInhalt meldung={meldung} zone={zone} />
              ) : (
                <PannenInhalt meldung={meldung} />
              )}
              <Stellen meldung={meldung} />
              <p className="mt-6">
                <Textlink to={`/betrieb/flotte/rad/${meldung.bike_id}`} alleinstehend>
                  Zum Rad
                </Textlink>
              </p>
            </>
          );
        }}
      </Abfragezustand>
    </>
  );
}

function CheckupInhalt({
  meldung,
  zone,
}: {
  meldung: Extract<FleetReport, { kind: 'checkup' }>;
  zone: string | null;
}) {
  const seitenfotos = meldung.photos.filter((foto) => foto.side !== null);
  const weitere = meldung.photos.filter((foto) => foto.side === null && foto.spot_id === null);
  const fehlend = fehlendeSeiten(meldung);
  return (
    <>
      <Section titel="Reinigung und Fotos">
        <DetailList>
          <DetailRow label="Werbeflächen">
            {meldung.ad_surfaces === null
              ? `Nicht erfasst (Check-Up vom ${formatTag(meldung.at, zone)})`
              : meldung.ad_surfaces === 'wiped'
                ? 'Abgewischt'
                : `Nicht abgewischt: ${meldung.ad_surfaces_note ?? ''}`}
          </DetailRow>
          <DetailRow label="Seitenfotos">
            {seitenfotos.length > 0 ? (
              <Fotoreihe fotos={seitenfotos} bezug="vom Check-Up" />
            ) : meldung.ad_surfaces === null ? (
              'Nicht erfasst'
            ) : null}
            {fehlend.length > 0 ? (
              <span className="text-warnung block font-medium">
                <span aria-hidden="true">! </span>
                Fehlt: {fehlend.map((seite) => seite.label).join(', ')}
              </span>
            ) : null}
          </DetailRow>
          {meldung.note ? <DetailRow label="Notiz">{meldung.note}</DetailRow> : null}
          {weitere.length > 0 ? (
            <DetailRow label="Weitere Fotos">
              <Fotoreihe fotos={weitere} bezug="vom ganzen Rad" />
            </DetailRow>
          ) : null}
        </DetailList>
      </Section>
      <Listenabschnitt titel="Prüfpunkte" anzahl={meldung.items.length}>
        {meldung.items.map((item) => (
          <ListRow
            key={item.key}
            titel={checkItemLabels[item.key as CheckItemKey] ?? item.key}
            meta={item.note ?? undefined}
            status={
              item.rating === 'ok' ? (
                <span className="text-positiv font-medium">
                  <span aria-hidden="true">✓ </span>
                  {checkRatingLabels.ok}
                </span>
              ) : (
                <Einstufung einstufung={item.rating} />
              )
            }
          />
        ))}
      </Listenabschnitt>
    </>
  );
}

function PannenInhalt({ meldung }: { meldung: Extract<FleetReport, { kind: 'breakdown' }> }) {
  return (
    <Section titel="Abschluss">
      <DetailList>
        <DetailRow label="Ergebnis">{meldung.summary}</DetailRow>
        <DetailRow label="Rad">{meldung.blocks ? 'Gesperrt' : 'Weiterfahrt möglich'}</DetailRow>
        {meldung.remark ? <DetailRow label="Auffällig">{meldung.remark}</DetailRow> : null}
        {meldung.location_note ? (
          <DetailRow label="Standort">{meldung.location_note}</DetailRow>
        ) : null}
        {meldung.transport ? (
          <DetailRow label="Transport">
            {meldung.transport === 'carsharing' ? 'Carsharing' : 'Fahrdienst'}
          </DetailRow>
        ) : null}
      </DetailList>
    </Section>
  );
}

function Stellen({ meldung }: { meldung: FleetReport }) {
  if (meldung.spots.length === 0) return null;
  return (
    <Listenabschnitt titel="Stellen am Rad" anzahl={meldung.spots.length}>
      {meldung.spots.map((stelle) => {
        const fotos = meldung.photos.filter((foto) => foto.spot_id === stelle.id);
        return (
          <ListRow
            key={stelle.id}
            titel={zoneLabel(stelle.zone)}
            meta={
              <>
                <span className="block">
                  <Einstufung einstufung={stelle.severity} />
                  {stelle.resolved_at ? ' · erledigt' : ' · offen'}
                </span>
                {stelle.note ? <span className="block">{stelle.note}</span> : null}
              </>
            }
            darunter={
              fotos.length > 0 ? (
                <Fotoreihe fotos={fotos} bezug={`zu ${zoneLabel(stelle.zone)}`} />
              ) : undefined
            }
          />
        );
      })}
    </Listenabschnitt>
  );
}
