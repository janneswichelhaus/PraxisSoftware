import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Card, CardGrid, DataList, DataRow } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import type { CurrentUser } from '@/features/session/types';
import {
  mitarbeiterName,
  useVorschau,
  type Protokolleintrag,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { darfEntscheiden, vorschauidentitaet } from '@/features/preview/identitaet';
import { SignaturFeld } from '@/features/preview/SignaturFeld';
import {
  Klappbereich,
  OffeneEntscheidung,
  SimulationsMeldung,
  VorschauBanner,
} from '@/features/preview/ui';
import { formatDatum, formatEuro } from '@/features/preview/format';
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
  genehmigt: 'akzent',
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

      <VorschauBanner bereich="Erstattungen" />
      <SimulationsMeldung eintrag={meldung} />

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="erstattung-filter" className="text-ink text-sm font-medium">
            Bearbeitungsstand
          </label>
          <select
            id="erstattung-filter"
            className="border-line-strong bg-surface text-ink min-h-11 rounded-lg border px-3 text-base"
            value={filter}
            onChange={(event) => setFilter(event.target.value as 'alle' | Erstattungsstand)}
          >
            <option value="alle">Alle</option>
            {(Object.keys(erstattungsstandLabels) as Erstattungsstand[]).map((stand) => (
              <option key={stand} value={stand}>
                {erstattungsstandLabels[stand]}
              </option>
            ))}
          </select>
        </div>
        <p className="text-ink-muted pb-3 text-sm">
          Offene Erstattungen: <strong className="text-ink">{formatEuro(offenCent)}</strong>
        </p>
      </div>

      {sichtbar.length === 0 ? <EmptyState title="Keine Einträge" /> : null}

      <CardGrid>
        {sichtbar.map((erstattung) => (
          <Erstattungskarte
            key={erstattung.id}
            erstattung={erstattung}
            eigene={identitaet?.person.id === erstattung.mitarbeiterId}
            entscheidungsrecht={entscheidungsrecht}
            onEntscheiden={entscheiden}
          />
        ))}
      </CardGrid>

      <Historie />

      <Klappbereich
        titel="Berechnung der Stromerstattung"
        beschreibung="Wie aus Arbeitstagen ein Betrag wird."
      >
        <DataList>
          <DataRow label="Ladung je Arbeitstag">{KWH_PRO_ARBEITSTAG} kWh</DataRow>
          <DataRow label="Satz je kWh">{formatEuro(zustand.stromsatzCent)}</DataRow>
          <DataRow label="Formel">Arbeitstage × 0,5 kWh × Satz</DataRow>
        </DataList>
        <p className="text-ink-subtle mt-3 text-sm">
          Die Pauschale stammt aus der Vorlage und ist eine betriebliche Regel, kein allgemein
          gültiger Verbrauchswert und keine rechtliche Vorgabe. Sie muss für diesen Betrieb
          gesondert entschieden werden.
        </p>
      </Klappbereich>

      <OffeneEntscheidung titel="Einreichen, Genehmigen und Auszahlen sind drei Schritte">
        Die Vorschau führt die Stände getrennt. Was davon steuerlich als Beleg gilt, wie lange
        Belege aufbewahrt werden und wer die Auszahlung bestätigt, folgt aus dem Retention-Konzept
        (ADR-008) und dem Abrechnungsmodell (ADR-009) und ist hier nicht entschieden.
      </OffeneEntscheidung>
    </>
  );
}

function Erstattungskarte({
  erstattung,
  eigene,
  entscheidungsrecht,
  onEntscheiden,
}: {
  erstattung: Erstattung;
  eigene: boolean;
  entscheidungsrecht: boolean;
  onEntscheiden: (erstattung: Erstattung, stand: Erstattungsstand, grund?: string) => void;
}) {
  const { zustand } = useVorschau();
  const [ablehnung, setAblehnung] = useState('');
  const [ablehnenOffen, setAblehnenOffen] = useState(false);
  const betrag = betragCent(erstattung, zustand.stromsatzCent);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-[0.9375rem] font-semibold">
            {mitarbeiterName(zustand, erstattung.mitarbeiterId)}
            {eigene ? ' (ich)' : ''}
          </p>
          <p className="text-ink-muted mt-0.5 text-sm">
            {erstattung.art === 'strom' ? 'Stromkosten' : 'Einkauf'} ·{' '}
            {formatDatum(erstattung.eingereichtAm)}
          </p>
        </div>
        <Badge ton={standTon[erstattung.stand]}>{erstattungsstandLabels[erstattung.stand]}</Badge>
      </div>

      <DataList>
        <DataRow label="Betrag">{formatEuro(betrag)}</DataRow>
        {erstattung.art === 'strom' ? (
          <>
            <DataRow label="Zeitraum">
              {erstattung.zeitraumVon}
              {erstattung.zeitraumBis && erstattung.zeitraumBis !== erstattung.zeitraumVon
                ? ` – ${erstattung.zeitraumBis}`
                : ''}
            </DataRow>
            <DataRow label="Arbeitstage">{erstattung.arbeitstage}</DataRow>
          </>
        ) : (
          <DataRow label="Positionen">{erstattung.positionen.length}</DataRow>
        )}
        <DataRow label="IBAN">{erstattung.iban}</DataRow>
        {erstattung.belege > 0 ? <DataRow label="Belege">{erstattung.belege}</DataRow> : null}
      </DataList>

      {erstattung.positionen.length > 0 ? (
        <ul className="text-ink-muted mt-2 space-y-0.5 text-sm">
          {erstattung.positionen.map((position) => (
            <li key={position.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{position.bezeichnung}</span>
              <span className="shrink-0 tabular-nums">{formatEuro(position.betragCent)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {erstattung.notiz ? (
        <p className="text-ink-muted bg-surface-sunken mt-2 rounded-lg px-3 py-2 text-sm">
          {erstattung.notiz}
        </p>
      ) : null}

      {erstattung.stand === 'abgelehnt' && erstattung.ablehnungsgrund ? (
        <p className="text-danger mt-2 text-sm">Ablehnung: {erstattung.ablehnungsgrund}</p>
      ) : null}
      {erstattung.stand === 'genehmigt' ? (
        <p className="text-ink-subtle mt-2 text-sm">
          Genehmigt von {erstattung.entschiedenVon} am {formatDatum(erstattung.entschiedenAm)}. Noch
          nicht ausgezahlt.
        </p>
      ) : null}
      {erstattung.stand === 'ausgezahlt' ? (
        <p className="text-ink-subtle mt-2 text-sm">
          Ausgezahlt am {formatDatum(erstattung.ausgezahltAm)}.
        </p>
      ) : null}

      {entscheidungsrecht ? (
        <div className="border-line mt-3 border-t pt-3">
          {erstattung.stand === 'eingereicht' ? (
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => onEntscheiden(erstattung, 'genehmigt')}>
                Genehmigen
              </Button>
              <Button variant="quiet" onClick={() => setAblehnenOffen((offen) => !offen)}>
                Ablehnen
              </Button>
            </div>
          ) : null}
          {erstattung.stand === 'genehmigt' ? (
            <Button variant="secondary" onClick={() => onEntscheiden(erstattung, 'ausgezahlt')}>
              Auszahlung vermerken
            </Button>
          ) : null}
          {ablehnenOffen ? (
            <div className="mt-3 flex flex-col gap-2">
              <Textarea
                label="Grund der Ablehnung"
                value={ablehnung}
                onChange={(event) => setAblehnung(event.target.value)}
              />
              <div>
                <Button
                  variant="secondary"
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
    </Card>
  );
}

/** Historie je Person - praktisch, um doppelte Einreichungen zu erkennen. */
function Historie() {
  const { zustand } = useVorschau();

  return (
    <Klappbereich
      titel="Historie je Person"
      beschreibung="Zeigt bisherige Einreichungen, um Doppelungen zu erkennen."
    >
      {zustand.mitarbeitende.map((person) => {
        const eintraege = zustand.erstattungen.filter(
          (erstattung) => erstattung.mitarbeiterId === person.id,
        );
        if (eintraege.length === 0) return null;
        return (
          <div key={person.id} className="border-line border-t py-2 first:border-t-0">
            <p className="text-ink text-sm font-medium">{person.name}</p>
            <ul className="text-ink-muted mt-1 space-y-0.5 text-sm">
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
    </Klappbereich>
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

/** Cent aus einer Eingabe wie „12,50" oder „12.50". Unlesbares zählt als 0. */
function centAus(eingabe: string): number {
  const wert = Number(eingabe.replace(',', '.'));
  if (!Number.isFinite(wert) || wert < 0) return 0;
  return Math.round(wert * 100);
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
  const [zeitraumVon, setZeitraumVon] = useState(zustand.stichtag.slice(0, 7));
  const [zeitraumBis, setZeitraumBis] = useState(zustand.stichtag.slice(0, 7));
  const [arbeitstage, setArbeitstage] = useState('');
  const [positionen, setPositionen] = useState<Positionsentwurf[]>([]);
  const [belege, setBelege] = useState(0);
  const [notiz, setNotiz] = useState('');
  const [unterschrieben, setUnterschrieben] = useState(false);

  const tage = Number(arbeitstage) || 0;
  const stromBetrag = Math.round(tage * KWH_PRO_ARBEITSTAG * zustand.stromsatzCent);
  const einkaufBetrag = positionen.reduce((summe, position) => summe + centAus(position.betrag), 0);
  const betrag = art === 'strom' ? stromBetrag : einkaufBetrag;

  const ibanKurz = iban.replace(/\s/g, '');
  const ibanPlausibel = ibanKurz.length === 0 || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(ibanKurz);
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
          'Antrag mit dem Stand „Eingereicht" in der Liste',
          'Er erscheint bei den Leitungsrollen zur Entscheidung',
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
                    betragCent: centAus(position.betrag),
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
      <VorschauBanner bereich="Erstattungen" />

      <div className="flex max-w-xl flex-col gap-4">
        <div>
          <p className="text-ink mb-2 text-sm font-medium">Art der Erstattung</p>
          <div role="radiogroup" aria-label="Art der Erstattung" className="flex flex-wrap gap-2">
            {(
              [
                { wert: 'strom', label: 'Stromkosten' },
                { wert: 'einkauf', label: 'Einkauf' },
              ] as const
            ).map((option) => (
              <label
                key={option.wert}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-4 text-[0.9375rem] ${
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

        <Field
          label="IBAN"
          placeholder="DE02 1234 5678 0000 1234 00"
          hint="Nur synthetische Werte eingeben. Es wird nichts gespeichert und nichts überwiesen."
          error={ibanPlausibel ? undefined : 'Diese IBAN sieht nicht plausibel aus.'}
          value={iban}
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
              unterschrieben={unterschrieben}
              onChange={setUnterschrieben}
            />
          </>
        ) : (
          <>
            <fieldset className="border-line rounded-card border p-4">
              <legend className="text-ink px-1 text-sm font-medium">Positionen</legend>
              {positionen.length === 0 ? (
                <p className="text-ink-subtle text-sm">Noch keine Position erfasst.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {positionen.map((position, index) => (
                    <li key={position.id} className="flex flex-wrap items-end gap-3">
                      <div className="min-w-40 flex-1">
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
                      <div className="w-32">
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
                      <Button
                        variant="quiet"
                        onClick={() =>
                          setPositionen((aktuell) =>
                            aktuell.filter((eintrag) => eintrag.id !== position.id),
                          )
                        }
                      >
                        Entfernen
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
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
              <p className="text-ink-subtle mb-2 text-sm">
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

        <Textarea
          label="Notiz"
          hint="Optional."
          value={notiz}
          onChange={(event) => setNotiz(event.target.value)}
        />

        <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={absenden} disabled={!gueltig}>
            Einreichen (Vorschau)
          </Button>
          <Button variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </div>
      </div>
    </>
  );
}
