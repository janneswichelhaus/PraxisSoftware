import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatLocalDate } from '@/features/appointments/api';
import {
  EINWILLIGUNG_BEGLEITUNG_FASSUNG,
  NACHWEISDOKUMENT,
  RECHTSGRUNDLAGE,
  VERTRETUNGSART,
  einwilligungBegleitung,
  vollmachtsdokument,
  type Rechtsgrundlage,
  type Vertretungsart,
} from '@/lib/vertretung';
import {
  invitePlatformRepresentation,
  listPlatformRepresentations,
  recordCompanionConsentWithdrawn,
  renewPlatformRepresentationCode,
  revokePlatformAccess,
  setPlatformAccessLocked,
  vertretungsschluessel,
  type Einladung,
  type Verhaeltnisart,
  type Vertretung,
} from './api';
import { ZUSTAND } from './zustand';

/**
 * Vertretungen im Abschnitt „Plattform" (POR-005, ADR-023 Punkte 13 bis 15).
 *
 * Eine Vertretung hat ein eigenes Konto und einen eigenen Zugang zu diesem
 * Verhältnis — nie die Zugangsdaten der Person (B5). Zwei Arten (W3):
 * rechtliche Vertretung und Begleitung. Die Praxis vermerkt, was sie gesehen
 * hat, gespeichert wird kein Dokument (ANN-205). Eine Begleitung braucht die
 * Einwilligung der Person, die sie hier auf dem Praxisgerät bestätigt
 * (ANN-206). Eingeladen wird nur vor Ort (ANN-204).
 *
 * Was erlaubt ist, prüft der Server (Art, Alter, Nachweis, Rolle); die
 * Oberfläche führt nur durch die Schritte.
 */
export function Vertretungen({
  art,
  verhaeltnisId,
  darfVerwalten,
  zeitzone,
  praxis,
  onEinladungVorOrt,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  darfVerwalten: boolean;
  zeitzone: string;
  praxis: string;
  onEinladungVorOrt: (einladung: Einladung, fuer: string) => void;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: vertretungsschluessel(art, verhaeltnisId),
    queryFn: () => listPlatformRepresentations(art, verhaeltnisId),
  });
  const [formularOffen, setFormularOffen] = useState(false);

  const laufend = (data ?? []).filter((v) => v.status !== 'revoked');
  const beendet = (data ?? []).filter((v) => v.status === 'revoked');

  return (
    <div className="border-line mt-5 border-t pt-4">
      <h3 className="text-ink text-base font-semibold">Vertretung</h3>
      {isPending ? (
        <LoadingState label="Vertretungen werden geladen …" />
      ) : isError ? (
        <ErrorState
          title="Die Vertretungen konnten nicht geladen werden."
          description="Bitte später erneut versuchen."
          onErneut={refetch}
        />
      ) : (
        <>
          {laufend.length === 0 && !formularOffen ? (
            <p className="text-ink-muted mt-1 text-sm">Niemand handelt für diese Person.</p>
          ) : null}
          <ul className="mt-2 flex flex-col gap-3">
            {laufend.map((v) => (
              <VertretungsEintrag
                key={v.id}
                art={art}
                verhaeltnisId={verhaeltnisId}
                vertretung={v}
                darfVerwalten={darfVerwalten}
                zeitzone={zeitzone}
                onEinladungVorOrt={onEinladungVorOrt}
              />
            ))}
          </ul>
          {beendet.length > 0 ? (
            <Disclosure summary="Beendet" anzahl={beendet.length}>
              <ul className="flex flex-col gap-1">
                {beendet.map((v) => (
                  <li key={v.id} className="text-ink-muted text-sm">
                    {v.representative_name} · {artText(v)} · {beendetText(v, zeitzone)}
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
          {darfVerwalten ? (
            formularOffen ? (
              <VertretungEinrichten
                art={art}
                verhaeltnisId={verhaeltnisId}
                praxis={praxis}
                onAbbrechen={() => setFormularOffen(false)}
                onEingerichtet={(einladung, name) => {
                  setFormularOffen(false);
                  onEinladungVorOrt(einladung, name);
                }}
              />
            ) : (
              <div className="mt-3">
                <Button variant="secondary" onClick={() => setFormularOffen(true)}>
                  Vertretung einrichten
                </Button>
              </div>
            )
          ) : null}
        </>
      )}
    </div>
  );
}

function artText(v: Vertretung): string {
  if (v.access_kind === 'legal_representative' && v.legal_basis) {
    return `${VERTRETUNGSART.legal_representative} (${RECHTSGRUNDLAGE[v.legal_basis]})`;
  }
  return VERTRETUNGSART[v.access_kind];
}

function beendetText(v: Vertretung, zeitzone: string): string {
  const am = v.revoked_at ? formatLocalDate(v.revoked_at, zeitzone) : '—';
  if (v.revoked_reason === 'consent_withdrawn') return `widerrufen am ${am}`;
  if (v.revoked_reason === 'scope_unproven') {
    return `beendet am ${am}, Gesundheitssorge nicht vermerkt – bitte neu einrichten`;
  }
  return `beendet am ${am}`;
}

function VertretungsEintrag({
  art,
  verhaeltnisId,
  vertretung: v,
  darfVerwalten,
  zeitzone,
  onEinladungVorOrt,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  vertretung: Vertretung;
  darfVerwalten: boolean;
  zeitzone: string;
  onEinladungVorOrt: (einladung: Einladung, fuer: string) => void;
}) {
  const queryClient = useQueryClient();
  const neuLaden = () =>
    queryClient.invalidateQueries({ queryKey: vertretungsschluessel(art, verhaeltnisId) });
  const datum = (wert: string | null) => (wert ? formatLocalDate(wert, zeitzone) : '—');

  const code = useMutation({ mutationFn: () => renewPlatformRepresentationCode(v.id) });
  const sperren = useMutation({
    mutationFn: (sperre: boolean) => setPlatformAccessLocked(v.id, sperre),
    onSuccess: neuLaden,
  });
  const entziehen = useMutation({
    mutationFn: () => revokePlatformAccess(v.id),
    onSuccess: neuLaden,
  });
  const widerrufen = useMutation({
    mutationFn: () => recordCompanionConsentWithdrawn(v.id),
    onSuccess: neuLaden,
  });

  // Ein Sorgerecht endet am 18. Geburtstag, auch ohne Zutun (ANN-208).
  const abgelaufen = v.ended_at !== null && new Date(v.ended_at).getTime() <= Date.now();
  const zustand = v.status === 'invited' && v.invitation_purpose === null ? 'expired' : v.status;
  const aktiv = v.status === 'active' && !abgelaufen;
  const gesperrt = v.status === 'locked';
  const eingeladen = v.status === 'invited';
  // Der Ausweis zuerst, dann das Dokument der Vollmacht.
  const gesehen = [...v.proof_documents]
    .sort((a, b) => Number(b === 'identity_document') - Number(a === 'identity_document'))
    .map((d) => NACHWEISDOKUMENT[d])
    .join(', ');

  return (
    <li className="rounded-card border-line border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink font-medium">{v.representative_name}</span>
        <span className="text-ink-muted text-sm">{artText(v)}</span>
        {abgelaufen ? (
          <Badge ton="neutral">Beendet</Badge>
        ) : zustand === 'active' ? null : (
          <Badge ton={ZUSTAND[zustand]!.ton}>{ZUSTAND[zustand]!.text}</Badge>
        )}
      </div>
      <p className="text-ink-muted mt-1 text-sm">
        Gesehen: {gesehen}
        {v.health_scope ? ', Gesundheitssorge' : ''}
        {v.access_kind === 'legal_representative' && v.finance_scope
          ? ', Vermögenssorge'
          : ''} · {v.proof_recorded_by_name ?? 'Praxis'}, {datum(v.proof_recorded_at)}
      </p>
      {v.access_kind === 'companion' ? (
        <p className="text-ink-muted text-sm">
          Einwilligung der Person am {datum(v.consent_recorded_at)}
          {v.consent_earlier_messages ? ', mit früheren Nachrichten' : ', ohne frühere Nachrichten'}
          {v.finance_scope ? ', mit Rechnungen' : ', ohne Rechnungen'}
        </p>
      ) : null}
      {v.ended_at && !abgelaufen && v.legal_basis === 'custody' ? (
        <p className="text-ink-muted text-sm">Endet am 18. Geburtstag, {datum(v.ended_at)}.</p>
      ) : null}
      {v.invitation_purpose && v.invitation_expires_at ? (
        <p className="text-ink-muted text-sm">
          {v.invitation_purpose === 'reset' ? 'Neues Kennwort' : 'Einladung'} vor Ort, gültig bis{' '}
          {datum(v.invitation_expires_at)}
        </p>
      ) : null}

      {darfVerwalten ? (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          {eingeladen || aktiv ? (
            <Rueckfrage
              ausloeser={aktiv ? 'Neues Kennwort (vor Ort)' : 'Neuer Code (vor Ort)'}
              bestaetigen="Code anzeigen"
              bestaetigenLaeuft="Wird ausgestellt …"
              fehler={code.error?.message}
              onBestaetigen={async () => {
                const e = await code.mutateAsync();
                await neuLaden();
                onEinladungVorOrt(e, v.representative_name);
              }}
            >
              <p>
                Ein Code erscheint auf diesem Gerät. Bitte nur {v.representative_name} selbst
                scannen lassen.
              </p>
            </Rueckfrage>
          ) : null}
          {(aktiv || gesperrt) && !abgelaufen ? (
            <Rueckfrage
              ausloeser={aktiv ? 'Sperren' : 'Entsperren'}
              bestaetigen={aktiv ? 'Sperren' : 'Entsperren'}
              bestaetigenLaeuft={aktiv ? 'Wird gesperrt …' : 'Wird entsperrt …'}
              fehler={sperren.error?.message}
              onBestaetigen={() => sperren.mutateAsync(aktiv)}
            >
              <p>
                {aktiv
                  ? `${v.representative_name} sieht ab sofort nichts mehr. Das lässt sich zurücknehmen.`
                  : `${v.representative_name} kann wieder für die Person handeln.`}
              </p>
            </Rueckfrage>
          ) : null}
          {v.access_kind === 'companion' ? (
            <Rueckfrage
              ausloeser="Widerruf vermerken"
              bestaetigen="Widerruf vermerken"
              bestaetigenLaeuft="Wird vermerkt …"
              fehler={widerrufen.error?.message}
              onBestaetigen={() => widerrufen.mutateAsync()}
            >
              <p>
                Die Person widerruft ihre Einwilligung hier in der Praxis. {v.representative_name}{' '}
                sieht ab sofort nichts mehr; im Nachweis steht der Widerruf.
              </p>
            </Rueckfrage>
          ) : null}
          <Rueckfrage
            ausloeser="Entziehen"
            ausloeserVariante="quiet"
            bestaetigen="Vertretung entziehen"
            bestaetigenLaeuft="Wird entzogen …"
            fehler={entziehen.error?.message}
            onBestaetigen={() => entziehen.mutateAsync()}
          >
            <p>
              Die Vertretung endet endgültig, etwa wenn eine Vollmacht widerrufen, eine Betreuung
              aufgehoben oder die Person verstorben ist. Der Zugang der Person selbst bleibt.
            </p>
          </Rueckfrage>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Eine Vertretung einrichten: Art, Name, Nachweis und — bei der Begleitung —
 * die Einwilligung der Person (ADR-023 Punkt 13). Die Begleitung soll vor Ort
 * in zwei Minuten stehen; der erlaubte Weg muss der leichtere sein (B5).
 */
function VertretungEinrichten({
  art,
  verhaeltnisId,
  praxis,
  onAbbrechen,
  onEingerichtet,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  praxis: string;
  onAbbrechen: () => void;
  onEingerichtet: (einladung: Einladung, fuer: string) => void;
}) {
  const queryClient = useQueryClient();
  const gruppe = useId();
  const [zugangsart, setZugangsart] = useState<Vertretungsart>('companion');
  const [grundlage, setGrundlage] = useState<Rechtsgrundlage>('guardianship');
  const [name, setName] = useState('');
  const [ausweis, setAusweis] = useState(false);
  const [vollmacht, setVollmacht] = useState(false);
  const [aufgabenkreis, setAufgabenkreis] = useState(false);
  const [fruehere, setFruehere] = useState(false);
  const [rechnungen, setRechnungen] = useState(false);
  const [eingewilligt, setEingewilligt] = useState(false);
  const [zweifel, setZweifel] = useState(false);

  const einrichten = useMutation({
    mutationFn: () => {
      const dokumente: string[] = ausweis ? ['identity_document'] : [];
      if (zugangsart === 'legal_representative' && vollmacht) {
        dokumente.push(vollmachtsdokument(grundlage));
      }
      return invitePlatformRepresentation(art, verhaeltnisId, {
        zugangsart,
        grundlage: zugangsart === 'legal_representative' ? grundlage : null,
        name: name.trim(),
        dokumente,
        // ABN-010: Gesundheitssorge bei Betreuung und Vorsorgevollmacht.
        aufgabenkreis:
          zugangsart === 'legal_representative' && grundlage !== 'custody' ? aufgabenkreis : null,
        fassung:
          zugangsart === 'companion' && eingewilligt ? EINWILLIGUNG_BEGLEITUNG_FASSUNG : null,
        fruehereNachrichten: zugangsart === 'companion' ? fruehere : null,
        rechnungen,
        zweifel: zweifel && zugangsart === 'legal_representative',
      });
    },
    onSuccess: async (einladung) => {
      await queryClient.invalidateQueries({
        queryKey: vertretungsschluessel(art, verhaeltnisId),
      });
      onEingerichtet(einladung, name.trim());
    },
  });
  // LOG-EPIC-001: Der Zweifel wird mit der rechtlichen Vertretung gespeichert
  // (ANN-207 Fassung 2), nicht mehr sofort als Auditeintrag.
  function zweifeln(): Promise<void> {
    setZweifel(true);
    setZugangsart('legal_representative');
    return Promise.resolve();
  }

  function absenden(event: FormEvent) {
    event.preventDefault();
    einrichten.mutate();
  }

  const begleitung = zugangsart === 'companion';
  const vollstaendig =
    name.trim().length >= 2 &&
    ausweis &&
    (begleitung ? eingewilligt : vollmacht && (grundlage === 'custody' || aufgabenkreis));

  return (
    <form
      onSubmit={absenden}
      aria-label="Vertretung einrichten"
      className="rounded-card border-line bg-surface-sunken mt-3 flex flex-col gap-4 border p-4"
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="text-ink text-sm font-medium">Art</legend>
        {(['companion', 'legal_representative'] as const).map((k) => (
          <label key={k} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
            <input
              type="radio"
              name={`${gruppe}-art`}
              className="border-line-strong text-accent focus-visible:outline-accent mt-0.5 size-5 shrink-0"
              checked={zugangsart === k}
              disabled={k === 'companion' && zweifel}
              onChange={() => setZugangsart(k)}
            />
            <span className="text-sm">
              <span className="text-ink block font-medium">{VERTRETUNGSART[k]}</span>
              <span className="text-ink-muted block">
                {k === 'companion'
                  ? 'Angehörige oder Vertraute, mit Einwilligung der Person. Liest mit, schreibt Terminwünsche und Nachrichten; keine Einwilligung, kein Widerruf, kein Datenexport.'
                  : 'Sorgeberechtigte, Betreuung oder Vorsorgevollmacht. Darf, was die Person darf, soweit der Nachweis reicht; Rechnungen nur mit Vermögenssorge.'}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {zweifel ? (
        <Statusmeldung ton="warnung">
          Eine Begleitung gibt es nicht, weil die Praxis an der Einwilligungsfähigkeit zweifelt;
          möglich ist eine rechtliche Vertretung. An ihr wird nur der Zweifel vermerkt, ohne Grund.
        </Statusmeldung>
      ) : null}

      <Field
        label="Name der vertretenden Person"
        hint="Vor- und Nachname, wie im Ausweis."
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {!begleitung ? (
        <Select
          label="Worauf beruht die Vertretung?"
          value={grundlage}
          onChange={(e) => {
            setGrundlage(e.target.value as Rechtsgrundlage);
            setVollmacht(false);
            setAufgabenkreis(false);
            setRechnungen(false);
          }}
        >
          {(['guardianship', 'power_of_attorney', 'custody'] as const).map((g) => (
            <option key={g} value={g}>
              {RECHTSGRUNDLAGE[g]}
            </option>
          ))}
        </Select>
      ) : null}

      <fieldset className="flex flex-col">
        <legend className="text-ink text-sm font-medium">Angesehen</legend>
        <p className="text-ink-muted text-sm">
          Gespeichert wird nur der Vermerk, nie das Dokument und keine Nummer.
        </p>
        <Checkbox
          label={NACHWEISDOKUMENT.identity_document}
          checked={ausweis}
          onChange={(e) => setAusweis(e.target.checked)}
        />
        {!begleitung ? (
          <Checkbox
            label={NACHWEISDOKUMENT[vollmachtsdokument(grundlage)]}
            checked={vollmacht}
            onChange={(e) => setVollmacht(e.target.checked)}
          />
        ) : null}
        {!begleitung && grundlage !== 'custody' ? (
          <Checkbox
            label={
              grundlage === 'guardianship'
                ? 'Der Aufgabenkreis umfasst die Gesundheitssorge'
                : 'Die Vollmacht umfasst die Gesundheitssorge'
            }
            checked={aufgabenkreis}
            onChange={(e) => setAufgabenkreis(e.target.checked)}
          />
        ) : null}
        {/* ABN-010 (BEF-119): Rechnungen nur bei nachgewiesener Vermögenssorge. */}
        {!begleitung ? (
          <Checkbox
            label={
              grundlage === 'guardianship'
                ? 'Der Aufgabenkreis umfasst die Vermögenssorge (Rechnungen)'
                : grundlage === 'custody'
                  ? 'Das Sorgerecht umfasst die Vermögenssorge (Rechnungen)'
                  : 'Die Vollmacht umfasst die Vermögenssorge (Rechnungen)'
            }
            hint="Ohne dieses Häkchen sieht die Vertretung keine Rechnungen."
            checked={rechnungen}
            onChange={(e) => setRechnungen(e.target.checked)}
          />
        ) : null}
      </fieldset>

      {begleitung ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink text-sm font-medium">Einwilligung der Person</legend>
          <Checkbox
            label="Frühere Nachrichten mit den Antworten der Praxis sind sichtbar"
            checked={fruehere}
            onChange={(e) => {
              setFruehere(e.target.checked);
              setEingewilligt(false);
            }}
          />
          {/* ABN-010 (BEF-116): der Umfang je Bereich, ausdrücklich im Wortlaut. */}
          <Checkbox
            label="Rechnungen und Zahlungen sind sichtbar"
            checked={rechnungen}
            onChange={(e) => {
              setRechnungen(e.target.checked);
              setEingewilligt(false);
            }}
          />
          <div className="bg-surface border-line rounded-card border p-3 text-sm">
            <p className="text-ink-muted mb-2">Bitte der Person zum Lesen geben.</p>
            {einwilligungBegleitung({
              begleitung: name,
              praxis,
              fruehereNachrichten: fruehere,
              rechnungen,
            }).map((satz) => (
              <p key={satz} className="text-ink mt-1">
                {satz}
              </p>
            ))}
          </div>
          <Checkbox
            label="Die Person hat den Text auf diesem Gerät gelesen und willigt ein."
            hint="Sie willigt selbst ein, nicht die begleitende Person."
            checked={eingewilligt}
            onChange={(e) => setEingewilligt(e.target.checked)}
          />
          <div>
            <Rueckfrage
              ausloeser="Zweifel an der Einwilligungsfähigkeit"
              ausloeserVariante="quiet"
              bestaetigen="Vermerken"
              bestaetigenLaeuft="Wird vermerkt …"
              onBestaetigen={zweifeln}
            >
              <p>
                Dann gibt es keine Begleitung, nur eine rechtliche Vertretung. An ihr wird vermerkt,
                dass gezweifelt wurde, kein Grund und keine Diagnose.
              </p>
            </Rueckfrage>
          </div>
        </fieldset>
      ) : null}

      {einrichten.error ? (
        <Statusmeldung ton="fehler">{einrichten.error.message}</Statusmeldung>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!vollstaendig || einrichten.isPending}>
          {einrichten.isPending ? 'Wird eingerichtet …' : 'Code anzeigen'}
        </Button>
        <Button type="button" variant="quiet" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
