# Eksperymentalna sieć neuronowa

Hardcore w menu korzysta z przeszukiwania i oceny strategicznej. Model neuronowy
można dołączyć w arenie; nie jest automatycznie włączany po treningu.

Model ocenia szanse zwycięstwa trzech graczy na podstawie 344 publicznych cech.
Ma wspólną sieć z 32 neuronami w warstwie ukrytej i 11 072 parametrami.
Nie korzysta z kolejności zakrytych plantacji. Obsługuje podstawową grę
trzyosobową w fazie wyboru postaci, czyli po zakończeniu całej poprzedniej roli.
W innych konfiguracjach stosowana jest ocena strategiczna Hardcore.
Końcowe wyniki zawsze pochodzą z silnika gry.

Trening działa lokalnie na CPU w TypeScript. Partie rozgrywa liga polityk
strategicznych i bota zachłannego; opcja --iterations dołącza przeszukiwanie.
Z każdej ukończonej partii pobieranych jest maksymalnie 12 pozycji, którym
przypisuje się końcowego zwycięzcę, z podziałem nagrody w przypadku remisu.
Sieć uczy się przez minimalizację entropii krzyżowej optymalizatorem Adam.
Jest to początkowy model wartości uczony na wynikach self-play, bez osobnej
wyuczonej polityki ruchów i bez pełnego algorytmu AlphaZero.

Przykładowy pierwszy trening, uruchamiany z katalogu gry:

```powershell
node --import ./tools/register-typescript.mjs tools/train-neural.ts --games 1200 --epochs 30 --seed 681903 --output .hardcore-work/neural-candidate-v1.json --patience 6 --batch-size 64
```

Powstają trzy pliki: model JSON do oceny, .checkpoint.json z momentami
optymalizatora oraz .dataset.json z pozycjami i wynikami. Dane dzielone są
całymi partiami; pozycje jednej partii nie trafiają do obu zbiorów.
Wznowienie wymaga poprzedniego zestawu danych i zachowuje wcześniejszy podział
na trening i walidację. Błędna lub brakująca historia podziału zatrzymuje trening.

Kolejny cykl wykorzystujący model w przeszukiwaniu podczas tworzenia nowych partii:

```powershell
node --import ./tools/register-typescript.mjs tools/train-neural.ts --games 240 --epochs 12 --seed 681903 --input .hardcore-work/neural-candidate-v1.json.dataset.json --resume .hardcore-work/neural-candidate-v1.json --iterations 8 --output .hardcore-work/neural-candidate-v2.json --patience 4 --batch-size 64
```

W przykładzie wznowione są wagi. Aby wznowić także stan optymalizatora,
przekaż plik .checkpoint.json zamiast modelu bez tego stanu. --games oznacza
liczbę nowych partii dodawanych do danych. Samo --resume przy --iterations 0
nie wykorzystuje sieci do podejmowania decyzji podczas generowania partii.

Porównanie modelu z dwoma zwykłymi Hardcore:

```powershell
node --import ./tools/register-typescript.mjs tools/arena.ts --games 90 --players 3 --seed 918301 --iterations 24 --opponents hardcore --model .hardcore-work/neural-candidate-v2.json --model-weight 0.25 --output reports/neural-test.json
node --import ./tools/register-typescript.mjs tools/arena.ts --games 90 --players 3 --seed 918301 --iterations 24 --opponents hardcore --output reports/neural-control.json
```

Model dostaje wyłącznie kandydat. --model-weight określa udział jego oceny
w mieszance z oceną strategiczną. Kontrola bez modelu musi mieć te same
ziarna, miejsca i budżety. Około 1/3 zwycięstw oznacza poziom porównywalny
z identycznymi przeciwnikami, z wahaniami losowymi. Mała próba służy
selekcji kandydatów; końcową ocenę wykonuj na nowych ziarnach i wielu rotacjach.

Spadek błędu walidacyjnego nie dowodzi wzrostu siły gry. Przed włączeniem
modelu do menu potrzebna jest powtarzalna przewaga w arenie, także przy
docelowym czasie namysłu. Model dla 3 graczy nie stanowi walidacji wariantów
4–5-osobowych ani dodatków. Dalszy rozwój powinien obejmować mocniejszą ligę
przeciwników, więcej danych z przeszukiwania, osobną politykę ruchów
i zachowywanie starszych mistrzów w lidze.

## Laboratorium poprawy oceny Hardcore

`tools/neural-lab.ts` generuje gry i rozgrywa porównania w osobnych wątkach CPU.
Każda partia ma własne losowanie silnika i losowania botów. Zmiana liczby wątków
nie zmienia danych ani wyników przy stałej liczbie iteracji. Domyślnie używane
są najwyżej cztery wątki. Dla testu z limitem czasu należy ograniczyć obciążenie
komputera; taki test nie jest deterministyczny.

Nowa liga zawiera trzech Hardcore z przeszukiwaniem. Każda zapisana pozycja
zawiera również ocenę oryginalnego Hardcore. Tryb `residual` dodaje do logarytmów
tych prawdopodobieństw poprawkę uczoną przez sieć. Początkowo poprawka jest
zerowa. Model może więc uczyć się błędów obecnej oceny. Nie gwarantuje to
lepszej gry: nadal wymagane jest niezależne porównanie rzeczywistych partii.

Modele samodzielne zachowują format wersji 1. Modele korekcyjne mają wersję 2
i `valueMode: residual`; starszy program odrzuci je, zamiast błędnie odczytać
jako samodzielną ocenę. Dawne zbiory bez `baseline` nie nadają się do treningu
korekcyjnego. Modele nadal obsługują tylko podstawową grę trzyosobową.

```powershell
node --import ./tools/register-typescript.mjs tools/neural-lab.ts generate --games 480 --iterations 16 --workers 4 --seed 26090901 --samples-per-game 24 --exploration 0.015 --output work/neural-lab/hardcore-480.dataset.json

node --import ./tools/register-typescript.mjs tools/train-neural.ts --input work/neural-lab/hardcore-480.dataset.json --games 0 --value-mode residual --hidden-size 32 --epochs 40 --learning-rate 0.0005 --patience 8 --batch-size 64 --seed 26090901 --output work/neural-lab/residual-v3.json

node --import ./tools/register-typescript.mjs tools/neural-diagnostics.ts work/neural-lab/hardcore-480.dataset.json work/neural-lab/residual-v3.json reports/neural-lab/residual-diagnostics.json

node --import ./tools/register-typescript.mjs tools/neural-lab.ts evaluate --games 60 --players 3 --seed 26090971 --iterations 24 --opponents hardcore --model work/neural-lab/residual-v3.json --model-weight 0.5 --workers 4 --output reports/neural-lab/pilot.json
```

Ostatnie polecenie rozgrywa 60 partii modelu oraz 60 odpowiadających im partii
kontrolnych. Raport podaje różnicę skuteczności wraz z przedziałem bootstrap,
losując całe grupy wspólnych ziaren, a nie pojedyncze miejsca przy stole.
Nieukończona lub błędna partia uniemożliwia uznanie porównania za poprawne.
Ziarna użyte w treningu i walidacji są odrzucane w arenie.

Udział sieci wybieramy na próbie pilotażowej. Potwierdzenie musi użyć nowych
ziaren i wcześniej wybranego modelu oraz udziału, bez strojenia do tej próby.
Trzeba również wykonać porównanie przy ustawieniach wersji w grze:
650 ms i najwyżej 1500 iteracji na decyzję. Sieć kosztuje czas, dlatego stała
liczba iteracji i równy limit czasu odpowiadają na różne pytania.

W eksperymentach zapisujemy plan, pochodzenie danych, model, jego skrót SHA256,
wyniki i liczbę prób. Sam spadek entropii krzyżowej nie stanowi warunku
wdrożenia. Narzędzia nie podmieniają bota w menu ani modelu produkcyjnego.
