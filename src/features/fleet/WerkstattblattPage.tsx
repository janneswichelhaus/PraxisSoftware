import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import {
  fetchFleetPhotos,
  fetchWorkshopSheet,
  fotosSchluessel,
  loadFleetPhoto,
  werkstattSchluessel,
  type FleetPhoto,
  type WorkshopSheet,
} from './api';
import type { Werkstattbild, Werkstattbilder } from './bike3d/werkstattbilder';
import {
  bikeTypeLabels,
  checkItemLabels,
  zoneCheckItem,
  zoneLabel,
  type Severity,
} from './bike3d/zones';
import { dateinameWerkstatt, formatTag, formatZeitpunkt } from './format';
import { punktAmModell } from './stellen';
import { aktiveStandortvorlage } from './standortvorlage';

/**
 * Die Unterlage für die Werkstatt (Handoff Lastenrad 3D, Abschnitt 4,
 * Vorschläge 5 bis 7; AC 6) - Seitentyp „Druckblatt“: Bedienung darüber
 * `nicht-drucken`, das Blatt selbst über den Druckdialog des Browsers als
 * Papier oder PDF, wie das Rechnungsblatt (B14, Weg 1).
 *
 * Seite 1: Wortmarke, Rad und Bauart, An und Rückfragen, Zustand, die rechte
 * und die linke Seite mit den Nadeln und die Tabelle der Stellen mit einem
 * leeren Kästchen „Erledigt“. Ab Seite 2 je Stelle ein Ausschnitt am Modell
 * und ihre Fotos, drei Stellen je Seite. Dieselbe Nummer wie am Rad und in
 * der Liste.
 *
 * **Nur Angaben zum Rad** (Vorschlag 5): keine Namen aus dem Team, keine
 * Termine, kein Pannenort - die Serverfunktion liefert sie gar nicht
 * (`get_fleet_workshop_sheet`). Notizen und Fotos gehen unverändert mit; die
 * Seite bittet, sie vor dem Weitergeben zu prüfen. **Versendet wird nichts**
 * (Vorschlag 6, ADR-017 Punkt 42).
 */
export function WerkstattblattPage({ user }: { user: CurrentUser }) {
  const { radId = '' } = useParams();
  const zone = user.organizationTimeZone;
  const blatt = useQuery({
    queryKey: werkstattSchluessel(radId),
    queryFn: () => fetchWorkshopSheet(radId),
    retry: false,
  });
  const zumRad = `/betrieb/flotte/rad/${radId}?bereich=stellen`;

  return (
    <Abfragezustand
      abfrage={blatt}
      laden="Unterlage wird vorbereitet …"
      fehler="Die Unterlage für die Werkstatt konnte nicht geladen werden."
      inKarte
      rahmen={(zustand) => (
        <>
          <Rueckweg standard={zumRad} beschriftung="Zurück zum Rad" />
          <PageHeader title="Unterlage für die Werkstatt" />
          {zustand}
        </>
      )}
    >
      {(daten) =>
        daten.spots.length === 0 ? (
          <>
            <Rueckweg standard={zumRad} beschriftung="Zurück zum Rad" />
            <PageHeader title="Unterlage für die Werkstatt" />
            <EmptyState
              inKarte
              title="Keine offenen Stellen"
              description="Die Unterlage zeigt die offenen Stellen eines Rads."
            />
          </>
        ) : (
          <Unterlage blatt={daten} radId={radId} zone={zone} zumRad={zumRad} />
        )
      }
    </Abfragezustand>
  );
}

/** Drei Stellen je Detailseite (Handoff, Druckregeln). */
const JE_SEITE = 3;

function Unterlage({
  blatt,
  radId,
  zone,
  zumRad,
}: {
  blatt: WorkshopSheet;
  radId: string;
  zone: string | null;
  zumRad: string;
}) {
  const vorlage = aktiveStandortvorlage;
  const heute = todayInTimeZone(zone ?? 'Europe/Berlin');
  const name = dateinameWerkstatt(blatt.name, heute);
  const stand = `${formatZeitpunkt(new Date().toISOString(), zone)} Uhr`;

  const bilder = useQuery({
    queryKey: [
      ...werkstattSchluessel(radId),
      'bilder',
      blatt.spots.map((spot) => spot.id).join(','),
    ],
    queryFn: async (): Promise<Werkstattbilder> => {
      const { zeichneWerkstattbilder } = await import('./bike3d/werkstattbilder');
      return zeichneWerkstattbilder(
        blatt.spots.map((spot) => ({
          id: spot.id,
          zone: spot.zone,
          point: punktAmModell(spot, blatt.bike_type),
        })),
      );
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const fotos = useQuery({
    queryKey: fotosSchluessel(radId),
    queryFn: () => fetchFleetPhotos(radId),
    retry: false,
  });
  const fotoadressen = useFotoadressen(
    (fotos.data ?? []).filter((foto) => blatt.spots.some((spot) => spot.id === foto.spot_id)),
  );

  // Der Dateiname der PDF ist der Titel des Tabs im Moment des Druckens.
  useEffect(() => {
    let vorher = document.title;
    const vor = () => {
      vorher = document.title;
      document.title = name;
    };
    const nach = () => {
      document.title = vorher;
    };
    window.addEventListener('beforeprint', vor);
    window.addEventListener('afterprint', nach);
    return () => {
      window.removeEventListener('beforeprint', vor);
      window.removeEventListener('afterprint', nach);
    };
  }, [name]);

  const probleme = blatt.spots.filter((spot) => spot.severity === 'problem').length;
  const seiten: WorkshopSheet['spots'][] = [];
  for (let start = 0; start < blatt.spots.length; start += JE_SEITE) {
    seiten.push(blatt.spots.slice(start, start + JE_SEITE));
  }
  const seitenzahl = 1 + seiten.length;
  const bereit = !bilder.isPending && (fotos.isError || fotoadressen.fertig);

  return (
    <>
      <div className="nicht-drucken mx-auto mb-4 flex max-w-[210mm] flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4">
          <Rueckweg standard={zumRad} beschriftung="Zurück zum Rad" />
          <Button type="button" disabled={!bereit} onClick={() => window.print()}>
            {bereit ? 'Drucken oder als PDF sichern' : 'Wird vorbereitet …'}
          </Button>
        </div>
        <Kleingedrucktes>
          Datei: {name}.pdf. Seite 1 zeigt das Rad von beiden Seiten mit allen offenen Stellen und
          die Tabelle zum Abhaken, ab Seite 2 steht jede Stelle im Ausschnitt mit ihren Fotos. Die
          Unterlage nennt keine Namen aus dem Team, keine Termine und keinen Pannenort. Notizen und
          Fotos gehen unverändert mit – bitte vor dem Weitergeben auf Angaben zu Patient:innen
          prüfen. Versendet wird nichts automatisch; Sie schicken die Datei selbst an die Werkstatt.
        </Kleingedrucktes>
        {bilder.isError ? (
          <Statusmeldung ton="warnung">
            Die Ansichten des Rads lassen sich in diesem Browser nicht zeichnen. Die Unterlage
            enthält die Tabelle und die Fotos, aber keine Bilder vom Modell.
          </Statusmeldung>
        ) : null}
        {fotos.isError || fotoadressen.fehler ? (
          <Statusmeldung ton="warnung">
            Nicht alle Fotos ließen sich laden. Die Unterlage zeigt nur die geladenen.
          </Statusmeldung>
        ) : null}
      </div>

      <article aria-label="Unterlage für die Werkstatt" className="text-ink mx-auto max-w-[210mm]">
        <Blattseite nummer={1} von={seitenzahl} rad={blatt.name}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Wortmarke farbig, 40 px, Schutzraum frei (marke/README.md). */}
            <Wortmarke hoehe={40} />
            <div className="text-right">
              <p className="text-base font-semibold">Übersicht für die Werkstatt</p>
              <p className="text-ink-muted text-sm">Stand {stand}</p>
            </div>
          </div>

          <h1 className="text-accent mt-8 text-3xl font-extrabold">{blatt.name}</h1>
          <p className="text-ink-muted mt-1 text-base">{bikeTypeLabels[blatt.bike_type].lang}</p>

          <dl className="border-line rounded-card mt-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 border p-4 text-base sm:gap-x-6">
            <dt className="text-ink-muted">An</dt>
            <dd>{vorlage.werkstatt.name}</dd>
            <dt className="text-ink-muted">Rückfragen</dt>
            <dd>{vorlage.zustaendigeRolle} · hallo@ownmotion.de</dd>
            <dt className="text-ink-muted">Zustand</dt>
            <dd>
              {blatt.blocked_since
                ? `Gesperrt seit ${formatZeitpunkt(blatt.blocked_since, zone)}`
                : 'Nicht gesperrt'}
            </dd>
            <dt className="text-ink-muted">Stellen</dt>
            <dd>
              {blatt.spots.length} markiert, davon {probleme} Problem
            </dd>
          </dl>

          <h2 className="mt-6 text-lg font-bold">Wo am Rad</h2>
          {/* Nebeneinander wie im Entwurf: So passt Seite 1 auf ein A4-Blatt. */}
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Seitenbild titel="Rechte Seite mit Antrieb" bild={bilder.data?.rechts} blatt={blatt} />
            <Seitenbild titel="Linke Seite" bild={bilder.data?.links} blatt={blatt} />
          </div>

          <h2 className="mt-6 text-lg font-bold">Markierte Stellen</h2>
          {/* Feste Spalten mit Silbentrennung. Am Telefon steht die Einstufung
              unter dem Bauteil, und das Kästchen zum Abhaken fehlt - es gehört
              aufs Papier. A4 ist breiter als `sm`: Gedruckt bleibt die Tabelle
              wie im Entwurf. */}
          <table className="mt-3 w-full table-fixed border-collapse text-sm break-words hyphens-auto sm:text-base">
            <colgroup>
              <col className="w-10" />
              <col className="w-[38%] sm:w-[30%]" />
              <col />
              <col className="hidden w-[18%] sm:table-column" />
              <col className="hidden w-16 sm:table-column" />
            </colgroup>
            <thead>
              <tr className="border-ink border-b-2 text-left text-sm">
                <th scope="col" className="py-2 pr-2 sm:pr-3">
                  Nr.
                </th>
                <th scope="col" className="py-2 pr-2 sm:pr-3">
                  Bauteil
                </th>
                <th scope="col" className="py-2 pr-2 sm:pr-3">
                  Beschreibung
                </th>
                <th scope="col" className="hidden py-2 pr-2 sm:table-cell sm:pr-3">
                  Einstufung
                </th>
                <th scope="col" className="hidden py-2 sm:table-cell">
                  Erledigt
                </th>
              </tr>
            </thead>
            <tbody>
              {blatt.spots.map((spot) => (
                <tr key={spot.id} className="border-line border-b align-top">
                  <td className="py-2 pr-2 sm:pr-3">
                    <DruckNadel nummer={spot.number} einstufung={spot.severity} />
                  </td>
                  <td className="py-2 pr-2 sm:pr-3">
                    <span className="block font-semibold">{zoneLabel(spot.zone)}</span>
                    <span className="block sm:hidden">{einstufungText(spot.severity)}</span>
                    <span className="text-ink-muted block text-sm">{herkunft(spot, zone)}</span>
                  </td>
                  <td className="py-2 pr-2 sm:pr-3">{spot.note ?? '–'}</td>
                  <td className="hidden py-2 pr-2 sm:table-cell sm:pr-3">
                    {einstufungText(spot.severity)}
                  </td>
                  <td className="hidden py-2 sm:table-cell">
                    <span
                      aria-label="Erledigt, zum Abhaken"
                      role="img"
                      className="border-ink inline-block size-6 border-2"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-ink-muted mt-4 text-sm">
            Ausschnitt am Modell und Fotos zu jeder Stelle: Seite 2
            {seitenzahl > 2 ? ` bis ${seitenzahl}` : ''}.
          </p>
        </Blattseite>

        {seiten.map((gruppe, index) => (
          <Blattseite
            key={gruppe[0]?.id ?? index}
            nummer={index + 2}
            von={seitenzahl}
            rad={blatt.name}
          >
            <div className="border-line flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
              <p className="text-accent text-sm font-semibold">
                {blatt.name} · Übersicht für die Werkstatt
              </p>
              <p className="text-ink-muted text-sm">Stand {stand}</p>
            </div>
            <h2 className="text-accent mt-6 text-2xl font-extrabold">Stellen im Detail</h2>
            <p className="text-ink-muted mt-1 text-base">
              Je Stelle ein Ausschnitt am Modell und die Fotos aus der Meldung.
            </p>
            <div className="mt-5 flex flex-col gap-4">
              {gruppe.map((spot) => {
                const pruefpunkt = zoneCheckItem(spot.zone);
                return (
                  <article
                    key={spot.id}
                    aria-label={`Stelle ${spot.number}`}
                    className="border-line rounded-card grid gap-4 border p-4 sm:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <DruckNadel nummer={spot.number} einstufung={spot.severity} />
                        <h3 className="text-base font-semibold">{zoneLabel(spot.zone)}</h3>
                      </div>
                      <p className="text-sm font-semibold">{einstufungText(spot.severity)}</p>
                      <p className="text-base">{spot.note ?? 'Ohne Notiz.'}</p>
                      <p className="text-ink-muted text-sm">
                        {herkunft(spot, zone)}
                        {pruefpunkt ? ` · Prüfpunkt ${checkItemLabels[pruefpunkt]}` : ''}
                      </p>
                    </div>
                    <figure className="min-w-0">
                      <Ausschnitt bild={bilder.data?.ausschnitte[spot.id]} spot={spot} />
                      <figcaption className="text-ink-muted mt-1.5 text-sm">
                        Ausschnitt am Modell
                      </figcaption>
                    </figure>
                    <figure className="min-w-0">
                      <Fotos
                        adressen={fotoadressen.adressen.filter(
                          (eintrag) => eintrag.spotId === spot.id,
                        )}
                        nummer={spot.number}
                      />
                      <figcaption className="text-ink-muted mt-1.5 text-sm">
                        {spot.source === 'breakdown'
                          ? 'Foto aus der Panne'
                          : 'Foto aus dem Check-Up'}
                      </figcaption>
                    </figure>
                  </article>
                );
              })}
            </div>
            <p className="text-ink-muted mt-6 text-sm">
              Rückfragen bitte mit der Nummer der Stelle an die {vorlage.zustaendigeRolle}.
            </p>
          </Blattseite>
        ))}
      </article>
    </>
  );
}

function herkunft(spot: WorkshopSheet['spots'][number], zone: string | null): string {
  return `${spot.source === 'breakdown' ? 'Panne' : 'Check-Up'} am ${formatTag(spot.source_at, zone)}`;
}

function einstufungText(einstufung: Severity): string {
  return einstufung === 'problem' ? '× Problem' : '! Beobachten';
}

/** Eine A4-Seite: am Bildschirm als Blatt, im Druck mit Seitenumbruch davor. */
function Blattseite({
  nummer,
  von,
  rad,
  children,
}: {
  nummer: number;
  von: number;
  rad: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={`Seite ${nummer} von ${von}`}
      className={`border-line bg-surface rounded-card mb-6 flex flex-col border p-4 sm:p-10 print:mb-0 print:border-0 print:p-0 ${
        nummer > 1 ? 'print:break-before-page' : ''
      }`.trim()}
    >
      <div className="flex-1">{children}</div>
      <div className="border-line text-ink-muted mt-6 flex flex-wrap justify-between gap-x-4 border-t pt-2 text-xs">
        <span>Own Motion · hallo@ownmotion.de</span>
        <span>
          {rad} · Seite {nummer} von {von}
        </span>
      </div>
    </section>
  );
}

/**
 * Die Nadel im Druck: als SVG, damit Farbe, Form und Nummer auf Papier und in
 * der PDF bleiben (das Druckprofil nimmt Hintergründe weg, `src/index.css`)
 * und scharf drucken. Dieselben Farben wie am Modell (`--color-nadel-*`).
 */
function DruckNadel({ nummer, einstufung }: { nummer: number; einstufung: Severity }) {
  const problem = einstufung === 'problem';
  return (
    <svg
      viewBox="0 0 32 32"
      width="32"
      height="32"
      role="img"
      aria-label={`Stelle ${nummer}, ${problem ? 'Problem' : 'Beobachten'}`}
      className="shrink-0"
    >
      {problem ? (
        <circle cx="16" cy="16" r="15" className="fill-nadel-problem" />
      ) : (
        <rect
          x="2"
          y="2"
          width="28"
          height="28"
          rx="7"
          className="fill-nadel-beobachten stroke-nadel-beobachten-ink"
          strokeWidth="2.5"
        />
      )}
      <text
        x="16"
        y="21.5"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        className={problem ? 'fill-surface' : 'fill-nadel-beobachten-ink'}
      >
        {nummer}
      </text>
    </svg>
  );
}

/** Eine Nadel mit Spitze über einem Bild, an der Lage des Punkts. */
function NadelImBild({
  x,
  y,
  nummer,
  einstufung,
}: {
  x: number;
  y: number;
  nummer: number;
  einstufung: Severity;
}) {
  return (
    <span
      className="absolute -translate-x-1/2 -translate-y-full"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="flex flex-col items-center">
        <DruckNadel nummer={nummer} einstufung={einstufung} />
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true" className="-mt-px">
          <path
            d="M0 0h12L6 8z"
            className={
              einstufung === 'problem' ? 'fill-nadel-problem' : 'fill-nadel-beobachten-ink'
            }
          />
        </svg>
      </span>
    </span>
  );
}

function Seitenbild({
  titel,
  bild,
  blatt,
}: {
  titel: string;
  bild: Werkstattbild | undefined;
  blatt: WorkshopSheet;
}) {
  const nummern = (bild?.punkte ?? [])
    .map((punkt) => blatt.spots.find((spot) => spot.id === punkt.id)?.number)
    .filter((nummer): nummer is number => nummer !== undefined)
    .sort((a, b) => a - b);
  const unterschrift =
    nummern.length === 0
      ? `${titel}: keine Stelle`
      : `${titel}: ${nummern.length === 1 ? 'Stelle' : 'Stellen'} ${nummern.join(', ').replace(/, (\d+)$/, ' und $1')}`;
  return (
    <figure className="min-w-0 break-inside-avoid">
      <div className="border-line bg-surface-sunken rounded-card relative aspect-[341/200] overflow-hidden border">
        {bild ? (
          <>
            <img
              src={bild.url}
              alt={`${blatt.name}, ${unterschrift}`}
              className="block size-full"
            />
            {bild.punkte.map((punkt) => {
              const spot = blatt.spots.find((eintrag) => eintrag.id === punkt.id);
              return spot ? (
                <NadelImBild
                  key={punkt.id}
                  x={punkt.x}
                  y={punkt.y}
                  nummer={spot.number}
                  einstufung={spot.severity}
                />
              ) : null;
            })}
          </>
        ) : null}
      </div>
      <figcaption className="text-ink-muted mt-1.5 text-sm">{unterschrift}</figcaption>
    </figure>
  );
}

function Ausschnitt({
  bild,
  spot,
}: {
  bild: Werkstattbild | undefined;
  spot: WorkshopSheet['spots'][number];
}) {
  return (
    <div className="border-line bg-surface-sunken rounded-card relative aspect-[3/2] overflow-hidden border">
      {bild ? (
        <>
          <img
            src={bild.url}
            alt={`Ausschnitt am Modell: ${zoneLabel(spot.zone)}`}
            className="block size-full"
          />
          {bild.punkte.map((punkt) => (
            <NadelImBild
              key={punkt.id}
              x={punkt.x}
              y={punkt.y}
              nummer={spot.number}
              einstufung={spot.severity}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function Fotos({
  adressen,
  nummer,
}: {
  adressen: readonly { id: string; url: string }[];
  nummer: number;
}) {
  if (adressen.length === 0) {
    return (
      <div className="bg-surface-sunken border-line text-ink-muted rounded-card flex aspect-[3/2] items-center justify-center border border-dashed p-4 text-center text-sm">
        Zu dieser Stelle gibt es kein Foto.
      </div>
    );
  }
  return (
    <div className={adressen.length === 1 ? 'grid' : 'grid grid-cols-2 gap-2'}>
      {adressen.map((eintrag, index) => (
        <img
          key={eintrag.id}
          src={eintrag.url}
          alt={`Foto ${index + 1} zu Stelle ${nummer}`}
          className="border-line rounded-card aspect-[3/2] w-full border object-cover"
        />
      ))}
    </div>
  );
}

/**
 * Die Fotos der Stellen für das Blatt laden - in den Speicher der Seite, über
 * die einmalige Freigabe je Foto (ADR-017 Punkt 54 sinngemäß). Die Adressen
 * gehen mit der Seite.
 */
function useFotoadressen(fotos: readonly FleetPhoto[]): {
  adressen: { id: string; spotId: string | null; url: string }[];
  fertig: boolean;
  fehler: boolean;
} {
  const schluessel = fotos.map((foto) => foto.id).join(',');
  const [stand, setStand] = useState<{
    schluessel: string;
    adressen: { id: string; spotId: string | null; url: string }[];
    fertig: boolean;
    fehler: boolean;
  }>({ schluessel: '', adressen: [], fertig: false, fehler: false });

  useEffect(() => {
    let abgebrochen = false;
    const erzeugt: string[] = [];
    void (async () => {
      const adressen: { id: string; spotId: string | null; url: string }[] = [];
      let fehler = false;
      for (const foto of fotos) {
        try {
          const bild = await loadFleetPhoto(foto.id);
          const url = URL.createObjectURL(bild);
          erzeugt.push(url);
          adressen.push({ id: foto.id, spotId: foto.spot_id, url });
        } catch {
          fehler = true;
        }
        if (abgebrochen) return;
      }
      if (!abgebrochen) setStand({ schluessel, adressen, fertig: true, fehler });
    })();
    return () => {
      abgebrochen = true;
      erzeugt.forEach((url) => URL.revokeObjectURL(url));
    };
    // Neu geladen wird nur, wenn sich die Fotos ändern.
  }, [schluessel]);

  return stand.schluessel === schluessel
    ? stand
    : { adressen: [], fertig: fotos.length === 0, fehler: false };
}
