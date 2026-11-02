import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate, tagePlus } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { monateText } from './api';
import {
  STARTHINDERNIS,
  createPaket,
  deletePaket,
  fetchPakete,
  fetchPaketpositionen,
  paketSchluessel,
  type Paketsicht,
  type Trainingspaket as Paket,
} from './trainingspaket-api';
import { Eintraege, Eintrag } from './Eintraege';
import { ANGEBOTSZAHLEN_KEY } from './statistics/api';

/** Sprungziel des Abschnitts: Die Liste in Offene Punkte führt hierher (ANN-834). */
export const TRAININGSPAKET_ANKER = 'trainingspaket';

/**
 * Das Trainingspaket am Trainingsverhältnis (ANG-EPIC-002, PROJECT_PRINCIPLES.md
 * 4.10 und 19, ADR-009 Punkt 21).
 *
 * Ein Paket gilt für einen festen Zeitraum, ist nicht pausierbar und wird
 * einmal im Voraus berechnet (ANN-276, ANN-277). Mit dem Paket entsteht seine
 * Leistung; die Rechnung kommt über Abrechnung → Rechnungen. Sichtbar und
 * bedienbar für owner und office; die Seite blendet den Abschnitt für alle
 * anderen aus, verbindlich prüft der Server (ADR-004).
 */
export function Trainingspaket({ verhaeltnisId }: { verhaeltnisId: string }) {
  const sicht = useQuery({
    queryKey: paketSchluessel(verhaeltnisId),
    queryFn: () => fetchPakete(verhaeltnisId),
    retry: false,
  });
  // Der Router rollt nicht von selbst zum Anker, und der Abschnitt steht erst nach dem Laden da.
  const { hash } = useLocation();
  const geladen = Boolean(sicht.data);
  useEffect(() => {
    if (!geladen || hash !== `#${TRAININGSPAKET_ANKER}`) return;
    document.getElementById(TRAININGSPAKET_ANKER)?.scrollIntoView?.({ block: 'start' });
  }, [geladen, hash]);

  if (sicht.isPending) return null;
  if (sicht.isError) {
    return (
      <ErrorState
        title="Die Trainingspakete konnten nicht geladen werden."
        description={VERBINDUNG_PRUEFEN}
        onErneut={() => sicht.refetch()}
      />
    );
  }
  if (!sicht.data) return null;

  return (
    // Abstand wie bei `Section`, dazu Luft unter der klebenden Kopfzeile beim Sprung.
    <div id={TRAININGSPAKET_ANKER} className="mt-8 scroll-mt-20 first:mt-0">
      <Section titel="Trainingspaket" rahmen>
        {sicht.data.packages.length === 0 ? (
          <p className="text-ink-muted text-sm">Kein Paket.</p>
        ) : (
          <Eintraege beschriftung="Trainingspakete" rahmen={false}>
            {sicht.data.packages.map((paket) => (
              <PaketZeile key={paket.id} paket={paket} verhaeltnisId={verhaeltnisId} />
            ))}
          </Eintraege>
        )}
        <Anlegen verhaeltnisId={verhaeltnisId} sicht={sicht.data} />
      </Section>
    </div>
  );
}

// Offene Punkte und die Kennzahl führen die Pakete ohne Anschluss (ANN-834): Anlegen und
// Entfernen ändern beide.
function erneuereUebersichten(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['open-points'] });
  void queryClient.invalidateQueries({ queryKey: ANGEBOTSZAHLEN_KEY });
}

/**
 * Ein Paket als Zeile der Liste (Design-Rollout B6): Bezeichnung und Stand,
 * Zeitraum, Laufzeit und Preis darunter; ob es abgerechnet ist und der Weg,
 * eine Fehlanlage zu entfernen, unter der Zeile.
 */
function PaketZeile({ paket, verhaeltnisId }: { paket: Paket; verhaeltnisId: string }) {
  // Laufend und abgerechnet ist der Regelfall ohne Abzeichen (DESIGN.md Regel 5); ein geplantes
  // Paket wird erst ab seinem Beginn abgerechnet. Unter der Zeile, weil die Namen lang sind.
  const abrechnungOffen = paket.state !== 'planned' && !paket.invoiced;
  return (
    <Eintrag
      titel={paket.label}
      meta={`${formatDate(paket.starts_on)} bis ${formatDate(paket.ends_on)} · ${monateText(
        paket.package_months,
      )} · ${formatEuro(paket.price_cents, paket.currency)}${
        paket.created_by_name ? ` · angelegt von ${paket.created_by_name}` : ''
      }`}
      status={paket.state === 'planned' ? <Badge>Beginnt bald</Badge> : undefined}
      gedaempft={paket.state === 'ended'}
    >
      {/* Eine Fehlanlage geht nur, solange nichts abgerechnet ist (ANG-006). */}
      {paket.invoiced ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {abrechnungOffen ? (
            <Badge eigenesZeichen={STATUSZEICHEN.fehlt}>Noch nicht abgerechnet</Badge>
          ) : null}
          <Entfernen paket={paket} verhaeltnisId={verhaeltnisId} />
        </div>
      )}
    </Eintrag>
  );
}

function Entfernen({ paket, verhaeltnisId }: { paket: Paket; verhaeltnisId: string }) {
  const queryClient = useQueryClient();
  const entfernen = useMutation({
    mutationFn: () => deletePaket(paket.id),
    onSuccess: () => {
      erneuereUebersichten(queryClient);
      return queryClient.invalidateQueries({ queryKey: paketSchluessel(verhaeltnisId) });
    },
  });
  return (
    <Rueckfrage
      ausloeser="Irrtümlich angelegt"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung={`Paket ab ${formatDate(paket.starts_on)} entfernen`}
      bestaetigen="Ja, entfernen"
      bestaetigenLaeuft="Wird entfernt …"
      fehler={entfernen.isError ? entfernen.error.message : undefined}
      onBestaetigen={() => entfernen.mutateAsync()}
      onAbbrechen={() => entfernen.reset()}
    >
      Das Paket ab {formatDate(paket.starts_on)} und seine Leistung werden entfernt, als hätte es
      sie nie gegeben. Das geht nur, solange das Paket auf keiner Rechnung steht.
    </Rueckfrage>
  );
}

/** Pakete überschneiden sich nie: Ein Folgepaket beginnt am Tag nach dem letzten Ende (ANN-834). */
function vorschlagBeginn(sicht: Paketsicht): string {
  const ende = sicht.packages.reduce<string>((max, p) => (p.ends_on > max ? p.ends_on : max), '');
  return ende >= sicht.today ? tagePlus(ende, 1) : sicht.today;
}

function Anlegen({ verhaeltnisId, sicht }: { verhaeltnisId: string; sicht: Paketsicht }) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [beginn, setBeginn] = useState(() => vorschlagBeginn(sicht));
  const [position, setPosition] = useState('');
  const [geprueft, setGeprueft] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);

  // Die Pakete der Preisliste, die am gewählten Beginn gilt (ADR-009 Punkt 5).
  const positionen = useQuery({
    queryKey: ['trainingspaket-positionen', beginn],
    queryFn: () => fetchPaketpositionen(beginn),
    enabled: offen && beginn !== '',
    retry: false,
  });

  const speichern = useMutation({
    mutationFn: () => createPaket(verhaeltnisId, position, beginn),
    onSuccess: async () => {
      setOffen(false);
      setGeprueft(false);
      setGespeichert(true);
      erneuereUebersichten(queryClient);
      await queryClient.invalidateQueries({ queryKey: paketSchluessel(verhaeltnisId) });
    },
  });

  // Ein Hindernis, das jeden Beginn betrifft, steht als Satz da statt eines
  // Knopfs, der abgewiesen würde. „Zu früh" und „vor dem Abschluss" hängen
  // am gewählten Tag und meldet erst das Formular.
  const hindernis =
    sicht.start_blocker === 'ended' || sicht.start_blocker === 'care_open'
      ? STARTHINDERNIS[sicht.start_blocker]
      : null;
  if (hindernis) {
    return <p className="text-ink-muted mt-2 text-sm">{hindernis}</p>;
  }

  if (!offen) {
    return (
      <div className="mt-3 flex flex-col gap-3">
        {gespeichert ? (
          <Statusmeldung ton="erfolg">Paket angelegt, die Leistung ist erfasst.</Statusmeldung>
        ) : null}
        <div>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => {
              setGespeichert(false);
              setBeginn(vorschlagBeginn(sicht));
              setPosition('');
              setOffen(true);
            }}
          >
            Paket anlegen
          </Button>
        </div>
      </div>
    );
  }

  const liste = positionen.data ?? [];
  const gewaehlt = liste.find((p) => p.catalog_item_id === position);
  const fehlerBeginn =
    geprueft && beginn === '' ? 'Bitte angeben, ab wann das Paket läuft.' : undefined;
  const fehlerPaket = geprueft && !gewaehlt ? 'Bitte ein Paket wählen.' : undefined;

  return (
    <form
      className="mt-3"
      aria-label="Trainingspaket anlegen"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setGeprueft(true);
        if (beginn === '' || !gewaehlt) return;
        speichern.mutate();
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="sm:w-44">
            <Field
              label="Beginn"
              type="date"
              value={beginn}
              error={fehlerBeginn}
              onChange={(event) => {
                setBeginn(event.target.value);
                setPosition('');
              }}
            />
          </div>
          <div className="min-w-0 sm:grow">
            <Select
              label="Paket"
              value={position}
              error={fehlerPaket}
              disabled={positionen.isPending}
              onChange={(event) => setPosition(event.target.value)}
            >
              <option value="">
                {positionen.isPending
                  ? 'Wird geladen …'
                  : liste.length === 0
                    ? 'Die Preisliste nennt kein Paket'
                    : 'Bitte wählen'}
              </option>
              {liste.map((p) => (
                <option key={p.catalog_item_id} value={p.catalog_item_id}>
                  {p.label} – {formatEuro(p.unit_price_cents, p.currency)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {positionen.isError ? (
          <Statusmeldung ton="fehler">{positionen.error.message}</Statusmeldung>
        ) : null}
        {speichern.isError ? (
          <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
        ) : null}
      </div>
      <Formularfuss zusatz="Das Paket gilt ohne Pause und ohne Kündigung für die ganze Laufzeit, auch neben einer Behandlung, und wird einmal zu Beginn berechnet.">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird angelegt …' : 'Paket anlegen'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            setOffen(false);
            setGeprueft(false);
            speichern.reset();
          }}
        >
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
