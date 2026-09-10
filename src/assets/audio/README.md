# Odgłosy wyspy

Nagrania dostarczone przez użytkownika w katalogu audio: traffic.wav, birds.mp3, church.flac. Oryginały pozostają niezmienione. W tej części repo są ich lżejsze kopie do gry, bez dodatkowych zależności od serwisów audio.

- traffic.mp3: 120,543 s, stereo, MP3 96 kb/s, 32 kHz.
- birds.mp3: 125,723 s, stereo, MP3 96 kb/s, 32 kHz.
- church.mp3: 42,064 s, mono, MP3 64 kb/s, 32 kHz.

Konwersja FFmpeg 7.1: loudnorm I=-23, TP=-2, LRA=12, łagodne wejście 2 s i wyjście 2,5 s dla pętli; dzwony 2,5 s / 5 s. Metadane źródłowe pominięte. Łącznie około 3,3 MB zamiast 29,3 MB.

Traffic i birds grają w pętli. Church pojawia się po 90 sekundach aktywnego odtwarzania, potem co 270 sekund. Głośność domyślna 22%; zmiana i wyciszenie są zapamiętywane lokalnie. Ukrycie karty zatrzymuje nagrania i zegar dźwiękowy; wyjście z gry usuwa odtwarzacze i AudioContext. Zegar dźwiękowy nie dotyka stanu gry ani jej generatora losowego.

Dwa długie nagrania korzystają ze strumieniowych HTMLAudioElement i GainNode; krótki church z AudioBufferSourceNode, dzięki czemu nie wymaga kolejnego gestu przy późniejszym wejściu. Obsługę głośności i odblokowania audio oparto na [praktykach Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices). W razie blokady odtwarzania przycisk prosi o uruchomienie dźwięku kliknięciem.
