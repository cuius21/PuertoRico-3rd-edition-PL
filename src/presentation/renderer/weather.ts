export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm';
export const WEATHER_NAMES: Record<WeatherKind, string> = {
  clear: 'Słonecznie',
  cloudy: 'Pochmurnie',
  rain: 'Deszcz',
  storm: 'Burza',
};
export const WEATHER_CYCLE = [
  { kind: 'clear', duration: 55 },
  { kind: 'cloudy', duration: 35 },
  { kind: 'rain', duration: 40 },
  { kind: 'cloudy', duration: 25 },
  { kind: 'storm', duration: 20 },
  { kind: 'rain', duration: 20 },
  { kind: 'cloudy', duration: 20 },
  { kind: 'clear', duration: 25 },
] as const;
export const WEATHER_PERIOD = WEATHER_CYCLE.reduce((n, s) => n + s.duration, 0);
const LOOK = {
  clear: { clouds: 0.06, shade: 0, rain: 0, wind: 0.15 },
  cloudy: { clouds: 0.65, shade: 0.13, rain: 0, wind: 0.45 },
  rain: { clouds: 0.8, shade: 0.18, rain: 0.65, wind: 0.7 },
  storm: { clouds: 1, shade: 0.26, rain: 1, wind: 1 },
};
export function weatherAt(seconds: number, motion = true) {
  const clock = motion && Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  let offset = clock % WEATHER_PERIOD;
  let index = 0;
  while (offset >= WEATHER_CYCLE[index]!.duration) {
    offset -= WEATHER_CYCLE[index]!.duration;
    index++;
  }
  const kind = WEATHER_CYCLE[index]!.kind;
  const previous =
    WEATHER_CYCLE[(index + WEATHER_CYCLE.length - 1) % WEATHER_CYCLE.length]!
      .kind;
  const blend = Math.min(1, offset / 8);
  const eased = blend * blend * (3 - 2 * blend);
  const mix = (key: keyof typeof LOOK.clear) =>
    LOOK[previous][key] + (LOOK[kind][key] - LOOK[previous][key]) * eased;
  // A soft distant lightning glow, one broad pulse per storm; no strobe.
  const lightning =
    kind === 'storm' && offset > 11 && offset < 12.4
      ? Math.sin(((offset - 11) / 1.4) * Math.PI) ** 2
      : 0;
  return {
    kind,
    clouds: motion ? mix('clouds') : 0,
    shade: mix('shade'),
    rain: mix('rain'),
    wind: mix('wind'),
    lightning,
  };
}
