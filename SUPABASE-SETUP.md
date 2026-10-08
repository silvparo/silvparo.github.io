# KOBOM Admin – aktuell lokal, später Supabase

## Sofort nutzbar: lokale Admin-Vorschau

1. Starte `index.html` über einen lokalen Webserver (z. B. `python -m http.server 8000` im Website-Verzeichnis).
2. Öffne die Website und klicke im Footer auf **Admin Login**.
3. Klicke auf **Lokale Admin-Demo starten** – hierfür gibt es bewusst kein Fake-Passwort.
4. Bearbeite **Home** oder **Aktuell** direkt im Text. Klicke auf **Lokal speichern**.
5. Änderungen werden im `localStorage` nur dieses Browsers gespeichert; der ursprüngliche HTML-Code bleibt unverändert und andere Nutzer sehen die Änderungen nicht.
6. **Original wiederherstellen** setzt die beiden Bereiche auf den HTML-Ausgangsstand zurück.

> Wichtig: Die Demo ist **keine echte Zugangsverwaltung**. Browser-HTML und
> localStorage können keine Administratoren sicher authentifizieren.

## Später: echter Admin-Login & Datenbank mit Supabase

1. Erstelle ein Supabase-Projekt.
2. Führe `supabase-schema.sql` im SQL Editor aus (RLS wird aktiviert).
3. Erstelle in **Authentication > Users** den Admin-Nutzer per E-Mail und Passwort.
4. Kopiere die UUID des Nutzers, und führe im SQL Editor diesen Befehl aus:
   `insert into public.site_admins (user_id) values ('UUID-DES-ADMIN-NUTZERS');`
5. Trage die **Project URL** sowie den **publishable key** (alternativ anon key) in `supabase-config.js` ein.
6. Veröffentliche die Website über HTTPS. Der Browser lädt dann für alle Besucher den aktuellen Inhalt aus `public.site_pages`.
7. Nur angemeldete und in `site_admins` eingetragene Nutzer dürfen Änderungen veröffentlichen.

**Wichtig:** Verwende niemals den `service_role` oder einen Secret-Key in Browser-Dateien.

**Hinweis:** Für den allerersten Datensatz zeigt die Site den HTML-Ausgangsstand an. Der erste Admin-Speichervorgang erstellt den Datensatz `home` in der Datenbank.

## Bearbeitbare Bereiche

- **Home**: Willkommenstext und Begrüssung.
- **Aktuell**: Termine, Seminar- und Reisemeldungen, Bilder und PDF-Links auf der Startseite.

Das einfache Seitenlayout, die Originalfarben und die anderen Unterseiten bleiben erhalten.
