import { Container, Graphics } from 'pixi.js';
import { weatherAt } from './weather';

export class WeatherLayer {
  readonly view = new Container();
  private shade = new Graphics();
  private clouds = new Graphics();
  private rain = new Graphics();
  private flash = new Graphics();
  constructor() {
    this.view.eventMode = 'none';
    this.view.interactiveChildren = false;
    this.view.addChild(this.shade, this.clouds, this.rain, this.flash);
  }
  render(width: number, height: number, seconds: number, motion: boolean) {
    const weather = weatherAt(seconds, motion);
    this.shade
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: 0x102c4c, alpha: weather.shade });
    this.clouds.clear();
    this.rain.clear();
    this.flash.clear();
    if (!motion) return weather;
    const t = seconds;
    for (let i = 0; i < 9; i++) {
      const x = ((i * 239 + t * (8 + weather.wind * 14)) % (width + 430)) - 210;
      const y = ((i * 157 + Math.sin(t * 0.05 + i) * 20) % (height + 200)) - 70;
      const scale = 0.75 + (i % 3) * 0.23;
      for (let layer = 3; layer > 0; layer--) {
        const soft = 1 + layer * 0.15;
        this.clouds
          .ellipse(x, y, 120 * scale * soft, 26 * scale * soft)
          .ellipse(
            x - 48 * scale,
            y - 12 * scale,
            58 * scale * soft,
            28 * scale * soft,
          )
          .ellipse(
            x + 38 * scale,
            y - 18 * scale,
            67 * scale * soft,
            32 * scale * soft,
          )
          .fill({
            color: 0xd8e5e9,
            alpha: weather.clouds * (layer === 1 ? 0.09 : 0.035),
          });
      }
    }
    if (weather.rain > 0.005) {
      const drops = Math.min(
        180,
        Math.max(50, Math.ceil((width * height) / 7000)),
      );
      const period = height + 70;
      for (let i = 0; i < drops; i++) {
        const y = ((i * 101.73 + t * (430 + (i % 5) * 38)) % period) - 35;
        const x =
          ((((i * 181.37 - t * (50 + weather.wind * 70) + y * 0.13) %
            (width + 50)) +
            width +
            50) %
            (width + 50)) -
          25;
        const length = 12 + (i % 4) * 4;
        this.rain
          .moveTo(x, y)
          .lineTo(x - length * (0.25 + weather.wind * 0.3), y + length)
          .stroke({
            color: 0xc7e9ef,
            alpha: weather.rain * 0.42,
            width: i % 3 === 0 ? 1.6 : 1,
          });
      }
      for (let i = 0; i < 18; i++) {
        const life = (t * 0.8 + i * 0.371) % 1;
        const x = (i * 193.17) % Math.max(1, width);
        const y = (i * 139.81) % Math.max(1, height);
        this.rain
          .ellipse(x, y, 3 + life * 9, 1 + life * 3)
          .stroke({
            color: 0xc7e9ef,
            width: 1,
            alpha: weather.rain * (1 - life) * 0.22,
          });
      }
    }
    if (weather.lightning > 0) {
      this.flash
        .rect(0, 0, width, height)
        .fill({ color: 0xe0eff9, alpha: weather.lightning * 0.07 });
      const x = width * 0.22;
      this.flash
        .poly([x, 0, x - 12, 25, x + 3, 23, x - 20, 58])
        .stroke({ color: 0xf0f7ff, width: 2, alpha: weather.lightning * 0.75 });
    }
    return weather;
  }
}
