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
