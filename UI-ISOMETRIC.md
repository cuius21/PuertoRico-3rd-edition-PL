# Interfejs izometryczny Puerto Rico

Nowa prezentacja zachowuje istniejący silnik, boty, zapisy i protokół LAN. Gra działa lokalnie w przeglądarce; Cloudflare udostępnia pliki aplikacji.

## Podział kodu

- `src/presentation/iso/projection.ts`: projekcja siatki i układ 12 pól plantacji oraz 12 miejsc miasta. Duże budynki zajmują dwa sąsiednie pola prezentacji; kluczem pozostaje identyfikator budynku.
- `iso/layout.ts`: większe wyspy graczy i oddzielny, największy obrys San Juan; rozmieszczenie obiektów i ścieżek.
- `renderer/ambient.ts`: zapętlone spacery mieszkańców i parametry kołysania, niezależne od czasu gry oraz RNG.
- `ui/WorldDialog.tsx`, `ui/RoleDeck.tsx`, `interaction/roleChoices.ts`: okna modalne z obsługą klawiatury oraz karty wybierające aktualną legalną akcję, także konkretną kartę Poszukiwacza.
- `adapter/buildSceneSnapshot.ts`: kopia publicznego stanu w postaci prostych danych. Nie kopiuje talii zakrytych plantacji ani nie wywołuje RNG.
- `renderer/WorldRenderer.ts`: PixiJS 8 / WebGL, kamera, grafika terenu, kolejność rysowania według wysokości podstawy obiektu i animacje. Działa na osobnym zegarze, maksymalnie 30 FPS.
- `interaction/actionBridge.ts`: klucz klikniętego obiektu → aktualne legalne akcje silnika. Kliknięcie przycisku ponownie wyszukuje obiekt Action w bieżącej liście. Nie tworzy własnych reguł.
- `ui/WorldGame.tsx`, `ui/WorldViewport.tsx`, `ui/world.css`: React, panel graczy, szczegóły, legalne ruchy, historia, ustawienia i cykl życia renderera.
- `assets/registry.ts`: nazwy i ramki grafik. Źródłowe pliki PNG są w `src/assets/isometric`.

GameScreen oraz MultiplayerGameScreen korzystają ze wspólnej prezentacji. Pozostają dotychczasowe useGameRunner, useMultiplayerGame, GameRunner, ServerGameRunner i GameSerializer. Zakończenie gry nadal korzysta z dotychczasowej tabeli wyników.

## Świat i obsługa

San Juan to wspólna wyspa: budynki i targ, plantacje do wyboru, magistrat oraz trzy statki. Włączenie dodatków pokazuje Festyn, Korsarza i szlachtę. Nowe budynki trafiają do wspólnego katalogu; kupione egzemplarze pojawiają się na wyspie właściciela.

Przyciski graczy przenoszą kamerę do odpowiednich wysp. Można przeciągać mapę, przybliżać kółkiem myszy, gestem dwóch palców lub przyciskami +/−. Wszystkie miejsca i obiekty są też dostępne przez przyciski HTML. Mapa zajmuje pełną szerokość. Kliknięcie obiektu z żółtą otoczką otwiera okno szczegółów; katalog budynków mieści się w przewijanym popupie. Wybór roli odbywa się przez ilustrowane karty, aktywna karta świeci na złoto. Akcje budowy są dostępne w oknie konkretnego budynku; pozostałe legalne ruchy pozostają pod mapą. Przycisk ? otwiera opis akcji i przywileju.

Animacje: wyraźniejsze fale, kołysanie palm i statków oraz chód robotników i szlachty. Dodatkowi mieszkańcy spacerują bez przerwy po zapętlonych trasach, nawet na początku partii. Są dekoracją; faktyczną obsadę pokazują znaczniki przy obiektach. Trasa pracownika biegnie po wizualnej siatce; dotarcie do celu niczego nie uruchamia w silniku. Stan obsady obowiązuje od razu. Przełącznik „Animacje: wł. / wył.” zapisuje tylko osobną preferencję interfejsu; domyślnie respektuje prefers-reduced-motion.

## Walidacja

- Kontrola TypeScript.
- 424 testy / 37 plików, w tym 17 testów prezentacji (obrysy i odstępy wysp, budynki na lądzie, pętle spacerów, dwie karty Poszukiwacza, indywidualny wybór plantacji) oraz granicy z silnikiem: projekcja, duże budynki, 3–5 graczy i dodatki, brak mutacji/RNG, zgodność zapisu, odrzucenie nieaktualnych akcji i pełna deterministyczna partia bota z prezentacją oraz bez.
- Kontrola SHA-256 139 istniejących plików actions, core, domain, state, server, src/bots, src/game i src/hooks: bez zmian.
- Testy w przeglądarce: uruchomienie, zapis/odczyt, zakup, rozmieszczenie robotnika, ruchy botów, mapa i dodatki; sprawdzenie desktop/mobile i konsoli przed publikacją.

## Granice obecnej wersji

To renderer 2.5D ze sprite’ami, bez obracania kamery w pełnym 3D. Grafiki są wygenerowane i można je niezależnie zastępować w rejestrze. Sześć źródłowych PNG waży około 14 MB; pierwsze otwarcie mapy wymaga ich pobrania. Przy braku WebGL karty postaci, przyciski miejsc i popupy z legalnymi ruchami pozostają dostępne.

Dalsze kosmetyczne ulepszenia (nowe animacje, bardziej szczegółowe brzegi, efekty zakupu i produkcji) można dodawać wewnątrz presentation bez trenowania botów lub zmiany zasad.

## Pracownicy i wybór plantacji — 10 września 2026

Przy Magistracie widać liczby robotników i szlachciców z jego zasobów oraz osobne stojące postacie. Na każdej wyspie oczekuje dokładnie pending + held osób każdego rodzaju; po przydziale grupa maleje, a po pasowaniu pozostaje jako rezerwa. Podczas Burmistrza karta pokazuje pending bieżącego gracza (również gdy rolę wybrał ktoś inny), a kamera przechodzi na jego wyspę. Dekoracyjni spacerowicze nie wchodzą do tych liczników.

Plantator uruchamia wskazówkę i strzałkę na plantacje w San Juan. Kliknięcie ilustracji surowca w popupie wywołuje aktualną legalną akcję bez pośredniego wyboru kafla; duplikaty i zamiana na las mają osobne klucze. Niedostępne kafle są nieaktywne. Wybór sprawdza świeżą listę akcji, a strzałka znika poza odpowiednią turą. Przycisk pod mapą zapewnia alternatywę dla klikania canvasu.

Zmiany obejmują wyłącznie prezentację, zasoby graficzne i testy. Nowe testy sprawdzają faktyczny przydział i rezerwę, przejście magistratu, granice gęstych grup, pojedynczy wybór surowca, Szałas i nieaktualne akcje.

## Dźwięki wyspy — 10 września 2026

Warstwa prezentacji odtwarza ciche pętle traffic i birds z dostarczonego katalogu audio. Church dołącza po 90 sekundach, następnie co 270 sekund. Dwa długie nagrania są strumieniowane, a krótkie dzwony korzystają z bufora Web Audio. Odtwarzanie nie korzysta ze stanu gry ani jej RNG.

Przycisk Dźwięk wycisza odgłosy; strzałka obok otwiera suwak głośności. Domyślnie 22%, ustawienia przechowywane lokalnie. Jeśli przeglądarka wymaga gestu, przycisk pokazuje Włącz dźwięk. Ukryta karta pauzuje nagrania i czas harmonogramu; wyjście do menu zwalnia odtwarzacze, połączenia audio i zegar. Brak dzwonów przy problemie sieciowym nie przerywa dwóch głównych nagrań ani gry.

Pliki src/assets/audio ważą łącznie 3,3 MB. Oryginały audio nie były zmieniane. Testy sprawdzają rzadkie dzwony, głośność, pauzę i wznowienie, obsługę blokady autoplay, wyjście podczas startu oraz zwolnienie zasobów.

## Wiatr i łąka — 10 września 2026

Dodana trzecia cicha pętla: summer meadow with wind autorstwa Garuda1982 (Freesound, CC0 1.0). Źródło i sposób przygotowania zapisano w src/assets/audio/README.md. Traffic i birds pozostają głównym tłem; meadow gra z niższą głośnością. Wszystkie trzy warstwy łagodnie cichną przy wejściu dzwonów i wracają po ich zakończeniu. Wspólne wyciszenie, ukrycie karty i wyjście z gry obejmują też nowe nagranie. Łączny rozmiar czterech plików audio: około 4,9 MB.

## Targowisko, rejsy i flagi — 10 września 2026

Targowisko ma własną drewnianą tabliczkę w San Juan, licznik zajętych miejsc i cztery skrzynki odpowiadające aktualnym towarom. Kliknięcie tabliczki lub przycisku Targowisko otwiera osobny popup; sprzedaż i dodatkowe akcje handlowe są przypisane do tego miejsca. Katalog Budynki ma oddzielne rzędy według ceny bazowej od 1 do 10 dublonów, z kolumnami ofert; podczas Budowniczego oferty pokazują cenę po zniżkach. Ikony monet i gwiazd mają tekstowe etykiety dla czytników ekranu.

Każda wyspa gracza ma maszt z falującą flagą w kolorze właściciela. Flaga otwiera podgląd jego wyspy. Tabliczka i flagi są rysowane wektorowo w Pixi, bez dodatkowych dużych plików graficznych.

ShipVoyages przechowuje wyłącznie historię wizualnych przejść statków i działa na zegarze renderera. Pełny statek płynie poza port przez 4,5 s, pozostawiając ślad na wodzie i znikając w oddali. Powrót bez ładunku następuje po rozładunku potwierdzonym stanem silnika, po fazie Kapitana. Kolejny załadunek ma pierwszeństwo przed starszą animacją. Etykieta przy nabrzeżu oraz popup zawsze pokazują aktualne dane gry. Wyłączenie animacji usuwa aktywne rejsy; żaden rejs nie jest zapisywany w stanie gry.

Adapter kopiuje również ostatni publiczny załadunek z lokalnego actionLog, aby pokazać przypadek napełnienia i opróżnienia statku w jednej akcji. Przejścia pełny/pusty działają także bez tej wskazówki. Wczytanie gry nie odtwarza historycznych rejsów.

Walidacja obejmuje rzeczywiste akcje silnika: pełny i częściowy załadunek, natychmiastowy rozładunek, oczekiwanie na koniec fazy, powrót, kolejne ruchy podczas rejsu, wyłączone animacje i osobne targowisko. Sprawdzono katalog z dodatkami, zniżki i zakup, flagi pięciu graczy oraz układ mobilny. Silnik, boty, zapis i backend pozostają bez zmian.

## Ceny, pogoda i okno Akcje — 10 września 2026

Targowisko pokazuje bazowe ceny sprzedaży nad czterema miejscami: kukurydza 0, indygo 1, cukier 2, tytoń 3, kawa 4 monety. Ta sama legenda jest na drewnianej tabliczce oraz w popupie. adapter/tradePrices.ts pobiera wartości z GOOD_PRICES silnika; premie Kupca i budynków nadal wylicza dotychczasowa logika. W porcie etykiety statków i popup wyjaśniają: jedno miejsce mieści jeden towar, a każdy załadowany towar daje bazowo jeden punkt zwycięstwa (gwiazdka), nie monetę.

Stały, okrągły przycisk „Akcje” w prawym dolnym rogu zastępuje karty w nagłówku. Otwiera modal z trzema kolumnami kart na komputerze i dwiema na telefonie. Wybór aktualnej legalnej roli zamyka okno; aktywna karta pozostaje złota. Pytajnik otwiera opis w tym samym oknie, z powrotem do listy. Przy Burmistrzu także przycisk pokazuje liczbę osób do przydzielenia przez bieżącego gracza. Wyjście z modalu przywraca fokus elementowi, który go otworzył.

renderer/weather.ts definiuje niezależny od RNG i stanu gry, czterominutowy cykl słońca, zachmurzenia, deszczu i krótkiej burzy. Zmiany mieszają się przez osiem sekund. WeatherLayer rysuje przesuwające się chmury, przyciemnienie, ukośne krople i kręgi deszczu; burza ma jeden łagodny błysk trwający 1,4 sekundy. Warstwa nie przechwytuje kliknięć, a wiatr zwiększa kołysanie palm. Wszystko używa dotychczasowego zegara renderera do 30 FPS. Wyłączenie „Animacji” usuwa efekty pogody, a ukrycie karty pauzuje jej zegar. Pogoda nie zmienia produkcji, handlu, żeglugi ani decyzji botów.

Kontrola: TypeScript i 443 testy w 41 plikach, w tym ciągłość pogody na granicach cyklu, wyłączenie efektów, brak użycia RNG i pojedynczy szeroki błysk. Scenariusze przeglądarkowe obejmują ceny, modal ról, wybór i podświetlenie, zachmurzenie/deszcz/burzę, klikanie obiektów przez pogodę oraz układ mobilny. Lokalny sterownik czasu do kontroli pogody pozostaje wyłącznie w work/ui-weather i nie trafia do publikacji.
