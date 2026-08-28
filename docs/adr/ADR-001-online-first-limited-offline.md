# ADR-001: Online-first mit begrenzter Offline-Fähigkeit

## Status

Angenommen

## Datum

2026-08-28

## Kontext

`PROJECT_PRINCIPLES.md` §2.2 fordert Mobile First: Therapeut:innen arbeiten
regelmäßig außerhalb der Praxis, alle zentralen Funktionen müssen auf dem
Smartphone praktikabel sein. §1 nennt Hausbesuche und mobile Versorgung als
Kernszenario. In Wohnungen, Kellern und Hinterhäusern ist fehlender Empfang
kein Ausnahmefall.

Gleichzeitig gilt §13: Dokumentation darf niemals unbemerkt verloren gehen
oder überschrieben werden. §16 stellt Patientensicherheit und Datenschutz über
Usability und Entwicklungsgeschwindigkeit.

Daraus entsteht ein echter Zielkonflikt. Eine vollständige Patientenakte auf
dem Endgerät würde die Verfügbarkeit am Patienten maximieren, aber
Gesundheitsdaten dauerhaft auf mobilen, teils privaten Geräten verteilen —
mit entsprechendem Risiko bei Verlust, Diebstahl oder Weitergabe des Geräts.
Eine reine Online-Anwendung wiederum führt dazu, dass am Hausbesuch faktisch
nicht dokumentiert wird und Doku später aus dem Gedächtnis nachgetragen wird.

Diese Entscheidung war als Punkt A1 in `docs/decisions/OPEN_DECISIONS.md`
als P0 offen.

## Entscheidung

1. Die Anwendung ist **online-first**.
2. Eine **vollständige Patientenakte wird nicht generell offline vorgehalten**.
3. Eine **begrenzte Offline-Fähigkeit soll architektonisch möglich sein**,
   insbesondere für
   - den Tagesplan,
   - die minimal notwendigen Hausbesuchsdaten,
   - nicht finalisierte Dokumentationsentwürfe.
4. **Offline erstellte Dokumentation darf erst nach erfolgreicher
   Serversynchronisation finalisiert werden.**
5. **Synchronisation darf klinische Dokumentation niemals über ein einfaches
   Last-Write-Wins-Modell überschreiben.**
6. Der **konkrete technische Offline-Mechanismus ist noch nicht festgelegt**.

## Konsequenzen

- Die Anwendung muss ohne Offline-Betrieb vollständig funktionieren. Offline
  ist eine Ergänzung, kein Fundament — die Architektur darf sich nicht auf
  einen lokalen Datenbestand als primäre Quelle stützen.
- Das Dokumentationsmodell braucht einen expliziten Lebenszyklus, der
  mindestens zwischen lokalem Entwurf, serverseitig gespeichertem Entwurf und
  finalisierter Dokumentation unterscheidet. Finalisierung ist ein
  serverseitiger Vorgang und kann offline nicht stattfinden.
- Synchronisation muss additiv arbeiten: konkurrierende Änderungen erzeugen
  eine neue Version beziehungsweise einen aufzulösenden Konflikt, niemals ein
  stilles Überschreiben. Das ist die direkte Umsetzung von §13 und wirkt auf
  das Versionierungsmodell aus §5.
- Offline gehaltene Daten sind Gesundheitsdaten. Sobald der Offline-Umfang
  festgelegt wird, entstehen Anforderungen an das Endgerät
  (Geräteverschlüsselung, Sperrcode, Umgang mit privaten Geräten) sowie an
  die lokale Vorhaltedauer.
- Die Beschränkung auf „minimal notwendige Hausbesuchsdaten" ist eine
  Datenminimierungsmaßnahme und muss als konkrete Feldliste definiert werden,
  sonst wächst sie im Betrieb unkontrolliert zur Vollakte.
- Da die vollständige Akte offline nicht verfügbar ist, kann im Funkloch
  Vorgeschichte fehlen. Das Ausfall- und Notfallverhalten der Praxis muss das
  berücksichtigen (offener Punkt E2).
- Die Oberfläche muss Verbindungs- und Synchronisationsstatus deutlich
  anzeigen. Niemand darf glauben, dokumentiert zu haben, während der Entwurf
  noch lokal liegt.
- Der Verzicht auf Last-Write-Wins schließt einige einfache Sync-Bibliotheken
  als Gesamtlösung aus und erhöht den Implementierungsaufwand bewusst.

## Bewusst nicht Bestandteil dieser Entscheidung

- Der technische Mechanismus für Offline-Betrieb und Synchronisation
  (Service Worker, lokale Datenhaltung im Browser, Sync-Engine,
  Konfliktdatenstrukturen).
- Die konkrete Feldliste der offline verfügbaren Hausbesuchsdaten.
- Die maximale Vorhaltedauer lokaler Daten auf dem Endgerät.
- Geräte- und BYOD-Richtlinie, Mobile-Device-Management, Remote Wipe.
- Das Offline-Verhalten von Terminplanung und Routenplanung.
- Die Entscheidung gegen native Apps — die bleibt bei §2.2 (PWA in der ersten
  Entwicklungsphase).

## Offene Folgefragen

- Welche Felder gehören zu den „minimal notwendigen Hausbesuchsdaten"?
- Wie lange darf ein lokaler Entwurf unsynchronisiert bestehen bleiben, und
  was passiert danach?
- Wie sieht die Konfliktauflösung konkret aus: wer löst auf, in welcher
  Oberfläche, und wie bleiben beide Fassungen nach §5 nachvollziehbar?
- Welche Geräteanforderungen werden verpflichtend, und wie werden sie
  durchgesetzt?
- Wie wird verhindert, dass ein nicht synchronisierter Entwurf bei
  Geräteverlust ersatzlos verloren geht (§13 „Dokumentation verlieren")?
- Wie verhält sich eine verzögerte Synchronisation zur Anforderung zeitnaher
  Dokumentation nach §630f BGB?
- Sind offline gelesene Daten auditpflichtig, und wie wird ein Offline-Zugriff
  im Audit-Log nachgeführt (Bezug ADR-004)?
