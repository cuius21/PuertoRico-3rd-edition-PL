# Odgłosy wyspy

Nagrania dostarczone przez użytkownika w katalogu audio: traffic.wav, birds.mp3, church.flac. Oryginały pozostają niezmienione. W tej części repo są ich lżejsze kopie do gry, bez dodatkowych zależności od serwisów audio.

- traffic.mp3: 120,543 s, stereo, MP3 96 kb/s, 32 kHz.
- birds.mp3: 125,723 s, stereo, MP3 96 kb/s, 32 kHz.
- church.mp3: 42,064 s, mono, MP3 64 kb/s, 32 kHz.

Konwersja FFmpeg 7.1: loudnorm I=-23, TP=-2, LRA=12, łagodne wejście 2 s i wyjście 2,5 s dla pętli; dzwony 2,5 s / 5 s. Metadane źródłowe pominięte. Trzy dostarczone nagrania zajmują około 3,3 MB zamiast 29,3 MB.

Traffic, birds i cichsze meadow grają w pętli. Church pojawia się po 90 sekundach aktywnego odtwarzania, potem co 270 sekund. Głośność domyślna 22%; zmiana i wyciszenie są zapamiętywane lokalnie. Ukrycie karty zatrzymuje nagrania i zegar dźwiękowy; wyjście z gry usuwa odtwarzacze i AudioContext. Zegar dźwiękowy nie dotyka stanu gry ani jej generatora losowego.

Trzy długie nagrania korzystają ze strumieniowych HTMLAudioElement i GainNode; krótki church z AudioBufferSourceNode, dzięki czemu nie wymaga kolejnego gestu przy późniejszym wejściu. Obsługę głośności i odblokowania audio oparto na [praktykach Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices). W razie blokady odtwarzania przycisk prosi o uruchomienie dźwięku kliknięciem.

## Wiatr i odgłosy łąki

- Plik: meadow.mp3; 133,437 s, stereo, MP3 96 kb/s, 32 kHz.
- Nagranie: [summer meadow with wind](https://freesound.org/people/Garuda1982/sounds/639459/), autor **Garuda1982**, Freesound, 22 czerwca 2022.
- Licencja: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) zgodnie ze stroną autora, sprawdzona 10 września 2026.
- Źródło: [publiczny podgląd MP3 wysokiej jakości](https://cdn.freesound.org/previews/639/639459_2061858-hq.mp3), pełne nagranie. Pobrana kopia znajduje się lokalnie w audio/meadow-wind-garuda1982.mp3.
- Obróbka: FFmpeg 7.1, loudnorm I=-23, TP=-2, LRA=12; wejście 2 s, wyjście 3 s od 130,437 s; metadane pominięte, ponowna kompresja. Kopia źródłowa pozostaje niezmieniona.
- Miks: traffic 0,65, birds 0,90, meadow 0,32; podczas dzwonów odpowiednio 0,48 / 0,68 / 0,24. Całość podlega wspólnemu suwakowi głośności i wyciszeniu.

Wiatr, owady i szelest łąki tworzą dodatkową spokojną warstwę pod głównymi nagraniami. Cztery pliki audio ważą łącznie około 4,9 MB; podczas gry nie ma połączeń do Freesound.
