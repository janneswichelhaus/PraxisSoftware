import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Badge, type Ton } from '@/components/ui/Badge';
import { DataList, DataRow, Disclosure } from '@/components/ui/Card';
import { Datenliste, type Datenspalte } from '@/components/ui/Datenliste';
import { EmptyState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { roleLabels } from '@/components/ui/roleLabels';
import type { CurrentUser } from '@/features/session/types';
import {
  mitarbeiterName,
  useVorschau,
  type Protokolleintrag,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { darfEntscheiden, vorschauidentitaet } from '@/features/preview/identitaet';
import { SignaturFeld } from '@/features/preview/SignaturFeld';
import { SimulationsMeldung } from '@/features/preview/ui';
import { formatDatum, formatEuro, formatMonat, parseEuroZuCent } from '@/features/preview/format';
import {
  erstattungsstandLabels,
  type Erstattung,
  type Erstattungsart,
  type Erstattungsstand,
} from '@/features/preview/types';

/**
 * Erstattungen.
 *
 * Übernahme aus der Team-App: Strom- und Einkaufserstattung, IBAN, Zeitraum,
 * Arbeitstage mit Berechnung, Positionen mit Summe, Belege, Erklärung,
 * Unterschrift, Historie je Person und Bearbeitungsstände.
 *
 * Eine bewusste Abweichung: Die Vorlage kennt nur „offen" und „erstattet".
 * Einreichen, Entscheiden und tatsächliches Auszahlen sind aber verschiedene
 * Vorgänge - „genehmigt" heißt nicht „ausgezahlt". Der Ablauf hier trennt
 * sie, weil die zusammengefasste Variante genau den Fehler begünstigt, den
 * eine Erstattungsprüfung verhindern soll.
 */

const standTon: Record<Erstattungsstand, Ton> = {
  eingereicht: 'warnung',
  genehmigt: 'positiv',
  abgelehnt: 'kritisch',
  ausgezahlt: 'positiv',
};

/** Eine Akkuladung je Arbeitstag, wie in der Vorlage. */
const KWH_PRO_ARBEITSTAG = 0.5;

function betragCent(erstattung: Erstattung, stromsatzCent: number): number {
  if (erstattung.art === 'strom') {
    return Math.round(erstattung.arbeitstage * KWH_PRO_ARBEITSTAG * stromsatzCent);
  }
  return erstattung.positionen.reduce((summe, position) => summe + position.betragCent, 0);
}

export function ReimbursementsPage({ user }: { user: CurrentUser }) {
  const { zustand, simuliere } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);
  const entscheidungsrecht = darfEntscheiden(user);

  const [formular, setFormular] = useState(false);
  const [filter, setFilter] = useState<'alle' | Erstattungsstand>('alle');
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);

  const sichtbar = zustand.erstattungen.filter(
    (erstattung) => filter === 'alle' || erstattung.stand === filter,
  );
  const offenCent = zustand.erstattungen
    .filter((erstattung) => erstattung.stand !== 'ausgezahlt' && erstattung.stand !== 'abgelehnt')
    .reduce((summe, erstattung) => summe + betragCent(erstattung, zustand.stromsatzCent), 0);

  function entscheiden(erstattung: Erstattung, neuerStand: Erstattungsstand, grund = '') {
    const name = mitarbeiterName(zustand, erstattung.mitarbeiterId);
    const folgenText: Record<Erstattungsstand, string[]> = {
      eingereicht: ['Antrag wieder als eingereicht geführt'],
      genehmigt: [
        `Antrag von ${name} als genehmigt vermerkt`,
        'Die Auszahlung ist damit ausdrücklich noch nicht erfolgt',
      ],
      abgelehnt: [`Antrag von ${name} abgelehnt: ${grund || 'ohne Angabe'}`],
      ausgezahlt: [
        `Auszahlung an ${name} vermerkt`,
        'Der Vorgang gilt in der Vorschau als abgeschlossen',
      ],
    };

    const eintrag = simuliere(
      {
        bereich: 'Erstattungen',
        vorgang: `${erstattungsstandLabels[neuerStand]}: ${name}`,
        folgen: folgenText[neuerStand],
        nichtGeschehen: [
          'Keine Überweisung ausgelöst und keine Buchhaltung informiert',
          'Keine Benachrichtigung an die einreichende Person',
        ],
      },
      (stand) => ({
        ...stand,
        erstattungen: stand.erstattungen.map((eintragErstattung) =>
          eintragErstattung.id === erstattung.id
            ? {
                ...eintragErstattung,
                stand: neuerStand,
                entschiedenVon:
                  neuerStand === 'genehmigt' || neuerStand === 'abgelehnt'
                    ? user.profile.display_name
                    : eintragErstattung.entschiedenVon,
                entschiedenAm:
                  neuerStand === 'genehmigt' || neuerStand === 'abgelehnt'
                    ? stand.stichtag
                    : eintragErstattung.entschiedenAm,
                ausgezahltAm: neuerStand === 'ausgezahlt' ? stand.stichtag : '',
                ablehnungsgrund: neuerStand === 'abgelehnt' ? grund : '',
              }
            : eintragErstattung,
        ),
      }),
    );
    setMeldung(eintrag);
  }

  if (formular) {
    return (
      <Erstattungsformular
        user={user}
        onFertig={(eintrag) => {
          setMeldung(eintrag);
          setFormular(false);
        }}
        onAbbrechen={() => setFormular(false)}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Erstattungen"
        description="Stromkosten für das Laden der Diensträder und ausgelegte Einkäufe."
        actions={<Button onClick={() => setFormular(true)}>Erstattung einreichen</Button>}
      />

      <SimulationsMeldung eintrag={meldung} />

      {/* Wem „(Sie)" gehört, steht dabei (VOR-07): In der Vorschau ist das
          angemeldete Konto einer Demoperson zugeordnet, und ohne diesen Satz
          markierte „(ich)" scheinbar eine fremde Person. */}
      {identitaet ? (
        <p className="text-ink-muted mb-4 max-w-prose text-sm">
          Ihre Erstattungen in der Vorschau sind die von {identitaet.person.name}
          {identitaet.ueberNamen ? '' : ' (Demoperson zur Rolle)'}
          {zustand.erstattungen.some(
            (erstattung) => erstattung.mitarbeiterId === identitaet.person.id,
          )
            ? ', markiert mit „(Sie)“.'
            : '; bisher liegt keine vor.'}
        </p>
      ) : null}

      {/* Der Filter am Telefon hinter „Filter“, die offene Summe als Zeile
          über der Liste (DESIGN.md „Liste“, ANN-405). */}
      <Filterleiste
        beschriftung="Erstattungen filtern"
        gesetzt={filter === 'alle' ? 0 : 1}
        onZuruecksetzen={() => setFilter('alle')}
        ergebnis={
          <>
            Offene Erstattungen: <strong className="text-ink">{formatEuro(offenCent)}</strong>
          </>
        }
      >
        <Select
          label="Bearbeitungsstand"
          value={filter}
          onChange={(event) => setFilter(event.target.value as 'alle' | Erstattungsstand)}
        >
          <option value="alle">Alle</option>
          {(Object.keys(erstattungsstandLabels) as Erstattungsstand[]).map((stand) => (
            <option key={stand} value={stand}>
              {erstattungsstandLabels[stand]}
            </option>
          ))}
        </Select>
      </Filterleiste>

      {sichtbar.length === 0 ? (
        <EmptyState inKarte title="Keine Einträge" />
      ) : (
        // Die Anträge als Datenliste (DESIGN.md „Datenliste“, vorher eine
        // Karte je Antrag): ab 1024 px Spalten, darunter je Antrag eine Zeile
        // mit Betrag oben rechts.
        <Datenliste
          beschriftung="Erstattungen"
          zeilen={sichtbar}
          schluessel={(erstattung) => erstattung.id}
          spalten={erstattungsspalten({
            eigene: identitaet?.person.id ?? null,
            entscheidungsrecht,
            onEntscheiden: entscheiden,
          })}
        />
      )}

      <div className="mt-8 flex flex-col gap-3">
        <Historie />

        <Disclosure summary="Berechnung der Stromerstattung" inKarte>
          <DataList>
            <DataRow label="Ladung je Arbeitstag">{KWH_PRO_ARBEITSTAG} kWh</DataRow>
            <DataRow label="Satz je kWh">{formatEuro(zustand.stromsatzCent)}</DataRow>
            <DataRow label="Formel">Arbeitstage × 0,5 kWh × Satz</DataRow>
          </DataList>
          {/* Ehrlich über die Herkunft der Zahl (Vorschau): keine Vorgabe. */}
          <Kleingedrucktes className="mt-3">
            Die Pauschale stammt aus der Vorlage und ist eine betriebliche Regel, kein allgemein
            gültiger Verbrauchswert und keine rechtliche Vorgabe. Sie muss für diesen Betrieb
            gesondert entschieden werden.
          </Kleingedrucktes>
        </Disclosure>
      </div>
    </>
  );
}

interface Zeilenkontext {
  /** Die Demoperson des angemeldeten Kontos, markiert mit „(Sie)". */
  eigene: string | null;
  entscheidungsrecht: boolean;
  onEntscheiden: (erstattung: Erstattung, stand: Erstattungsstand, grund?: string) => void;
}

/**
 * Die Spalten eines Antrags: wer und was, der Stand als Zeichen und Wort, die
 * Einzelheiten samt Entscheidung an Ort und Stelle (Leitfaden L3), der
 * Betrag.
 */
function erstattungsspalten(kontext: Zeilenkontext): Datenspalte<Erstattung>[] {
  return [
    {
      titel: 'Antrag',
      breite: '14rem',
      telefon: 'kopf',
      inhalt: (erstattung) => <Antragskopf erstattung={erstattung} eigene={kontext.eigene} />,
    },
    {
      titel: 'Stand',
      breite: '9rem',
      inhalt: (erstattung) => (
        <Badge ton={standTon[erstattung.stand]}>{erstattungsstandLabels[erstattung.stand]}</Badge>
      ),
    },
    {
      titel: 'Einzelheiten',
      inhalt: (erstattung) => (
        <Einzelheiten
          erstattung={erstattung}
          entscheidungsrecht={kontext.entscheidungsrecht}
          onEntscheiden={kontext.onEntscheiden}
        />
      ),
    },
    {
      titel: 'Betrag',
      breite: '7rem',
      rechts: true,
      telefon: 'ende',
      inhalt: (erstattung) => <Antragsbetrag erstattung={erstattung} />,
    },
  ];
}

function Antragskopf({ erstattung, eigene }: { erstattung: Erstattung; eigene: string | null }) {
  const { zustand } = useVorschau();
  return (
    <span className="block">
      <span className="text-ink text-liste block font-semibold">
        {mitarbeiterName(zustand, erstattung.mitarbeiterId)}
        {eigene === erstattung.mitarbeiterId ? ' (Sie)' : ''}
      </span>
      <span className="text-ink-muted block text-sm">
        {erstattung.art === 'strom' ? 'Stromkosten' : 'Einkauf'} ·{' '}
        {formatDatum(erstattung.eingereichtAm)}
      </span>
    </span>
  );
}

function Antragsbetrag({ erstattung }: { erstattung: Erstattung }) {
  const { zustand } = useVorschau();
  return formatEuro(betragCent(erstattung, zustand.stromsatzCent));
}

/**
 * Was den Antrag ausmacht, was mit ihm geschehen ist - und die Entscheidung.
 * Die Aktionen nur, wo es etwas zu entscheiden gibt (VOR-24).
 */
function Einzelheiten({
  erstattung,
  entscheidungsrecht,
  onEntscheiden,
}: {
  erstattung: Erstattung;
  entscheidungsrecht: boolean;
  onEntscheiden: (erstattung: Erstattung, stand: Erstattungsstand, grund?: string) => void;
}) {
  const [ablehnung, setAblehnung] = useState('');
  const [ablehnenOffen, setAblehnenOffen] = useState(false);
  const hatAktion =
    entscheidungsrecht && (erstattung.stand === 'eingereicht' || erstattung.stand === 'genehmigt');

  // In einer Zeile: der Zeitraum ausgeschrieben statt als Wert des
  // Eingabefelds („2026-08", VOR-24), keine Zeile „Positionen: N" - die
  // Positionen stehen darunter (UX-005i).
  const angaben = [
    erstattung.art === 'strom'
      ? `${formatMonat(erstattung.zeitraumVon)}${
          erstattung.zeitraumBis && erstattung.zeitraumBis !== erstattung.zeitraumVon
            ? ` – ${formatMonat(erstattung.zeitraumBis)}`
            : ''
        }`
      : null,
    erstattung.art === 'strom' ? `${erstattung.arbeitstage} Arbeitstage` : null,
    erstattung.belege > 0
      ? `${erstattung.belege} ${erstattung.belege === 1 ? 'Beleg' : 'Belege'}`
      : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      {angaben.length > 0 ? <p className="text-ink-muted">{angaben.join(' · ')}</p> : null}

      {erstattung.positionen.length > 0 ? (
        <ul className="text-ink-muted space-y-0.5">
          {erstattung.positionen.map((position) => (
            <li key={position.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{position.bezeichnung}</span>
              <span className="shrink-0 tabular-nums">{formatEuro(position.betragCent)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Die IBAN nur, wenn sie gebraucht wird: zur Auszahlung eines
            genehmigten Antrags (UX-005i). */}
      {erstattung.stand === 'genehmigt' ? (
        <p className="text-ink-muted">
          IBAN <span className="text-ink tabular-nums">{erstattung.iban}</span>
        </p>
      ) : null}

      {erstattung.notiz ? <p className="text-ink-muted">{erstattung.notiz}</p> : null}

      {erstattung.stand === 'abgelehnt' && erstattung.ablehnungsgrund ? (
        <p className="text-danger">Ablehnung: {erstattung.ablehnungsgrund}</p>
      ) : null}
      {/* „Genehmigt" heißt nicht „ausgezahlt" - der Satz sagt es an jedem
            genehmigten Antrag (Abweichung von der Vorlage, siehe oben). */}
      {erstattung.stand === 'genehmigt' ? (
        <p className="text-ink-muted">
          Genehmigt von {erstattung.entschiedenVon} am {formatDatum(erstattung.entschiedenAm)}. Noch
          nicht ausgezahlt.
        </p>
      ) : null}
      {erstattung.stand === 'ausgezahlt' ? (
        <p className="text-ink-muted">Ausgezahlt am {formatDatum(erstattung.ausgezahltAm)}.</p>
      ) : null}

      {hatAktion ? (
        <div className="mt-1">
          {erstattung.stand === 'eingereicht' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                groesse="kompakt"
                onClick={() => onEntscheiden(erstattung, 'genehmigt')}
              >
                Genehmigen
              </Button>
              <Button
                variant="quiet"
                groesse="kompakt"
                aria-expanded={ablehnenOffen}
                onClick={() => setAblehnenOffen((offen) => !offen)}
              >
                Ablehnen
              </Button>
            </div>
          ) : null}
          {erstattung.stand === 'genehmigt' ? (
            <Button
              variant="secondary"
              groesse="kompakt"
              onClick={() => onEntscheiden(erstattung, 'ausgezahlt')}
            >
              Auszahlung vermerken
            </Button>
          ) : null}
          {ablehnenOffen ? (
            <div className="max-w-formular mt-3 flex flex-col gap-2">
              <TextArea
                rows={3}
                label="Grund der Ablehnung"
                value={ablehnung}
                onChange={(event) => setAblehnung(event.target.value)}
              />
              <div>
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  disabled={ablehnung.trim() === ''}
                  onClick={() => {
                    onEntscheiden(erstattung, 'abgelehnt', ablehnung.trim());
                    setAblehnenOffen(false);
                    setAblehnung('');
                  }}
                >
                  Ablehnung übernehmen
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Historie je Person - praktisch, um doppelte Einreichungen zu erkennen. */
function Historie() {
  const { zustand } = useVorschau();

  return (
    <Disclosure summary="Historie je Person" inKarte>
      {zustand.mitarbeitende.map((person) => {
        const eintraege = zustand.erstattungen.filter(
          (erstattung) => erstattung.mitarbeiterId === person.id,
        );
        if (eintraege.length === 0) return null;
        return (
          <div key={person.id} className="border-line border-t py-2 first:border-t-0">
            <p className="text-ink text-sm font-medium">{person.name}</p>
            <ul className="text-ink-muted space-y-0.5 text-sm">
              {eintraege.map((erstattung) => (
                <li key={erstattung.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {erstattung.art === 'strom' ? 'Strom' : 'Einkauf'} ·{' '}
                    {formatDatum(erstattung.eingereichtAm)} ·{' '}
                    {formatEuro(betragCent(erstattung, zustand.stromsatzCent))}
                  </span>
                  <Badge ton={standTon[erstattung.stand]}>
                    {erstattungsstandLabels[erstattung.stand]}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Disclosure>
  );
}

// -----------------------------------------------------------------------------
// Formular
// -----------------------------------------------------------------------------

/**
 * Eine Position, solange sie eingetippt wird.
 *
 * Der Betrag bleibt als Text im Zustand, bis das Formular abgesendet wird. Ein
 * bei jedem Tastendruck nach Cent und zurück gerechnetes Feld springt beim
 * Tippen: „12," wäre schon 12,00 € und das Komma verschwunden.
 */
interface Positionsentwurf {
  id: string;
  bezeichnung: string;
  betrag: string;
}

function Erstattungsformular({
  user,
  onFertig,
  onAbbrechen,
}: {
  user: CurrentUser;
  onFertig: (eintrag: Protokolleintrag) => void;
  onAbbrechen: () => void;
}) {
  const { zustand, simuliere } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);

  const [art, setArt] = useState<Erstattungsart>('strom');
  const [mitarbeiterId, setMitarbeiterId] = useState(identitaet?.person.id ?? '');
  const [iban, setIban] = useState('');
  // Geprüft wird die IBAN erst, wenn das Feld verlassen wurde (VOR-17): Beim
  // Tippen stand nach „DE" sofort ein Fehler am Feld, bis mindestens 14
  // Zeichen da waren.
  const [ibanVerlassen, setIbanVerlassen] = useState(false);
  const [zeitraumVon, setZeitraumVon] = useState(zustand.stichtag.slice(0, 7));
  const [zeitraumBis, setZeitraumBis] = useState(zustand.stichtag.slice(0, 7));
  const [arbeitstage, setArbeitstage] = useState('');
  const [positionen, setPositionen] = useState<Positionsentwurf[]>([]);
  const [belege, setBelege] = useState(0);
  const [notiz, setNotiz] = useState('');
  const [unterschrieben, setUnterschrieben] = useState(false);

  const tage = Number(arbeitstage) || 0;
  const stromBetrag = Math.round(tage * KWH_PRO_ARBEITSTAG * zustand.stromsatzCent);
  const einkaufBetrag = positionen.reduce(
    (summe, position) => summe + (parseEuroZuCent(position.betrag) ?? 0),
    0,
  );
  const betrag = art === 'strom' ? stromBetrag : einkaufBetrag;

  const ibanKurz = iban.replace(/\s/g, '');
  const ibanPlausibel = ibanKurz.length === 0 || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(ibanKurz);
  const ibanFehler =
    ibanVerlassen && !ibanPlausibel
      ? 'Bitte prüfen Sie die IBAN: zwei Buchstaben, zwei Prüfziffern, dann die Kontonummer (z. B. DE02 1001 …).'
      : undefined;
  const gueltig =
    mitarbeiterId !== '' &&
    ibanKurz.length > 0 &&
    ibanPlausibel &&
    (art === 'strom' ? tage > 0 && unterschrieben : positionen.length > 0);

  function absenden() {
    const eintrag = simuliere(
      {
        bereich: 'Erstattungen',
        vorgang: `Erstattung eingereicht: ${mitarbeiterName(zustand, mitarbeiterId)}, ${formatEuro(betrag)}`,
        folgen: [
          'Antrag mit dem Stand „Eingereicht“ in der Liste',
          // Die Rollen mit ihren Anzeigenamen (VOR-25).
          `Er erscheint bei ${roleLabels.owner} und ${roleLabels.team_lead} zur Entscheidung`,
        ],
        nichtGeschehen: [
          'Kein PDF erzeugt und nichts an die Buchhaltung versendet',
          'Belegfotos und Unterschrift verlassen diese Sitzung nicht',
          'Keine Auszahlung veranlasst',
        ],
      },
      (stand) => ({
        ...stand,
        erstattungen: [
          {
            id: vorschauId('erstattung'),
            mitarbeiterId,
            art,
            iban: iban.trim(),
            zeitraumVon: art === 'strom' ? zeitraumVon : '',
            zeitraumBis: art === 'strom' ? zeitraumBis : '',
            arbeitstage: art === 'strom' ? tage : 0,
            positionen:
              art === 'einkauf'
                ? positionen.map((position) => ({
                    id: position.id,
                    bezeichnung: position.bezeichnung,
                    betragCent: parseEuroZuCent(position.betrag) ?? 0,
                  }))
                : [],
            belege,
            notiz,
            unterschrift: unterschrieben,
            stand: 'eingereicht' as const,
            eingereichtAm: stand.stichtag,
            entschiedenVon: '',
            entschiedenAm: '',
            ausgezahltAm: '',
            ablehnungsgrund: '',
          },
          ...stand.erstattungen,
        ],
      }),
    );
    onFertig(eintrag);
  }

  return (
    <>
      <PageHeader title="Erstattung einreichen" />
      <div className="max-w-formular flex flex-col gap-4">
        <div>
          <p className="text-ink mb-2 text-sm font-medium">Art der Erstattung</p>
          <div role="radiogroup" aria-label="Art der Erstattung" className="flex flex-wrap gap-2">
            {(
              [
                { wert: 'strom', label: 'Stromkosten' },
                { wert: 'einkauf', label: 'Einkauf' },
              ] as const
            ).map((option) => (
              // Fokus sichtbar am Chip statt am ausgeblendeten Radio, die Wahl
              // mit Zeichen statt nur mit Farbe (VOR-02, UIK-06).
              <label
                key={option.wert}
                className={`rounded-button text-liste has-[:focus-visible]:outline-accent inline-flex min-h-11 cursor-pointer items-center gap-1.5 border px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                  art === option.wert
                    ? 'border-accent bg-accent-soft text-accent font-medium'
                    : 'border-line-strong bg-surface text-ink-muted'
                }`}
              >
                <input
                  type="radio"
                  name="erstattungsart"
                  className="sr-only"
                  checked={art === option.wert}
                  onChange={() => setArt(option.wert)}
                />
                {art === option.wert ? <span aria-hidden="true">✓</span> : null}
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <Select
          label="Person"
          value={mitarbeiterId}
          onChange={(event) => setMitarbeiterId(event.target.value)}
        >
          <option value="">– auswählen –</option>
          {zustand.mitarbeitende.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>

        {/* Großbuchstaben, keine Autokorrektur und keine Vorschläge: Am
            Telefon kann die Autokorrektur die IBAN beim Tippen verändern
            (VOR-17). */}
        <Field
          label="IBAN"
          placeholder="DE02 1234 5678 0000 1234 00"
          hint="Es wird nichts gespeichert und nichts überwiesen."
          error={ibanFehler}
          value={iban}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          onBlur={() => setIbanVerlassen(true)}
          onChange={(event) => setIban(event.target.value)}
        />

        {art === 'strom' ? (
          <>
            <Field
              label="Zeitraum von"
              type="month"
              value={zeitraumVon}
              onChange={(event) => setZeitraumVon(event.target.value)}
            />
            <Field
              label="Zeitraum bis"
              type="month"
              value={zeitraumBis}
              onChange={(event) => setZeitraumBis(event.target.value)}
            />
            <Field
              label="Arbeitstage im Zeitraum"
              type="number"
              inputMode="numeric"
              hint={`Ein Arbeitstag entspricht einer Akkuladung von ${KWH_PRO_ARBEITSTAG} kWh.`}
              value={arbeitstage}
              onChange={(event) => setArbeitstage(event.target.value)}
            />
            <p className="text-ink-muted text-sm">
              Ergibt {formatEuro(stromBetrag)} bei {formatEuro(zustand.stromsatzCent)} je kWh.
            </p>
            <SignaturFeld
              beschriftung="Erklärung"
              erklaerung="Ich versichere, dass die geltend gemachten Stromkosten tatsächlich für das Laden des betrieblichen E-Bikes entstanden sind und mir nicht anderweitig erstattet wurden."
              onChange={setUnterschrieben}
            />
          </>
        ) : (
          <>
            {/* Eine Gruppe mit Namen statt eines Kastens (L2); die Felder
                einer Position stehen am Telefon untereinander, ab 640 px in
                einer Reihe (DESIGN.md „Formular“). */}
            <fieldset className="min-w-0">
              <legend className="sr-only">Positionen</legend>
              <Zwischentitel>Positionen</Zwischentitel>
              {positionen.length === 0 ? (
                <p className="text-ink-muted text-sm">Noch keine Position erfasst.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {positionen.map((position, index) => (
                    <li
                      key={position.id}
                      className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
                    >
                      <div className="min-w-0">
                        <Field
                          label={`Position ${index + 1}`}
                          placeholder="Was wurde gekauft?"
                          value={position.bezeichnung}
                          onChange={(event) =>
                            setPositionen((aktuell) =>
                              aktuell.map((eintrag) =>
                                eintrag.id === position.id
                                  ? { ...eintrag, bezeichnung: event.target.value }
                                  : eintrag,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <Field
                          label="Betrag in €"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={position.betrag}
                          onChange={(event) =>
                            setPositionen((aktuell) =>
                              aktuell.map((eintrag) =>
                                eintrag.id === position.id
                                  ? { ...eintrag, betrag: event.target.value }
                                  : eintrag,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <Button
                          variant="quiet"
                          groesse="kompakt"
                          onClick={() =>
                            setPositionen((aktuell) =>
                              aktuell.filter((eintrag) => eintrag.id !== position.id),
                            )
                          }
                        >
                          Entfernen
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  onClick={() =>
                    setPositionen((aktuell) => [
                      ...aktuell,
                      { id: vorschauId('position'), bezeichnung: '', betrag: '' },
                    ])
                  }
                >
                  Position hinzufügen
                </Button>
                <span className="text-ink-muted text-sm">
                  Gesamt: <strong className="text-ink">{formatEuro(einkaufBetrag)}</strong>
                </span>
              </div>
            </fieldset>

            <div>
              <p className="text-ink text-sm font-medium">Beleg</p>
              <p className="text-ink-muted mb-2 text-sm">
                Beleg gut lesbar fotografieren: gerade halten, ausreichend Licht, alle Beträge und
                der Händlername müssen erkennbar sein. In der Vorschau wird nur die Anzahl
                mitgeführt, es wird nichts hochgeladen.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={() => setBelege((anzahl) => anzahl + 1)}>
                  Beleg hinzufügen
                </Button>
                {belege > 0 ? (
                  <span className="text-ink-muted text-sm">
                    {belege} Beleg{belege === 1 ? '' : 'e'} vorgemerkt
                  </span>
                ) : null}
              </div>
            </div>
          </>
        )}

        <TextArea
          rows={3}
          label="Notiz"
          hint="Optional."
          value={notiz}
          onChange={(event) => setNotiz(event.target.value)}
        />

        <Formularfuss trenner>
          <Button onClick={absenden} disabled={!gueltig}>
            Einreichen (Vorschau)
          </Button>
          <Button variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </Formularfuss>
      </div>
    </>
  );
}
