# Puerto Rico — nowy poziom Hardcore

Stan na 9 września 2026. W menu każdego bota jest nowy przycisk **🔥 Hardcore**.
Gra została również opublikowana na https://puerto-rico-3rd-edition.pages.dev/.
Instrukcja kolejnych wdrożeń znajduje się w CLOUDFLARE.md, a obowiązek publikacji
ukończonych zmian gry jest zapisany w AGENTS.md.
Nowy bot wyraźnie przewyższył dotychczasowy poziom AI w przeprowadzonych
porównaniach. Wyniki nie oznaczają, że jest niepokonany przez człowieka.

Uruchom **URUCHOM HARDCORE.cmd** z katalogu gry. Otwiera on aplikację
**dist-hardcore/win-unpacked/Puerto Rico Hardcore.exe**. Zachowaj cały folder
win-unpacked, ponieważ EXE korzysta z jego bibliotek. Wersja jednoplikowa
dla przeglądarki znajduje się w **Puerto Rico Hardcore.html** oraz
**dist-html/index.html**. Otwórz HTML dwuklikiem; zawiera kod, style i boty,
a czcionki korzystają z lokalnych zamienników, więc gra działa także offline.
Przy każdym poziomie trudności dodano klikalny pytajnik z opisem algorytmu
i informacją o użyciu sieci neuronowej. Opisy zamyka się krzyżykiem,
klawiszem Escape lub kliknięciem poza okienkiem. Dotychczasowy
przenośny EXE w dist-exe pozostaje wcześniejszą wersją.

Hardcore planuje obsadę całej wyspy, zależności między plantacjami,
produkcją i budynkami oraz moment zakończenia gry. Przeszukiwanie uwzględnia
własny interes każdego kolejnego gracza, a ocenę przeprowadza po zakończeniu
całej roli. Kolejność zakrytych plantacji jest losowana w symulacjach.
Domyślny limit wynosi 650 ms i maksymalnie 1500 iteracji na decyzję;
rozstawianie robotników wykorzystuje szybką optymalizację strategiczną.
Limit czasu sprawdzany jest pomiędzy symulacjami, więc pojedyncza decyzja
może go nieznacznie przekroczyć.

Długie obliczenia AI i Hardcore odbywają się w osobnym Workerze, aby nie
blokować interfejsu. Zapis gry zachowuje nowy poziom trudności. Powrót do
menu anuluje obliczenia; odpowiedź do nieaktualnego stanu jest odrzucana.

Porównania obejmowały jednego Hardcore przeciw wszystkim pozostałym botom
dotychczasowego poziomu AI. Kandydat rotował po każdym miejscu dla danego
ziarna ustawienia początkowego. Wszystkie partie w tabeli są bez dodatków.

| Gracze | Partie | Zwycięstwa Hardcore | Średnia przewaga nad najlepszym rywalem | Czas na decyzję obu botów |
|---|---:|---|---:|---:|
| 3 | 60 | 59 samodzielnych + 1 dzielone | +14,58 PZ | 50 ms |
| 4 | 16 | 13 | +9,69 PZ | 25 ms |
| 5 | 15 | 14 | +9,13 PZ | 25 ms |

Żadna z tych 91 partii nie była niepoprawna ani przerwana. Próby obejmowały
odpowiednio 20, 4 i 3 niezależne ustawienia, każde z pełną rotacją miejsc.
Wyniki cztero- i pięcioosobowe traktuj jako mniejsze próby orientacyjne.
Skrócone, równe limity ułatwiają porównanie algorytmów, ale nie stanowią
pomiaru procentu zwycięstw przy ustawieniach menu. Dodatkowa kontrola przy
domyślnych limitach — Hardcore 650 ms, stary AI 1500 ms — dała 3/3 zwycięstwa,
ze średnią przewagą 18 PZ. To jedno ustawienie z rotacją miejsc i współdzieleniem
CPU między procesami, więc wyłącznie kontrola działania ustawień domyślnych.

Naprawiono również stan symulacji w środku fazy: klonowanie i zapis zachowują
liczniki już wykonanych ruchów oraz flagi Kapitana. Stary bot AI korzysta
z tego samego poprawionego mechanizmu odtwarzania stanu. W testach dodatków
wykryto i poprawiono oferowanie niedozwolonego wyboru Korsarza, rozbieżność
kosztu budowy ze zniżką Cechu Murarzy i ujemną gotówkę po płatności przez
Czarny Rynek. Nie zmieniano punktacji końcowej.

Kontrole końcowe: **234 testy w 18 plikach — wszystkie poprawne**, TypeScript
bez błędów, oba warianty Vite zbudowane. Dodatkowo sprawdzono 7938 przejść
stanu między oryginałem a klonem w 12 pełnych partiach oraz 48 partii
obejmujących wszystkie 16 kombinacji dodatków dla 3–5 graczy. Test dodatków
sprawdzał legalność oferowanych akcji i nieujemność zasobów; nie mierzył siły
Hardcore z dodatkami. W przeglądarce rozegrano pełną partię botów, sprawdzono
zapis/wczytanie i brak błędów konsoli. To test interfejsu i Workera przez HTTP;
nie przeprowadzono osobnego testu uruchomienia końcowego EXE ani adresu file://.

Standardowy electron-builder zatrzymał się na ograniczeniu uruchamiania
procesów pomocniczych w środowisku wykonawczym. Pakiet folderowy złożono
z lokalnego Electron 42.3.3 oraz nowego app.asar. Zweryfikowano zgodność
73 plików runtime z lokalną dystrybucją i zawartość archiwum aplikacji.

Powstał też działający eksperyment z siecią neuronową: 344 publiczne cechy,
32 neurony ukryte, 11 072 parametrów, uczenie Adam na CPU. Pierwszy etap
obejmował 1200 ukończonych partii i 14 400 pozycji. Błąd walidacyjny spadł
z 1,194 do 0,625. W praktycznej próbie przeciw dwóm zwykłym Hardcore model
uzyskał 9/36 zwycięstw, a kontrolny Hardcore bez sieci na tych samych
ziarnach 10/36. Różnica jest mała; nie wykazano poprawy siły gry.

Drugi cykl dodał 240 partii z przeszukiwaniem wspomaganym modelem, łącznie
1440 partii i 17 280 pozycji. Zachowano wcześniejszy podział danych, uzyskując
1154 partie treningowe i 286 walidacyjnych. Żadna z czterech nowych epok
nie poprawiła walidacji względem wag wejściowych na tym zbiorze. Wybrano
zatem te same wagi; ponowny turniej identycznej sieci nie był potrzebny.
Model obsługuje obecnie podstawową grę trzyosobową na granicach ról.

**Sieć nie jest włączona w poziomie Hardcore.** Gotowy bot korzysta z
przetestowanego przeszukiwania i oceny strategicznej. Następny krok rozwoju
sieci to większa liga mocnych przeciwników, więcej partii z przeszukiwaniem
i wyuczona polityka wyboru ruchów. Włączenie modelu powinno nastąpić dopiero
po wykazaniu przewagi nad Hardcore na nowych ziarnach i docelowym budżecie.

Surowe raporty są w reports/hardcore. Modele, checkpointy i zestawy danych
pozostają w .hardcore-work. Instrukcje uruchamiania turniejów i treningu:
tools/arena-guide.md oraz tools/neural-guide.md. Kopia pierwotnych źródeł:
.hardcore-backup-20260909. Obliczenia i trening wykonano lokalnie.
