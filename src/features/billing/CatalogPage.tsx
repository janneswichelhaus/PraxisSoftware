import { useEffect, useMemo, useState } from 'react';
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
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { formatDate } from '@/lib/datum';
import { centZuEingabe, formatEuro, parseEuroZuCent } from '@/lib/geld';
import { HEILMITTEL } from '@/features/treatment-bases/heilmittel';
import { canManageServiceCatalog, type CurrentUser } from '@/features/session/types';
import { todayInTimeZone } from '@/features/appointments/api';
import {
  artLabels,
  createKatalogVersion,
  deleteKatalogVersion,
  fetchKatalogPositionen,
  fetchKatalogVersionen,
  publishKatalogVersion,
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

function leereZeile(): PositionsEingabe {
  return {
    code: '',
    label: '',
    item_kind: 'treatment',
    remedy: '',
    preis: '',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
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
  };
}

/** Was an einer Zeile nicht stimmt — leer heißt: sie ist in Ordnung. */
function pruefe(zeile: PositionsEingabe): string | undefined {
  if (zeile.code.trim() === '') return 'Kürzel fehlt.';
  if (zeile.label.trim() === '') return 'Bezeichnung fehlt.';
  if (parseEuroZuCent(zeile.preis) === null) return 'Preis ist keine gültige Zahl.';
  if (zeile.item_kind === 'absence_fee' && zeile.remedy !== '')
    return 'Ein Ausfallhonorar hängt an keinem Heilmittel.';
  return undefined;
}

export function CatalogPage({ user }: { user: CurrentUser }) {
  const darfPflegen = canManageServiceCatalog(user.roles);
  const queryClient = useQueryClient();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  const versionen = useQuery({
    queryKey: ['katalog-versionen'],
    queryFn: fetchKatalogVersionen,
    retry: false,
  });

  const aktuelle = useMemo(() => {
    const liste = versionen.data ?? [];
    return liste.find((version) => version.id === gewaehlt) ?? liste[0] ?? null;
  }, [versionen.data, gewaehlt]);

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
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {versionen.data && versionen.data.length === 0 ? (
        <EmptyState
          title="Noch keine Preisliste"
          description="Ohne eine in Kraft gesetzte Preisliste lässt sich keine Leistung erfassen."
        />
      ) : null}

      {versionen.data && versionen.data.length > 0 ? (
        <Section titel="Preislisten" rahmen>
          <ul className="divide-line divide-y">
            {versionen.data.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() => setGewaehlt(version.id)}
                  aria-current={aktuelle?.id === version.id}
                  className="min-h-11 min-w-0 flex-1 text-left"
                >
                  <span className="text-ink block truncate text-[0.9375rem] font-medium">
                    {version.label}
                  </span>
                  <span className="text-ink-muted mt-0.5 block text-sm">
                    gültig ab {formatDate(version.valid_from)}
                  </span>
                </button>
                <Badge ton={version.published_at ? 'positiv' : 'neutral'}>
                  {version.published_at ? 'In Kraft' : 'Entwurf'}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {darfPflegen ? (
        <NeuePreisliste
          vorlage={versionen.data?.find((version) => version.published_at) ?? null}
          zeitzone={user.organizationTimeZone}
          onAngelegt={async (id) => {
            await queryClient.invalidateQueries({ queryKey: ['katalog-versionen'] });
            setGewaehlt(id);
          }}
        />
      ) : null}

      {aktuelle ? (
        <Preisliste key={aktuelle.id} version={aktuelle} darfPflegen={darfPflegen} />
      ) : null}
    </>
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
        <Button type="button" onClick={() => setOffen(true)}>
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
          hint={'Zum Wiederfinden, etwa „Preisliste 2027“.'}
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
            label={`Positionen aus „${vorlage.label}" übernehmen`}
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
            Entwurf anlegen
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOffen(false)}>
            Abbrechen
          </Button>
        </div>
        {anlegen.isError ? (
          <Statusmeldung ton="fehler">{anlegen.error.message}</Statusmeldung>
        ) : null}
      </div>
    </Section>
  );
}

function Preisliste({ version, darfPflegen }: { version: KatalogVersion; darfPflegen: boolean }) {
  const queryClient = useQueryClient();
  const positionen = useQuery({
    queryKey: ['katalog-positionen', version.id],
    queryFn: () => fetchKatalogPositionen(version.id),
    retry: false,
  });

  const [zeilen, setZeilen] = useState<PositionsEingabe[] | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  // Der Entwurf wird bearbeitbar, sobald seine Positionen da sind. Ein
  // Formular, das vor den Daten steht, überschriebe sie beim ersten Speichern.
  useEffect(() => {
    if (positionen.data && zeilen === null) setZeilen(positionen.data.map(alsEingabe));
  }, [positionen.data, zeilen]);

  const fehler = (zeilen ?? []).map(pruefe);
  const vollstaendig =
    (zeilen ?? []).length > 0 && fehler.every((eintrag) => eintrag === undefined);

  // In Kraft gesetzt wird der **Serverstand**. Weicht das Formular davon ab,
  // gingen die Änderungen still verloren — und die Liste wäre danach
  // unveränderlich (R3-007). Verglichen wird gegen denselben Stand, aus dem
  // die Zeilen entstanden sind.
  const ungespeichert =
    zeilen !== null &&
    positionen.data !== undefined &&
    JSON.stringify(zeilen) !== JSON.stringify(positionen.data.map(alsEingabe));

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
        })),
      ),
    onSuccess: async () => {
      setGespeichert(true);
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

  if (positionen.isPending) return <LoadingState label="Positionen werden geladen …" />;
  if (positionen.isError) {
    return (
      <ErrorState
        title="Die Positionen konnten nicht geladen werden."
        description="Bitte später erneut versuchen."
      />
    );
  }

  const bearbeitbar = darfPflegen && version.published_at === null;

  return (
    <Section
      titel={version.label}
      ebene={2}
      hinweis={
        version.published_at
          ? 'In Kraft und damit unveränderlich. Eine Preisänderung ist eine neue Preisliste.'
          : 'Entwurf. Änderbar, solange die Liste nicht in Kraft ist.'
      }
      rahmen={!bearbeitbar}
    >
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
                <span className="text-ink block text-[0.9375rem]">{position.label}</span>
                <span className="text-ink-muted mt-0.5 block text-sm">
                  {artLabels[position.item_kind]} · {steuerLabels[position.tax_treatment]}
                  {position.tax_treatment === 'taxable'
                    ? ` (${position.tax_rate_permille / 10} %)`
                    : ''}
                </span>
              </span>
              <span className="text-ink shrink-0 text-[0.9375rem] font-medium tabular-nums">
                {formatEuro(position.unit_price_cents, position.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-4">
          {(zeilen ?? []).map((zeile, index) => (
            <Positionszeile
              // Die Reihenfolge IST die Kennung: Eine Zeile im Entwurf hat
              // noch keine eigene, und die Liste wird vollständig ersetzt.
              key={index}
              zeile={zeile}
              fehler={fehler[index]}
              onChange={(neu) =>
                setZeilen((alt) => (alt ?? []).map((wert, i) => (i === index ? neu : wert)))
              }
              onEntfernen={() => setZeilen((alt) => (alt ?? []).filter((_, i) => i !== index))}
            />
          ))}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setZeilen((alt) => [...(alt ?? []), leereZeile()])}
            >
              Position hinzufügen
            </Button>
            <Button
              type="button"
              onClick={() => speichern.mutate()}
              disabled={!vollstaendig || speichern.isPending}
            >
              Entwurf speichern
            </Button>
          </div>

          {speichern.isError ? (
            <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
          ) : null}
          {gespeichert && !speichern.isError ? (
            <Statusmeldung>Entwurf gespeichert.</Statusmeldung>
          ) : null}

          {ungespeichert ? (
            <Statusmeldung ton="warnung">
              Es gibt ungespeicherte Änderungen. Bitte zuerst den Entwurf speichern — in Kraft
              gesetzt wird der gespeicherte Stand.
            </Statusmeldung>
          ) : null}

          <div className="border-line flex flex-wrap gap-3 border-t pt-4">
            {ungespeichert ? (
              // Gesperrt statt Rückfrage: Die Rückfrage erklärt, was
              // unumkehrbar wird — sie ist nicht der Ort, an dem man erfährt,
              // dass die eigene Änderung gar nicht mitginge (R3-007).
              <Button type="button" disabled>
                In Kraft setzen
              </Button>
            ) : (
              <Rueckfrage
                ausloeser="In Kraft setzen"
                ausloeserVariante="primary"
                bestaetigen="In Kraft setzen"
                bestaetigenLaeuft="Wird in Kraft gesetzt …"
                laeuft={inKraft.isPending}
                fehler={inKraft.isError ? inKraft.error.message : undefined}
                onBestaetigen={() => inKraft.mutate()}
              >
                <p>
                  „{version.label}" gilt ab {formatDate(version.valid_from)} und ist danach
                  <strong> unveränderlich</strong>. Eine spätere Preisänderung ist eine neue
                  Preisliste.
                </p>
              </Rueckfrage>
            )}
            <Rueckfrage
              ausloeser="Entwurf verwerfen"
              bestaetigen="Verwerfen"
              bestaetigenLaeuft="Wird verworfen …"
              laeuft={verwerfen.isPending}
              fehler={verwerfen.isError ? verwerfen.error.message : undefined}
              onBestaetigen={() => verwerfen.mutate()}
            >
              <p>Der Entwurf „{version.label}" wird samt seinen Positionen gelöscht.</p>
            </Rueckfrage>
          </div>

          {positionen.data.length === 0 ? (
            <Statusmeldung ton="warnung">
              Eine Preisliste ohne Position lässt sich nicht in Kraft setzen — sie wäre ab ihrem
              Beginn die geltende und ließe keine Leistung mehr erfassen.
            </Statusmeldung>
          ) : null}
        </div>
      )}
    </Section>
  );
}

function Positionszeile({
  zeile,
  fehler,
  onChange,
  onEntfernen,
}: {
  zeile: PositionsEingabe;
  fehler: string | undefined;
  onChange: (zeile: PositionsEingabe) => void;
  onEntfernen: () => void;
}) {
  return (
    <div className="border-line rounded-card flex flex-col gap-3 border p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-28">
          <Field
            label="Kürzel"
            value={zeile.code}
            onChange={(event) => onChange({ ...zeile, code: event.target.value })}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Field
            label="Bezeichnung"
            value={zeile.label}
            onChange={(event) => onChange({ ...zeile, label: event.target.value })}
          />
        </div>
        <div className="sm:w-32">
          <Field
            label="Preis"
            inputMode="decimal"
            value={zeile.preis}
            onChange={(event) => onChange({ ...zeile, preis: event.target.value })}
            hint="in Euro"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-44">
          <Select
            label="Art"
            value={zeile.item_kind}
            onChange={(event) =>
              onChange({
                ...zeile,
                item_kind: event.target.value as PositionsEingabe['item_kind'],
                remedy: event.target.value === 'absence_fee' ? '' : zeile.remedy,
              })
            }
          >
            <option value="treatment">{artLabels.treatment}</option>
            <option value="absence_fee">{artLabels.absence_fee}</option>
          </Select>
        </div>
        <div className="sm:w-56">
          <Select
            label="Heilmittel"
            value={zeile.remedy}
            disabled={zeile.item_kind === 'absence_fee'}
            onChange={(event) => onChange({ ...zeile, remedy: event.target.value })}
            hint="Belegt die Leistungserfassung vor."
          >
            <option value="">ohne</option>
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
        <div className="min-w-0 flex-1">
          <Select
            label="Steuer"
            value={zeile.tax_treatment}
            onChange={(event) => {
              const wert = event.target.value as PositionsEingabe['tax_treatment'];
              onChange({
                ...zeile,
                tax_treatment: wert,
                tax_rate_permille: wert === 'taxable' ? STEUERSATZ_VORGABE : 0,
              });
            }}
          >
            <option value="exempt_healthcare">{steuerLabels.exempt_healthcare}</option>
            <option value="taxable">{steuerLabels.taxable}</option>
            <option value="not_taxable">{steuerLabels.not_taxable}</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : <span />}
        <Button type="button" variant="secondary" onClick={onEntfernen}>
          Position entfernen
        </Button>
      </div>
    </div>
  );
}
