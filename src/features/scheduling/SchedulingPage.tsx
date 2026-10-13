import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { fetchAssignableTherapists, todayInTimeZone } from '@/features/appointments/api';
import { Listenfehler, NachladeHinweis, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { canManageWorkingHours, isOwner, type CurrentUser } from '@/features/session/types';
import {
  FRIST_VOREINSTELLUNG,
  FRIST_WERTE,
  fetchDocumentationDeadline,
  fristLabel,
  saveDocumentationDeadline,
} from '@/features/documentation/api';
import { FahrzeitfaktorEinstellung } from '@/features/tours/FahrzeitfaktorEinstellung';
import { BenachrichtigungsSchalter } from '@/features/platform-access/BenachrichtigungsSchalter';
import { GarageEinstellung, StartortEinstellung } from '@/features/tours/StartortEinstellung';
import {
  RASTER_WERTE,
  WOCHENTAGE,
  bloeckeText,
  fetchWorkingHourExceptions,
  fetchWorkingHours,
  istRasterWert,
  saveAppointmentGrid,
  saveWorkingHourException,
  saveWorkingHours,
  wochenBloecke,
  wochentagLabels,
  type RasterWert,
  type Wochentag,
  type Zeitblock,
} from './api';
import {
  LEERER_BLOCK,
  abweichungenNachDatum,
  gleicheBloecke,
  halbeBloecke,
  ohneLeere,
  type AbweichungsTag,
  type Blockfehler,
} from './zeitbloecke';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

/**
 * Arbeitszeiten und Planungseinstellungen der Praxis (CAL-005).
 *
 * Zwei Dinge auf einer Seite, weil beide dieselbe Frage beantworten: wann
 * kann überhaupt geplant werden. Das Raster gilt für die ganze Praxis und darf
 * nur von owner geändert werden; die Arbeitszeiten gehören zur einzelnen
 * Person und werden von owner, team_lead und office gepflegt.
 *
 * Die Seite heißt wie ihr Menüpunkt, „Arbeitszeiten" (ORG-07, TER-22); bis
 * UXR-011 stand über ihr „Planung". Die Reihenfolge - Praxiseinstellungen vor
 * den Arbeitszeiten - bleibt, bis Jannes über ORG-06 entschieden hat.
 *
 * **Nichts verschwindet still (ORG-02, ORG-03).** Ein halb ausgefüllter Block
 * ist ein Feldfehler und wird nicht gespeichert; ein Tag, der Blöcke hatte,
 * wird erst nach einer Rückfrage leer gespeichert; ein Wechsel von Tag oder
 * Person mit ungespeicherten Blöcken fragt, und ein Seitenwechsel läuft durch
 * den Schutz der Formulare (ANN-046, ohne Entwurf nur Verwerfen und Bleiben).
 *
 * Die Rollenprüfung hier steuert nur die Darstellung. Verbindlich prüfen
 * `set_appointment_grid`, `set_staff_working_hours` und
 * `set_staff_working_hour_exception` (ADR-004).
 */

/** Die Rückfrage vor dem Weggehen, mit den Sätzen für Formulare (ANN-046). */
const SCHUTZTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherte Arbeitszeiten',
};

/** Was nach einem gescheiterten Speichern zu tun ist (WRT-01). */
const ERNEUT_SPEICHERN = 'Bitte die Verbindung prüfen und erneut speichern.';

/** Kalendertag ein Jahr später, über UTC gerechnet – keine Ortszeit im Spiel. */
function einJahrSpaeter(tag: string): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Setzt den Fokus auf das Element mit dieser Kennung, sofern es im Dokument steht. */
function fokussieren(id: string) {
  document.getElementById(id)?.focus();
}

/** Das erste Feld mit Fehler - dorthin wandert der Fokus (ORG-02). */
function ersterFehler(praefix: string, fehler: readonly Blockfehler[]): string | null {
  for (const [index, eintrag] of fehler.entries()) {
    if (eintrag.von) return `${praefix}-${index}-von`;
    if (eintrag.bis) return `${praefix}-${index}-bis`;
  }
  return null;
}

/**
 * Rückfrage vor einem Wechsel, der ungespeicherte Eingaben verwerfen würde
 * (ORG-03).
 *
 * Tag und Person wechseln ohne Seitenwechsel; der Schutz der Formulare sieht
 * davon nichts. Bis UXR-011 setzte ein Wechsel die Blöcke still zurück - wer
 * vor dem Speichern den Wochentag umstellte, verlor die Eingabe und merkte es
 * erst beim Zurückwechseln. Der Kasten steht an der Auswahl, die den Wechsel
 * auslöst, und nimmt den Fokus. Ohne Entwurfszustand gibt es wie beim Schutz
 * der Formulare nur Verwerfen und Bleiben (ANN-046).
 */
function Wechselrueckfrage({
  children,
  onVerwerfen,
  onBleiben,
}: {
  children: ReactNode;
  onVerwerfen: () => void;
  onBleiben: () => void;
}) {
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    kasten.current?.querySelector('button')?.focus();
  }, []);

  return (
    <div
      ref={kasten}
      role="group"
      aria-label={SCHUTZTEXTE.bezeichnung}
      // Eine vertiefte Fläche mit Linie links wie jede Rückfrage (DESIGN.md
      // Regel 2), keine Karte.
      className="border-line-strong bg-surface-sunken border-l-4 py-3 pr-4 pl-4"
    >
      <p className="text-ink text-sm leading-relaxed">{children}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={onVerwerfen}>
          Verwerfen und wechseln
        </Button>
        <Button type="button" variant="quiet" onClick={onBleiben}>
          Hier bleiben
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Praxisraster
// -----------------------------------------------------------------------------

function RasterEinstellung({ aktuell }: { aktuell: number | null }) {
  const queryClient = useQueryClient();
  const [wert, setWert] = useState<RasterWert>(istRasterWert(aktuell) ? aktuell : 5);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    if (istRasterWert(aktuell)) setWert(aktuell);
  }, [aktuell]);

  const mutation = useMutation({
    mutationFn: () => saveAppointmentGrid(wert),
    onSuccess: () => {
      setGespeichert(true);
      // Das Raster steckt in den Sitzungsdaten und steuert die Eingabefelder.
      // Die Meldung wartet nicht auf das Nachladen (ZST-B01): Gespeichert ist
      // es, sobald der Server es bestätigt.
      void queryClient.invalidateQueries({ queryKey: ['current-user'] });
    },
  });

  return (
    // Kein Erklärsatz unter dem Titel (DESIGN.md Regel 6); was eine Änderung
    // bewirkt, steht knapp als Kleingedrucktes am Feld.
    <Section titel="Praxisraster">
      <div className="max-w-formular">
        <Select
          label="Minutenraster"
          value={String(wert)}
          onChange={(e) => {
            const gewaehlt = Number(e.target.value);
            if (istRasterWert(gewaehlt)) setWert(gewaehlt);
            setGespeichert(false);
          }}
        >
          {RASTER_WERTE.map((m) => (
            <option key={m} value={m}>
              {m} Minuten
            </option>
          ))}
        </Select>
        <Kleingedrucktes className="mt-2">
          Gilt für die ganze Praxis. Bestehende Termine außerhalb des Rasters bleiben erhalten.
        </Kleingedrucktes>
      </div>

      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {mutation.error.message} {ERNEUT_SPEICHERN}
        </Statusmeldung>
      ) : null}
      {gespeichert && !mutation.isPending && !mutation.isError ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Das Praxisraster ist gespeichert.
        </Statusmeldung>
      ) : null}

      <Formularfuss>
        <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Wird gespeichert …' : 'Raster speichern'}
        </Button>
      </Formularfuss>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Frist der automatischen Finalisierung (DOK-004)
// -----------------------------------------------------------------------------

/**
 * Die Frist steht neben dem Praxisraster, weil beides Grundeinstellungen der
 * Praxis sind, die nur owner setzt (PROJECT_PRINCIPLES.md 4.1). Verbindlich
 * prüft `set_documentation_deadline`.
 *
 * **Ohne geladene Frist keine Auswahl (ORG-14, ZST-09).** Bis UXR-011 zeigte
 * das Feld nach einem Ladefehler die Voreinstellung, und „Frist speichern"
 * blieb bedienbar - ein Tipp hätte die unbekannte Frist der Praxis mit der
 * Voreinstellung überschrieben. Solange der Wert fehlt, sagt das Feld das und
 * ist gesperrt.
 */
function FristEinstellung({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [wert, setWert] = useState<number>(FRIST_VOREINSTELLUNG);
  const [gespeichert, setGespeichert] = useState(false);

  const frist = useQuery({
    queryKey: ['documentation-deadline', organizationId],
    queryFn: () => fetchDocumentationDeadline(organizationId),
    retry: false,
  });

  useEffect(() => {
    if (frist.data !== undefined) setWert(frist.data);
  }, [frist.data]);

  const mutation = useMutation({
    mutationFn: () => saveDocumentationDeadline(wert),
    onSuccess: () => {
      setGespeichert(true);
      void queryClient.invalidateQueries({ queryKey: ['documentation-deadline'] });
    },
  });

  const geladen = frist.data !== undefined;

  // Ein gespeicherter Wert außerhalb der Stufen bleibt sichtbar und wählbar.
  const werte = FRIST_WERTE.includes(wert as (typeof FRIST_WERTE)[number])
    ? [...FRIST_WERTE]
    : [...FRIST_WERTE, wert].sort((a, b) => a - b);

  return (
    // Was die Frist bewirkt, trägt Rechtsfunktion (ADR-016: Finalisierung
    // macht den Entwurf zum Bestandteil der Akte) - deshalb bleibt der Satz,
    // als Kleingedrucktes am Feld statt als Erklärsatz unter dem Titel.
    <Section titel="Automatische Finalisierung">
      <div className="max-w-formular">
        <Select
          label="Frist"
          value={String(wert)}
          disabled={!geladen}
          onChange={(e) => {
            setWert(Number(e.target.value));
            setGespeichert(false);
          }}
        >
          {geladen ? (
            werte.map((tage) => (
              <option key={tage} value={tage}>
                {fristLabel(tage)}
              </option>
            ))
          ) : (
            // Solange die Frist fehlt, steht genau das im Feld - und nicht
            // die Voreinstellung, die wie der Wert der Praxis aussähe.
            <option value={wert}>{frist.isError ? 'Nicht geladen' : 'Wird geladen …'}</option>
          )}
        </Select>
        <Kleingedrucktes className="mt-2">
          Ein Entwurf der Behandlungsdokumentation wird nach Ablauf dieser Frist automatisch
          finalisiert und ist ab dann Bestandteil der Akte. Die Frist zählt in Kalendertagen der
          Praxiszeitzone ab dem Behandlungstag; später angelegte Einträge und Nachträge bekommen sie
          ab ihrer Anlage.
        </Kleingedrucktes>
      </div>

      {frist.isError && !geladen ? (
        <div className="mt-3">
          <Listenfehler
            text="Die Dokumentationsfrist konnte nicht geladen werden. Bis dahin lässt sie sich nicht ändern."
            onErneut={() => void frist.refetch()}
          />
        </div>
      ) : null}

      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {mutation.error.message} {ERNEUT_SPEICHERN}
        </Statusmeldung>
      ) : null}
      {gespeichert && !mutation.isPending && !mutation.isError ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Die Frist ist gespeichert.
        </Statusmeldung>
      ) : null}

      <Formularfuss>
        <Button
          type="button"
          disabled={mutation.isPending || !geladen}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Wird gespeichert …' : 'Frist speichern'}
        </Button>
      </Formularfuss>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Zeitblöcke
// -----------------------------------------------------------------------------

function BlockFelder({
  bloecke,
  fehler,
  onChange,
  legende,
  // Wochenplan und Abweichung stehen auf derselben Seite. Ohne eigene
  // Beschriftung hätten ihre Felder identische Labels - für Screenreader
  // nicht unterscheidbar.
  blockLabel,
  // Feste Kennungen, damit der Fokus auf das erste fehlerhafte Feld springen
  // kann (ORG-02).
  idPraefix,
  gesperrt = false,
}: {
  bloecke: Zeitblock[];
  fehler: Blockfehler[] | null;
  onChange: (bloecke: Zeitblock[]) => void;
  legende: string;
  blockLabel: string;
  idPraefix: string;
  gesperrt?: boolean;
}) {
  function setzen(index: number, feld: keyof Zeitblock, wert: string) {
    onChange(bloecke.map((b, i) => (i === index ? { ...b, [feld]: wert } : b)));
  }

  /**
   * Einen Block entfernen (ORG-05). Bis UXR-011 ließen sich Blöcke nur
   * hinzufügen; wer einen zu viel hatte, musste ihn leeren und die Regel
   * kennen, dass leere Blöcke wegfallen. Der letzte Block bleibt als leere
   * Zeile stehen, damit sofort wieder etwas eingetragen werden kann.
   */
  function entfernen(index: number) {
    const rest = bloecke.filter((_, i) => i !== index);
    onChange(rest.length > 0 ? rest : [{ ...LEERER_BLOCK }]);
  }

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-ink text-sm font-medium">{legende}</legend>
      <div className="mt-2 flex flex-col gap-3">
        {bloecke.map((block, index) => {
          const nummer = `${blockLabel} ${index + 1}`;
          const entfernbar = bloecke.length > 1 || block.von !== '' || block.bis !== '';
          return (
            // Von, bis und Entfernen in einer Zeile (Design-Rollout B2): vorher
            // stand unter jedem Block ein eigener Knopf „Block n entfernen“.
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3"
            >
              <Field
                label={`${nummer} von`}
                feldId={`${idPraefix}-${index}-von`}
                type="time"
                value={block.von}
                error={fehler?.[index]?.von}
                disabled={gesperrt}
                onChange={(e) => setzen(index, 'von', e.target.value)}
              />
              <Field
                label={`${nummer} bis`}
                feldId={`${idPraefix}-${index}-bis`}
                type="time"
                value={block.bis}
                error={fehler?.[index]?.bis}
                disabled={gesperrt}
                onChange={(e) => setzen(index, 'bis', e.target.value)}
              />
              {/* Die Spalte bleibt, auch ohne Knopf: So fluchten die Felder. */}
              <div className="mb-0.5 size-11">
                {entfernbar ? (
                  <Symbolknopf
                    beschriftung={`${nummer} entfernen`}
                    disabled={gesperrt}
                    onClick={() => entfernen(index)}
                  >
                    <span className="text-xl leading-none">×</span>
                  </Symbolknopf>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2">
        <Button
          type="button"
          variant="quiet"
          groesse="kompakt"
          disabled={gesperrt}
          onClick={() => onChange([...bloecke, { ...LEERER_BLOCK }])}
        >
          Weiteren Block hinzufügen
        </Button>
      </div>
    </fieldset>
  );
}

// -----------------------------------------------------------------------------
// Wochenplan
// -----------------------------------------------------------------------------

/**
 * Was am gewählten Tag gerade im Formular steht.
 *
 * Der Stand trägt seinen Tag mit: Wechselt der Tag, gilt ein frischer Stand,
 * ohne dass ein Effekt ihn zurücksetzen müsste. Genau das war der Fehler
 * hinter ORG-04 - ein Effekt auf die geladenen Zeiten setzte nach jedem
 * Nachladen auch „gespeichert" zurück, und die Meldung erschien nur, wenn sich
 * nichts geändert hatte.
 */
interface Editorstand {
  tag: Wochentag;
  /** Eingegebene Blöcke; `null`, solange nichts eingegeben wurde. */
  bearbeitung: Zeitblock[] | null;
  fehler: Blockfehler[] | null;
  /**
   * Zuletzt gespeichert, bis die Liste den neuen Stand geladen hat. Scheitert
   * das Nachladen, gilt weiter das, was der Server bestätigt hat.
   */
  gesichert: { bloecke: Zeitblock[]; stand: number } | null;
  meldung: { text: string; nr: number } | null;
}

function frischerStand(tag: Wochentag): Editorstand {
  return { tag, bearbeitung: null, fehler: null, gesichert: null, meldung: null };
}

interface Wochenauftrag {
  tag: Wochentag;
  bloecke: Zeitblock[];
}

/**
 * Wochenplan einer Person.
 *
 * Die Seite setzt je Person eine neue Instanz (`key`) - verworfene Eingaben
 * einer Person tauchen so beim Zurückwechseln nicht wieder auf. Den Tag hält
 * die Seite, damit er einen Personenwechsel überlebt.
 */
function Wochenplan({
  staffMemberId,
  darfPflegen,
  tag,
  onTag,
  onUngespeichert,
}: {
  staffMemberId: string;
  darfPflegen: boolean;
  tag: Wochentag;
  onTag: (tag: Wochentag) => void;
  onUngespeichert: (ungespeichert: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [roh, setRoh] = useState<Editorstand>(() => frischerStand(tag));
  const [wechselZu, setWechselZu] = useState<Wochentag | null>(null);

  const zeiten = useQuery({
    queryKey: ['working-hours'],
    queryFn: fetchWorkingHours,
    retry: false,
  });

  const stand = roh.tag === tag ? roh : frischerStand(tag);
  // Für die Rückmeldung nach dem Speichern: welcher Tag gerade offen ist und
  // welcher Stand der Liste geladen war.
  const tagRef = useRef(tag);
  tagRef.current = tag;
  const datenstandRef = useRef(zeiten.dataUpdatedAt);
  datenstandRef.current = zeiten.dataUpdatedAt;

  const daten = zeiten.data ?? [];
  const geladen = wochenBloecke(daten, staffMemberId, tag);
  const referenz =
    stand.gesichert && stand.gesichert.stand === zeiten.dataUpdatedAt
      ? stand.gesichert.bloecke
      : geladen;
  const angezeigt = stand.bearbeitung ?? (referenz.length > 0 ? referenz : [{ ...LEERER_BLOCK }]);
  const ungespeichert =
    stand.bearbeitung !== null && !gleicheBloecke(ohneLeere(stand.bearbeitung), referenz);
  // Ein Tag, der Blöcke hatte, wird nur nach Rückfrage leer gespeichert (ORG-02).
  const leertTag = ohneLeere(angezeigt).length === 0 && referenz.length > 0;
  const label = wochentagLabels[tag];

  useEffect(() => {
    onUngespeichert(ungespeichert);
  }, [ungespeichert, onUngespeichert]);
  useEffect(() => () => onUngespeichert(false), [onUngespeichert]);

  function aendern(teil: (vorher: Editorstand) => Partial<Editorstand>) {
    setRoh((vorher) => {
      const basis = vorher.tag === tag ? vorher : frischerStand(tag);
      return { ...basis, ...teil(basis) };
    });
  }

  const mutation = useMutation({
    mutationFn: (auftrag: Wochenauftrag) =>
      saveWorkingHours(staffMemberId, auftrag.tag, auftrag.bloecke),
    onSuccess: (_, auftrag) => {
      const text =
        auftrag.bloecke.length === 0
          ? `Der ${wochentagLabels[auftrag.tag]} ist ohne Arbeitszeit gespeichert.`
          : `Der ${wochentagLabels[auftrag.tag]} ist gespeichert.`;
      setRoh((vorher) => {
        // Inzwischen ein anderer Tag offen: Die Liste zeigt den neuen Stand
        // nach dem Nachladen ohnehin.
        if (auftrag.tag !== tagRef.current) return vorher;
        const basis = vorher.tag === auftrag.tag ? vorher : frischerStand(auftrag.tag);
        // Wer während des Speicherns weitergetippt hat, behält seine Eingabe.
        const unveraendert =
          basis.bearbeitung === null ||
          gleicheBloecke(ohneLeere(basis.bearbeitung), auftrag.bloecke);
        return {
          ...basis,
          bearbeitung: unveraendert ? null : basis.bearbeitung,
          fehler: null,
          gesichert: { bloecke: auftrag.bloecke, stand: datenstandRef.current },
          meldung: { text, nr: (basis.meldung?.nr ?? 0) + 1 },
        };
      });
      // Nicht abwarten (ZST-B01): Gespeichert ist es mit der Antwort des
      // Servers. Hängt das Nachladen, stünde sonst sekundenlang „Wird
      // gespeichert …" da.
      void queryClient.invalidateQueries({ queryKey: ['working-hours'] });
    },
  });

  function speichern() {
    if (mutation.isPending) return;
    const halbe = halbeBloecke(angezeigt);
    if (halbe) {
      aendern(() => ({ fehler: halbe }));
      const ziel = ersterFehler('wochenplan', halbe);
      if (ziel) fokussieren(ziel);
      return;
    }
    aendern(() => ({ fehler: null }));
    mutation.mutate({ tag, bloecke: ohneLeere(angezeigt) });
  }

  function wechseln(neu: Wochentag) {
    setWechselZu(null);
    mutation.reset();
    setRoh(frischerStand(neu));
    onTag(neu);
  }

  function tagWaehlen(neu: Wochentag) {
    if (neu === tag) return;
    if (ungespeichert) {
      setWechselZu(neu);
      return;
    }
    wechseln(neu);
  }

  if (zeiten.isPending) return <LoadingState label="Arbeitszeiten werden geladen …" />;
  // Nur ohne Daten ersetzt der Fehler den Plan (ZST-03): Scheitert ein
  // Nachladen, bleibt der zuletzt geladene Stand samt Eingabe stehen.
  if (zeiten.isError && !zeiten.data) {
    return (
      <ErrorState
        title="Die Arbeitszeiten konnten nicht geladen werden."
        description={VERBINDUNG_PRUEFEN}
        onErneut={() => void zeiten.refetch()}
      />
    );
  }

  return (
    // Ohne Erklärsatz (DESIGN.md Regel 6): Die Zeitzone nennt das
    // Kleingedruckte am Seitenende.
    <Section titel="Wochenplan">
      {zeiten.isError ? (
        <NachladeHinweis
          className="mb-4"
          laeuft={zeiten.isFetching}
          onErneut={() => void zeiten.refetch()}
        />
      ) : null}

      {/* Übersicht links, Bearbeitung rechts, sobald Platz ist (ORG-29): Bis
          UXR-011 lagen Tag und Uhrzeit bei 1440 px rund 900 px auseinander. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Die Wochentage als Zeilen des Systems (DESIGN.md Regel 3): Tag und
            Zeiten, daneben der Weg in den Tag (ORG-05). */}
        <ListRows>
          {WOCHENTAGE.map((w) => {
            const offen = darfPflegen && w === tag;
            return (
              <ListRow
                key={w}
                titel={<span aria-current={offen ? 'true' : undefined}>{wochentagLabels[w]}</span>}
                meta={bloeckeText(w === tag ? referenz : wochenBloecke(daten, staffMemberId, w))}
                status={
                  offen ? (
                    <span className="text-accent text-sm font-semibold">Wird bearbeitet</span>
                  ) : undefined
                }
                gedaempft={!offen && darfPflegen}
                aktion={
                  darfPflegen && !offen ? (
                    <Button
                      type="button"
                      variant="quiet"
                      aria-label={`${wochentagLabels[w]} bearbeiten`}
                      disabled={mutation.isPending}
                      onClick={() => {
                        tagWaehlen(w);
                        if (!ungespeichert) fokussieren('wochenplan-tag');
                      }}
                    >
                      Bearbeiten
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </ListRows>

        {darfPflegen ? (
          <div className="flex flex-col gap-4">
            <Select
              label="Wochentag"
              feldId="wochenplan-tag"
              value={String(tag)}
              disabled={mutation.isPending}
              onChange={(e) => tagWaehlen(Number(e.target.value) as Wochentag)}
            >
              {WOCHENTAGE.map((w) => (
                <option key={w} value={w}>
                  {wochentagLabels[w]}
                </option>
              ))}
            </Select>

            {wechselZu !== null ? (
              <Wechselrueckfrage
                onVerwerfen={() => {
                  wechseln(wechselZu);
                  fokussieren('wochenplan-tag');
                }}
                onBleiben={() => {
                  setWechselZu(null);
                  fokussieren('wochenplan-tag');
                }}
              >
                Die Änderungen am {label} sind noch nicht gespeichert und gehen beim Wechsel zum{' '}
                {wochentagLabels[wechselZu]} verloren.
              </Wechselrueckfrage>
            ) : null}

            <BlockFelder
              bloecke={angezeigt}
              fehler={stand.fehler}
              onChange={(neu) =>
                // Einmal gezeigte Fehler laufen mit der Eingabe mit: Ist der
                // Block vollständig oder ganz leer, verschwindet der Hinweis.
                aendern((vorher) => ({
                  bearbeitung: neu,
                  fehler: vorher.fehler ? halbeBloecke(neu) : null,
                }))
              }
              legende={`Zeitblöcke am ${label}`}
              blockLabel="Block"
              idPraefix="wochenplan"
              gesperrt={mutation.isPending}
            />

            {mutation.isError && !leertTag ? (
              <Statusmeldung ton="fehler">
                {mutation.error.message} Die Eingaben stehen noch im Formular.
              </Statusmeldung>
            ) : null}
            {stand.meldung && stand.bearbeitung === null ? (
              <Rueckmeldung key={stand.meldung.nr}>{stand.meldung.text}</Rueckmeldung>
            ) : null}

            {/* Ein Speichern für das Formular des Tages (ANN-435, Design-Rollout B2): Den
                Tag leert man, indem man seine Blöcke entfernt - ein zweiter
                Knopf „Blöcke leeren“ daneben entfällt. Was ein leerer Tag
                bedeutet, sagt die Rückfrage beim Speichern. */}
            <div className="flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto">
              {leertTag ? (
                <Rueckfrage
                  ausloeser={`${label} speichern`}
                  ausloeserVariante="primary"
                  bezeichnung={`${label} ohne Arbeitszeit speichern`}
                  bestaetigen="Ohne Arbeitszeit speichern"
                  bestaetigenLaeuft="Wird gespeichert …"
                  fehler={mutation.isError ? mutation.error.message : undefined}
                  onBestaetigen={() => mutation.mutateAsync({ tag, bloecke: [] })}
                  onAbbrechen={() => mutation.reset()}
                >
                  <p>
                    {label} ohne Arbeitszeit speichern? Bisher: {bloeckeText(referenz)}. Danach sind
                    an diesem Wochentag keine Termine vorgesehen.
                  </p>
                </Rueckfrage>
              ) : (
                <Button type="button" disabled={mutation.isPending} onClick={speichern}>
                  {mutation.isPending ? 'Wird gespeichert …' : `${label} speichern`}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-ink-muted text-sm">
            Für das Ändern des Wochenplans fehlt Ihrem Zugang die Berechtigung.
          </p>
        )}
      </div>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Datumsbezogene Abweichungen
// -----------------------------------------------------------------------------

interface Abweichungsform {
  datum: string;
  abwesend: boolean;
  bloecke: Zeitblock[];
}

const LEERE_FORM: Abweichungsform = { datum: '', abwesend: false, bloecke: [{ ...LEERER_BLOCK }] };

function gleicheForm(a: Abweichungsform, b: Abweichungsform): boolean {
  return (
    a.datum === b.datum &&
    a.abwesend === b.abwesend &&
    gleicheBloecke(ohneLeere(a.bloecke), ohneLeere(b.bloecke))
  );
}

function alsForm(tag: AbweichungsTag): Abweichungsform {
  return {
    datum: tag.datum,
    abwesend: tag.frei,
    bloecke: tag.frei || tag.bloecke.length === 0 ? [{ ...LEERER_BLOCK }] : tag.bloecke,
  };
}

interface Abweichungsauftrag {
  datum: string;
  abwesend: boolean;
  bloecke: Zeitblock[];
  /** Entfernen ist dieselbe Serverfunktion mit leeren Blöcken. */
  art: 'speichern' | 'entfernen';
  /** Wo die Rückmeldung erscheint: an der Liste oder am Formular. */
  ort: 'liste' | 'formular';
  /** Das Formular zum Zeitpunkt des Speicherns - danach gilt es als gesichert. */
  quelle: Abweichungsform | null;
}

interface Abweichungsmeldung {
  text: string;
  ort: 'liste' | 'formular';
  nr: number;
}

function Abweichungen({
  staffMemberId,
  darfPflegen,
  heute,
  onUngespeichert,
}: {
  staffMemberId: string;
  darfPflegen: boolean;
  heute: string | undefined;
  onUngespeichert: (ungespeichert: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Abweichungsform>(LEERE_FORM);
  // Wovon die Eingabe ausging: leer oder eine geladene Abweichung (ORG-05).
  const [ausgang, setAusgang] = useState<Abweichungsform>(LEERE_FORM);
  const [fehler, setFehler] = useState<Blockfehler[] | null>(null);
  const [meldung, setMeldung] = useState<Abweichungsmeldung | null>(null);
  const [ladenFrage, setLadenFrage] = useState<Abweichungsform | null>(null);
  /** Das Datum, dessen Abweichung nach Rückfrage entfernt werden soll. */
  const [entfernenFrage, setEntfernenFrage] = useState<string | null>(null);
  const formular = useRef<HTMLDivElement>(null);

  // Ein knappes Fenster nach vorn: die Pflege betrifft die kommende Planung,
  // nicht die Vergangenheit. Gerechnet über ein Date statt über die
  // Jahreszahl im Text - der 29. Februar plus ein Jahr wäre sonst der
  // 29. Februar eines Nichtschaltjahres und damit gar kein Datum.
  const von = heute ?? '';
  const bis = heute ? einJahrSpaeter(heute) : '';

  const ausnahmen = useQuery({
    queryKey: ['working-hour-exceptions', von, bis],
    queryFn: () => fetchWorkingHourExceptions(von, bis),
    enabled: Boolean(heute),
    retry: false,
  });

  const tage = abweichungenNachDatum(
    (ausnahmen.data ?? []).filter((a) => a.staff_member_id === staffMemberId),
  );
  const bestehend = tage.some((t) => t.datum === form.datum);
  // Ohne Häkchen und ohne Blöcke wird nichts eingetragen - eine bestehende
  // Abweichung wird damit entfernt (ORG-02).
  const leer = !form.abwesend && ohneLeere(form.bloecke).length === 0;
  const ungespeichert = !gleicheForm(form, ausgang);
  const datumText = form.datum ? formatDate(form.datum) : '';

  useEffect(() => {
    onUngespeichert(ungespeichert);
  }, [ungespeichert, onUngespeichert]);
  useEffect(() => () => onUngespeichert(false), [onUngespeichert]);

  const mutation = useMutation({
    mutationFn: (auftrag: Abweichungsauftrag) =>
      saveWorkingHourException(staffMemberId, auftrag.datum, auftrag.abwesend, auftrag.bloecke),
    onSuccess: (_, auftrag) => {
      const text =
        auftrag.art === 'entfernen'
          ? `Die Abweichung am ${formatDate(auftrag.datum)} ist entfernt.`
          : `Die Abweichung am ${formatDate(auftrag.datum)} ist gespeichert.`;
      setMeldung((vorher) => ({ text, ort: auftrag.ort, nr: (vorher?.nr ?? 0) + 1 }));
      // Was gespeichert ist, gilt nicht mehr als ungespeichert.
      if (auftrag.quelle) setAusgang(auftrag.quelle);
      void queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] });
    },
  });

  function setzeForm(teil: Partial<Abweichungsform>) {
    const neu = { ...form, ...teil };
    setForm(neu);
    // Einmal gezeigte Fehler laufen mit der Eingabe mit.
    if (fehler) setFehler(halbeBloecke(neu.bloecke));
    setMeldung(null);
  }

  function laden(neu: Abweichungsform) {
    setLadenFrage(null);
    setForm(neu);
    setAusgang(neu);
    setFehler(null);
    setMeldung(null);
    mutation.reset();
    formular.current?.focus();
  }

  function speichern() {
    if (mutation.isPending || form.datum === '' || leer) return;
    if (!form.abwesend) {
      const halbe = halbeBloecke(form.bloecke);
      if (halbe) {
        setFehler(halbe);
        const ziel = ersterFehler('abweichung', halbe);
        if (ziel) fokussieren(ziel);
        return;
      }
    }
    setFehler(null);
    mutation.mutate({
      datum: form.datum,
      abwesend: form.abwesend,
      bloecke: form.abwesend ? [] : ohneLeere(form.bloecke),
      art: 'speichern',
      ort: 'formular',
      quelle: form,
    });
  }

  function liste() {
    // Ohne Zeitzone der Praxis gibt es kein „heute" und damit kein Fenster.
    // Bis UXR-011 stand hier dann „keine Abweichung hinterlegt" (ORG-14).
    if (!heute) {
      return (
        <Statusmeldung ton="warnung">
          Die Zeitzone der Praxis fehlt. Ohne sie lassen sich die Abweichungen nicht anzeigen.
        </Statusmeldung>
      );
    }
    if (ausnahmen.isPending) return <LoadingState label="Abweichungen werden geladen …" />;
    if (ausnahmen.isError && !ausnahmen.data) {
      return (
        <ErrorState
          title="Die Abweichungen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void ausnahmen.refetch()}
        />
      );
    }

    return (
      <>
        {ausnahmen.isError ? (
          <NachladeHinweis
            className="mb-4"
            laeuft={ausnahmen.isFetching}
            onErneut={() => void ausnahmen.refetch()}
          />
        ) : null}
        {/* Erst nach dem Schließen des Fensters: Dann nimmt die Bestätigung
            den Fokus, nicht der Knopf, der das Fenster geöffnet hatte. */}
        {meldung?.ort === 'liste' && entfernenFrage === null ? (
          <Rueckmeldung key={meldung.nr} className="mb-3">
            {meldung.text}
          </Rueckmeldung>
        ) : null}
        {tage.length > 0 ? (
          // Datum und Zeit als Zeile des Systems (ORG-29, DESIGN.md Regel 3),
          // mehrere Blöcke eines Tages in einer Zeile (ORG-05). Die Arbeit
          // steht daneben; das Entfernen fragt in einem Fenster nach, weil
          // die Zeile für eine Rückfrage an Ort und Stelle zu schmal ist.
          <ListRows>
            {tage.map((t) => {
              const datum = formatDate(t.datum);
              return (
                <ListRow
                  key={t.datum}
                  titel={<span className="tabular-nums">{datum}</span>}
                  meta={t.frei ? 'Keine Termine' : bloeckeText(t.bloecke)}
                  aktion={
                    darfPflegen ? (
                      <span
                        role="group"
                        aria-label={`Abweichung am ${datum}`}
                        className="flex items-center gap-1"
                      >
                        <Button
                          type="button"
                          variant="quiet"
                          disabled={mutation.isPending}
                          onClick={() => {
                            const neu = alsForm(t);
                            if (ungespeichert) setLadenFrage(neu);
                            else laden(neu);
                          }}
                        >
                          Ändern
                        </Button>
                        <Button
                          type="button"
                          variant="quiet"
                          disabled={mutation.isPending}
                          onClick={() => {
                            mutation.reset();
                            setEntfernenFrage(t.datum);
                          }}
                        >
                          Entfernen
                        </Button>
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </ListRows>
        ) : (
          // Der Leerzustand in der Karte (DESIGN.md Regel 8).
          <EmptyState inKarte title="Für das kommende Jahr ist keine Abweichung hinterlegt." />
        )}

        {entfernenFrage !== null ? (
          <EntfernenFenster
            datum={formatDate(entfernenFrage)}
            fehler={
              mutation.isError && mutation.variables?.ort === 'liste'
                ? mutation.error.message
                : undefined
            }
            onBestaetigen={() =>
              mutation.mutateAsync({
                datum: entfernenFrage,
                abwesend: false,
                bloecke: [],
                art: 'entfernen',
                ort: 'liste',
                quelle: null,
              })
            }
            onSchliessen={() => {
              setEntfernenFrage(null);
              mutation.reset();
            }}
          />
        ) : null}
      </>
    );
  }

  const formularFehler = mutation.isError && mutation.variables?.ort === 'formular';

  return (
    // Ohne Erklärsatz (DESIGN.md Regel 6): Was eine Abweichung bewirkt, sagen
    // die Rückfragen dort, wo es ansteht.
    <Section titel="Abweichungen an einzelnen Tagen">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div>{liste()}</div>

        {darfPflegen ? (
          <div
            ref={formular}
            tabIndex={-1}
            role="group"
            aria-label="Abweichung eintragen"
            className="flex flex-col gap-4 outline-none"
          >
            {ladenFrage ? (
              <Wechselrueckfrage
                onVerwerfen={() => laden(ladenFrage)}
                onBleiben={() => setLadenFrage(null)}
              >
                Die Eingaben im Formular sind noch nicht gespeichert und gehen beim Wechsel zur
                Abweichung am {formatDate(ladenFrage.datum)} verloren.
              </Wechselrueckfrage>
            ) : null}

            <Field
              label="Datum"
              feldId="abweichung-datum"
              type="date"
              value={form.datum}
              min={heute}
              // Später als das Fenster der Liste wäre die Abweichung
              // gespeichert, aber nirgends zu sehen (ORG-05).
              max={bis || undefined}
              onChange={(e) => setzeForm({ datum: e.target.value })}
            />

            {/* Der Baustein trägt die Trefferfläche von 44 px (ORG-17,
                RSP-13) - davon hängt ab, ob ein ganzer Tag gesperrt wird. */}
            <Checkbox
              label="An diesem Tag keine Termine"
              checked={form.abwesend}
              onChange={(e) => setzeForm({ abwesend: e.target.checked })}
            />

            {!form.abwesend ? (
              <BlockFelder
                bloecke={form.bloecke}
                fehler={fehler}
                onChange={(neu) => setzeForm({ bloecke: neu })}
                legende="Abweichende Zeitblöcke"
                blockLabel="Abweichender Block"
                idPraefix="abweichung"
                gesperrt={mutation.isPending}
              />
            ) : null}

            {formularFehler && !(leer && bestehend) ? (
              <Statusmeldung ton="fehler">
                {mutation.error?.message} Die Eingaben stehen noch im Formular.
              </Statusmeldung>
            ) : null}
            {meldung?.ort === 'formular' ? (
              <Rueckmeldung key={meldung.nr}>{meldung.text}</Rueckmeldung>
            ) : null}

            {form.datum !== '' && leer && !bestehend ? (
              <p className="text-ink-muted text-sm">
                Für den {datumText} ist keine Abweichung hinterlegt. Bitte das Häkchen setzen oder
                Zeitblöcke eintragen.
              </p>
            ) : null}

            <div className="flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto">
              {form.datum !== '' && leer && bestehend ? (
                <Rueckfrage
                  ausloeser="Abweichung speichern"
                  ausloeserVariante="primary"
                  bezeichnung={`Abweichung am ${datumText} entfernen`}
                  bestaetigen="Abweichung entfernen"
                  bestaetigenLaeuft="Wird entfernt …"
                  fehler={formularFehler ? mutation.error?.message : undefined}
                  onBestaetigen={() =>
                    mutation.mutateAsync({
                      datum: form.datum,
                      abwesend: false,
                      bloecke: [],
                      art: 'entfernen',
                      ort: 'formular',
                      quelle: form,
                    })
                  }
                  onAbbrechen={() => mutation.reset()}
                >
                  <p>
                    Ohne Häkchen und ohne Blöcke wird die Abweichung am {datumText} entfernt. Danach
                    gilt für diesen Tag wieder der Wochenplan.
                  </p>
                </Rueckfrage>
              ) : (
                <Button
                  type="button"
                  disabled={mutation.isPending || form.datum === '' || leer}
                  onClick={speichern}
                >
                  {mutation.isPending ? 'Wird gespeichert …' : 'Abweichung speichern'}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * Rückfrage vor dem Entfernen einer Abweichung aus der Liste (ORG-05), als
 * Fenster: In der Zeile neben Datum und Zeit ist für die Frage kein Platz
 * (Design-Rollout B2). Der Knopf wartet auf den Server; scheitert er, bleibt
 * das Fenster offen und nennt den Fehler (ZST-06).
 */
function EntfernenFenster({
  datum,
  fehler,
  onBestaetigen,
  onSchliessen,
}: {
  datum: string;
  fehler: string | undefined;
  onBestaetigen: () => Promise<unknown>;
  onSchliessen: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [gescheitert, setGescheitert] = useState(false);

  async function bestaetigen() {
    if (laeuft) return;
    setLaeuft(true);
    setGescheitert(false);
    try {
      await onBestaetigen();
      onSchliessen();
    } catch {
      setGescheitert(true);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Dialogfenster titel={`Abweichung am ${datum} entfernen`} onSchliessen={onSchliessen}>
      <p className="text-ink mt-2 text-sm">Danach gilt für diesen Tag wieder der Wochenplan.</p>
      {gescheitert ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler ?? 'Das hat nicht geklappt.'} {ERNEUT_SPEICHERN}
        </Statusmeldung>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto">
        <Button
          type="button"
          data-autofocus
          disabled={laeuft}
          onClick={() => {
            void bestaetigen();
          }}
        >
          {laeuft ? 'Wird entfernt …' : 'Abweichung entfernen'}
        </Button>
        <Button type="button" variant="quiet" disabled={laeuft} onClick={onSchliessen}>
          Abbrechen
        </Button>
      </div>
    </Dialogfenster>
  );
}

// -----------------------------------------------------------------------------
// Seite
// -----------------------------------------------------------------------------

export function SchedulingPage({ user }: { user: CurrentUser }) {
  const darfPflegen = canManageWorkingHours(user.roles);
  const darfRaster = isOwner(user.roles);
  const zone = user.organizationTimeZone;
  const heute = zone ? todayInTimeZone(zone) : undefined;

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  /**
   * Die gewählte Person steht in der Adresszeile (UX-012).
   *
   * Damit führt ein Weg aus dem Mitarbeiterdatensatz direkt auf **diese**
   * Arbeitszeiten, statt auf die Seite mit der ersten Person – und der Stand
   * überlebt ein Neuladen wie im Kalender. Ein unbekannter oder verstellter
   * Wert fällt still auf die Vorwahl zurück.
   */
  const [suche, setSuche] = useSearchParams();
  const gewuenscht = suche.get('person');

  const [person, setPerson] = useState('');
  const [tag, setTag] = useState<Wochentag>(1);
  const [planOffen, setPlanOffen] = useState(false);
  const [abweichungOffen, setAbweichungOffen] = useState(false);
  const [personWechsel, setPersonWechsel] = useState<string | null>(null);

  const ungespeichert = planOffen || abweichungOffen;
  const { schutz } = useTextverlustschutz({ ungespeichert, texte: SCHUTZTEXTE });

  // Vorwahl (ORG-30): die Person aus der Adresse, sonst die eigene, wenn sie
  // selbst behandelt, sonst die erste der Liste. Therapeut:innen sahen bis
  // UXR-011 zuerst die Zeiten einer Kollegin und mussten sich selbst suchen.
  useEffect(() => {
    const liste = therapeuten.data;
    if (!liste || liste.length === 0) return;
    const ausAdresse = liste.find((t) => t.staff_member_id === gewuenscht);
    const eigene = liste.find((t) => t.staff_member_id === user.staffMemberId);
    setPerson((bisher) => {
      if (ausAdresse) return ausAdresse.staff_member_id;
      if (bisher !== '') return bisher;
      return (eigene ?? liste[0]!).staff_member_id;
    });
  }, [therapeuten.data, gewuenscht, user.staffMemberId]);

  function wechslePerson(staffMemberId: string) {
    setPersonWechsel(null);
    setPerson(staffMemberId);
    const naechste = new URLSearchParams(suche);
    naechste.set('person', staffMemberId);
    setSuche(naechste, { replace: true });
  }

  function personWaehlen(staffMemberId: string) {
    if (staffMemberId === person) return;
    // Ein Personenwechsel ist kein Seitenwechsel - der Schutz der Formulare
    // sieht ihn nicht. Er fragt deshalb hier (ORG-03).
    if (ungespeichert) {
      setPersonWechsel(staffMemberId);
      return;
    }
    wechslePerson(staffMemberId);
  }

  const name = (staffMemberId: string) =>
    therapeuten.data?.find((t) => t.staff_member_id === staffMemberId)?.display_name ?? '';

  return (
    <>
      {/* Eine Zeile (DESIGN.md Regel 6); die Praxiseinstellungen nennt ihr
          Aufklapper selbst. */}
      <PageHeader
        title={BEGRIFFE.arbeitszeiten}
        description="Wochenplan und Abweichungen je Person."
      />

      {therapeuten.isPending ? <LoadingState label="Personen werden geladen …" /> : null}
      {therapeuten.isError && !therapeuten.data ? (
        <ErrorState
          title="Die behandelnden Personen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void therapeuten.refetch()}
        />
      ) : null}

      {/* Ohne behandelnde Person stand bis UXR-011 nur die Fußnote da (ORG-30). */}
      {therapeuten.data && therapeuten.data.length === 0 ? (
        <EmptyState
          title="Noch keine behandelnde Person"
          description="Arbeitszeiten gibt es für Personen mit Zugang und der Rolle Therapeut:in oder Teamleitung."
          aktion={
            darfRaster ? (
              <ButtonLink to="/praxis/team" variant="secondary">
                Zu den Mitarbeitenden
              </ButtonLink>
            ) : undefined
          }
        />
      ) : null}

      {therapeuten.data && therapeuten.data.length > 0 ? (
        <>
          <div className="max-w-formular mb-8 flex flex-col gap-4">
            <Select
              label="Behandelnde Person"
              feldId="planung-person"
              value={person}
              onChange={(e) => personWaehlen(e.target.value)}
            >
              {therapeuten.data.map((t) => (
                <option key={t.staff_member_id} value={t.staff_member_id}>
                  {t.display_name}
                </option>
              ))}
            </Select>
            {personWechsel ? (
              <Wechselrueckfrage
                onVerwerfen={() => {
                  wechslePerson(personWechsel);
                  fokussieren('planung-person');
                }}
                onBleiben={() => {
                  setPersonWechsel(null);
                  fokussieren('planung-person');
                }}
              >
                Die Änderungen an den Arbeitszeiten von {name(person)} sind noch nicht gespeichert
                und gehen beim Wechsel zu {name(personWechsel)} verloren.
              </Wechselrueckfrage>
            ) : null}
            {therapeuten.isError ? (
              <NachladeHinweis
                laeuft={therapeuten.isFetching}
                onErneut={() => void therapeuten.refetch()}
              />
            ) : null}
          </div>

          {/* Die Rückfrage vor dem Weggehen (ANN-046). */}
          {schutz}

          {person ? (
            <>
              <Wochenplan
                key={`plan-${person}`}
                staffMemberId={person}
                darfPflegen={darfPflegen}
                tag={tag}
                onTag={setTag}
                onUngespeichert={setPlanOffen}
              />
              <Abweichungen
                key={`abweichung-${person}`}
                staffMemberId={person}
                darfPflegen={darfPflegen}
                heute={heute}
                onUngespeichert={setAbweichungOffen}
              />
            </>
          ) : null}
        </>
      ) : null}

      {/* Die Einstellungen der Praxis - Raster, Frist, Startort, Garage,
          Fahrzeitfaktor - stehen seit dem Handoff Rahmen vom 2026-10-05
          (RAH-006) **unter** dem Wochenplan in einem geschlossenen Aufklapper:
          Bis dahin schoben fünf Formulare, die sich im Jahr ein paarmal ändern,
          die Arbeitszeiten, derentwegen man kommt, am Telefon um mehr als
          einen Bildschirm nach unten. Der Weg „Arbeitszeiten" aus dem
          Mitarbeiterdatensatz landet damit beim Wochenplan der Person. Die
          Formulare selbst sind unverändert, nur owner sieht sie. */}
      {darfRaster ? (
        <div className="mt-10">
          <Disclosure
            kopf="label"
            inKarte
            summary={
              <>
                Praxiseinstellungen
                {/* Am Telefon brach die Aufzählung neben dem Titel in drei Zeilen
                    um; dort genügt der Titel (Design-Rollout B2). */}
                <span className="text-ink-muted ml-auto hidden text-sm font-normal tracking-normal normal-case sm:inline">
                  Raster · Frist · Startort · Benachrichtigungen
                </span>
              </>
            }
          >
            <RasterEinstellung aktuell={user.appointmentGridMinutes} />
            <FristEinstellung organizationId={user.profile.organization_id} />
            <div className="mt-8 space-y-8">
              <StartortEinstellung />
              {/* UBK-015: Beginn und Ende der Tour, getrennt vom Ort der Praxistermine. */}
              <GarageEinstellung />
              {/* UBK-010: neben dem Startort - beides bestimmt die Fahrzeiten. */}
              <FahrzeitfaktorEinstellung />
              {/* KOM-011: Arten der Benachrichtigung für alle abschalten (ADR-024 Punkt 15). */}
              <BenachrichtigungsSchalter />
            </div>
          </Disclosure>
        </div>
      ) : null}

      <Kleingedrucktes className="mt-10">
        Alle Zeiten gelten in der Zeitzone der Praxis{zone ? ` (${zone})` : ''}. Arbeitszeiten sind
        organisatorische Angaben zur Planung – keine Arbeitszeiterfassung und keine
        Urlaubsverwaltung.
      </Kleingedrucktes>
    </>
  );
}
