import { describe, expect, it, vi } from 'vitest';
import {
  weatherAt,
  WEATHER_CYCLE,
  WEATHER_PERIOD,
} from '../../src/presentation/renderer/weather';

describe('decorative island weather', () => {
  it('visits every weather type and repeats without drifting over long sessions', () => {
    const examples = [
      [0, 'clear'],
      [70, 'cloudy'],
      [105, 'rain'],
      [166, 'storm'],
    ] as const;
    for (const [time, kind] of examples) {
      expect(weatherAt(time).kind).toBe(kind);
      expect(weatherAt(time + WEATHER_PERIOD * 360)).toEqual(weatherAt(time));
    }
  });
  it('blends clouds, shade, rain and wind continuously across every boundary', () => {
    let boundary = 0;
    for (const phase of WEATHER_CYCLE) {
      boundary += phase.duration;
      const before = weatherAt(boundary - 0.00001);
      const after = weatherAt(boundary + 0.00001);
      for (const channel of ['clouds', 'shade', 'rain', 'wind'] as const) {
        expect(Math.abs(before[channel] - after[channel])).toBeLessThan(
          0.00001,
        );
      }
    }
  });
  it('disabling animations removes rain, clouds, shade and lightning at any point', () => {
    for (let time = 0; time < WEATHER_PERIOD; time += 0.7) {
      expect(weatherAt(time, false)).toEqual(weatherAt(0, false));
      expect(weatherAt(time, false)).toMatchObject({
        kind: 'clear',
        clouds: 0,
        rain: 0,
        shade: 0,
        lightning: 0,
      });
    }
  });
  it('uses one broad lightning pulse per cycle, never repeated flashes', () => {
    let risingEdges = 0,
      litSeconds = 0,
      wasLit = false;
    for (let time = 0; time < WEATHER_PERIOD; time += 0.02) {
      const { lightning, kind } = weatherAt(time);
      expect(lightning).toBeGreaterThanOrEqual(0);
      expect(lightning).toBeLessThanOrEqual(1);
      const lit = lightning > 0.001;
      if (lit) {
        litSeconds += 0.02;
        expect(kind).toBe('storm');
      }
      if (lit && !wasLit) risingEdges++;
      wasLit = lit;
    }
    expect(risingEdges).toBe(1);
    expect(litSeconds).toBeGreaterThan(1.3);
    expect(litSeconds).toBeLessThan(1.5);
  });
  it('never draws randomness from the game or global random generator', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw Error('Weather consumed randomness');
    });
    try {
      for (let time = 0; time < 1000; time += 7) weatherAt(time);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
  it('handles an invalid or negative clock with finite clear weather values', () => {
    for (const time of [NaN, Infinity, -Infinity, -10])
      expect(weatherAt(time)).toEqual(weatherAt(0));
  });
});
