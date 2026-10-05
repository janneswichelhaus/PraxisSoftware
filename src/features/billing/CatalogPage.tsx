import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { formatDate } from '@/lib/datum';
import { centZuEingabe, formatEuro, parseEuroZuCent } from '@/lib/geld';
import type { Formularfehler } from '@/lib/formularfehler';
import { HEILMITTEL } from '@/features/treatment-bases/heilmittel';
import { canManageServiceCatalog, type CurrentUser } from '@/features/session/types';
import { todayInTimeZone } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import {
  artLabels,
  bereichLabels,
  createKatalogVersion,
  deleteKatalogVersion,
  fetchKatalogPositionen,
  fetchKatalogVersionen,
  publishKatalogVersion,
  setTarif,
  steuerLabels,
  writeKatalogPositionen,
  type KatalogPosition,
  type KatalogVersion,
  type PositionsEingabe,
} from './api';

/**
 * Der Leistungskatalog (ABR-001).
 *
 * Eine Preisliste ist entweder **Entwurf** oder **in Kraft**. Ein Entwurf
 * lässt sich beliebig ändern; mit dem Inkraftsetzen wird er unveränderlich —
 * Positionen, Preise und Steuerkennzeichen eingeschlossen. Eine Preisänderung
 * ist deshalb immer eine neue Liste, nie eine Korrektur an der alten
 * (ADR-009 Punkt 5). Die Seite zeigt genau das: Was in Kraft ist, hat keine
 * Schaltfläche zum Ändern.
 *
 * Preise setzt allein die Inhaberin (ANN-071). Die Oberfläche blendet die
 * Schaltflächen für andere Rollen aus — verbindlich ist die Prüfung im
 * Schreibpfad, nicht diese Weiche (ADR-004).
 */

const STEUERSATZ_VORGABE = 190;

/** Die Sätze des Verlustschutzes für den Entwurf einer Preisliste (ABR-14, ANN-046). */
const PREISLISTENTEXTE = { ...EINGABETEXTE, bezeichnung: 'Ungespeicherte Preisliste' };

function leereZeile(): PositionsEingabe {
  return {
    code: '',
    label: '',
    item_kind: 'treatment',
    remedy: '',
    preis: '',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    service_area: 'therapy',
  };
}

function alsEingabe(position: KatalogPosition): PositionsEingabe {
  return {
    code: position.code,
    label: position.label,
    item_kind: position.item_kind,
    remedy: position.remedy ?? '',
    preis: centZuEingabe(position.unit_price_cents),
    tax_treatment: position.tax_treatment,
    tax_rate_permille: position.tax_rate_permille,
    service_area: position.service_area,
  };
}

/**
 * Eine Zeile, wie der Server sie speichert - zum Vergleichen (ABR-04).
 *
 * Das Formular führt den Preis als Eingabetext; „48" und „48,00" sind aber
 * derselbe Preis. Verglichen wurde bis UXR-010 der Text: Wer „48" tippte und
 * speicherte, las danach zugleich „Entwurf gespeichert." und „Es gibt
 * ungespeicherte Änderungen", und „In Kraft setzen" blieb gesperrt. Jetzt
 * zählt der Wert, den der Server ablegt: Kürzel und Bezeichnung getrimmt
 * (`btrim` in `write_service_catalog_items`), der Preis in Cent. Ein Preis,
 * der keine Zahl ist, bleibt als Text stehen und damit verschieden - R3-007
 * bleibt scharf.
 *
 * Nur der Vergleich: Was gespeichert wird, bestimmt unverändert der Aufruf in
 * `speichern` weiter unten.
 */
function vergleichswert(zeile: PositionsEingabe) {
  const cent = parseEuroZuCent(zeile.preis);
  return {
    code: zeile.code.trim(),
    label: zeile.label.trim(),
    item_kind: zeile.item_kind,
    remedy: zeile.remedy,
    preis: cent === null ? `keine Zahl: ${zeile.preis}` : cent,
    tax_treatment: zeile.tax_treatment,
    tax_rate_permille: zeile.tax_rate_permille,
    service_area: zeile.service_area,
  };
}

function gleich(a: readonly PositionsEingabe[], b: readonly PositionsEingabe[]): boolean {
  return JSON.stringify(a.map(vergleichswert)) === JSON.stringify(b.map(vergleichswert));
}

/** Die Felder einer Position, an denen eine Meldung stehen kann. */
type Positionsfeld = 'code' | 'label' | 'preis' | 'remedy' | 'tax_treatment';
/** Dazu die Felder, deren Änderung eine Meldung anderswo auslöst. */
type Feldschluessel = Positionsfeld | 'service_area' | 'item_kind';

const FELDNAMEN: Record<Positionsfeld, string> = {
  code: 'Kürzel',
  label: 'Bezeichnung',
  preis: 'Preis',
  remedy: 'Heilmittel',
  tax_treatment: 'Steuer',
};

/**
 * Wann eine Meldung am Feld erscheint: nachdem die Person das Feld verlassen
 * hat - oder das, was sie auslöst (ABR-21). Die Steuer meldet sich also auch,
 * wenn „Training" im Bereich gewählt wird.
 */
const AUSLOESER: Record<Positionsfeld, readonly Feldschluessel[]> = {
  code: ['code'],
  label: ['label'],
  preis: ['preis'],
  remedy: ['remedy', 'item_kind'],
  tax_treatment: ['tax_treatment', 'service_area'],
};

interface Zeilenfehler {
  feld: Positionsfeld;
  meldung: string;
}

/**
 * Was an einer Zeile nicht stimmt, und an welchem Feld - leer heißt: sie ist
 * in Ordnung.
 *
 * Die Regeln sind dieselben wie bis UXR-010; neu ist, dass jede Meldung an
 * ihrem Feld steht und sagt, was zu tun ist (ABR-21, WRT-09).
 */
function pruefe(zeile: PositionsEingabe): Zeilenfehler[] {
  const fehler: Zeilenfehler[] = [];
  if (zeile.code.trim() === '') fehler.push({ feld: 'code', meldung: 'Bitte ausfüllen.' });
  if (zeile.label.trim() === '') fehler.push({ feld: 'label', meldung: 'Bitte ausfüllen.' });
  if (parseEuroZuCent(zeile.preis) === null)
    fehler.push({ feld: 'preis', meldung: 'Bitte einen Preis wie 45,00 eingeben.' });
  if (zeile.item_kind === 'absence_fee' && zeile.remedy !== '')
    fehler.push({ feld: 'remedy', meldung: 'Ein Ausfallhonorar hängt an keinem Heilmittel.' });
  // ADR-021: Training ist keine Heilbehandlung. Verbindlich ist die Constraint
  // in der Datenbank; diese Zeile nennt den Grund, bevor der Server abweist.
  if (zeile.service_area === 'training' && zeile.tax_treatment === 'exempt_healthcare')
    fehler.push({
      feld: 'tax_treatment',
      meldung:
        'Training ist keine Heilbehandlung und damit nicht umsatzsteuerfrei. Bitte ein anderes Steuerkennzeichen wählen.',
    });
  return fehler;
}

function feldIdFuer(index: number, feld: Positionsfeld): string {
  return `position-${index + 1}-${feld}`;
}

/** Alle Mängel aller Zeilen, für die Zusammenfassung über dem Formular. */
function fehlerliste(zeilen: readonly PositionsEingabe[]): Formularfehler[] {
  return zeilen.flatMap((zeile, index) =>
    pruefe(zeile).map(({ feld, meldung }) => ({
      feldId: feldIdFuer(index, feld),
      feld: `Position ${index + 1}, ${FELDNAMEN[feld]}`,
      meldung,
    })),
  );
}

export function CatalogPage({ user }: { user: CurrentUser }) {
  const darfPflegen = canManageServiceCatalog(user.roles);
  const queryClient = useQueryClient();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  // Stehen im Entwurf darunter ungespeicherte Zeilen? Und der Wechsel, der
  // deshalb wartet (ABR-14). Eine Referenz statt eines Zustands: Gelesen wird
  // sie nur beim Wechsel, auch nach einem `await`, und ein Neuzeichnen der
  // ganzen Seite je Tastendruck braucht es dafür nicht.
  const ungespeichertRef = useRef(false);
  const [wechselZiel, setWechselZiel] = useState<string | null>(null);
  const heute = user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : null;

  const meldeUngespeichert = useCallback((wert: boolean) => {
    ungespeichertRef.current = wert;
  }, []);

  const versionen = useQuery({
    queryKey: ['katalog-versionen'],
    queryFn: fetchKatalogVersionen,
    retry: false,
  });

  const aktuelle = useMemo(() => {
    const liste = versionen.data ?? [];
    return liste.find((version) => version.id === gewaehlt) ?? liste[0] ?? null;
  }, [versionen.data, gewaehlt]);

  /**
   * Eine andere Liste zeigen. Stehen im Entwurf ungespeicherte Zeilen, wartet
   * der Wechsel auf eine Antwort - vorher baute er den Entwurf still neu, und
   * die Änderungen waren fort (ABR-14).
   */
  function wechseln(id: string) {
    if (id === aktuelle?.id) {
      setWechselZiel(null);
      return;
    }
    if (ungespeichertRef.current) {
      setWechselZiel(id);
      return;
    }
    setGewaehlt(id);
  }

  const zielLabel = versionen.data?.find((version) => version.id === wechselZiel)?.label;

  return (
    <>
      <PageHeader
        title="Leistungskatalog"
        description="Preislisten mit Einzelpreis und Steuerkennzeichen je Position."
      />

      {versionen.isPending ? <LoadingState label="Preislisten werden geladen …" /> : null}
      {versionen.isError ? (
        <ErrorState
          title="Die Preislisten konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => versionen.refetch()}
        />
      ) : null}

      {versionen.data && versionen.data.length === 0 ? (
        <EmptyState
          title="Noch keine Preisliste"
          description={
            darfPflegen
              ? 'Ohne eine in Kraft gesetzte Preisliste lässt sich keine Leistung erfassen.'
              : 'Ohne eine in Kraft gesetzte Preisliste lässt sich keine Leistung erfassen. Preislisten legt die Praxisinhaber:in an.'
          }
        />
      ) : null}

      {versionen.data && versionen.data.length > 0 ? (
        <Section titel="Preislisten" rahmen>
          <ul className="divide-line divide-y">
            {versionen.data.map((version) => {
              const istGewaehlt = aktuelle?.id === version.id;
              // Bei einer künftigen Liste sagt das Abzeichen „Gilt ab …" den
              // Beginn; die Zeile darunter wiederholte ihn (UX-005i).
              const kuenftig =
                version.published_at !== null && heute !== null && version.valid_from > heute;
              return (
                <li
                  key={version.id}
                  // Die gewählte Liste ist sichtbar gewählt, nicht nur für
                  // Vorlesesoftware (ABR-13): Fläche der aktiven Option und ✓.
                  className={`-mx-4 flex flex-wrap items-center gap-3 px-4 py-3 sm:-mx-5 sm:px-5 ${
                    istGewaehlt ? 'bg-accent-soft' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => wechseln(version.id)}
                    aria-current={istGewaehlt}
                    className="min-h-11 min-w-0 flex-1 text-left"
                  >
                    <span className="text-ink text-liste block truncate font-medium">
                      {istGewaehlt ? (
                        <span aria-hidden="true" className="text-accent mr-1.5">
                          ✓
                        </span>
                      ) : null}
                      {version.label}
                    </span>
                    {kuenftig ? null : (
                      <span className="text-ink-muted mt-0.5 block text-sm">
                        gültig ab {formatDate(version.valid_from)}
                      </span>
                    )}
                  </button>
                  <Listenstand version={version} heute={heute} />
                </li>
              );
            })}
          </ul>

          {wechselZiel && aktuelle ? (
            <Wechselrueckfrage
              bisher={aktuelle.label}
              ziel={zielLabel ?? 'die andere Preisliste'}
              onVerwerfen={() => {
                meldeUngespeichert(false);
                setGewaehlt(wechselZiel);
                setWechselZiel(null);
              }}
              onBleiben={() => setWechselZiel(null)}
            />
          ) : null}
        </Section>
      ) : null}

      {darfPflegen ? (
        <NeuePreisliste
          vorlage={versionen.data?.find((version) => version.published_at) ?? null}
          zeitzone={user.organizationTimeZone}
          onAngelegt={async (id) => {
            await queryClient.invalidateQueries({ queryKey: ['katalog-versionen'] });
            wechseln(id);
          }}
        />
      ) : null}

      {aktuelle ? (
        <Preisliste
          key={aktuelle.id}
          version={aktuelle}
          darfPflegen={darfPflegen}
          heute={heute}
          onUngespeichert={meldeUngespeichert}
        />
      ) : null}
    </>
  );
}

/**
 * Der Stand einer Preisliste (ABR-13): Entwurf, in Kraft - oder in Kraft
 * gesetzt mit einem Beginn nach dem heutigen Praxistag, dann „Gilt ab …".
 * Welche Liste eine neuere abgelöst hat, sagt die Seite nicht: Das wäre eine
 * zweite Ableitung neben der des Servers.
 */
function Listenstand({ version, heute }: { version: KatalogVersion; heute: string | null }) {
  if (version.published_at === null) return <Badge ton="neutral">Entwurf</Badge>;
  if (heute !== null && version.valid_from > heute) {
    return <Badge ton="neutral">Gilt ab {formatDate(version.valid_from)}</Badge>;
  }
  return <Badge ton="positiv">In Kraft</Badge>;
}

/**
 * Die Rückfrage vor dem Wechsel zu einer anderen Liste, solange im Entwurf
 * ungespeicherte Zeilen stehen (ABR-14). Dieselbe Form und dieselben Wege wie
 * der Verlustschutz beim Verlassen der Seite, nur ohne Speichern: Speichern
 * ist der Knopf am Entwurf.
 */
function Wechselrueckfrage({
  bisher,
  ziel,
  onVerwerfen,
  onBleiben,
}: {
  bisher: string;
  ziel: string;
  onVerwerfen: () => void;
  onBleiben: () => void;
}) {
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Der Kasten erscheint nach einem Tipp auf die Liste; der Fokus geht mit.
    kasten.current?.querySelector('button')?.focus();
  }, []);

  return (
    <div
      ref={kasten}
      role="group"
      aria-label="Ungespeicherte Preisliste"
      className="border-line-strong bg-surface-sunken rounded-card mt-3 border p-4"
    >
      <p className="text-ink text-sm">
        Die Änderungen an „{bisher}“ sind noch nicht gespeichert. Beim Wechsel zu „{ziel}“ gehen sie
        verloren.
      </p>
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

function NeuePreisliste({
  vorlage,
  zeitzone,
  onAngelegt,
}: {
  vorlage: KatalogVersion | null;
  zeitzone: string | null;
  onAngelegt: (id: string) => void | Promise<void>;
}) {
  const [offen, setOffen] = useState(false);
  const [label, setLabel] = useState('');
  // Der Praxistag, nicht der UTC-Tag: Zwischen Mitternacht und 01:00/02:00
  // Ortszeit wäre das sonst der Vortag — und genau so gespeichert (R3-006).
  const [gueltigAb, setGueltigAb] = useState(zeitzone ? todayInTimeZone(zeitzone) : '');
  const [kopieren, setKopieren] = useState(true);

  const anlegen = useMutation({
    mutationFn: () =>
      createKatalogVersion(label, gueltigAb, kopieren && vorlage ? vorlage.id : null),
    onSuccess: async (id) => {
      setOffen(false);
      setLabel('');
      await onAngelegt(id);
    },
  });

  if (!offen) {
    return (
      <div className="mt-5">
        {/* Sekundär: Der Hauptknopf gehört der Aktion, die der Entwurf
            darunter gerade erwartet (ABR-24). */}
        <Button type="button" variant="secondary" onClick={() => setOffen(true)}>
          Neue Preisliste
        </Button>
      </div>
    );
  }

  return (
    <Section titel="Neue Preisliste" ebene={2}>
      <div className="flex flex-col gap-4 sm:max-w-md">
        <Field
          label="Bezeichnung"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          hint="Zum Wiederfinden, etwa „Preisliste 2027“."
        />
        <Field
          label="Gültig ab"
          type="date"
          value={gueltigAb}
          onChange={(event) => setGueltigAb(event.target.value)}
          hint="Maßgeblich ist der Leistungstag, nicht der Tag der Erfassung."
        />
        {vorlage ? (
          <Checkbox
            label={`Positionen aus „${vorlage.label}“ übernehmen`}
            hint="Eine Preisrunde ändert meist zwei Zeilen und lässt zwanzig stehen."
            checked={kopieren}
            onChange={(event) => setKopieren(event.target.checked)}
          />
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => anlegen.mutate()}
            disabled={label.trim() === '' || anlegen.isPending}
          >
            {anlegen.isPending ? 'Wird angelegt …' : 'Entwurf anlegen'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOffen(false)}>
            Abbrechen
          </Button>
        </div>
        {anlegen.isError ? (
          <Statusmeldung ton="fehler">
            {anlegen.error.message} Bitte die Verbindung prüfen und erneut versuchen.
          </Statusmeldung>
        ) : null}
      </div>
    </Section>
  );
}

function Preisliste({
  version,
  darfPflegen,
  heute,
  onUngespeichert,
}: {
  version: KatalogVersion;
  darfPflegen: boolean;
  heute: string | null;
  onUngespeichert: (ungespeichert: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const positionen = useQuery({
    queryKey: ['katalog-positionen', version.id],
    queryFn: () => fetchKatalogPositionen(version.id),
    retry: false,
  });

  const [zeilen, setZeilen] = useState<PositionsEingabe[] | null>(null);
  const zeilenRef = useRef(zeilen);
  zeilenRef.current = zeilen;
  const [gespeichert, setGespeichert] = useState(false);
  // Welche Felder die Person verlassen hat, und bis zu welcher Zeile der
  // letzte Speicherversuch alles gezeigt hat (ABR-21). Eine eben hinzugefügte
  // Position meldet nichts, bevor jemand etwas in ihr getan hat.
  const [beruehrt, setBeruehrt] = useState<ReadonlySet<string>>(new Set());
  const [pruefungBis, setPruefungBis] = useState(0);
  const [zusammenfassung, setZusammenfassung] = useState<Formularfehler[]>([]);

  // Der Entwurf wird bearbeitbar, sobald seine Positionen da sind. Ein
  // Formular, das vor den Daten steht, überschriebe sie beim ersten Speichern.
  useEffect(() => {
    if (positionen.data && zeilen === null) setZeilen(positionen.data.map(alsEingabe));
  }, [positionen.data, zeilen]);

  const bearbeitbar = darfPflegen && version.published_at === null;

  // In Kraft gesetzt wird der **Serverstand**. Weicht das Formular davon ab,
  // gingen die Änderungen still verloren — und die Liste wäre danach
  // unveränderlich (R3-007). Verglichen wird gegen denselben Stand, aus dem
  // die Zeilen entstanden sind - Wert gegen Wert, nicht Text gegen Text (ABR-04).
  const ungespeichert =
    zeilen !== null &&
    positionen.data !== undefined &&
    !gleich(zeilen, positionen.data.map(alsEingabe));

  useEffect(() => {
    onUngespeichert(bearbeitbar && ungespeichert);
  }, [bearbeitbar, ungespeichert, onUngespeichert]);

  const speichern = useMutation({
    mutationFn: () =>
      writeKatalogPositionen(
        version.id,
        (zeilen ?? []).map((zeile) => ({
          code: zeile.code.trim(),
          label: zeile.label.trim(),
          item_kind: zeile.item_kind,
          remedy: zeile.remedy === '' ? null : zeile.remedy,
          unit_price_cents: parseEuroZuCent(zeile.preis) ?? 0,
          tax_treatment: zeile.tax_treatment,
          tax_rate_permille: zeile.tax_rate_permille,
          service_area: zeile.service_area,
        })),
      ),
    onSuccess: async () => {
      setGespeichert(true);
      setPruefungBis(0);
      setBeruehrt(new Set());
      setZusammenfassung([]);
      await queryClient.invalidateQueries({ queryKey: ['katalog-positionen', version.id] });
    },
  });

  const inKraft = useMutation({
    mutationFn: () => publishKatalogVersion(version.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['katalog-versionen'] });
    },
  });

  const verwerfen = useMutation({
    mutationFn: () => deleteKatalogVersion(version.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['katalog-versionen'] });
    },
  });

  // Schutz vor dem stillen Verlust beim Verlassen der Seite (ABR-14, ANN-046):
  // Ein Entwurf ist ein Speicherstand, also gibt es alle drei Wege. Der
  // Speicherweg ist derselbe Aufruf wie der Knopf am Entwurf.
  const schutz = useTextverlustschutz({
    ungespeichert: bearbeitbar && ungespeichert,
    speichern: async () => {
      if (fehlerliste(zeilenRef.current ?? []).length > 0) {
        setPruefungBis((zeilenRef.current ?? []).length);
        throw new Error(
          'Die Positionen sind noch nicht vollständig. Bitte „Hier bleiben“ wählen und die markierten Angaben ergänzen.',
        );
      }
      const gesendet = zeilenRef.current ?? [];
      await speichern.mutateAsync();
      // Vollständig ist das Speichern nur, wenn währenddessen niemand weiter
      // eingegeben hat.
      return gleich(zeilenRef.current ?? [], gesendet);
    },
    texte: PREISLISTENTEXTE,
  });

  if (positionen.isPending) return <LoadingState label="Positionen werden geladen …" />;
  if (positionen.isError) {
    return (
      <ErrorState
        title="Die Positionen konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => positionen.refetch()}
      />
    );
  }

  const ohnePosition = positionen.data.length === 0;
  const kuenftig = version.published_at !== null && heute !== null && version.valid_from > heute;

  function aendern(neu: PositionsEingabe[]) {
    setZeilen(neu);
    // Die Meldung gilt dem gespeicherten Stand; mit der nächsten Änderung ist
    // sie überholt (ABR-04).
    setGespeichert(false);
  }

  function beruehren(index: number, feld: Feldschluessel) {
    setBeruehrt((alt) => new Set(alt).add(`${index}:${feld}`));
  }

  function sichtbareFehler(index: number, zeile: PositionsEingabe) {
    const ergebnis: Partial<Record<Positionsfeld, string>> = {};
    for (const { feld, meldung } of pruefe(zeile)) {
      if (index < pruefungBis || AUSLOESER[feld].some((a) => beruehrt.has(`${index}:${a}`))) {
        ergebnis[feld] = meldung;
      }
    }
    return ergebnis;
  }

  function speichernVersuchen() {
    if (speichern.isPending) return;
    const liste = fehlerliste(zeilen ?? []);
    setZusammenfassung(liste);
    if (liste.length > 0) {
      setPruefungBis((zeilen ?? []).length);
      return;
    }
    setPruefungBis(0);
    speichern.mutate();
  }

  return (
    <Section
      titel={version.label}
      ebene={2}
      hinweis={
        version.published_at
          ? kuenftig
            ? `In Kraft gesetzt und damit unveränderlich; sie gilt für Leistungen ab ${formatDate(version.valid_from)}.`
            : 'In Kraft und damit unveränderlich. Eine Preisänderung ist eine neue Preisliste.'
          : // Wer nichts ändern kann, liest keinen Satz übers Ändern (ABR-17).
            darfPflegen
            ? 'Entwurf. Änderbar, solange die Liste nicht in Kraft ist.'
            : undefined
      }
      rahmen={!bearbeitbar}
    >
      <Tarif version={version} bearbeitbar={bearbeitbar} />
      {!bearbeitbar ? (
        <ul className="divide-line divide-y">
          {positionen.data.length === 0 ? (
            <li className="text-ink-muted py-3 text-sm">Noch keine Position.</li>
          ) : null}
          {positionen.data.map((position) => (
            <li key={position.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="text-ink w-16 shrink-0 text-sm font-medium tabular-nums">
                {position.code}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink text-liste block">{position.label}</span>
                <span className="text-ink-muted mt-0.5 block text-sm">
                  {bereichLabels[position.service_area]}
                  {/* Die Art nur, wo sie etwas unterscheidet (ABR-B06): Sonst
                      stand da „Behandlung · Behandlung". */}
                  {position.item_kind === 'absence_fee' ? ` · ${artLabels.absence_fee}` : ''} ·{' '}
                  {steuerLabels[position.tax_treatment]}
                  {position.tax_treatment === 'taxable'
                    ? ` (${position.tax_rate_permille / 10} %)`
                    : ''}
                </span>
              </span>
              <span className="text-ink text-liste shrink-0 font-medium tabular-nums">
                {formatEuro(position.unit_price_cents, position.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-6">
          <Fehlerzusammenfassung fehler={zusammenfassung} />

          {(zeilen ?? []).map((zeile, index) => (
            <Positionszeile
              // Die Reihenfolge IST die Kennung: Eine Zeile im Entwurf hat
              // noch keine eigene, und die Liste wird vollständig ersetzt.
              key={index}
              index={index}
              zeile={zeile}
              fehler={sichtbareFehler(index, zeile)}
              onChange={(neu) =>
                aendern((zeilen ?? []).map((wert, i) => (i === index ? neu : wert)))
              }
              onVerlassen={(feld) => beruehren(index, feld)}
              onEntfernen={() => {
                aendern((zeilen ?? []).filter((_, i) => i !== index));
                // Die Kennungen folgen der Reihenfolge; was „verlassen" war,
                // gilt nach dem Entfernen nicht mehr für dieselbe Zeile.
                setBeruehrt(new Set());
                setPruefungBis((bis) => (index < bis ? bis - 1 : bis));
              }}
            />
          ))}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => aendern([...(zeilen ?? []), leereZeile()])}
            >
              Position hinzufügen
            </Button>
            {/* Nicht mehr gesperrt, solange eine Zeile fehlerhaft ist: Der
                Tipp zeigt, was fehlt und wo (ABR-21). Primär, wenn es etwas
                zu speichern gibt (ABR-24). */}
            <Button
              type="button"
              variant={ungespeichert ? 'primary' : 'secondary'}
              onClick={speichernVersuchen}
              disabled={speichern.isPending || (zeilen ?? []).length === 0}
            >
              {speichern.isPending ? 'Wird gespeichert …' : 'Entwurf speichern'}
            </Button>
          </div>

          {speichern.isError ? (
            <Statusmeldung ton="fehler">
              {speichern.error.message} Die Eingaben stehen noch im Formular. Bitte die Verbindung
              prüfen und erneut speichern.
            </Statusmeldung>
          ) : null}
          {gespeichert && !ungespeichert && !speichern.isError ? (
            <Statusmeldung ton="erfolg">Entwurf gespeichert.</Statusmeldung>
          ) : null}

          {ungespeichert ? (
            <Statusmeldung ton="warnung">
              Es gibt ungespeicherte Änderungen. Bitte zuerst den Entwurf speichern – in Kraft
              gesetzt wird der gespeicherte Stand.
            </Statusmeldung>
          ) : null}

          {schutz.schutz}

          <div className="border-line flex flex-wrap gap-3 border-t pt-4">
            {ungespeichert || ohnePosition ? (
              // Gesperrt statt Rückfrage: Die Rückfrage erklärt, was
              // unumkehrbar wird — sie ist nicht der Ort, an dem man erfährt,
              // dass die eigene Änderung gar nicht mitginge (R3-007), oder
              // dass der Server eine leere Liste abweist (ABR-03). Der Grund
              // steht jeweils daneben.
              <Button type="button" variant="secondary" disabled>
                In Kraft setzen
              </Button>
            ) : (
              <Rueckfrage
                ausloeser="In Kraft setzen"
                ausloeserVariante="primary"
                bestaetigen="In Kraft setzen"
                bestaetigenLaeuft="Wird in Kraft gesetzt …"
                laeuft={inKraft.isPending}
                fehler={
                  inKraft.isError
                    ? `${inKraft.error.message} Bitte die Verbindung prüfen und erneut versuchen.`
                    : undefined
                }
                // Mit Versprechen: Der Kasten bleibt offen, bis der Server
                // geantwortet hat, und zeigt einen Fehlschlag (ABR-03).
                onBestaetigen={() => inKraft.mutateAsync()}
                onAbbrechen={() => inKraft.reset()}
              >
                <p>
                  Mit dem Inkraftsetzen wird „{version.label}“ <strong>unveränderlich</strong>; sie
                  gilt für Leistungen ab {formatDate(version.valid_from)}. Eine spätere
                  Preisänderung ist eine neue Preisliste.
                </p>
              </Rueckfrage>
            )}
            <Rueckfrage
              ausloeser="Entwurf verwerfen"
              bestaetigen="Ja, Entwurf verwerfen"
              bestaetigenLaeuft="Wird verworfen …"
              laeuft={verwerfen.isPending}
              fehler={
                verwerfen.isError
                  ? `${verwerfen.error.message} Bitte die Verbindung prüfen und erneut versuchen.`
                  : undefined
              }
              onBestaetigen={() => verwerfen.mutateAsync()}
              onAbbrechen={() => verwerfen.reset()}
            >
              <p>Der Entwurf „{version.label}“ wird samt seinen Positionen gelöscht.</p>
            </Rueckfrage>
          </div>

          {ohnePosition ? (
            <Statusmeldung ton="warnung">
              Eine Preisliste ohne Position lässt sich nicht in Kraft setzen – sie wäre ab ihrem
              Beginn die geltende und ließe keine Leistung mehr erfassen.
            </Statusmeldung>
          ) : null}
        </div>
      )}
    </Section>
  );
}

/**
 * Der Tarif des Terminhonorars an der Preisliste (ABR-030, ADR-009 Punkt 22,
 * ANN-231).
 *
 * Je Behandlungstermin entsteht genau einmal dieses Honorar, es sei denn,
 * mit der Person ist ein anderes vereinbart. Die Preise der Heilmittel
 * darunter verändern es nicht; auf der Rechnung teilen sie es nur auf
 * (ANN-233). Gespeichert wird getrennt von den Positionen, eigener Knopf,
 * eigener Aufruf; mit dem Inkraftsetzen friert der Tarif mit der Liste ein.
 */
function Tarif({ version, bearbeitbar }: { version: KatalogVersion; bearbeitbar: boolean }) {
  const queryClient = useQueryClient();
  const [eingabe, setEingabe] = useState<string | null>(null);
  const [geprueft, setGeprueft] = useState(false);
  const wert =
    eingabe ?? (version.session_fee_cents === null ? '' : centZuEingabe(version.session_fee_cents));
  const cent = wert.trim() === '' ? null : parseEuroZuCent(wert);
  const fehler =
    geprueft && wert.trim() !== '' && cent === null
      ? 'Bitte einen Betrag in Euro eingeben oder das Feld leeren.'
      : undefined;

  const speichern = useMutation({
    mutationFn: () => setTarif(version.id, cent),
    onSuccess: async () => {
      setEingabe(null);
      setGeprueft(false);
      await queryClient.invalidateQueries({ queryKey: ['katalog-versionen'] });
    },
  });

  if (!bearbeitbar) {
    return version.session_fee_cents === null ? (
      <p className="text-ink-muted mb-3 text-sm">
        Kein Terminhonorar. Ohne Vereinbarung lassen sich an Terminen in dieser Zeit keine
        Heilmittel bestätigen.
      </p>
    ) : (
      <p className="text-ink text-liste mb-3">
        Terminhonorar je Behandlungstermin{' '}
        <strong className="font-medium tabular-nums">
          {formatEuro(version.session_fee_cents)}
        </strong>
      </p>
    );
  }

  const geaendert = eingabe !== null;
  return (
    <form
      className="border-line mb-6 flex flex-col gap-3 border-b pb-6"
      aria-label="Terminhonorar"
      onSubmit={(event) => {
        event.preventDefault();
        setGeprueft(true);
        if (wert.trim() !== '' && cent === null) return;
        speichern.mutate();
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-56">
          <Field
            label="Terminhonorar je Behandlungstermin"
            inputMode="decimal"
            value={wert}
            hint="in Euro, einschließlich Dokumentation und Hausbesuch"
            error={fehler}
            onChange={(event) => setEingabe(event.target.value)}
          />
        </div>
        <div>
          <Button
            type="submit"
            variant={geaendert ? 'primary' : 'secondary'}
            disabled={speichern.isPending || !geaendert}
          >
            {speichern.isPending ? 'Wird gespeichert …' : 'Terminhonorar speichern'}
          </Button>
        </div>
      </div>
      <p className="text-ink-muted text-sm">
        Gilt einmal je Termin, egal welche Heilmittel bestätigt werden. Die Preise der Heilmittel
        teilen es auf der Rechnung auf.
      </p>
      {speichern.isError ? (
        <Statusmeldung ton="fehler">
          {speichern.error.message} Bitte die Verbindung prüfen und erneut versuchen.
        </Statusmeldung>
      ) : null}
    </form>
  );
}

/**
 * Eine Position im Entwurf.
 *
 * Eine Gruppe mit Namen statt eines eigenen Kastens (ABR-33): Die Felder
 * stehen ohne Rahmen wie in jedem Formular, und „Position 3" sagt auch der
 * Vorlesesoftware, zu welcher Zeile ein „Preis" gehört. Meldungen stehen am
 * Feld, nicht als Alarm an der Karte (ABR-21).
 */
function Positionszeile({
  index,
  zeile,
  fehler,
  onChange,
  onVerlassen,
  onEntfernen,
}: {
  index: number;
  zeile: PositionsEingabe;
  fehler: Partial<Record<Positionsfeld, string>>;
  onChange: (zeile: PositionsEingabe) => void;
  onVerlassen: (feld: Feldschluessel) => void;
  onEntfernen: () => void;
}) {
  return (
    <div className="border-line border-t pt-4">
      <fieldset className="min-w-0">
        <legend className="text-ink mb-3 text-sm font-medium">Position {index + 1}</legend>

        <div className="flex flex-col gap-4">
          {/* `sm:items-end`: Ein Hinweis unter einer Beschriftung verschiebt
              das Feld daneben nicht mehr (ABR-12). */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="sm:w-28">
              <Field
                label="Kürzel"
                feldId={feldIdFuer(index, 'code')}
                value={zeile.code}
                error={fehler.code}
                onChange={(event) => onChange({ ...zeile, code: event.target.value })}
                onBlur={() => onVerlassen('code')}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Field
                label="Bezeichnung"
                feldId={feldIdFuer(index, 'label')}
                value={zeile.label}
                error={fehler.label}
                onChange={(event) => onChange({ ...zeile, label: event.target.value })}
                onBlur={() => onVerlassen('label')}
              />
            </div>
            <div className="sm:w-32">
              <Field
                label="Preis"
                feldId={feldIdFuer(index, 'preis')}
                inputMode="decimal"
                value={zeile.preis}
                error={fehler.preis}
                onChange={(event) => onChange({ ...zeile, preis: event.target.value })}
                onBlur={() => onVerlassen('preis')}
                hint="in Euro"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="sm:w-44">
              <Select
                label="Bereich"
                value={zeile.service_area}
                onChange={(event) => {
                  onChange({
                    ...zeile,
                    service_area: event.target.value as PositionsEingabe['service_area'],
                  });
                  onVerlassen('service_area');
                }}
                hint="Die Rechnung trägt genau einen."
              >
                <option value="therapy">{bereichLabels.therapy}</option>
                <option value="training">{bereichLabels.training}</option>
              </Select>
            </div>
            <div className="sm:w-44">
              <Select
                label="Art"
                value={zeile.item_kind}
                onChange={(event) => {
                  onChange({
                    ...zeile,
                    item_kind: event.target.value as PositionsEingabe['item_kind'],
                    remedy: event.target.value === 'absence_fee' ? '' : zeile.remedy,
                  });
                  onVerlassen('item_kind');
                }}
              >
                <option value="treatment">{artLabels.treatment}</option>
                <option value="absence_fee">{artLabels.absence_fee}</option>
              </Select>
            </div>
            <div className="sm:w-56">
              <Select
                label="Heilmittel"
                feldId={feldIdFuer(index, 'remedy')}
                value={zeile.remedy}
                error={fehler.remedy}
                disabled={zeile.item_kind === 'absence_fee'}
                onChange={(event) => {
                  onChange({ ...zeile, remedy: event.target.value });
                  onVerlassen('remedy');
                }}
                hint="Belegt die Leistungserfassung vor."
              >
                <option value="">Kein Heilmittel</option>
                {HEILMITTEL.map((heilmittel) => (
                  <option key={heilmittel.remedy} value={heilmittel.remedy}>
                    {heilmittel.beschriftung}
                  </option>
                ))}
                {zeile.remedy !== '' &&
                !HEILMITTEL.some((heilmittel) => heilmittel.remedy === zeile.remedy) ? (
                  <option value={zeile.remedy}>{zeile.remedy}</option>
                ) : null}
              </Select>
            </div>
            {/* Mindestens 256 px breit: Bleibt weniger, bricht die Steuer in
                eine eigene Zeile, statt bei 820 px auf 46 px zu schrumpfen
                (ABR-12). Am Handy steht ohnehin alles untereinander. */}
            <div className="min-w-0 sm:grow sm:basis-64">
              <Select
                label="Steuer"
                feldId={feldIdFuer(index, 'tax_treatment')}
                value={zeile.tax_treatment}
                error={fehler.tax_treatment}
                onChange={(event) => {
                  const wert = event.target.value as PositionsEingabe['tax_treatment'];
                  onChange({
                    ...zeile,
                    tax_treatment: wert,
                    tax_rate_permille: wert === 'taxable' ? STEUERSATZ_VORGABE : 0,
                  });
                  onVerlassen('tax_treatment');
                }}
              >
                <option value="exempt_healthcare">{steuerLabels.exempt_healthcare}</option>
                <option value="taxable">{steuerLabels.taxable}</option>
                <option value="not_taxable">{steuerLabels.not_taxable}</option>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onEntfernen}>
              Position entfernen
            </Button>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
