import { useEffect, useState } from 'react';
import { MenuShell } from '../presentation/menu/MenuShell';
import { LEVEL_LABELS, type Summary } from './types';
import './statistics.css';

const number = (value: number) => value.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
export function StatisticsScreen({ onBack }: { onBack: () => void }) {
  const [players, setPlayers] = useState('');
  const [kind, setKind] = useState('');
  const [expansions, setExpansions] = useState('');
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    const query = new URLSearchParams();
    if (players) query.set('players', players);
    if (kind) query.set('kind', kind);
    if (expansions) query.set('expansions', expansions);
    fetch('/api/stats?' + query, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Summary>; })
      .then(setData).catch(() => { if (!controller.signal.aborted) setError('Nie udało się pobrać statystyk. Spróbuj ponownie.'); });
    return () => controller.abort();
  }, [players, kind, expansions, refresh]);
  return <MenuShell className="setup-screen pr-statistics" as="main">
    <section className="pr-stats-card">
      <div className="pr-stats-heading"><div><span>Kronika wysp</span><h1>Statystyki partii</h1></div><button onClick={onBack}>← Wróć do menu</button></div>
      <p>Ukończone partie rozegrane na tej stronie. Zapis trwa od uruchomienia statystyk; wcześniejsze rozgrywki nie są dostępne.</p>
      <div className="pr-stats-filters">
        <label>Gracze<select value={players} onChange={e => setPlayers(e.target.value)}><option value="">3–5 graczy</option>{[3,4,5].map(n => <option key={n} value={n}>{n} graczy</option>)}</select></label>
        <label>Skład stołu<select value={kind} onChange={e => setKind(e.target.value)}><option value="">Wszystkie partie</option><option value="mixed">Ludzie i boty</option><option value="bots">Same boty</option><option value="humans">Sami ludzie</option></select></label>
        <label>Wariant<select value={expansions} onChange={e => setExpansions(e.target.value)}><option value="">Wszystkie warianty</option><option value="base">Podstawowa gra</option><option value="expanded">Z rozszerzeniami</option></select></label>
        <button onClick={() => setRefresh(n => n + 1)}>↻ Odśwież</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Wczytywanie kroniki…</p>}
      {data && <>
        <div className="pr-stats-totals">
          <article><span>Ukończone partie</span><strong>{number(data.games)}</strong></article>
          <article><span>Zwycięstwa ludzi</span><strong>{number(data.humanWins)}</strong></article>
          <article><span>Zwycięstwa botów</span><strong>{number(data.botWins)}</strong></article>
          <article><span>Partie z remisem</span><strong>{number(data.ties)}</strong></article>
        </div>
        {data.games === 0 ? <p className="pr-stats-empty">Kronika czeka na pierwszą ukończoną partię w tym zestawieniu.</p> :
          <div className="pr-stats-table-wrap"><table><caption>Wyniki według rzeczywiście użytego poziomu</caption><thead><tr><th>Gracz / bot</th><th>Występy</th><th>Zwycięstwa</th><th>Odsetek zwycięstw</th><th>Średnio ★</th></tr></thead><tbody>
            {data.levels.map(row => <tr key={row.level}><th scope="row">{LEVEL_LABELS[row.level] ?? row.level}</th><td>{number(row.appearances)}</td><td>{number(row.wins)}</td><td><div className="pr-stats-rate"><span style={{ width: (row.wins / row.appearances * 100) + '%' }} /><b>{number(row.wins / row.appearances * 100)}%</b></div></td><td>{number(row.averageScore)}</td></tr>)}
          </tbody></table></div>}
        <p className="pr-stats-note">Zwycięstwo przy pełnym remisie dzielimy między zwycięzców: po ½ dla dwóch graczy. Występ to jeden gracz w jednej partii. Gwiazdki ★ oznaczają punkty zwycięstwa.</p>
        {data.configurations.length > 0 && <p>{data.configurations.map(c => c.playerCount + ' graczy: ' + number(c.games) + ' partii').join(' · ')}</p>}
        {data.lastGame && <p>Ostatnia ukończona partia: {new Date(data.lastGame).toLocaleString('pl-PL')}</p>}
      </>}
      <details><summary>Co trafia do kroniki?</summary><p>Zapisujemy wynik, miejsca przy stole, wybrany i rzeczywiście użyty poziom bota, wersję gry, rozszerzenia oraz anonimową historię ruchów ze zmianami stanu wysp. Nie wysyłamy wpisanych imion ani nie zapisujemy adresów IP w bazie statystyk. Historie są dostępne tylko właścicielowi gry.</p><p>Samouczek, partie ćwiczeniowe, niedokończone gry i treningi botów nie zwiększają licznika. Wczytanie starego zapisu daje historię od chwili wznowienia. Neural przy 4–5 graczach lub rozszerzeniach jest liczony jako Hardcore. Wyniki pochodzą z przeglądarek i służą obserwacji; to nie jest ranking odporny na manipulacje ani kontrolowany test siły botów.</p></details>
    </section>
  </MenuShell>;
}

