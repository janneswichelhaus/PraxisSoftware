# ADR-001: Online-first mit begrenzter Offline-Fähigkeit
## Status
Angenommen, Fassung 1 (2026-08-28); Mechanismus und Folgefragen beantwortet ADR-024.

## Kontext
Am Hausbesuch (§1, §2.2) fehlt oft Empfang; eine Vollakte auf mobilen, teils privaten Geräten
verteilte Gesundheitsdaten (§16), rein online würde aus dem Gedächtnis nachdokumentiert. Bewusst
nicht Bestandteil: MDM, Remote Wipe, Termin- und Routenplanung offline, native Apps (§2.2).

## Entscheidung
1. **Online-first:** vollständig funktionsfähig ohne Offline-Betrieb; primäre Quelle ist der Server.
2. Eine **vollständige Patientenakte wird nicht generell offline vorgehalten**.
3. Eine **begrenzte Offline-Fähigkeit soll architektonisch möglich sein**, insbesondere für
   Tagesplan, minimal notwendige Hausbesuchsdaten und nicht finalisierte Dokumentationsentwürfe.
4. **Offline erstellte Dokumentation darf erst nach erfolgreicher Serversynchronisation finalisiert
   werden**; Finalisierung ist ein serverseitiger Vorgang und kann offline nicht stattfinden.
5. **Synchronisation darf klinische Dokumentation niemals über ein einfaches Last-Write-Wins-Modell
   überschreiben**: Sie ist additiv, Konkurrierendes wird neue Version oder Konflikt (§5, §13).
6. Den **konkreten technischen Offline-Mechanismus** legt nicht dieser ADR fest, sondern ADR-024.

## Konsequenzen
- Der Lebenszyklus trennt mindestens lokalen Entwurf, Serverentwurf und Finalisiertes. Feste
  Feldliste der Hausbesuchsdaten, sonst wächst sie zur Vollakte (ADR-024 Punkt 6, auch Gerät,
  Vorhaltedauer). Fehlende Vorgeschichte im Funkloch berücksichtigt das Ausfallkonzept (E2).
  Verbindungs- und Sync-Status sind deutlich sichtbar: Niemand darf Lokales für dokumentiert halten.

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen (A1); Vermerk 2026-10-11: Punkt 6 beantwortet ADR-024.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
