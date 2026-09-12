# Statystyki zakończonych partii

Działa w wersji Cloudflare Pages pod https://puerto-rico-3rd-edition.pages.dev/.
Menu → **Statystyki partii**: liczba ukończonych gier, zwycięstwa ludzi i botów,
wyniki poziomów oraz filtry 3/4/5 graczy, składu stołu i rozszerzeń.

Zbieranie zaczyna się od tej aktualizacji. Nie odtwarza wcześniejszych partii.
Samouczek, praktyka uruchamiana z samouczka, niedokończone gry, areny botów,
LAN, EXE i samodzielny HTML nie wysyłają wyników do tej bazy.

## Dane i dostęp

Publiczny jest wyłącznie agregat GET /api/stats. Szczegółowe wyniki i historie
są prywatne w bazie D1; nie ma publicznego endpointu ich odczytu.

W raporcie są: UUID partii, czas rozpoczęcia/zakończenia, liczba graczy,
rozszerzenia, miejsca przy stole, człowiek/bot, wybrany i faktycznie użyty poziom,
składowe punktacji, monety/towary rozstrzygające remis, miejsca końcowe, powód
końca, liczba rund i ruchów oraz identyfikatory wersji gry i kodu botów.
Każdy ruch zawiera jego parametry, polski opis, wykonawcę, fazę, rundę, czas od
rozpoczęcia oraz zmiany stanu, łącznie z automatycznymi skutkami faz.
Czas jest czasem zegarowym, obejmuje przerwy i czas między zapisem a wznowieniem.
Numer rundy przy ruchu jest liczony od zera zgodnie z silnikiem; podgląd dodaje 1.

Wpisane nazwy graczy i zawierający je komunikat końca są usuwane przed wysyłką.
Baza statystyk nie zawiera IP, identyfikatora osoby ani konta gracza.
Standardowe przetwarzanie ruchu HTTP przez Cloudflare jest odrębną warstwą.

W przypadku Neural dla 4–5 graczy lub rozszerzeń zapisujemy selected=neural,
effective=hardcore. Publiczne zestawienie grupuje po effective.
Wersja bota to skrót źródeł silnika i botów przy rozpoczęciu partii.
build/endBuild i build każdego ruchu pozwalają rozpoznać wznowienie po aktualizacji.

Pełny remis dzieli jednostkę zwycięstwa między zwycięzców. Trzy takie same boty
w jednej partii to trzy występy, nie trzy partie. Serwer oblicza miejsca na
podstawie przesłanej punktacji i istniejącego porządku rozstrzygania remisów.

## Dostęp właściciela

W katalogu projektu, z istniejącą sesją Wrangler/Cloudflare:

```powershell
npm run stats:list
npm run stats:export -- UUID_PARTII
```

Eksport zapisuje dwa pliki w work/private-statistics/: JSON z danymi oraz HTML
do otwarcia lokalnie w przeglądarce. HTML zawiera listę ruchów, suwak, stan wysp
po wskazanym ruchu, statki/targ i wynik końcowy. Nie wymaga połączenia z serwerem.
To podgląd zapisanych stanów, nie ponowne uruchomienie losowań silnika.
Właściciel może również analizować tabelę matches w panelu D1 Cloudflare.

Eksportów nie wolno dołączać do dist-pages ani publicznego repozytorium.
Narzędzia właściciela korzystają z sesji Cloudflare, nie z hasła w kodzie strony.

## Trwałość i ograniczenia

- POST /api/matches zapisuje tylko ukończoną partię. PRIMARY KEY UUID i
  INSERT ... ON CONFLICT DO NOTHING zapewniają jeden wynik mimo ponowień.
- UUID i historia są w istniejącym zapisie gry. Ponowne rozegranie tego samego
  zapisu nie dodaje kolejnego wyniku; serwer zachowuje pierwszy ukończony wynik.
- Wczytanie starego zapisu rozpoczyna historię od wznowienia i oznacza ją jako
  niepełną. Nowy identyfikator jest od razu dopisywany do zapisu.
- Wynik oczekujący na sieć pozostaje w lokalnej kolejce. Wysyłka jest ponawiana
  po otwarciu strony, odzyskaniu sieci i co minutę. Nie blokuje ruchów.
- Brak miejsca w przeglądarce ogranicza historię, zachowując wynik i UUID.
  Całkowity brak lokalnego storage oznacza, że trzeba pozostawić stronę otwartą
  do przesłania wyniku; ekran końca wyraźnie o tym informuje.
- Limit historii: 850 kB zmian i 5000 ruchów. Po przekroczeniu nadal zapisujemy
  wynik i końcowy stan, a historię oznaczamy jako niepełną.
- Serwer ogranicza rozmiar żądania do 1,2 MB, waliduje strukturę, punktację,
  poziomy, ścieżki zmian i Origin. Nie przechowuje nieudanych zgłoszeń.
- Wyniki są zgłaszane przez przeglądarki. Sprawdzenie Origin nie uwierzytelnia
  autora i nie zapobiega fałszowaniu wyników przez własnego klienta HTTP.
  To materiał obserwacyjny, nie ranking odporny na oszustwa. Przed wykorzystaniem
  do treningu lub oceny siły botów dane wymagają selekcji i kontroli jakości.
- Nie ma automatycznego kasowania archiwum. Właściciel powinien obserwować
  zużycie miejsca D1; przeniesienie starszych historii do skompresowanego archiwum
  można dodać, gdy pojawi się większa liczba gier.

## Publikacja i kontrola

Baza: puerto-rico-match-statistics, binding produkcji: STATS_DB.
API jest osobnym modułem statistics-server/worker.ts. Silnik i boty nie zależą
od zapisu statystyk. Rejestrator działa przy pomyślnych akcjach w useGameRunner.

Jednorazowa, idempotentna konfiguracja bazy i bindingu:
`npm run stats:setup`. Narzędzie zachowuje pozostałą konfigurację Pages.

```powershell
npm run check
npm run check:stats
npm test -- --configLoader native --pool threads --maxWorkers 2
npm run build:pages
npm run pages:upload
npm run pages:verify
```

Sprawdzone na Node.js 24. Testy używają node:sqlite do wykonania rzeczywistych
zapytań SQL. Build używa istniejącego Vite/Rolldown, bez dodatkowych zależności.
_worker.js i _routes.json są wysyłane jako worker Pages, a nie publiczne zasoby.
Tylko /api/* uruchamia worker; grafika i pliki gry pozostają zwykłymi zasobami Pages.

Sprawdzono pełne partie dla 3/4/5 graczy, partię ze wszystkimi rozszerzeniami,
odtwarzanie zmian stanu, anonimowość danych, zapis/wznowienie, limity storage,
remisy, filtrowanie SQL, deduplikację, odrzucanie niepoprawnych zgłoszeń
oraz ponowienie po utracie sieci. Test zapisu do produkcyjnego D1 potwierdził
wynik i historię 229 ruchów (około 142 kB); testowy rekord usunięto po kontroli.

