import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { SceneSnapshot } from '../adapter/sceneTypes';
import type { ActionBeat } from '../playback/actionBeats';
import { islandCenters, parcel, type Point } from '../iso/projection';
import { CENTRAL_PLACES, PLAYER_STOCK } from '../iso/layout';
import { idleFormation, waitingWorkforce } from '../iso/workforce';

export function cuePoint(scene: SceneSnapshot, key: string): Point {
  if (key === 'pier') return { x: 390, y: 265 };
  if (key === 'corsair') return { x: -560, y: 255 };
  if (key.startsWith('ship:')) {
    const index = Number(key.slice(5));
    return { x: 360 + index * 152, y: 410 - index * 65 };
  }
  if (Object.hasOwn(CENTRAL_PLACES, key))
    return CENTRAL_PLACES[key as keyof typeof CENTRAL_PLACES];
  const special = key.startsWith('stock:')
    ? 'stock'
    : key.startsWith('dock:')
      ? 'dock'
      : key.startsWith('waiting:')
        ? 'waiting'
        : null;
  const id = special ? key.slice(special.length + 1) : key;
  const index = scene.players.findIndex(
    (p) =>
      p.id === id ||
      p.objects.some((o) => o.key === key) ||
      key.startsWith(p.id + ':'),
  );
  if (index < 0) return { x: 0, y: 0 };
  const player = scene.players[index]!,
    center = islandCenters(scene.players.length)[index]!;
  const object = player.objects.find((o) => o.key === key);
  const available = waitingWorkforce(player);
  const people = idleFormation(available.workers, available.nobles, false);
  const waiting = people.length
    ? {
        x: people.reduce((n, p) => n + p.x, 0) / people.length,
        y: people.reduce((n, p) => n + p.y, 0) / people.length,
      }
    : parcel(4.1, 3.9);
  const local = object
    ? parcel(object.u + (object.size - 1) * 0.5, object.v)
    : special === 'dock' || special === 'stock'
      ? PLAYER_STOCK
      : special === 'waiting'
        ? waiting
        : { x: 0, y: 0 };
  return { x: center.x + local.x, y: center.y + local.y };
}
export class ActionVisuals {
  readonly view = new Container();
  private ink = new Graphics();
  private tokens: Sprite[] = [];
  private title = new Text({
    text: '',
    style: {
      fontFamily: 'Trebuchet MS',
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0xffedb0,
      stroke: { color: 0x254d46, width: 4 },
    },
  });
  private beatId: number | null = null;
  constructor(private texture: (name: string) => Texture | undefined) {
    this.view.eventMode = 'none';
    this.view.interactiveChildren = false;
    this.view.addChild(this.ink, this.title);
    this.title.anchor.set(0.5, 0);
  }
  render(beat: ActionBeat | null, progress: number, motion: boolean) {
    this.view.visible = !!beat;
    if (!beat) {
      this.beatId = null;
      return;
    }
    if (beat.id !== this.beatId) {
      this.beatId = beat.id;
      for (const token of this.tokens) token.destroy();
      this.tokens = [];
      const cargo =
        beat.kind === 'worker'
          ? []
          : beat.tokens.length
            ? beat.tokens
            : [{ sprite: beat.token, count: beat.count }];
      for (const item of cargo) {
        const texture = this.texture(item.sprite);
        if (!texture) continue;
        for (
          let i = 0;
          i < Math.min(cargo.length > 1 ? 3 : 8, item.count);
          i++
        ) {
          const token = new Sprite(texture);
          token.anchor.set(0.5, 0.7);
          token.width =
            item.sprite.includes('worker') || item.sprite.includes('noble')
              ? 26
              : 42;
          token.height =
            item.sprite.includes('worker') || item.sprite.includes('noble')
              ? 42
              : 42;
          this.tokens.push(token);
          this.view.addChild(token);
        }
      }
      this.title.text = beat.count > 0 ? beat.count + ' ×' : '';
    }
    const from = cuePoint(beat.scene, beat.from),
      to = cuePoint(beat.scene, beat.to);
    this.ink.clear();
    const pulse = motion ? 0.7 + Math.sin(progress * Math.PI * 5) * 0.2 : 0.9;
    for (const key of beat.highlights.length ? beat.highlights : [beat.to]) {
      const p = cuePoint(beat.scene, key);
      this.ink
        .ellipse(p.x, p.y + 8, 65, 26)
        .fill({ color: 0xffd774, alpha: 0.14 })
        .stroke({ color: 0xffdd83, width: 3, alpha: pulse });
      this.ink
        .ellipse(p.x, p.y + 8, 75 + progress * 5, 30 + progress * 2)
        .stroke({ color: 0xffe3a0, width: 1.3, alpha: 0.45 });
      if (beat.kind === 'build') {
        this.ink
          .moveTo(p.x - 54, p.y - 90)
          .lineTo(p.x - 54, p.y + 5)
          .lineTo(p.x + 54, p.y + 5)
          .lineTo(p.x + 54, p.y - 90)
          .stroke({ color: 0xf5d88c, width: 2, alpha: 0.5 * (1 - progress) });
        if (motion)
          for (let i = 0; i < 10; i++) {
            const rise = (progress * 1.8 + i * 0.113) % 1;
            this.ink
              .circle(p.x + Math.sin(i * 11) * 62, p.y - 20 - rise * 110, 2.5)
              .fill({ color: 0xffe9ab, alpha: (1 - rise) * 0.8 });
          }
      }
    }
    if (beat.count > 0) {
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 60 };
      this.ink
        .moveTo(from.x, from.y)
        .quadraticCurveTo(mid.x, mid.y, to.x, to.y)
        .stroke({ color: 0xffe3a0, width: 2, alpha: 0.22 });
      this.tokens.forEach((token, i) => {
        const t = motion
          ? Math.max(0, Math.min(1, (progress - 0.15 - i * 0.025) / 0.6))
          : 1;
        token.x =
          (1 - t) * (1 - t) * from.x +
          2 * (1 - t) * t * mid.x +
          t * t * to.x +
          ((i % 3) - 1) * 14;
        token.y =
          (1 - t) * (1 - t) * from.y +
          2 * (1 - t) * t * mid.y +
          t * t * to.y -
          Math.floor(i / 3) * 12;
        token.alpha = motion
          ? t >= 1
            ? Math.max(0, 1 - (progress - 0.86) * 7)
            : 0.95
          : 0.9;
      });
    }
    this.title.position.set(to.x, to.y + 40);
  }
}
