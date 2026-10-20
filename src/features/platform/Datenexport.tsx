import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BENACHRICHTIGUNGEN, istBenachrichtigungsart } from '@/lib/begriffe';
import { formatEuro } from '@/lib/geld';
import {
  type Benachrichtigungsexport,
  type Datenexport as Daten,
  type Plattformzugang,
} from './api';
import { usePlattformApi } from './einsicht';
import { EINWILLIGUNGSTEXTE } from './einwilligungstexte';
import { THEMA_NAME } from './nachrichtentexte';
import { PLATTFORM_PFAD } from './pfade';
import { terminBeschreibung } from './terminbeschreibung';
import { datum, tagLang, zeitraum } from './zeit';

/**
 * „Ich → Meine Daten" (POR-018, IDEA-QSN-003, ANN-265).
 *
 * Ein Knopf stellt die Daten zusammen - erst dann, weil jeder Abruf im
 * Protokoll der Praxis steht. Danach zwei Wege: als Datei speichern
 * (maschinenlesbar, Art. 20 DSGVO) oder lesbar ansehen und drucken. Der
 * Inhalt ist, was die Plattform zeigt, nicht die Akte; die Kopie der Akte
 * gibt die Praxis (ADR-023 Punkt 12). Das steht vorher da.
 *
 * Eine Begleitung bekommt nur ihre eigene Wahl zu Benachrichtigungen
 * (BEF-189, ADR-023 Punkt 13 Fassung 6); verbindlich prüft der Server.
 */
export function Datenexport({ zugang }: { zugang: Plattformzugang }) {
  return zugang.access_kind === 'companion' ? (
    <EigeneBenachrichtigungen zugang={zugang} />
  ) : (
    <GanzerExport zugang={zugang} />
  );
}

function GanzerExport({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const [ergebnis, setErgebnis] = useState<{ daten: Daten; roh: unknown } | null>(null);
  const abrufen = useMutation({
    mutationFn: () => api.ladeDatenexport(zugang.access_id),
    onSuccess: setErgebnis,
  });
  const fuer = zugang.access_kind === 'legal_representative' ? zugang.represented_name : null;

  return (
    <>
      <Rueckweg
        standard={`${PLATTFORM_PFAD}/ich`}
        beschriftung="Zu „Ich“"
        className="print:hidden"
      />
      <PageHeader title="Meine Daten" />
      {ergebnis ? null : (
        <>
          {/* Was drin ist und was nicht - vor dem Abruf (ADR-023 Punkt 12). */}
          <p className="text-ink max-w-prose text-base leading-relaxed">
            {fuer ? `Sie holen hier die Daten von ${fuer}. ` : ''}
            Sie bekommen alles, was Sie hier auf der Plattform sehen: Ihre Angaben zur Person,
            Termine, Wünsche, {zugang.relationship_kind === 'treatment' ? 'Befundbogen, ' : ''}
            Rechnungen, Dokumente und Einwilligungen.
          </p>
          <p className="text-ink mt-3 max-w-prose text-base leading-relaxed">
            {zugang.relationship_kind === 'treatment'
              ? 'Eine vollständige Kopie Ihrer Akte bekommen Sie bei der Praxis.'
              : 'Eine vollständige Auskunft bekommen Sie bei der Praxis.'}
          </p>
          {abrufen.error ? (
            <Statusmeldung ton="fehler" className="mt-6">
              {abrufen.error.message}
            </Statusmeldung>
          ) : null}
          <Formularfuss>
            <Button type="button" onClick={() => abrufen.mutate()} disabled={abrufen.isPending}>
              {abrufen.isPending ? 'Wird zusammengestellt …' : 'Daten zusammenstellen'}
            </Button>
          </Formularfuss>
        </>
      )}
      {ergebnis ? <Ergebnis daten={ergebnis.daten} roh={ergebnis.roh} /> : null}
    </>
  );
}

/** Die Datei: genau die Antwort des Servers, eingerückt. */
function speichern(roh: unknown, exportiertAm: string, name = 'meine-daten') {
  const blob = new Blob([JSON.stringify(roh, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${exportiertAm.slice(0, 10)}.json`;
  link.click();
  // Erst später freigeben: Manche Browser (älteres Safari) brechen den
  // Download sonst ab (Zweitreview).
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const STATUS: Record<Daten['appointments'][number]['status'], string> = {
  confirmed: 'geplant',
  completed: 'durchgeführt',
  cancelled: 'abgesagt',
  no_show: 'nicht wahrgenommen',
};

const EINWILLIGUNG: Record<Daten['consents'][number]['state'], string> = {
  open: 'nicht entschieden',
  granted: 'erteilt',
  withdrawn: 'widerrufen',
  refused: 'abgelehnt',
};

function Ergebnis({ daten, roh }: { daten: Daten; roh: unknown }) {
  const p = daten.person as Record<string, string | null | undefined>;
  const name = [p.given_name, p.family_name].filter(Boolean).join(' ');
  const anschrift = [
    [p.street, p.house_number].filter(Boolean).join(' '),
    [p.postal_code, p.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  const telefone = [p.phone, p.phone_mobile, p.phone_work].filter(Boolean).join(', ');

  return (
    <>
      <Statusmeldung ton="erfolg" className="print:hidden">
        Ihre Daten sind zusammengestellt.
      </Statusmeldung>
      <div className="mt-4 flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto print:hidden">
        <Button type="button" onClick={() => speichern(roh, daten.exported_at)}>
          Als Datei speichern
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Drucken
        </Button>
      </div>
      <Kleingedrucktes className="mt-3 print:hidden">
        Die Datei ist im Format JSON. Andere Programme können sie lesen.
      </Kleingedrucktes>

      <p className="text-ink mt-6 text-base">
        Stand {datum(daten.exported_at)} · {daten.organization}
      </p>

      <Abschnitt titel="Angaben zur Person">
        <Zeile label="Name">{name || '–'}</Zeile>
        {p.date_of_birth ? <Zeile label="Geburtsdatum">{datum(p.date_of_birth)}</Zeile> : null}
        {anschrift ? <Zeile label="Anschrift">{anschrift}</Zeile> : null}
        {telefone ? <Zeile label="Telefon">{telefone}</Zeile> : null}
        {p.email ? <Zeile label="E-Mail">{p.email}</Zeile> : null}
      </Abschnitt>

      <Abschnitt
        titel={`Termine (${daten.appointments.length})`}
        leer={daten.appointments.length === 0}
      >
        {daten.appointments.map((t) => (
          <Zeile key={t.id} label={`${tagLang(t.starts_at)}, ${zeitraum(t.starts_at, t.ends_at)}`}>
            {terminBeschreibung(t).titel} · {STATUS[t.status]}
          </Zeile>
        ))}
      </Abschnitt>

      <Abschnitt
        titel={`Terminwünsche (${daten.appointment_requests.length})`}
        leer={daten.appointment_requests.length === 0}
      >
        {daten.appointment_requests.map((w) => (
          <Zeile key={w.id} label={datum(w.created_at)}>
            {w.kind === 'new' ? 'Termin gewünscht' : w.kind === 'change' ? 'Änderung' : 'Absage'}
            {w.answer ? ` · Antwort: ${w.answer}` : ''}
          </Zeile>
        ))}
      </Abschnitt>

      {/* KOM-004: die eigenen Nachrichten mit Antworten. */}
      <Abschnitt
        titel={`Nachrichten (${daten.messages.length})`}
        leer={daten.messages.length === 0}
      >
        {daten.messages.map((m) => (
          <Zeile key={m.id} label={datum(m.created_at)}>
            {THEMA_NAME[m.topic]} · {m.entries.length}{' '}
            {m.entries.length === 1 ? 'Eintrag' : 'Einträge'}
          </Zeile>
        ))}
      </Abschnitt>

      {daten.relationship === 'treatment' ? (
        <Abschnitt
          titel={`Befundbogen (${daten.questionnaires.length})`}
          leer={daten.questionnaires.length === 0}
        >
          {daten.questionnaires.map((b) => (
            <Zeile key={b.id} label={datum(b.recorded_on)}>
              {b.status === 'abgeschlossen' ? 'abgeschickt' : 'Entwurf'}
            </Zeile>
          ))}
        </Abschnitt>
      ) : null}

      <Abschnitt titel={`Rechnungen (${daten.invoices.length})`} leer={daten.invoices.length === 0}>
        {daten.invoices.map((r) => (
          <Zeile key={r.id} label={`${r.invoice_number} vom ${datum(r.issued_on)}`}>
            {formatEuro(r.total_cents, r.currency)}
            {r.cancelled ? ' · storniert' : ''}
          </Zeile>
        ))}
      </Abschnitt>

      {/* ANG-008: die eigenen Trainingspakete. */}
      {daten.relationship === 'training' ? (
        <Abschnitt
          titel={`Trainingspakete (${daten.training_packages.length})`}
          leer={daten.training_packages.length === 0}
        >
          {daten.training_packages.map((k) => (
            <Zeile key={k.starts_on} label={`${datum(k.starts_on)} bis ${datum(k.ends_on)}`}>
              {k.label} · {formatEuro(k.price_cents, k.currency)}
            </Zeile>
          ))}
        </Abschnitt>
      ) : null}

      {/* KND-003: der im Konto geschlossene Trainingsvertrag. */}
      {daten.training_contract ? (
        <Abschnitt titel="Trainingsvertrag">
          <Zeile label={`Geschlossen am ${datum(daten.training_contract.concluded_at)}`}>
            {daten.training_contract.label} ·{' '}
            {formatEuro(daten.training_contract.price_cents, daten.training_contract.currency)}
          </Zeile>
        </Abschnitt>
      ) : null}

      {daten.relationship === 'treatment' ? (
        <Abschnitt
          titel={`Dokumente (${daten.documents.length})`}
          leer={daten.documents.length === 0}
        >
          {daten.documents.map((d) => (
            <Zeile key={d.id} label={d.display_name}>
              freigegeben am {datum(d.released_at)}
            </Zeile>
          ))}
        </Abschnitt>
      ) : null}

      <Abschnitt titel="Einwilligungen">
        {daten.consents.map((e) => (
          <Zeile key={e.purpose} label={EINWILLIGUNGSTEXTE[e.purpose].titel}>
            {EINWILLIGUNG[e.state]}
            {e.occurred_on ? ` am ${datum(e.occurred_on)}` : ''}
          </Zeile>
        ))}
      </Abschnitt>
    </>
  );
}

/**
 * Der Export einer Begleitung (BEF-189): ihre eigene Wahl, die Geräte nur als
 * Anzahl, die Zustellungen als Anzahl - wie im ganzen Export. Daten der
 * Person gibt es hier nicht.
 */
function EigeneBenachrichtigungen({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const [ergebnis, setErgebnis] = useState<{
    daten: Benachrichtigungsexport;
    roh: unknown;
  } | null>(null);
  const abrufen = useMutation({
    mutationFn: () => api.ladeBenachrichtigungsexport(zugang.access_id),
    onSuccess: setErgebnis,
  });
  const wahl = ergebnis?.daten.notifications.settings ?? null;
  const arten = (liste: string[] | undefined) =>
    liste && liste.length > 0
      ? liste
          .map((art) => (istBenachrichtigungsart(art) ? BENACHRICHTIGUNGEN[art].name : art))
          .join(', ')
      : 'keine';

  return (
    <>
      <Rueckweg
        standard={`${PLATTFORM_PFAD}/ich`}
        beschriftung="Zu „Ich“"
        className="print:hidden"
      />
      <PageHeader title="Meine Benachrichtigungen" />
      {ergebnis ? (
        <>
          <Statusmeldung ton="erfolg" className="print:hidden">
            Ihre Daten sind zusammengestellt.
          </Statusmeldung>
          <div className="mt-4 flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto print:hidden">
            <Button
              type="button"
              onClick={() =>
                speichern(ergebnis.roh, ergebnis.daten.exported_at, 'meine-benachrichtigungen')
              }
            >
              Als Datei speichern
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.print()}>
              Drucken
            </Button>
          </div>
          <Kleingedrucktes className="mt-3 print:hidden">
            Die Datei ist im Format JSON. Andere Programme können sie lesen.
          </Kleingedrucktes>
          <p className="text-ink mt-6 text-base">
            Stand {datum(ergebnis.daten.exported_at)} · {ergebnis.daten.organization}
          </p>
          <Abschnitt titel="Benachrichtigungen">
            <Zeile label="Per E-Mail">{arten(wahl?.email_kinds)}</Zeile>
            <Zeile label="Per Push">{arten(wahl?.push_kinds)}</Zeile>
            <Zeile label="Ruhezeit">
              {wahl && wahl.quiet_from !== null && wahl.quiet_until !== null
                ? `${wahl.quiet_from} bis ${wahl.quiet_until} Uhr`
                : 'keine eigene'}
            </Zeile>
            <Zeile label="Geräte">{ergebnis.daten.notifications.devices.length}</Zeile>
            <Zeile label="Zustellungen">{ergebnis.daten.notifications.deliveries.length}</Zeile>
          </Abschnitt>
        </>
      ) : (
        <>
          <p className="text-ink max-w-prose text-base leading-relaxed">
            Sie bekommen Ihre eigene Wahl zu Benachrichtigungen: Arten und Wege, Ruhezeit, Geräte
            und Zustellungen. Die Daten von {zugang.represented_name ?? 'der Person'} bekommen Sie
            hier nicht.
          </p>
          {abrufen.error ? (
            <Statusmeldung ton="fehler" className="mt-6">
              {abrufen.error.message}
            </Statusmeldung>
          ) : null}
          <Formularfuss>
            <Button type="button" onClick={() => abrufen.mutate()} disabled={abrufen.isPending}>
              {abrufen.isPending ? 'Wird zusammengestellt …' : 'Daten zusammenstellen'}
            </Button>
          </Formularfuss>
        </>
      )}
    </>
  );
}

/** Ein Teil der Auskunft: beschriftete Angaben, ohne Einträge ein Satz. */
function Abschnitt({
  titel,
  leer = false,
  children,
}: {
  titel: string;
  leer?: boolean;
  children: ReactNode;
}) {
  return (
    <Section titel={titel} rahmen>
      {leer ? (
        <p className="text-ink-muted text-base">Keine Einträge.</p>
      ) : (
        <DetailList>{children}</DetailList>
      )}
    </Section>
  );
}

function Zeile({ label, children }: { label: string; children: ReactNode }) {
  return <DetailRow label={label}>{children}</DetailRow>;
}
