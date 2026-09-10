import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  Rectangle,
  Polygon,
} from 'pixi.js';
import {
  ATLAS_IDS,
  ATLAS_URLS,
  MARKET_URL,
  WALKERS_URL,
} from '../assets/registry';
import { parcel, islandCenters, type Point } from '../iso/projection';
import type {
  EntityRef,
  SceneSnapshot,
  SceneObject,
} from '../adapter/sceneTypes';

type WindItem = {
  sprite: Container;
  baseY: number;
  phase: number;
  kind: 'tree' | 'ship';
};
type Walker = {
  kind: 'worker' | 'noble';
  sprite: Sprite;
  route: Point[];
  segment: number;
  progress: number;
  from: Point;
  to: Point;
  phase: number;
};
const GOOD_COLOR: Record<string, number> = {
  corn: 0xf1c44a,
  indigo: 0x7687d7,
  sugar: 0xf8f3d9,
  tobacco: 0xaa784b,
  coffee: 0x653d30,
};
export class WorldRenderer {
  readonly app = new Application();
  private world = new Container();
  private terrain = new Container();
  private playerObjects = new Map<string, Container>();
  private waves = new Graphics();
  private textures = new Map<string, Texture>();
  private wind: WindItem[] = [];
  private walkers = new Map<string, Walker>();
  private snapshot: SceneSnapshot | null = null;
  private camera = { x: 0, y: 0, zoom: 1 };
  private focusId = 'central';
  private manuallyMoved = false;
  private destination = { x: 0, y: 0, zoom: 1 };
  private elapsed = 0;
  private motion = true;
  private dragged = false;
  private pointers = new Map<number, Point>();
  private pointerDistance = 0;
  private observer: ResizeObserver | null = null;
  private removers: (() => void)[] = [];
  private disposed = false;
  private initialized = false;
  private appDestroyed = false;
  private selected: string | null = null;
  private renderSignature = '';
  private onPick: (ref: EntityRef) => void;
  constructor(onPick: (ref: EntityRef) => void) {
    this.onPick = onPick;
  }

  async init(host: HTMLElement) {
    await this.app.init({
      resizeTo: host,
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    this.initialized = true;
    if (this.disposed) {
      this.destroyApp();
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute(
      'aria-label',
      'Izometryczny archipelag Puerto Rico. Przeciągnij mapę lub użyj przycisków nawigacji.',
    );
    this.app.canvas.setAttribute('role', 'img');
    this.app.ticker.maxFPS = 30;
    const sheets = await Promise.all(
      [...ATLAS_URLS, MARKET_URL, WALKERS_URL].map((url) =>
        Assets.load<Texture>(url),
      ),
    );
    if (this.disposed) return;
    sheets.slice(0, 4).forEach((sheet, i) =>
      ATLAS_IDS[i]!.forEach((id, cell) => {
        const col = cell % 5,
          row = Math.floor(cell / 5);
        const x = Math.floor((sheet.width * col) / 5),
          y = Math.floor((sheet.height * row) / 3);
        this.textures.set(
          id,
          new Texture({
            source: sheet.source,
            frame: new Rectangle(
              x,
              y,
              Math.floor((sheet.width * (col + 1)) / 5) - x,
              Math.floor((sheet.height * (row + 1)) / 3) - y,
            ),
          }),
        );
      }),
    );
    this.textures.set('market', sheets[4]!);
    const walks = sheets[5]!;
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++) {
        const x = Math.floor((walks.width * col) / 4),
          y = Math.floor((walks.height * row) / 2);
        this.textures.set(
          (row === 0 ? 'worker' : 'noble') + col,
          new Texture({
            source: walks.source,
            frame: new Rectangle(
              x,
              y,
              Math.floor((walks.width * (col + 1)) / 4) - x,
              Math.floor((walks.height * (row + 1)) / 2) - y,
            ),
          }),
        );
      }
    this.world.addChild(this.terrain);
    this.app.stage.addChild(this.waves, this.world);
    this.bindInput();
    this.observer = new ResizeObserver(() => {
      this.app.resize();
      if (!this.manuallyMoved) this.focus(this.focusId, true);
      this.positionCamera();
    });
    this.observer.observe(host);
    this.app.ticker.add(() =>
      this.animate(Math.min(this.app.ticker.deltaMS, 80) / 1000),
    );
    this.focus('central', true);
  }
  update(snapshot: SceneSnapshot) {
    if (this.disposed || !this.textures.size) return;
    const signature = JSON.stringify([snapshot, this.selected]);
    if (signature === this.renderSignature) return;
    this.renderSignature = signature;
    this.snapshot = snapshot;
    for (const w of this.walkers.values()) w.sprite.removeFromParent();
    this.playerObjects.clear();
    for (const child of this.terrain.removeChildren())
      child.destroy({ children: true });
    this.wind = [];
    const centers = islandCenters(snapshot.players.length);
    this.central(snapshot);
    snapshot.players.forEach((p, i) => {
      const center = centers[i]!;
      const group = this.land(center, p.name, p.color, p.current);
      const ground = new Graphics();
      for (let v = 0; v < 3; v++)
        for (let u = 0; u < 9; u++) {
          if (u === 4) continue;
          const q = parcel(u, v);
          ground
            .poly([q.x, q.y - 16, q.x + 32, q.y, q.x, q.y + 16, q.x - 32, q.y])
            .fill({ color: u < 4 ? 0x6b9952 : 0xc8c296, alpha: 0.65 })
            .stroke({
              color: u < 4 ? 0xd5dd99 : 0xf0e3b7,
              width: 1,
              alpha: 0.36,
            });
        }
      group.addChild(ground);
      const objects = new Container();
      objects.sortableChildren = true;
      group.addChild(objects);
      this.playerObjects.set(p.id, objects);
      for (const o of p.objects)
        this.object(objects, o, snapshot.legalTargets.includes(o.key));
      for (const [u, v] of [
        [-0.5, 1.3],
        [-0.7, 3.2],
        [0.6, 4.1],
        [3, 4.2],
        [6, 4.1],
        [9.5, 2.8],
        [9.3, -0.6],
      ]) {
        const q = parcel(u!, v!);
        this.palm(objects, q.x, q.y, 76, (i + 1) * 7 + u!);
      }
      const farm = parcel(1.5, -0.7),
        city = parcel(6.5, -0.7);
      group.addChild(
        this.label('PLANTACJE', farm.x, farm.y - 6, 10, 0xf9eac8),
        this.label('MIASTO', city.x, city.y - 6, 10, 0xf9eac8),
      );
      const dock = parcel(7.6, 4.8);
      this.dock(group, dock.x, dock.y);
      const mark = this.label(
        `${p.ruralUsed}/12 pól · ${p.urbanUsed}/12 miejsc miasta`,
        0,
        164,
        11,
        0xd3f0e8,
      );
      group.addChild(mark);
    });
    this.syncWorkers(snapshot);
    this.positionCamera();
  }
  private land(center: Point, name: string, color: string, current: boolean) {
    const group = new Container();
    group.position.set(center.x, center.y);
    this.terrain.addChild(group);
    const corners = [
      [-1.6, -0.3],
      [-0.4, -1.4],
      [9.2, -1.4],
      [10.6, -0.1],
      [10.6, 3.5],
      [9.4, 4.8],
      [-0.4, 4.8],
      [-1.6, 3.4],
    ];
    const outline = corners.map(([u, v]) => parcel(u!, v!));
    const polygon = (scale: number, dy: number) =>
      outline.flatMap((p) => [p.x * scale, p.y * scale + dy]);
    const g = new Graphics();
    g.poly(polygon(1.15, 15)).fill({ color: 0x6cddcf, alpha: 0.13 });
    g.poly(polygon(1.07, 13)).fill({ color: 0x98ead4, alpha: 0.3 });
    g.poly(polygon(1, 19)).fill(0x735e3b);
    g.poly(polygon(1, 10)).fill(0x9f8853);
    g.poly(polygon(1, 0)).fill(0xe8cd90).stroke({ color: 0xf8e0a0, width: 2 });
    g.poly(polygon(0.9, -5))
      .fill(0x72a75a)
      .stroke({ color: 0x94bc6c, width: 2 });
    g.poly(polygon(0.79, -5)).fill({ color: 0x84ad5d, alpha: 0.7 });
    // The path exists only in the scene; it never determines legal moves.
    const start = parcel(-0.6, 3.5),
      end = parcel(9.6, 3.5),
      cross = parcel(4.1, -0.8),
      middle = parcel(4.1, 3.5);
    g.moveTo(start.x, start.y)
      .lineTo(end.x, end.y)
      .stroke({ color: 0xb0b978, width: 16 });
    g.moveTo(cross.x, cross.y)
      .lineTo(middle.x, middle.y)
      .stroke({ color: 0xb0b978, width: 14 });
    if (current)
      g.poly(polygon(1.01, -1)).stroke({
        color: 0xffd484,
        width: 2.5,
        alpha: 0.9,
      });
    group.addChild(g);
    const title = new Container();
    title.position.set(0, -203);
    const titleBg = new Graphics()
      .roundRect(-125, -19, 250, 38, 19)
      .fill({ color: 0x133f43, alpha: 0.95 })
      .stroke({ color: parseInt(color.slice(1), 16), width: 1.5, alpha: 0.8 });
    title.addChild(titleBg, this.label(name, 0, -9, 16, 0xfff1cf));
    group.addChild(title);
    return group;
  }
  private object(parent: Container, o: SceneObject, legal: boolean) {
    const q = parcel(o.u + (o.size - 1) * 0.5, o.v);
    const container = new Container();
    container.position.set(q.x, q.y);
    container.zIndex = q.y;
    const w = o.size === 2 ? 126 : 92,
      h = o.sprite === 'forest' ? 94 : 99;
    const floor = new Graphics()
      .ellipse(0, 3, w * 0.4, 14)
      .fill({ color: 0x254932, alpha: 0.16 });
    container.addChild(floor);
    if (legal || this.selected === o.key)
      container.addChild(
        new Graphics().ellipse(0, 5, w * 0.45, 17).stroke({
          color: legal ? 0xffdd88 : 0xd1fff1,
          width: 2.5,
          alpha: 0.95,
        }),
      );
    const sprite = this.sprite(o.sprite, w, h);
    sprite.anchor.y = 0.8;
    container.addChild(sprite);
    if (o.capacity > 0) {
      const badge = new Graphics();
      for (let i = 0; i < o.capacity; i++)
        badge
          .circle((i - (o.capacity - 1) / 2) * 8, 11, 3)
          .fill(
            i < o.workers
              ? 0xfff4cd
              : i < o.workers + o.nobles
                ? 0xe080a0
                : 0x486e51,
          )
          .stroke({ color: 0xf6e7b8, width: 1, alpha: 0.65 });
      container.addChild(badge);
    }
    this.interactive(
      container,
      o.target,
      new Rectangle(-w / 2, -h * 0.9, w, h + 20),
    );
    parent.addChild(container);
  }
  private sprite(id: string, width: number, height: number) {
    const sprite = new Sprite(this.textures.get(id));
    sprite.anchor.set(0.5, 0.92);
    sprite.width = width;
    sprite.height = height;
    return sprite;
  }
  private palm(
    parent: Container,
    x: number,
    y: number,
    size: number,
    phase: number,
  ) {
    const sprite = this.sprite('palm', size * 0.74, size);
    sprite.position.set(x, y);
    sprite.zIndex = y;
    parent.addChild(sprite);
    this.wind.push({ sprite, baseY: y, phase, kind: 'tree' });
  }
  private label(
    text: string,
    x: number,
    y: number,
    size = 12,
    color = 0xffedcb,
  ) {
    const label = new Text({
      text,
      style: {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: size,
        fontWeight: '600',
        fill: color,
        align: 'center',
        dropShadow: { color: 0x123c3f, alpha: 0.6, blur: 2, distance: 1 },
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(x, y);
    return label;
  }
  private interactive(
    container: Container,
    ref: EntityRef,
    hit: Rectangle | Polygon,
  ) {
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.hitArea = hit;
    container.on('pointertap', () => {
      if (!this.dragged && !this.disposed) this.onPick(ref);
    });
    container.on('pointerover', () => {
      container.alpha = 0.85;
    });
    container.on('pointerout', () => {
      container.alpha = 1;
    });
  }
  private landmark(
    parent: Container,
    id: string,
    name: string,
    x: number,
    y: number,
    w: number,
    area: EntityRef['area'],
    key: string = area,
  ) {
    const group = new Container();
    group.position.set(x, y);
    group.zIndex = y;
    const legal = this.snapshot?.legalTargets.includes(key);
    if (legal)
      group.addChild(
        new Graphics()
          .ellipse(0, 2, w * 0.4, 18)
          .stroke({ color: 0xffd277, width: 3 }),
      );
    group.addChild(this.sprite(id, w, w));
    group.addChild(this.label(name, 0, 14, 12));
    this.interactive(
      group,
      { key, area },
      new Rectangle(-w / 2, -w * 0.9, w, w + 35),
    );
    parent.addChild(group);
    return group;
  }
  private central(s: SceneSnapshot) {
    const group = this.land(
      { x: 0, y: 0 },
      'SAN JUAN · RYNEK',
      '#9ce1d2',
      false,
    );
    const objects = new Container();
    objects.sortableChildren = true;
    group.addChild(objects);
    this.landmark(objects, 'market', 'Budynki i targ', 68, -16, 170, 'market');
    this.landmark(
      objects,
      'magistrate',
      'Magistrat',
      -90,
      -74,
      115,
      'magistrate',
    );
    this.landmark(objects, 'corn', 'Plantacje', -140, -27, 78, 'plantations');
    if (s.festival)
      this.landmark(
        objects,
        'festival',
        'Festyn w San Juan',
        22,
        54,
        100,
        'festival',
      );
    else this.palm(objects, 22, 54, 83, 1);
    if (s.nobles) {
      const noble = this.sprite('noble', 36, 48);
      noble.position.set(-144, -65);
      noble.zIndex = 0;
      objects.addChild(noble);
    }
    if (s.newBuildings) {
      const sign = this.label('NOWE BUDYNKI', 67, -132, 10, 0xffdf8e);
      objects.addChild(sign);
    }
    for (const [u, v, k] of [
      [-0.8, 0.5, 2],
      [-0.8, 2.2, 3],
      [2.4, 4.1, 4],
      [8.8, -0.5, 5],
      [9.7, 2.6, 6],
    ]) {
      const q = parcel(u!, v!);
      this.palm(objects, q.x, q.y, 80, k!);
    }
    this.dock(group, 150, 155);
    s.ships.forEach((ship, i) => {
      const x = 122 + i * 115,
        y = 219 - i * 35,
        w = 112 + i * 6;
      const boat = this.landmark(
        objects,
        'ship',
        `${ship.count}/${ship.capacity} · ${ship.good ? (ship.good === 'corn' ? 'kukurydza' : ship.good === 'indigo' ? 'indygo' : ship.good === 'sugar' ? 'cukier' : ship.good === 'coffee' ? 'kawa' : 'tytoń') : 'pusty'}`,
        x,
        y,
        w,
        'port',
        `ship:${i}`,
      );
      this.wind.push({ sprite: boat, baseY: y, phase: i * 2, kind: 'ship' });
      if (ship.good) {
        const cargo = new Graphics();
        for (let n = 0; n < Math.min(ship.count, 8); n++)
          cargo
            .roundRect(-16 + (n % 4) * 8, -27 - Math.floor(n / 4) * 8, 7, 7, 1)
            .fill(GOOD_COLOR[ship.good] ?? 0xc5a77c)
            .stroke({ color: 0xffedcf, width: 0.5 });
        boat.addChild(cargo);
      }
    });
    if (s.corsair) {
      const boat = this.landmark(
        objects,
        'corsair',
        'Korsarz',
        -315,
        97,
        127,
        'corsair',
      );
      this.wind.push({ sprite: boat, baseY: 97, phase: 5, kind: 'ship' });
    }
    group.addChild(
      this.label(
        'Wspólna wyspa · kliknij miejsce, aby zobaczyć szczegóły',
        0,
        315,
        12,
        0xc3ece3,
      ),
    );
  }
  private dock(parent: Container, x: number, y: number) {
    const g = new Graphics();
    g.position.set(x, y);
    g.poly([-40, -18, 110, 53, 94, 68, -56, -3])
      .fill(0x765137)
      .stroke({ color: 0xc5a270, width: 2 });
    for (let i = 0; i < 12; i++)
      g.moveTo(-43 + i * 12, -16 + i * 5.7)
        .lineTo(-56 + i * 12, -3 + i * 5.7)
        .stroke({ color: 0xb89362, width: 2 });
    for (const [px, py] of [
      [-44, -16],
      [107, 54],
      [-54, -2],
      [95, 67],
    ]) {
      g.roundRect(px! - 3, py! - 13, 6, 17, 2).fill(0x4c3a2d);
      g.ellipse(px!, py! - 13, 4, 2).fill(0xc4a272);
    }
    parent.addChild(g);
  }
  private syncWorkers(s: SceneSnapshot) {
    const active = new Set<string>();
    s.players.forEach((p) => {
      for (const o of p.objects)
        for (let n = 0; n < o.workers + o.nobles; n++) {
          const key = o.key + ':' + n;
          active.add(key);
          const q = parcel(o.u + (o.size - 1) * 0.5, o.v + 0.35);
          const target = {
            x: q.x + (n - (o.capacity - 1) / 2) * 8,
            y: q.y + 9,
          };
          const old = this.walkers.get(key);
          if (old) {
            old.to = target;
            this.playerObjects.get(p.id)!.addChild(old.sprite);
            old.kind = n < o.workers ? 'worker' : 'noble';
            continue;
          }
          const start = parcel(8.5, 3.6),
            bend = parcel(o.u, 3.6);
          const from = { x: start.x, y: start.y };
          const sprite = this.sprite(
            n < o.workers ? 'worker0' : 'noble0',
            24,
            32,
          );
          sprite.position.set(
            this.motion ? from.x : target.x,
            this.motion ? from.y : target.y,
          );
          this.playerObjects.get(p.id)!.addChild(sprite);
          this.walkers.set(key, {
            kind: n < o.workers ? 'worker' : 'noble',
            sprite,
            route: [{ x: bend.x, y: bend.y }, target],
            segment: 0,
            progress: 0,
            from,
            to: target,
            phase: n * 1.3,
          });
        }
    });
    for (const [key, w] of this.walkers)
      if (!active.has(key)) {
        w.sprite.destroy();
        this.walkers.delete(key);
      }
  }
  setMotion(enabled: boolean) {
    this.motion = enabled;
    if (!enabled)
      for (const w of this.walkers.values()) {
        w.sprite.position.set(w.to.x, w.to.y);
        w.segment = w.route.length;
      }
  }
  select(key: string | null) {
    this.selected = key;
    if (this.snapshot) this.update(this.snapshot);
  }
  focus(id: string, instant = false) {
    if (!this.initialized || this.disposed) return;
    this.focusId = id;
    this.manuallyMoved = false;
    let center: Point = { x: 0, y: 0 },
      zoom = Math.min(
        this.app.screen.width / 820,
        this.app.screen.height / 590,
        1.5,
      );
    if (id === 'all' && this.snapshot) {
      zoom = Math.min(
        this.app.screen.width / 2600,
        this.app.screen.height / 1750,
      );
    } else if (id !== 'central' && this.snapshot) {
      const i = this.snapshot.players.findIndex((p) => p.id === id);
      if (i >= 0) center = islandCenters(this.snapshot.players.length)[i]!;
    }
    this.destination = {
      x: center.x,
      y: center.y + 30,
      zoom: Math.max(0.12, zoom),
    };
    if (instant) this.camera = { ...this.destination };
  }
  zoom(factor: number) {
    if (!this.initialized || this.disposed) return;
    this.zoomAt(factor, {
      x: this.app.screen.width / 2,
      y: this.app.screen.height / 2,
    });
  }
  private zoomAt(factor: number, p: Point) {
    this.manuallyMoved = true;
    const z = Math.min(2.3, Math.max(0.12, this.camera.zoom * factor)),
      w = this.app.screen.width,
      h = this.app.screen.height;
    const wx = this.camera.x + (p.x - w / 2) / this.camera.zoom,
      wy = this.camera.y + (p.y - h / 2) / this.camera.zoom;
    this.camera = {
      x: wx - (p.x - w / 2) / z,
      y: wy - (p.y - h / 2) / z,
      zoom: z,
    };
    this.destination = { ...this.camera };
    this.positionCamera();
  }
  private positionCamera() {
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(
      this.app.screen.width / 2 - this.camera.x * this.camera.zoom,
      this.app.screen.height / 2 - this.camera.y * this.camera.zoom,
    );
  }
  private animate(dt: number) {
    if (this.disposed) return;
    this.elapsed += this.motion ? dt : 0;
    const t = this.elapsed;
    const factor = this.motion ? Math.min(1, dt * 7) : 1;
    for (const k of ['x', 'y', 'zoom'] as const)
      this.camera[k] += (this.destination[k] - this.camera[k]) * factor;
    this.positionCamera();
    this.waves.clear();
    const width = this.app.screen.width,
      height = this.app.screen.height;
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 9; col++) {
        const x = col * 170 + (row % 2) * 60 + ((t * 3) % 170) - 120,
          y = row * 75 + Math.sin(t * 0.55 + col + row) * 3;
        this.waves
          .moveTo(x, y)
          .quadraticCurveTo(x + 20, y + 4, x + 44, y)
          .stroke({
            color: 0xa1e2d7,
            width: 1,
            alpha: 0.06 + Math.sin(row + col) * 0.025,
          });
      }
    for (const item of this.wind) {
      if (item.kind === 'tree')
        item.sprite.rotation = this.motion
          ? Math.sin(t * 0.85 + item.phase) * 0.022 + Math.sin(t * 0.24) * 0.009
          : 0;
      else {
        item.sprite.y =
          item.baseY + (this.motion ? Math.sin(t * 0.75 + item.phase) * 2 : 0);
        item.sprite.rotation = this.motion
          ? Math.sin(t * 0.6 + item.phase) * 0.007
          : 0;
      }
    }
    for (const w of this.walkers.values()) {
      const sprite = w.sprite;
      if (!this.motion) {
        sprite.position.set(w.to.x, w.to.y);
        sprite.texture = this.textures.get(w.kind + '0')!;
        sprite.rotation = 0;
        sprite.zIndex = sprite.y;
        continue;
      }
      const next = w.route[w.segment];
      sprite.texture = this.textures.get(
        w.kind + (next ? Math.floor(t * 8 + w.phase) % 4 : 0),
      )!;
      if (next) {
        const dx = next.x - sprite.x,
          dy = next.y - sprite.y,
          dist = Math.hypot(dx, dy),
          step = dt * 85;
        if (dist < step) {
          sprite.position.set(next.x, next.y);
          w.segment++;
        } else {
          sprite.x += (dx / dist) * step;
          sprite.y += (dy / dist) * step;
          sprite.scale.x = Math.abs(sprite.scale.x) * (dx < 0 ? -1 : 1);
        }
        sprite.rotation = Math.sin(t * 15 + w.phase) * 0.045;
      } else {
        sprite.position.set(w.to.x, w.to.y);
        sprite.rotation = Math.sin(t * 1.4 + w.phase) * 0.012;
      }
      sprite.zIndex = sprite.y;
    }

    for (const island of this.terrain.children) {
      const x = (island.x - this.camera.x) * this.camera.zoom + width / 2,
        y = (island.y - this.camera.y) * this.camera.zoom + height / 2;
      island.visible =
        x > -600 * this.camera.zoom &&
        x < width + 600 * this.camera.zoom &&
        y > -450 * this.camera.zoom &&
        y < height + 450 * this.camera.zoom;
    }
  }
  private bindInput() {
    const canvas = this.app.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      name: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      canvas.addEventListener(name, fn as EventListener, options);
      this.removers.push(() =>
        canvas.removeEventListener(name, fn as EventListener, options),
      );
    };
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        this.zoomAt(Math.exp(-e.deltaY * 0.0015), {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
        });
      },
      { passive: false },
    );
    on('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragged = false;
      this.pointerDistance = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    on('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (this.pointerDistance) {
          const r = canvas.getBoundingClientRect();
          this.zoomAt(distance / this.pointerDistance, {
            x: (a!.x + b!.x) / 2 - r.left,
            y: (a!.y + b!.y) / 2 - r.top,
          });
        }
        this.pointerDistance = distance;
        this.dragged = true;
        return;
      }
      const dx = e.clientX - prev.x,
        dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2 || this.dragged) {
        this.dragged = true;
        this.manuallyMoved = true;
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.destination = { ...this.camera };
      }
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pointerDistance = 0;
    };
    on('pointerup', up);
    on('pointercancel', up);
  }
  private destroyApp() {
    if (this.initialized && !this.appDestroyed) {
      this.appDestroyed = true;
      this.app.destroy(true, {
        children: true,
        texture: false,
        textureSource: false,
      });
    }
  }
  destroy() {
    this.disposed = true;
    this.observer?.disconnect();
    this.removers.forEach((fn) => fn());
    this.destroyApp();
  }
}
