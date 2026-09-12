# Neural dla 3, 4 i 5 graczy — analiza i rozwój

Stan poranny, 12 września 2026. **Nie ma jeszcze potwierdzonego następcy Hardcore.** Kod obsługi sieci dla 3–5 graczy i nowa ścieżka treningowa działają eksperymentalnie. Produkcyjny bot, silnik i modele na Cloudflare pozostają niezmienione.

## Co ograniczało obecną wersję

1. **Brak obsługi 4–5 graczy był rzeczywisty.** `NeuralBot` sprawdza `supportsNeuralState`; w tych wariantach wybiera dokładnego Hardcore. Dotychczasowy zapis ma trzy wyspy i nie zawiera kart Poszukiwacza. W grze pięcioosobowej trzeba rozróżnić dwie takie karty, również ich osobne monety.
2. **Wersja w menu uczyła polityki, ale nie używała wyuczonej oceny pozycji.** Sieć wskazuje priorytety i ruchy podczas symulacji w czterech fazach. Po horyzoncie dwóch rund wynik ocenia `evaluateHardcoreState`; `evaluatorWeight` wynosi zero. Robotników rozmieszcza dotychczasowy algorytm.
3. **Nauczyciel nie był wystarczająco wyraźnie mocniejszy od przeciwnika.** Stare etykiety pochodzą głównie z 96 iteracji. W wielu pozycjach najlepsze ruchy dzieliło niewiele wizyt. Podniesienie wizyt do czwartej potęgi wyostrza odpowiedź, lecz nie poprawia samej analizy. Starsza ponowna analiza 384×2 poprawiła stabilność części etykiet, ale obejmowała tylko 318 pozycji i sama nie przyniosła dowodu silniejszej gry.
4. **Trener polityki pomijał zapisane oceny alternatyw i wyniki partii.** Uczył się rozkładu wizyt, a nie bezpośrednio poprawki do wyboru ruchu z jego ocen Q ani zwycięzcy. Samo dopisanie epok do tych samych danych nie rozwiązuje tego ograniczenia.
5. **Koszt sieci to głównie przygotowanie jej wejścia.** W starym profilu sama warstwa neuronowa zajmowała około 39 µs, cała polityka około 427 µs. Najpierw warto ograniczać powtarzane odczyty i kosztowne obliczanie priorytetów; większa sieć nie jest automatycznie lepszym wydatkiem czasu.

Ostatni wcześniejszy pełny test wersji z cache obejmował 180 partii kandydata i 180 kontroli przy 650 ms. Uzyskano 66/180 kredytu zwycięstwa wobec 59,5/180: różnica +3,61 punktu procentowego, przedział 95% [−6,67; +13,61]. Wynik nie potwierdził przewagi. Źródło: `reports/neural-policy/policy-active-cached-production-result.json`.

## Nowe porównanie: MCTS czy przeszukiwanie tylko pierwszej decyzji

Ukończono **204 partie**; dwa wątki, limit 24 symulacji, cztery nowe losowania na każdą liczbę graczy i pełna rotacja miejsc. To mały screening, a nie test siły przy docelowych 650 ms. Przed uruchomieniem zapisano konfigurację i skróty źródeł; po zakończeniu wszystkie zgadzały się z planem.

| Graczy | Hardcore — kontrola | Obecny Neural | MCTS z mniejszą losowością | 1-ply z heurystyką | 1-ply z obecną siecią |
|---|---:|---:|---:|---:|---:|
| 3 | 3/12 | 3/12 | 2/12 | 2/12 | **6/12** |
| 4 | 10/16 | 10/16 | 5/16 | 4,5/16 | nieobsługiwany stary model |
| 5 | 1/20 | 1/20 | 2/20 | 5/20 | nieobsługiwany stary model |

Licznik oznacza udział w zwycięstwach, dzielony przy remisie. Każdy wariant gra przeciw pozostałym niezmienionym Hardcore. Wariant MCTS z mniejszą losowością używa Championa, który również usuwa identyczne akcje budowania; porównanie z kontrolą nie izoluje samej losowości. Wyjątkowo wysoki wynik kontroli przy 4 osobach i niski przy 5 pokazują, dlaczego nie wolno wnioskować z samych tych małych próbek. Wynik 1-ply + sieć przy 3 osobach ma różnicę +25 pp, lecz przedział 95% [−16,67; +58,33] nadal obejmuje zero. Dla 4–5 graczy przebiegi obecnego Neurala i kontroli były identyczne, a wywołań sieci było zero.

**1-ply nie oznacza tutaj oceny natychmiast po jednej akcji.** Rozgałęziamy tylko bieżący wybór, następnie symulujemy jego dalsze skutki do tego samego horyzontu rund co MCTS. Wszystkie alternatywy w kompletnym bloku dostają wspólne ziarno losowania i po jednej próbce; niekompletnego bloku nie używamy do rankingu. Pozostali gracze nadal wykonują swoje działania. Wybieramy średnią ocenę ruchu, bez rozbudowywania głębszego drzewa. To osobna metoda przeszukiwania; self-play jest sposobem tworzenia danych treningowych, więc oba pojęcia nie są zamienne.

Wniosek: warto dalej sprawdzić **1-ply + sieć dla 3 osób przy równym czasie**. Nie ma podstaw do zastępowania MCTS we wszystkich konfiguracjach. Przy 4 osobach prosty wariant 1-ply w tej próbie był gorszy.

Wyniki, partie i plan: `reports/neural-multiplayer-20260912/screening/`. Zamrożona wersja sterownika z momentu badania: `work/neural-multiplayer-20260912/screening-driver-frozen.ts`. Po badaniu poprawiono w aktualnym sterowniku wyłącznie odczyt metadanych przez publiczny interfejs oraz jawne typy opcji dodatków; wcześniejsze raporty zachowują oryginalne hashe.

## Co zostało zaimplementowane

- Osobny schemat **543 cech publicznych**: do pięciu wysp w kolejności względem gracza, maski nieobecnych miejsc, liczba graczy, pojemności statków oraz osobne karty Poszukiwacza.
- Polityka **543 → 64 → 101 rodzajów akcji**, z normalizacją tylko wśród legalnych ruchów. Przenoszenie starych wag odbywa się po nazwach cech i akcji. Nowe wejścia zaczynają z wagą zero, a nowy optymalizator zaczyna od początku. Testy potwierdzają zachowanie starych przewidywań dla 3 osób przed dalszą nauką.
- Oddzielna sieć wartości: wspólny model dla kolejnych perspektyw graczy i rozkład zwycięstwa o długości 3, 4 lub 5. Uczy korekty istniejącej oceny na podstawie rzeczywistych końcowych zwycięzców; remisy zachowują ułamkowy udział.
- Eksperymentalny adapter faktycznie wywołujący politykę i opcjonalną sieć wartości przy każdej liczbie graczy. Nie jest podłączony do fabryki botów w menu.
- Zapisywanie pełnych trajektorii, próbek stanu, źródeł, rozkładów wizyt, ocen Q oraz wyników końcowych. Ponowna analiza nie modyfikuje zapisanej pozycji. Dane są dzielone całymi partiami i osobno dla każdej liczby graczy.
- Dwa oddzielne treningi polityki: dotychczasowy cel oparty na wizytach oraz cel oparty na ocenach alternatyw Q. Sieć wartości jest trzecią ablacją. To porównanie hipotez, nie deklaracja, że Q musi być lepsze.
- Wznawialny sterownik pracy z zapisem każdej ukończonej partii i kontrolą niezmienności kodu. Modele i eksperymenty mają osobne formaty; stara wersja nie może przypadkowo załadować nowych wag.

Sprawdzenie typów aplikacji i nowych narzędzi zakończyło się powodzeniem. **506 testów w 44 plikach przechodzi**, w tym 17 nowych testów obsługi 3–5 graczy, przenoszenia wag, uczenia nowych akcji, sieci wartości, legalności i braku mutacji. Techniczna próba całego przepływu ukończyła 6 partii, ich analizę, trzy treningi oraz 40 krótkich gier testujących różne adaptery. Próbę przerwano świadomie przed pełnym turniejem; jej maleńkie modele nie są kandydatami do wydania.

## Właściwa seria treningowa — stan i plan

Duża seria **nie rozpoczęła się przed końcem nocnego okna**. Pierwsze uruchomienie rano rozpoznało przekroczony termin i bezpiecznie zatrzymało się z zerem nowych partii. Ten fakt pozostaje zapisany w `nightly-v1/status.json`. Nie należy zaliczać planowanych gier do wykonanych.

Około 09:08 czasu Warszawy uruchomiono dalszą pracę w **`nightly-v2`**:

1. 108 nowych pełnych partii — po 36 dla 3, 4 i 5 graczy; Hardcore po 64 iteracje generuje trajektorie.
2. Do 24 pozycji z partii, równomiernie między czterema aktywnymi fazami. Każda dostaje niezależną analizę Championa po 512 iteracji, z niezmienioną oceną Hardcore. To mocniejsza analiza stanów, a nie 108 partii rozegranych w całości po 512 iteracji.
3. Dwie polityki oraz korekcyjna sieć wartości, do 24 epok z early stopping. Wspólny model uczy się wszystkich liczebności; jakość raportujemy osobno dla każdej z nich.
4. Pilot przy jednakowym limicie 100 ms: kontrola, przeniesiona stara polityka, nowa polityka wizyt, polityka Q i polityka wizyt z wartością. Cztery pełne rotacje na konfigurację — łącznie 240 partii.
5. Wybrany według zapisanej reguły wariant, jeśli pokona kontrolę w pilocie, trafia do osobnego porównania przy 650 ms i nowych losowaniach. Po dziesięć rotacji daje 30/40/50 gier na ramię. Wynik nie jest podstawą automatycznego wdrożenia; potrzebne są ocena niepewności i potwierdzenie zakresu.

Nowy limit uruchamiania pracy: 17:40 czasu Warszawy. Już rozpoczęte gry kończą się poprawnie. Aktualny stan należy odczytać z `work/neural-multiplayer-20260912/nightly-v2/status.json`; jeśli obliczenia zakończą się wcześniej, zostanie tam zapisany wynik. Limit chroni przed niekontrolowanym ciągłym obciążeniem; można wznowić kolejny etap na podstawie artefaktów.

## Kolejność dalszych decyzji

1. Najpierw ocenić jakość mocniejszych etykiet i wyniki trzech nowych sieci, osobno dla 3/4/5 graczy.
2. Równolegle koncepcyjnie zachować MCTS jako punkt odniesienia, a obiecujące 1-ply + sieć sprawdzić na nowych ziarnach i przy tym samym czasie. Nie mieszać jednocześnie zmian przeszukiwania, ocen i robotników w jednej nieczytelnej próbie.
3. Po wybraniu działającej polityki generować następną ligę z nowym modelem, Hardcore i starszymi modelami. Nowe wyniki muszą wracać do treningu wartości, a mocniejsze przeszukiwanie dostarczać politykę. To właściwa pętla dalszego self-play.
4. Dopiero po wykazaniu słabości konkretnej fazy poprawiać heurystykę robotników, handlu czy statków jako osobny wariant. Zwiększenie warstwy sieci i wydłużenie rolloutów mają niższy priorytet od jakości danych i rankingu legalnych ruchów.
5. Za sukces uznać powtarzalną przewagę przy porównywalnym czasie dla każdej liczby graczy. Naturalny udział jednego z równych graczy w zwycięstwach wynosi około 1/3, 1/4 i 1/5; wygranie ponad połowy wszystkich gier przeciw kilku równoczesnym Hardcore byłoby znacznie silniejszym wymaganiem. Dodatki pozostają osobnym zakresem do nauki i weryfikacji.

Nie ma podstaw, aby ogłaszać sufit tej metody. Nie ma też gwarancji, że samo dłuższe trenowanie obecnych wag da przewagę. Najważniejsze zmiany to pełny opis pozycji dla 3–5 graczy, mocniejsze etykiety i połączenie uczenia decyzji z wynikiem partii.

## Odniesienia metodyczne

Połączenie polityki, wartości i przeszukiwania uczonych w self-play jest opisane w pracy autorów [AlphaZero](https://arxiv.org/abs/1712.01815). Puerto Rico jest grą wieloosobową z częściowo ukrytym losowaniem, dlatego nie przenosimy automatycznie gwarancji lub wyników z szachów.

[Policy improvement by planning with Gumbel](https://openreview.net/pdf?id=bERaNdoegnO) analizuje poprawę polityki przy małej liczbie symulacji. Może inspirować późniejszy wybór gałęzi, lecz nasz obecny eksperyment 1-ply nie implementuje Gumbel AlphaZero i nie dziedziczy jego gwarancji.
