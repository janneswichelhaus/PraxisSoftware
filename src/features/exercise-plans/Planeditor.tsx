import { useContext, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Feldgruppe } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  BIBLIOTHEK_SCHLUESSEL,
  fetchBibliothek,
  importiereKatalog,
  type Bibliothek,
} from '@/features/exercises/api';
import type { Katalogvorlage } from '@/features/exercises/katalog/typen';
import { KATALOG_SCHLUESSEL, ladeKatalog } from '@/features/exercises/katalogLaden';
import { formatDate } from '@/lib/datum';
import {
  PLAENE_SCHLUESSEL,
  addCatalogExercises,
  assignPlan,
  deletePosition,
  discardPlan,
  movePosition,
  savePlan,
  savePosition,
  verhaeltnisPfad,
  type Plan,
  type PositionEingabe,
} from './api';
import { Fassungen } from './Fassungen';
import { schrittZeilen, standardTitel, vorigePosition } from './fassung';
import {
  POSITIONEN_HOECHSTENS,
  fuegeHinzu,
  hinzugefuegtSatz,
  mitKatalog,
  neuePosition,
  nichtSatz,
  standardDosis,
  type Hinzufuegen,
  type NichtHinzugefuegt,
  type Wunsch,
} from './hinzufuegen';
import { LAUFZEIT_HOECHSTENS_TAGE, LAUFZEIT_VORSCHLAG_TAGE, tagPlus } from './laufzeit';
import { Plankopf } from './Plankopf';
import { PositionFormular } from './PositionFormular';
import { Positionszeile } from './Positionszeile';
import { Uebungsauswahl, type Gewaehlt } from './Uebungsauswahl';
import { nurImKatalog } from './uebungsliste';
import { Vorlagenauswahl } from './Vorlagenauswahl';
import { VorlagenKontext, ausVorlage } from './vorlagen';
import { Zahlschritt } from './Zahlschritt';

/**
 * Der Entwurf eines Plans als Arbeitsseite (UEB-004; Welle B, Analyse
 * Training 12.10., Abschnitt 5).
 *
 * Die Übungen stehen als Zeilen mit Bild und kurzer Dosierung; ein Tipp auf
 * eine Zeile öffnet ihre Dosierung (Zahlschritte, Reihenfolge, entfernen).
 * Die Hauptaktion **„Übungen hinzufügen“** öffnet das Auswahlblatt, in dem
 * mehrere Übungen in einem Zug mit ihrer Standarddosierung dazukommen - aus
 * einer Liste von Bibliothek und Katalog; was nur im Katalog steht, übernimmt
 * der Server dabei still (Befund B9, ANN-536);
 * **„Aus Vorlage“** fügt eine mitgelieferte Zusammenstellung hinzu. Die
 * Knöpfe stehen in der klebenden Aktionsleiste, mit dem Daumen erreichbar.
 *
 * Nichts hier wählt, sortiert oder belegt etwas aus Angaben der Person vor
 * (ADR-006 Punkt 10): Die Liste der Bibliothek und die der Vorlagen sehen für
 * jede Person gleich aus.
 */

type Fenster =
  | { art: 'auswahl' }
  | { art: 'vorlage' }
  | { art: 'kopf' }
  | { art: 'zuweisen' }
  | { art: 'position'; id: string };

interface Meldung {
  nr: number;
  erfolg: string | null;
  fehler: string | null;
  /** Was nicht hinzukam, etwa eine archivierte Übung (O-002). */
  hinweis?: string | null;
}

/** Was nach einer Vorlage fehlt - mit dem Weg, es zu übernehmen (owner). */
interface Vorlagenrest {
  vorlage: Katalogvorlage;
  fehlend: string[];
  fehlendNamen: string[];
  archiviertNamen: string[];
}

export function Planeditor({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const vorlagen = useContext(VorlagenKontext);
  const bibliothek = useQuery({
    queryKey: BIBLIOTHEK_SCHLUESSEL,
    queryFn: fetchBibliothek,
    retry: false,
  });
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [rest, setRest] = useState<Vorlagenrest | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [auswahlFehler, setAuswahlFehler] = useState<string | null>(null);
  // Der mitgelieferte Katalog (ein eigener Teil des Builds, ANN-382) - erst,
  // wenn das Auswahlblatt ihn braucht.
  const katalog = useQuery({
    queryKey: KATALOG_SCHLUESSEL,
    queryFn: ladeKatalog,
    staleTime: Infinity,
    retry: false,
    enabled: fenster?.art === 'auswahl',
  });

  const melde = (
    erfolg: string | null,
    fehler: string | null = null,
    hinweis: string | null = null,
  ) => setMeldung((bisher) => ({ nr: (bisher?.nr ?? 0) + 1, erfolg, fehler, hinweis }));

  /** Positionen in einem Zug, mit Fortschritt („2 von 5“); danach neu laden. */
  async function hinzufuegen(eingaben: PositionEingabe[]): Promise<Hinzufuegen> {
    setLaeuft(`0 von ${eingaben.length}`);
    try {
      return await fuegeHinzu(eingaben, savePosition, (n) =>
        setLaeuft(`${n} von ${eingaben.length}`),
      );
    } finally {
      setLaeuft(null);
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
    }
  }

  /**
   * Übernimmt, was nur im Katalog steht, und fügt dann alle in einem Zug
   * hinzu (O-002). Scheitert die Übernahme, wirft sie - und nichts ist
   * passiert: Der Server übernimmt alles oder nichts.
   */
  async function hinzufuegenMitKatalog(
    wuensche: Wunsch[],
  ): Promise<{ ergebnis: Hinzufuegen; anzahl: number; nicht: NichtHinzugefuegt[] }> {
    setLaeuft(`0 von ${wuensche.length}`);
    let vorbereitet: Awaited<ReturnType<typeof mitKatalog>>;
    try {
      vorbereitet = await mitKatalog(plan.id, wuensche, addCatalogExercises);
    } catch (fehler) {
      setLaeuft(null);
      throw fehler;
    }
    if (wuensche.some((w) => w.eintrag)) {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
    }
    const ergebnis = await hinzufuegen(vorbereitet.positionen);
    return { ergebnis, anzahl: vorbereitet.positionen.length, nicht: vorbereitet.nicht };
  }

  /** Wie viele noch in den Plan passen - der Server nimmt höchstens 30. */
  function passtNicht(anzahl: number): string | null {
    const frei = POSITIONEN_HOECHSTENS - plan.items.length;
    if (anzahl <= frei) return null;
    return frei <= 0
      ? 'Ein Plan hat höchstens 30 Übungen.'
      : `Ein Plan hat höchstens 30 Übungen – es ${frei === 1 ? 'passt noch eine' : `passen noch ${frei}`}.`;
  }

  async function ausAuswahl(gewaehlt: Gewaehlt[]) {
    const zuViele = passtNicht(gewaehlt.length);
    setAuswahlFehler(zuViele);
    if (zuViele) return;
    const eintraege = new Map((katalog.data ?? []).map((e) => [e.schluessel, e]));
    let antwort: Awaited<ReturnType<typeof hinzufuegenMitKatalog>>;
    try {
      antwort = await hinzufuegenMitKatalog(
        gewaehlt.map((g) => ({
          variante: g.variante,
          dosis: standardDosis(g.variante),
          eintrag:
            nurImKatalog(g.variante) && g.variante.catalog_key
              ? eintraege.get(g.variante.catalog_key)
              : undefined,
        })),
      );
    } catch (fehler) {
      setAuswahlFehler(
        fehler instanceof Error ? fehler.message : 'Die Übungen konnten nicht übernommen werden.',
      );
      return;
    }
    setFenster(null);
    setRest(null);
    const { ergebnis, anzahl, nicht } = antwort;
    const satz = hinzugefuegtSatz(ergebnis, anzahl);
    if (ergebnis.fehler) melde(null, satz, nichtSatz(nicht));
    else melde(ergebnis.hinzugefuegt > 0 ? satz : null, null, nichtSatz(nicht));
  }

  async function namenAusKatalog(schluessel: readonly string[]): Promise<string[]> {
    if (schluessel.length === 0) return [];
    try {
      const katalog = await queryClient.fetchQuery({
        queryKey: KATALOG_SCHLUESSEL,
        queryFn: ladeKatalog,
        staleTime: Infinity,
      });
      return schluessel.map((s) => katalog.find((e) => e.schluessel === s)?.name ?? s);
    } catch {
      return [...schluessel];
    }
  }

  async function ausVorlageHinzufuegen(vorlage: Katalogvorlage, b: Bibliothek) {
    setFenster(null);
    const leer = plan.items.length === 0;
    const stand = ausVorlage(vorlage, b);
    const ergebnis = await hinzufuegen(
      stand.positionen.map((p) => neuePosition(plan.id, p.variante.id, p.dosis)),
    );
    // Ein neuer, leerer Entwurf heißt danach wie die Vorlage - nach Thema,
    // ohne Person.
    if (ergebnis.hinzugefuegt > 0 && leer && standardTitel(plan)) {
      try {
        await savePlan(plan.id, vorlage.name, plan.sessions_per_week);
      } catch {
        // Der Titel bleibt dann „Übungsplan“; die Übungen sind da.
      }
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
    }
    const satz = ergebnis.fehler
      ? hinzugefuegtSatz(ergebnis, stand.positionen.length)
      : `${hinzugefuegtSatz(ergebnis, stand.positionen.length).replace(/\.$/, '')} aus „${vorlage.name}“.`;
    if (ergebnis.fehler) melde(null, satz);
    else if (ergebnis.hinzugefuegt > 0) melde(satz);
    else setMeldung(null);
    if (stand.fehlend.length > 0 || stand.archiviert.length > 0) {
      setRest({
        vorlage,
        fehlend: stand.fehlend,
        fehlendNamen: await namenAusKatalog(stand.fehlend),
        archiviertNamen: await namenAusKatalog(stand.archiviert),
      });
    } else {
      setRest(null);
    }
  }

  /** Owner: was der Vorlage fehlt, aus dem Katalog übernehmen und hinzufügen (ANN-385). */
  const nachholen = useMutation({
    mutationFn: async (offen: Vorlagenrest) => {
      const katalog = await queryClient.fetchQuery({
        queryKey: KATALOG_SCHLUESSEL,
        queryFn: ladeKatalog,
        staleTime: Infinity,
      });
      await importiereKatalog(katalog.filter((e) => offen.fehlend.includes(e.schluessel)));
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      const frisch = await queryClient.fetchQuery({
        queryKey: BIBLIOTHEK_SCHLUESSEL,
        queryFn: fetchBibliothek,
      });
      const stand = ausVorlage(
        {
          ...offen.vorlage,
          uebungen: offen.vorlage.uebungen.filter((u) => offen.fehlend.includes(u.schluessel)),
        },
        frisch,
      );
      const ergebnis = await hinzufuegen(
        stand.positionen.map((p) => neuePosition(plan.id, p.variante.id, p.dosis)),
      );
      return { ergebnis, stand, gewaehlt: offen.fehlend.length };
    },
    onSuccess: async ({ ergebnis, stand }) => {
      if (ergebnis.fehler) melde(null, hinzugefuegtSatz(ergebnis, stand.positionen.length));
      else {
        melde(
          `${ergebnis.hinzugefuegt === 1 ? '1 Übung' : `${ergebnis.hinzugefuegt} Übungen`} übernommen und hinzugefügt. Sie gelten bis zur Durchsicht durch die Praxis als ungeprüft.`,
        );
      }
      const nochFehlend = stand.fehlend;
      if (nochFehlend.length > 0 && rest) {
        setRest({
          ...rest,
          fehlend: nochFehlend,
          fehlendNamen: await namenAusKatalog(nochFehlend),
        });
      } else {
        setRest((bisher) =>
          bisher && bisher.archiviertNamen.length > 0
            ? { ...bisher, fehlend: [], fehlendNamen: [] }
            : null,
        );
      }
    },
  });

  const verwerfen = useMutation({
    mutationFn: () => discardPlan(plan.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      void navigate(verhaeltnisPfad(plan), { replace: true });
    },
  });

  const b = bibliothek.data;
  const imPlan = new Set(plan.items.map((p) => p.variant_id));
  const offenePosition =
    fenster?.art === 'position' ? plan.items.find((p) => p.id === fenster.id) : undefined;
  const mitVorlagen = vorlagen.length > 0;

  const vorlageKnopf = mitVorlagen ? (
    <Button
      type="button"
      variant="secondary"
      groesse="kompakt"
      disabled={!b || laeuft !== null}
      onClick={() => setFenster({ art: 'vorlage' })}
    >
      Aus Vorlage
    </Button>
  ) : null;

  return (
    <>
      <Plankopf
        plan={plan}
        aktionen={
          <Button type="button" variant="secondary" onClick={() => setFenster({ art: 'kopf' })}>
            Bearbeiten
          </Button>
        }
      />

      {meldung?.erfolg ? (
        <Rueckmeldung key={meldung.nr} className="mt-4">
          {meldung.erfolg}
        </Rueckmeldung>
      ) : null}
      {meldung?.fehler ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {meldung.fehler}
        </Statusmeldung>
      ) : null}
      {meldung?.hinweis ? (
        <Statusmeldung ton="warnung" className="mt-4">
          {meldung.hinweis}
        </Statusmeldung>
      ) : null}
      {rest && (rest.fehlend.length > 0 || rest.archiviertNamen.length > 0) ? (
        <div className="mt-4 flex flex-col gap-2">
          {rest.fehlend.length > 0 ? (
            <Statusmeldung ton="warnung">
              Nicht in der Bibliothek der Praxis: {rest.fehlendNamen.join(', ')}.
              {b?.can_manage ? '' : ' Übernehmen kann die Praxisinhaber:in.'}
            </Statusmeldung>
          ) : null}
          {rest.archiviertNamen.length > 0 ? (
            <Statusmeldung ton="warnung">
              In der Bibliothek archiviert: {rest.archiviertNamen.join(', ')}.
            </Statusmeldung>
          ) : null}
          {rest.fehlend.length > 0 && b?.can_manage ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                groesse="kompakt"
                disabled={nachholen.isPending || laeuft !== null}
                onClick={() => nachholen.mutate(rest)}
              >
                {nachholen.isPending
                  ? 'Wird übernommen …'
                  : 'Aus dem Katalog übernehmen und hinzufügen'}
              </Button>
            </div>
          ) : null}
          {nachholen.isError ? (
            <Statusmeldung ton="fehler">{nachholen.error.message}</Statusmeldung>
          ) : null}
        </div>
      ) : null}
      {bibliothek.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          Die Übungsbibliothek konnte nicht geladen werden.
        </Statusmeldung>
      ) : null}

      <div className="mt-6">
        <Listenabschnitt
          titel="Übungen"
          {...(plan.items.length > 0 ? { anzahl: plan.items.length } : {})}
          {...(vorlageKnopf && plan.items.length > 0 ? { aktion: vorlageKnopf } : {})}
          leer={{
            titel: 'Noch keine Übung',
            beschreibung: mitVorlagen
              ? 'Aus der Bibliothek wählen oder eine Vorlage übernehmen.'
              : 'Aus der Bibliothek wählen.',
            ...(vorlageKnopf ? { aktion: vorlageKnopf } : {}),
          }}
        >
          {plan.items.map((position) => (
            <Positionszeile
              key={position.id}
              position={position}
              schritt={schrittZeilen(position, vorigePosition(plan, position))}
              onClick={() => setFenster({ art: 'position', id: position.id })}
            />
          ))}
        </Listenabschnitt>
      </div>

      <Fassungen plan={plan} />

      <div className="mt-8 mb-4">
        <Rueckfrage
          ausloeser="Entwurf verwerfen"
          ausloeserVariante="quiet"
          ausloeserGroesse="kompakt"
          bestaetigen="Verwerfen"
          bestaetigenLaeuft="Wird verworfen …"
          fehler={verwerfen.error?.message}
          onBestaetigen={() => verwerfen.mutateAsync()}
        >
          <p>Den Entwurf mit allen Übungen verwerfen? Das lässt sich nicht zurücknehmen.</p>
        </Rueckfrage>
      </div>

      <Aktionsleiste>
        {plan.items.length > 0 ? (
          <Button
            type="button"
            variant="secondary"
            disabled={laeuft !== null}
            onClick={() => setFenster({ art: 'zuweisen' })}
          >
            Zuweisen
          </Button>
        ) : null}
        <Button
          type="button"
          className="ml-auto"
          disabled={!b || laeuft !== null}
          onClick={() => {
            setAuswahlFehler(null);
            setFenster({ art: 'auswahl' });
          }}
        >
          {laeuft ? `Wird hinzugefügt … (${laeuft})` : 'Übungen hinzufügen'}
        </Button>
      </Aktionsleiste>

      {fenster?.art === 'auswahl' && b ? (
        katalog.isPending ? (
          <Dialogfenster titel="Übungen hinzufügen" onSchliessen={() => setFenster(null)}>
            <LoadingState label="Übungen werden geladen …" />
          </Dialogfenster>
        ) : (
          <Uebungsauswahl
            bibliothek={b}
            {...(katalog.data ? { katalog: katalog.data } : {})}
            katalogFehlt={katalog.isError}
            imPlan={imPlan}
            laeuft={laeuft}
            fehler={auswahlFehler}
            onHinzufuegen={(gewaehlt) => void ausAuswahl(gewaehlt)}
            onSchliessen={() => {
              if (laeuft === null) setFenster(null);
            }}
          />
        )
      ) : null}
      {fenster?.art === 'vorlage' && b ? (
        <Vorlagenauswahl
          vorlagen={vorlagen}
          onWaehlen={(vorlage) => void ausVorlageHinzufuegen(vorlage, b)}
          onSchliessen={() => setFenster(null)}
        />
      ) : null}
      {fenster?.art === 'kopf' ? <Kopfdaten plan={plan} onFertig={() => setFenster(null)} /> : null}
      {fenster?.art === 'zuweisen' ? (
        <Zuweisen plan={plan} onSchliessen={() => setFenster(null)} />
      ) : null}
      {offenePosition ? (
        <Positionsfenster
          plan={plan}
          positionId={offenePosition.id}
          bibliothek={b}
          onSchliessen={() => setFenster(null)}
        />
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Eine Position: Dosierung, Reihenfolge, entfernen
// -----------------------------------------------------------------------------

function Positionsfenster({
  plan,
  positionId,
  bibliothek,
  onSchliessen,
}: {
  plan: Plan;
  positionId: string;
  bibliothek: Bibliothek | undefined;
  onSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const index = plan.items.findIndex((p) => p.id === positionId);
  const position = plan.items[index];
  const fertig = () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
  const verschieben = useMutation({
    mutationFn: (richtung: 'up' | 'down') => movePosition(positionId, richtung),
    onSuccess: fertig,
  });
  const entfernen = useMutation({
    mutationFn: () => deletePosition(positionId),
    onSuccess: async () => {
      await fertig();
      onSchliessen();
    },
  });
  if (!position) return null;
  const laeuft = verschieben.isPending || entfernen.isPending;
  const fehler = verschieben.error ?? entfernen.error;

  return (
    <Dialogfenster
      titel={`${position.position}. ${position.variant_name}`}
      onSchliessen={onSchliessen}
    >
      <PositionFormular
        key={position.id}
        planId={plan.id}
        position={position}
        vorige={vorigePosition(plan, position)}
        bibliothek={bibliothek}
        idPraefix={`position-${position.id}`}
        onFertig={onSchliessen}
        onAbbrechen={onSchliessen}
        zusatz={
          <div className="border-line mt-6 flex flex-wrap gap-2 border-t pt-4">
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              disabled={index === 0 || laeuft}
              aria-label={`${position.variant_name} nach oben`}
              onClick={() => verschieben.mutate('up')}
            >
              ↑ Nach oben
            </Button>
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              disabled={index === plan.items.length - 1 || laeuft}
              aria-label={`${position.variant_name} nach unten`}
              onClick={() => verschieben.mutate('down')}
            >
              ↓ Nach unten
            </Button>
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              disabled={laeuft}
              aria-label={`${position.variant_name} entfernen`}
              onClick={() => entfernen.mutate()}
            >
              Entfernen
            </Button>
            {fehler ? (
              <Statusmeldung ton="fehler" className="basis-full">
                {fehler.message}
              </Statusmeldung>
            ) : null}
          </div>
        }
      />
    </Dialogfenster>
  );
}

// -----------------------------------------------------------------------------
// Titel und Einheiten je Woche
// -----------------------------------------------------------------------------

function Kopfdaten({ plan, onFertig }: { plan: Plan; onFertig: () => void }) {
  const queryClient = useQueryClient();
  const [titel, setTitel] = useState(plan.title);
  const [einheiten, setEinheiten] = useState(plan.sessions_per_week ?? 0);
  const [fehler, setFehler] = useState<string | undefined>();
  const speichern = useMutation({
    mutationFn: () => savePlan(plan.id, titel, einheiten > 0 ? einheiten : null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      onFertig();
    },
  });

  return (
    <Dialogfenster titel="Titel und Häufigkeit" onSchliessen={onFertig}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!titel.trim()) {
            setFehler('Bitte einen Titel angeben.');
            return;
          }
          setFehler(undefined);
          if (!speichern.isPending) speichern.mutate();
        }}
      >
        <Feldgruppe>
          <Field
            label="Titel *"
            maxLength={80}
            value={titel}
            error={fehler}
            onChange={(event) => setTitel(event.target.value)}
          />
          <Zahlschritt
            beschriftung="Einheiten je Woche"
            leer="ohne"
            wert={einheiten}
            min={0}
            max={14}
            onAendern={setEinheiten}
          />
        </Feldgruppe>
        {speichern.isError ? (
          <Statusmeldung ton="fehler" className="mt-4">
            {speichern.error.message}
          </Statusmeldung>
        ) : null}
        <Formularfuss>
          <Button type="submit" disabled={speichern.isPending}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
          <Button type="button" variant="quiet" onClick={onFertig}>
            Abbrechen
          </Button>
        </Formularfuss>
      </form>
    </Dialogfenster>
  );
}

// -----------------------------------------------------------------------------
// Zuweisen (UEB-005, ANN-300, ANN-302)
// -----------------------------------------------------------------------------

function Zuweisen({ plan, onSchliessen }: { plan: Plan; onSchliessen: () => void }) {
  const queryClient = useQueryClient();
  const [bis, setBis] = useState(() => tagPlus(plan.today, LAUFZEIT_VORSCHLAG_TAGE));
  const [fehler, setFehler] = useState<string | undefined>();
  const spaetestens = tagPlus(plan.today, LAUFZEIT_HOECHSTENS_TAGE);
  const zuweisen = useMutation({
    mutationFn: () => assignPlan(plan.id, bis),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      onSchliessen();
    },
  });

  return (
    <Dialogfenster titel="Plan zuweisen" onSchliessen={onSchliessen}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!bis || bis < plan.today || bis > spaetestens) {
            setFehler('Bitte ein Ende zwischen heute und 26 Wochen ab heute wählen.');
            return;
          }
          if (plan.items.length === 0) {
            setFehler('Bitte zuerst mindestens eine Übung hinzufügen.');
            return;
          }
          setFehler(undefined);
          if (!zuweisen.isPending) zuweisen.mutate();
        }}
      >
        <Field
          label="Läuft bis *"
          type="date"
          min={plan.today}
          max={spaetestens}
          className="max-w-48"
          hint={`Höchstens 26 Wochen, also bis ${formatDate(spaetestens)}.`}
          value={bis}
          error={fehler}
          onChange={(event) => setBis(event.target.value)}
        />
        <p className="text-ink mt-4 text-sm">
          Den Plan mit {plan.items.length === 1 ? 'einer Übung' : `${plan.items.length} Übungen`}{' '}
          bis {formatDate(bis)} zuweisen? Danach lässt er sich nicht mehr ändern, nur als neue
          Fassung.
        </p>
        {zuweisen.isError ? (
          <Statusmeldung ton="fehler" className="mt-4">
            {zuweisen.error.message}
          </Statusmeldung>
        ) : null}
        <Formularfuss>
          <Button type="submit" data-autofocus disabled={zuweisen.isPending}>
            {zuweisen.isPending ? 'Wird zugewiesen …' : 'Zuweisen'}
          </Button>
          <Button type="button" variant="quiet" onClick={onSchliessen}>
            Abbrechen
          </Button>
        </Formularfuss>
      </form>
    </Dialogfenster>
  );
}
