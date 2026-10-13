import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Chip } from '@/components/ui/Chip';
import { Formularfuss } from '@/components/ui/Formularfuss';
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
  monateText,
  publishKatalogVersion,
  setTarif,
  steuerLabels,
  writeKatalogPositionen,
  type KatalogPosition,
  type KatalogVersion,
  type PositionsEingabe,
} from './api';
import { Eintraege, Eintrag } from './Eintraege';

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
    laufzeit: '',
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
    laufzeit: position.package_months === null ? '' : String(position.package_months),
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
    laufzeit: zeile.laufzeit.trim(),
  };
}

/** ANG-005: die Laufzeit eines Trainingspakets in ganzen Monaten, 1 bis 24; sonst null. */
function laufzeitMonate(text: string): number | null {
  const wert = text.trim();
  if (!/^\d{1,2}$/.test(wert)) return null;
  const monate = Number(wert);
  return monate >= 1 && monate <= 24 ? monate : null;
}

function gleich(a: readonly PositionsEingabe[], b: readonly PositionsEingabe[]): boolean {
  return JSON.stringify(a.map(vergleichswert)) === JSON.stringify(b.map(vergleichswert));
}

/** Die Felder einer Position, an denen eine Meldung stehen kann. */
type Positionsfeld = 'code' | 'label' | 'preis' | 'remedy' | 'tax_treatment' | 'laufzeit';
/** Dazu die Felder, deren Änderung eine Meldung anderswo auslöst. */
type Feldschluessel = Positionsfeld | 'service_area' | 'item_kind';

const FELDNAMEN: Record<Positionsfeld, string> = {
  code: 'Kürzel',
  label: 'Bezeichnung',
  preis: 'Preis',
  remedy: 'Heilmittel',
  tax_treatment: 'Steuer',
  laufzeit: 'Laufzeit',
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
  laufzeit: ['laufzeit'],
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
  // ANG-002 (ANN-269): Der Abo-Monat ist Behandlung, ohne Heilmittel und bis
  // zur Antwort der Steuerberatung steuerpflichtig zum Regelsatz.
  if (
    zeile.item_kind === 'aftercare_month' &&
    (zeile.service_area !== 'therapy' ||
      zeile.tax_treatment !== 'taxable' ||
      zeile.tax_rate_permille !== STEUERSATZ_VORGABE)
  )
    fehler.push({
      feld: 'tax_treatment',
      meldung:
        'Das Nachsorge-Abo gehört zur Behandlung und ist bis zur Klärung mit der Steuerberatung umsatzsteuerpflichtig.',
    });
  // ANG-005 (ANN-275): Das Trainingspaket ist Training mit Laufzeit und bis zur
  // Antwort der Steuerberatung steuerpflichtig zum Regelsatz.
  if (zeile.item_kind === 'training_package' && laufzeitMonate(zeile.laufzeit) === null)
    fehler.push({ feld: 'laufzeit', meldung: 'Bitte die Laufzeit in Monaten eingeben, 1 bis 24.' });
  if (
    zeile.item_kind === 'training_package' &&
    (zeile.service_area !== 'training' ||
      zeile.tax_treatment !== 'taxable' ||
      zeile.tax_rate_permille !== STEUERSATZ_VORGABE)
  )
    fehler.push({
      feld: 'tax_treatment',
      meldung:
        'Das Trainingspaket gehört zum Training und ist bis zur Klärung mit der Steuerberatung umsatzsteuerpflichtig.',
    });
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
  const [neuOffen, setNeuOffen] = useState(false);
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
        // Kompakt im Kopf (DESIGN.md „Liste“) und sekundär: Der Hauptknopf
        // gehört der Aktion, die der Entwurf darunter gerade erwartet (ABR-24).
        actions={
          darfPflegen && !neuOffen ? (
            <Button type="button" variant="secondary" onClick={() => setNeuOffen(true)}>
              Neue Preisliste
            </Button>
          ) : undefined
        }
      />

      {darfPflegen && neuOffen ? (
        <NeuePreisliste
          vorlage={versionen.data?.find((version) => version.published_at) ?? null}
          zeitzone={user.organizationTimeZone}
          onSchliessen={() => setNeuOffen(false)}
          onAngelegt={async (id) => {
            setNeuOffen(false);
            await queryClient.invalidateQueries({ queryKey: ['katalog-versionen'] });
            wechseln(id);
          }}
        />
      ) : null}

      <Abfragezustand
        abfrage={versionen}
        laden="Preislisten werden geladen …"
        fehler="Die Preislisten konnten nicht geladen werden."
        leer={{
          wenn: (liste) => liste.length === 0,
          titel: 'Noch keine Preisliste',
          beschreibung: darfPflegen
            ? 'Ohne eine in Kraft gesetzte Preisliste lässt sich keine Leistung erfassen.'
            : 'Ohne eine in Kraft gesetzte Preisliste lässt sich keine Leistung erfassen. Preislisten legt die Praxisinhaber:in an.',
        }}
      >
        {(liste) => (
          <Section titel="Preislisten">
            {/* Welche Liste unten steht: genau eine ist gewählt, sichtbar mit
                Fläche und ✓ (ABR-13) - als Chips, die am Telefon umbrechen. */}
            <div role="group" aria-label="Preisliste wählen" className="flex flex-wrap gap-2">
              {liste.map((version) => (
                <Chip
                  key={version.id}
                  gewaehlt={aktuelle?.id === version.id}
                  onClick={() => wechseln(version.id)}
                >
                  {version.label}
                  <Listenstand version={version} heute={heute} />
                </Chip>
              ))}
            </div>

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
        )}
      </Abfragezustand>

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
 * gesetzt mit einem Beginn nach dem heutigen Praxistag, dann „gilt ab …".
 * Welche Liste eine neuere abgelöst hat, sagt die Seite nicht: Das wäre eine
 * zweite Ableitung neben der des Servers. Im Chip als leiser Zusatz.
 */
function Listenstand({ version, heute }: { version: KatalogVersion; heute: string | null }) {
  const text =
    version.published_at === null
      ? 'Entwurf'
      : heute !== null && version.valid_from > heute
        ? `Gilt ab ${formatDate(version.valid_from)}`
        : 'In Kraft';
  return <span className="text-ink-muted font-medium">· {text}</span>;
}

/**
 * Die Rückfrage vor dem Wechsel zu einer anderen Liste, solange im Entwurf
 * ungespeicherte Zeilen stehen (ABR-14). Dieselbe Form und dieselben Wege wie
 * der Verlustschutz beim Verlassen der Seite, nur ohne Speichern: Speichern
 * ist der Knopf am Entwurf. Eine Zeile mit Linie links wie die `Rueckfrage`,
 * kein eigener Kasten (L2).
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
      className="border-line-strong bg-surface-sunken mt-3 border-l-4 py-3 pr-4 pl-4"
    >
      <p className="text-ink text-sm">
        Die Änderungen an „{bisher}“ sind noch nicht gespeichert. Beim Wechsel zu „{ziel}“ gehen sie
        verloren.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button type="button" variant="secondary" groesse="kompakt" onClick={onVerwerfen}>
          Verwerfen und wechseln
        </Button>
        <Button type="button" variant="quiet" groesse="kompakt" onClick={onBleiben}>
          Hier bleiben
        </Button>
      </div>
    </div>
  );
}

function NeuePreisliste({
  vorlage,
  zeitzone,
  onSchliessen,
  onAngelegt,
}: {
  vorlage: KatalogVersion | null;
  zeitzone: string | null;
  onSchliessen: () => void;
  onAngelegt: (id: string) => void | Promise<void>;
}) {
  const [label, setLabel] = useState('');
  // Der Praxistag, nicht der UTC-Tag: Zwischen Mitternacht und 01:00/02:00
  // Ortszeit wäre das sonst der Vortag — und genau so gespeichert (R3-006).
  const [gueltigAb, setGueltigAb] = useState(zeitzone ? todayInTimeZone(zeitzone) : '');
  const [kopieren, setKopieren] = useState(true);

  const anlegen = useMutation({
    mutationFn: () =>
      createKatalogVersion(label, gueltigAb, kopieren && vorlage ? vorlage.id : null),
    onSuccess: async (id) => {
      setLabel('');
      await onAngelegt(id);
    },
  });

  return (
    <Section titel="Neue Preisliste" ebene={2}>
      <div className="max-w-formular">
        <Feldgruppe>
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
          {anlegen.isError ? (
            <Statusmeldung ton="fehler">
              {anlegen.error.message} {VERBINDUNG_PRUEFEN}
            </Statusmeldung>
          ) : null}
        </Feldgruppe>
        <Formularfuss>
          <Button
            type="button"
            onClick={() => anlegen.mutate()}
            disabled={label.trim() === '' || anlegen.isPending}
          >
            {anlegen.isPending ? 'Wird angelegt …' : 'Entwurf anlegen'}
          </Button>
          <Button type="button" variant="quiet" onClick={onSchliessen}>
            Abbrechen
          </Button>
        </Formularfuss>
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
  // Welche Positionen als Formular offen stehen (Bearbeiten auf Abruf).
  const [offen, setOffen] = useState<ReadonlySet<number>>(new Set());

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
          package_months:
            zeile.item_kind === 'training_package' ? laufzeitMonate(zeile.laufzeit) : null,
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
        description={VERBINDUNG_PRUEFEN}
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

  /**
   * Ist die Position als Formular offen? Auf Abruf („Bearbeiten“), eine neue
   * sofort - und jede, an der eine Meldung steht: Die Zusammenfassung über der
   * Liste führt zu ihren Feldern, und ein zugeklapptes Feld fände sie nicht.
   */
  function istOffen(index: number, zeile: PositionsEingabe): boolean {
    return offen.has(index) || Object.keys(sichtbareFehler(index, zeile)).length > 0;
  }

  function umschalten(index: number) {
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(index)) neu.delete(index);
      else neu.add(index);
      return neu;
    });
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
    >
      <Tarif version={version} bearbeitbar={bearbeitbar} />
      {!bearbeitbar ? (
        // Die Liste der Positionen - Kürzel, Bezeichnung, Bereich und Steuer,
        // Preis (DESIGN.md „Liste“); nichts zum Ändern (ADR-009 Punkt 5).
        positionen.data.length === 0 ? (
          <EmptyState inKarte title="Noch keine Position" />
        ) : (
          <Eintraege beschriftung={`Positionen der ${version.label}`}>
            {positionen.data.map((position) => (
              <Eintrag
                key={position.id}
                titel={position.label}
                meta={`${position.code} · ${positionsMeta(position)}`}
                betrag={formatEuro(position.unit_price_cents, position.currency)}
              />
            ))}
          </Eintraege>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <Fehlerzusammenfassung fehler={zusammenfassung} />

          {/* Jede Position als Zeile; ihr Formular auf Abruf (DESIGN.md
              „Liste → Detail“). Bis dahin stand jede als offenes Formular mit
              sieben Feldern da - 5.588 px am Telefon. */}
          {(zeilen ?? []).length > 0 ? (
            <Eintraege beschriftung={`Positionen der ${version.label}`}>
              {(zeilen ?? []).map((zeile, index) => {
                const auf = istOffen(index, zeile);
                const fehler = sichtbareFehler(index, zeile);
                const cent = parseEuroZuCent(zeile.preis);
                return (
                  <Eintrag
                    // Die Reihenfolge IST die Kennung: Eine Zeile im Entwurf hat
                    // noch keine eigene, und die Liste wird vollständig ersetzt.
                    key={index}
                    titel={zeile.label.trim() || `Position ${index + 1}`}
                    meta={`${zeile.code.trim() || 'ohne Kürzel'} · ${positionsMeta({
                      ...zeile,
                      package_months: laufzeitMonate(zeile.laufzeit),
                    })}`}
                    betrag={cent === null ? zeile.preis || '–' : formatEuro(cent)}
                    status={
                      Object.keys(fehler).length > 0 ? (
                        <Badge ton="warnung">Unvollständig</Badge>
                      ) : undefined
                    }
                    // Die ganze Zeile öffnet ihr Formular; mit Meldungen bleibt
                    // es offen, bis die Angaben stimmen.
                    aufklappen={{
                      offen: auf,
                      onUmschalten: () => umschalten(index),
                      gesperrt: auf && Object.keys(fehler).length > 0,
                    }}
                  >
                    {auf ? (
                      <Positionsformular
                        index={index}
                        zeile={zeile}
                        fehler={fehler}
                        onChange={(neu) =>
                          aendern((zeilen ?? []).map((wert, i) => (i === index ? neu : wert)))
                        }
                        onVerlassen={(feld) => beruehren(index, feld)}
                        onEntfernen={() => {
                          aendern((zeilen ?? []).filter((_, i) => i !== index));
                          // Die Kennungen folgen der Reihenfolge; was „verlassen"
                          // war oder offen stand, gilt nach dem Entfernen nicht
                          // mehr für dieselbe Zeile.
                          setBeruehrt(new Set());
                          setOffen(
                            (alt) =>
                              new Set(
                                [...alt]
                                  .filter((i) => i !== index)
                                  .map((i) => (i > index ? i - 1 : i)),
                              ),
                          );
                          setPruefungBis((bis) => (index < bis ? bis - 1 : bis));
                        }}
                      />
                    ) : null}
                  </Eintrag>
                );
              })}
            </Eintraege>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => {
                const neu = (zeilen ?? []).length;
                aendern([...(zeilen ?? []), leereZeile()]);
                // Eine neue Position steht gleich offen - sie ist noch leer.
                setOffen((alt) => new Set(alt).add(neu));
              }}
            >
              Position hinzufügen
            </Button>
            {/* Nicht mehr gesperrt, solange eine Zeile fehlerhaft ist: Der
                Tipp zeigt, was fehlt und wo (ABR-21). Primär, wenn es etwas
                zu speichern gibt (ABR-24). */}
            <Button
              type="button"
              variant={ungespeichert ? 'primary' : 'secondary'}
              groesse="kompakt"
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

          <div className="border-line mt-4 flex flex-col gap-3 border-t pt-4">
            <div>
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
                    inKraft.isError ? `${inKraft.error.message} ${VERBINDUNG_PRUEFEN}` : undefined
                  }
                  // Mit Versprechen: Der Kasten bleibt offen, bis der Server
                  // geantwortet hat, und zeigt einen Fehlschlag (ABR-03).
                  onBestaetigen={() => inKraft.mutateAsync()}
                  onAbbrechen={() => inKraft.reset()}
                >
                  <p>
                    Mit dem Inkraftsetzen wird „{version.label}“ <strong>unveränderlich</strong>;
                    sie gilt für Leistungen ab {formatDate(version.valid_from)}. Eine spätere
                    Preisänderung ist eine neue Preisliste.
                  </p>
                </Rueckfrage>
              )}
            </div>

            {ohnePosition ? (
              <Statusmeldung ton="warnung">
                Eine Preisliste ohne Position lässt sich nicht in Kraft setzen – sie wäre ab ihrem
                Beginn die geltende und ließe keine Leistung mehr erfassen.
              </Statusmeldung>
            ) : null}

            {/* Zerstörendes leise am Ende (DESIGN.md, Lücke 9.16). */}
            <div>
              <Rueckfrage
                ausloeser="Entwurf verwerfen"
                ausloeserVariante="quiet"
                bestaetigen="Ja, Entwurf verwerfen"
                bestaetigenLaeuft="Wird verworfen …"
                laeuft={verwerfen.isPending}
                fehler={
                  verwerfen.isError ? `${verwerfen.error.message} ${VERBINDUNG_PRUEFEN}` : undefined
                }
                onBestaetigen={() => verwerfen.mutateAsync()}
                onAbbrechen={() => verwerfen.reset()}
              >
                <p>Der Entwurf „{version.label}“ wird samt seinen Positionen gelöscht.</p>
              </Rueckfrage>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

/**
 * Die Nebenzeile einer Position: Bereich, Art (nur wo sie etwas
 * unterscheidet, ABR-B06 - sonst stand da „Behandlung · Behandlung“) und
 * Steuer. Dieselbe Zeile für die geltende Liste und den Entwurf.
 */
function positionsMeta(position: {
  service_area: KatalogPosition['service_area'];
  item_kind: KatalogPosition['item_kind'];
  package_months: number | null;
  tax_treatment: KatalogPosition['tax_treatment'];
  tax_rate_permille: number;
}): string {
  return [
    bereichLabels[position.service_area],
    position.item_kind === 'absence_fee' ? artLabels.absence_fee : null,
    position.item_kind === 'training_package'
      ? `${artLabels.training_package}, ${monateText(position.package_months ?? 0)}`
      : null,
    `${steuerLabels[position.tax_treatment]}${
      position.tax_treatment === 'taxable' ? ` (${position.tax_rate_permille / 10} %)` : ''
    }`,
  ]
    .filter(Boolean)
    .join(' · ');
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
        <div className="sm:w-80">
          <Field
            label="Terminhonorar je Behandlungstermin"
            inputMode="decimal"
            value={wert}
            hint="in Euro, einmal je Termin, einschließlich Dokumentation und Hausbesuch"
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
      {speichern.isError ? (
        <Statusmeldung ton="fehler">
          {speichern.error.message} {VERBINDUNG_PRUEFEN}
        </Statusmeldung>
      ) : null}
    </form>
  );
}

/**
 * Das Formular einer Position im Entwurf, unter ihrer Zeile (Bearbeiten auf
 * Abruf, Design-Rollout B6).
 *
 * Eine Gruppe mit Namen statt eines eigenen Kastens (ABR-33): Die Felder
 * stehen ohne Rahmen wie in jedem Formular, und „Position 3" sagt auch der
 * Vorlesesoftware, zu welcher Zeile ein „Preis" gehört - sichtbar steht der
 * Name schon in der Zeile darüber. Meldungen stehen am Feld, nicht als Alarm
 * an der Karte (ABR-21).
 */
function Positionsformular({
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
    <div className="max-w-formular pt-2">
      <fieldset className="min-w-0">
        <legend className="sr-only">Position {index + 1}</legend>

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
                  const art = event.target.value as PositionsEingabe['item_kind'];
                  onChange({
                    ...zeile,
                    item_kind: art,
                    remedy: art === 'treatment' ? zeile.remedy : '',
                    laufzeit: art === 'training_package' ? zeile.laufzeit : '',
                    // ANG-002 (ANN-269): Der Abo-Monat ist Behandlung und
                    // steuerpflichtig; verbindlich prüft die Datenbank.
                    ...(art === 'aftercare_month'
                      ? {
                          service_area: 'therapy' as const,
                          tax_treatment: 'taxable' as const,
                          tax_rate_permille: STEUERSATZ_VORGABE,
                        }
                      : {}),
                    // ANG-005 (ANN-275): Das Paket ist Training und steuerpflichtig.
                    ...(art === 'training_package'
                      ? {
                          service_area: 'training' as const,
                          tax_treatment: 'taxable' as const,
                          tax_rate_permille: STEUERSATZ_VORGABE,
                        }
                      : {}),
                  });
                  onVerlassen('item_kind');
                }}
              >
                <option value="treatment">{artLabels.treatment}</option>
                <option value="absence_fee">{artLabels.absence_fee}</option>
                <option value="aftercare_month">{artLabels.aftercare_month}</option>
                <option value="training_package">{artLabels.training_package}</option>
              </Select>
            </div>
            {zeile.item_kind === 'training_package' ? (
              <div className="sm:w-32">
                <Field
                  label="Laufzeit"
                  feldId={feldIdFuer(index, 'laufzeit')}
                  inputMode="numeric"
                  value={zeile.laufzeit}
                  error={fehler.laufzeit}
                  onChange={(event) => onChange({ ...zeile, laufzeit: event.target.value })}
                  onBlur={() => onVerlassen('laufzeit')}
                  hint="in Monaten"
                />
              </div>
            ) : null}
            <div className="sm:w-56">
              <Select
                label="Heilmittel"
                feldId={feldIdFuer(index, 'remedy')}
                value={zeile.remedy}
                error={fehler.remedy}
                disabled={zeile.item_kind !== 'treatment'}
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

          {/* Zerstörendes leise am Ende (DESIGN.md, Lücke 9.16). */}
          <div>
            <Button type="button" variant="quiet" groesse="kompakt" onClick={onEntfernen}>
              Position entfernen
            </Button>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
