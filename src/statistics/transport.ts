import type { MatchReport } from './types';

const PREFIX = 'puerto-stats-pending:';
const RECEIPTS = 'puerto-stats-receipts';
const memory = new Map<string, MatchReport>();
const statuses = new Map<string, string>();
let busy = false;
const listeners = new Set<() => void>();
export const subscribeStats = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const matchStatus = (id: string) => statuses.get(id) ?? (receipts().includes(id) ? 'Zapisano wynik i historię na serwerze.' : 'Oczekiwanie na zapis statystyk.');
function update(id: string, value: string) { statuses.set(id, value); listeners.forEach(fn => fn()); }
function receipts(): string[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(RECEIPTS) ?? '[]'); return Array.isArray(data) ? data.filter(v => typeof v === 'string') : []; } catch { return []; }
}
function pending(): MatchReport[] {
  const items = new Map(memory);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const report = JSON.parse(localStorage.getItem(key)!);
        if (report?.schema === 1 && typeof report.id === 'string') if (!items.has(report.id)) items.set(report.id, report);
      } catch { /* One damaged entry must not block other games. */ }
    }
  } catch {}
  return [...items.values()];
}
export function enqueueMatch(report: MatchReport): void {
  if (receipts().includes(report.id) || memory.has(report.id)) return;
  memory.set(report.id, report);
  try { localStorage.setItem(PREFIX + report.id, JSON.stringify(report)); }
  catch {
    // Preserve the result if a browser cannot fit the full history.
    const compact = { ...report, history: { ...report.history, complete: false, reason: 'storage-limit', moves: [] } };
    try { localStorage.setItem(PREFIX + report.id, JSON.stringify(compact)); } catch {
      update(report.id, 'Brak miejsca na zapis lokalny. Trwa próba wysłania wyniku — pozostaw stronę otwartą.');
    }
  }
  void flushMatches();
}
export async function flushMatches(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    for (const report of pending()) {
      try {
        const response = await fetch('/api/matches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report),
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            update(report.id, 'Serwer odrzucił zapis. Wynik pozostaje lokalnie do wyjaśnienia.');
            continue;
          }
          throw new Error('Upload failed');
        }
        const ack: unknown = await response.json();
        if (!ack || typeof ack !== 'object' || !('id' in ack) || ack.id !== report.id) throw new Error('Invalid receipt');
        memory.delete(report.id);
        try {
          localStorage.setItem(RECEIPTS, JSON.stringify([...new Set([...receipts(), report.id])].slice(-300)));
          localStorage.removeItem(PREFIX + report.id);
        } catch {}
        update(report.id, report.history.complete ? 'Zapisano wynik i historię na serwerze.' : 'Zapisano wynik na serwerze; historia tej partii jest niepełna.');
      } catch {
        let durable = false;
        try { durable = !!localStorage.getItem(PREFIX + report.id); } catch {}
        update(report.id, durable ? 'Wynik czeka na wysłanie. Ponowię zapis po odzyskaniu połączenia.' : 'Wynik czeka na wysłanie, ale zapis lokalny nie jest dostępny. Pozostaw stronę otwartą do odzyskania połączenia.');
        break;
      }
    }
  } finally { busy = false; }
}
export function startStatisticsSync(): () => void {
  void flushMatches();
  const retry = () => { void flushMatches(); };
  window.addEventListener('online', retry);
  const timer = window.setInterval(retry, 60_000);
  return () => { window.removeEventListener('online', retry); window.clearInterval(timer); };
}

