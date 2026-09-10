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
  IDLE_URL,
} from '../assets/registry';
import {
  parcel,
  islandCenters,
  TILE_W,
  TILE_H,
  type Point,
} from '../iso/projection';
import {
  PLAYER_OUTLINE,
  CENTRAL_OUTLINE,
  CENTRAL_PLACES,
  CENTRAL_PATHS,
  CENTRAL_WALKS,
  PLAYER_WALKS,
} from '../iso/layout';
import { idleFormation, waitingWorkforce } from '../iso/workforce';
import { walkAt, swayAt, bobAt } from './ambient';
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
  private idlers: {
    sprite: Sprite;
    baseY: number;
    lean: number;
    phase: number;
  }[] = [];
  private guiding = false;
  private arrow: Container | null = null;
  private arrowY = 0;
  private walkers = new Map<string, Walker>();
  private residents = new Map<
    string,
    { sprite: Sprite; route: Point[]; phase: number; kind: 'worker' | 'noble' }
  >();
  private highlights = new Map<string, Graphics[]>();
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
  private pointerOrigin: Point | null = null;
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
      [...ATLAS_URLS, MARKET_URL, WALKERS_URL, IDLE_URL].map((url) =>
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
              Math.floor((sheet.height * (row + 1)) / 3) -
                y -
                (id === 'corsair' ? 26 : 0),
            ),
          }),
        );
      }),
    );
    this.textures.set('market', sheets[4]!);
    for (const [index, prefix] of [
      [5, ''],
      [6, 'idle-'],
    ] as const) {
      const walks = sheets[index]!;
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 4; col++) {
          const x = Math.floor((walks.width * col) / 4),
            y = prefix
              ? row === 0
                ? 0
                : 486
              : Math.floor((walks.height * row) / 2);
          this.textures.set(
            prefix + (row === 0 ? 'worker' : 'noble') + col,
            new Texture({
              source: walks.source,
              frame: new Rectangle(
                x,
                y,
                Math.floor((walks.width * (col + 1)) / 4) - x,
                (prefix
                  ? row === 0
                    ? 486
                    : walks.height
                  : Math.floor((walks.height * (row + 1)) / 2)) - y,
              ),
            }),
          );
        }
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
    for (const w of this.residents.values()) w.sprite.removeFromParent();
    this.playerObjects.clear();
    this.highlights.clear();
    for (const child of this.terrain.removeChildren())
      child.destroy({ children: true });
    this.wind = [];
    this.idlers = [];
    this.arrow = null;
    const centers = islandCenters(snapshot.players.length);
    this.central(snapshot);
    snapshot.players.forEach((p, i) => {
      const center = centers[i]!;
      const group = this.land(center, p.name, p.color, p.current, false, p.id);
      const ground = new Graphics();
      for (let v = 0; v < 3; v++)
        for (let u = 0; u < 9; u++) {
          if (u === 4) continue;
          const q = parcel(u, v);
          ground
            .poly([
              q.x,
              q.y - TILE_H * 0.45,
              q.x + TILE_W * 0.45,
              q.y,
              q.x,
              q.y + TILE_H * 0.45,
              q.x - TILE_W * 0.45,
              q.y,
            ])
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
        [1.6, 4.2],
        [8.8, 3.9],
        [9.5, 2.8],
        [9.3, -0.6],
      ]) {
        const q = parcel(u!, v!);
        this.palm(objects, q.x, q.y, 76, (i + 1) * 7 + u!);
      }
      const waiting = waitingWorkforce(p);
      const ref: EntityRef = { key: p.id, area: 'island', playerId: p.id };
      this.waitingPeople(objects, waiting.workers, waiting.nobles, false, ref);
      if (waiting.workers + waiting.nobles > 0) {
        this.workforceBadge(
          objects,
          -150,
          210,
          waiting.workers,
          waiting.nobles,
          snapshot.nobles,
          p.pending + p.pendingNobles > 0 ? 'Do przydzielenia' : 'W rezerwie',
          ref,
        );
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
        290,
        11,
        0xd3f0e8,
      );
      group.addChild(mark);
    });
    this.syncWorkers(snapshot);
    this.syncResidents(snapshot);
    this.positionCamera();
  }
  private land(
    center: Point,
    name: string,
    color: string,
    current: boolean,
    central = false,
    playerId?: string,
  ) {
    const group = new Container();
    group.position.set(center.x, center.y);
    this.terrain.addChild(group);
    const outline = central ? CENTRAL_OUTLINE : PLAYER_OUTLINE;
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
    // Paths and residents are purely decorative.
    const paths = central
      ? CENTRAL_PATHS
      : [
          [parcel(-0.6, 3.5), parcel(9.6, 3.5)],
          [parcel(4.1, -0.8), parcel(4.1, 3.5)],
        ];
    for (const path of paths) {
      g.moveTo(path[0]!.x, path[0]!.y);
      for (const p of path.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({
        color: 0xc6c18b,
        width: central ? 25 : 22,
        cap: 'round',
        join: 'round',
      });
    }
    if (current)
      g.poly(polygon(1.01, -1)).stroke({
        color: 0xffd484,
        width: 2.5,
        alpha: 0.9,
      });
    group.addChild(g);
    const title = new Container();
    title.position.set(0, central ? -408 : -340);
    const titleBg = new Graphics()
      .roundRect(central ? -190 : -125, -19, central ? 380 : 250, 38, 19)
      .fill({ color: 0x133f43, alpha: 0.95 })
      .stroke({ color: parseInt(color.slice(1), 16), width: 1.5, alpha: 0.8 });
    title.addChild(titleBg, this.label(name, 0, -9, 16, 0xfff1cf));
    group.addChild(title);
    const ref: EntityRef = playerId
      ? { key: playerId, area: 'island', playerId }
      : { key: 'central', area: 'supplies' };
    this.interactive(
      title,
      ref,
      new Rectangle(central ? -190 : -125, -19, central ? 380 : 250, 38),
    );
    this.interactive(g, ref, new Polygon(polygon(1, 0)));
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
    const root = new Container();
    root.position.set(x, y);
    root.zIndex = y;
    const sprite = this.sprite('palm', size * 0.74, size);
    root.addChild(sprite);
    parent.addChild(root);
    this.interactive(
      root,
      { key: 'scenery:palm:' + phase + ':' + x + ':' + y, area: 'scenery' },
      new Rectangle(-size * 0.37, -size * 0.92, size * 0.74, size),
    );
    this.wind.push({ sprite, baseY: 0, phase, kind: 'tree' });
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
    const glow = new Graphics();
    if (hit instanceof Rectangle)
      glow.roundRect(hit.x - 4, hit.y - 3, hit.width + 8, hit.height + 6, 12);
    else glow.poly(hit.points);
    glow
      .fill({ color: 0xffda70, alpha: 0.09 })
      .stroke({ color: 0xffdf82, width: 2, alpha: 0.85 });
    glow.eventMode = 'none';
    glow.visible = this.selected === ref.key;
    if (container instanceof Graphics) {
      // Graphics are leaf views in Pixi; the hover layer is their sibling.
      glow.position.copyFrom(container.position);
      container.parent!.addChild(glow);
    } else container.addChildAt(glow, 0);
    const group = this.highlights.get(ref.key) ?? [];
    group.push(glow);
    this.highlights.set(ref.key, group);
    container.on('pointerover', () => {
      for (const g of this.highlights.get(ref.key) ?? []) g.visible = true;
    });
    container.on('pointerout', () => {
      for (const g of this.highlights.get(ref.key) ?? [])
        g.visible = this.selected === ref.key;
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
    const caption = new Container();
    caption.position.set(x, y + 24);
    caption.zIndex = 10000 + y;
    const text = this.label(name, 0, 0, 16, 0xffebbd);
    const captionWidth = text.width + 18;
    caption.addChild(
      new Graphics()
        .roundRect(-captionWidth / 2, -4, captionWidth, 29, 13)
        .fill({ color: 0x154b4f, alpha: 0.94 })
        .stroke({ color: 0xd8c88f, width: 0.8, alpha: 0.45 }),
      text,
    );
    this.interactive(
      caption,
      { key, area },
      new Rectangle(-captionWidth / 2, -4, captionWidth, 29),
    );
    parent.addChild(caption);
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
      'SAN JUAN · SERCE ARCHIPELAGU',
      '#f2d18c',
      false,
      true,
    );
    this.dock(group, 385, 245);
    const objects = new Container();
    objects.sortableChildren = true;
    group.addChild(objects);
    this.playerObjects.set('central', objects);
    for (const [area, id, name] of [
      ['market', 'market', 'Budynki i targ'],
      ['magistrate', 'magistrate', 'Magistrat i szlachta'],
      ['plantations', 'corn', 'Plantacje'],
      ['supplies', 'treasury', 'Wspólne zapasy'],
      ['port', 'lighthouse', 'Port San Juan'],
    ] as const) {
      const p = CENTRAL_PLACES[area];
      this.landmark(
        objects,
        id,
        area === 'magistrate' && !s.nobles ? 'Magistrat' : name,
        p.x,
        p.y,
        p.size,
        area,
      );
    }
    this.waitingPeople(objects, s.magistrate, s.magistrateNobles, true, {
      key: 'magistrate',
      area: 'magistrate',
    });
    this.workforceBadge(
      objects,
      -225,
      -213,
      s.magistrate,
      s.magistrateNobles,
      s.nobles,
      'Dostępni w magistracie',
      { key: 'magistrate', area: 'magistrate' },
    );
    const p = CENTRAL_PLACES.plantations;
    const arrow = new Container();
    arrow.position.set(p.x, p.y - p.size + 4);
    arrow.zIndex = 20000;
    arrow.addChild(
      new Graphics()
        .poly([-9, -28, 9, -28, 9, -10, 21, -10, 0, 9, -21, -10, -9, -10])
        .fill(0xffda70)
        .stroke({ color: 0x785b2c, width: 3, join: 'round' }),
    );
    this.interactive(
      arrow,
      { key: 'plantations', area: 'plantations' },
      new Rectangle(-32, -36, 64, 50),
    );
    arrow.visible = this.guiding;
    objects.addChild(arrow);
    this.arrow = arrow;
    this.arrowY = arrow.y;

    const f = CENTRAL_PLACES.festival;
    if (s.festival)
      this.landmark(
        objects,
        'festival',
        'Festyn w San Juan',
        f.x,
        f.y,
        f.size,
        'festival',
      );
    else this.palm(objects, f.x, f.y, 115, 1);
    if (s.newBuildings) {
      const sign = new Container();
      sign.position.set(220, -210);
      sign.addChild(this.label('Z DODATKOWYMI BUDYNKAMI', 0, 0, 10, 0xffe8b6));
      this.interactive(
        sign,
        { key: 'market', area: 'market' },
        new Rectangle(-110, -3, 220, 20),
      );
      objects.addChild(sign);
    }
    for (const [x, y, phase] of [
      [-420, -155, 2],
      [-490, 150, 3],
      [-125, 275, 4],
      [335, -125, 5],
      [530, 10, 6],
      [-65, -245, 7],
    ])
      this.palm(objects, x!, y!, 110, phase!);
    s.ships.forEach((ship, i) => {
      const x = 360 + i * 152,
        y = 440 - i * 65,
        w = 144 + i * 7;
      const names: Record<string, string> = {
        corn: 'kukurydza',
        indigo: 'indygo',
        sugar: 'cukier',
        coffee: 'kawa',
        tobacco: 'tytoń',
      };
      const boat = this.landmark(
        objects,
        'ship',
        `${ship.count}/${ship.capacity} · ${ship.good ? names[ship.good] : 'pusty'}`,
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
        -570,
        290,
        155,
        'corsair',
      );
      this.wind.push({ sprite: boat, baseY: 290, phase: 5, kind: 'ship' });
    }
    group.addChild(
      this.label('WSPÓLNA WYSPA · RYNEK, PORT I DODATKI', 0, 505, 13, 0xc3ece3),
    );
  }
  private workforceBadge(
    parent: Container,
    x: number,
    y: number,
    workers: number,
    nobles: number,
    showNobles: boolean,
    title: string,
    ref: EntityRef,
  ) {
    const group = new Container();
    group.position.set(x, y);
    group.zIndex = 12000 + y;
    const width = Math.max(showNobles ? 166 : 122, title.length * 7.5 + 20);
    group.addChild(
      new Graphics()
        .roundRect(-width / 2, -28, width, 65, 12)
        .fill({ color: 0x153f42, alpha: 0.97 })
        .stroke({ color: 0xeac979, width: 1.5 }),
    );
    const worker = this.sprite('idle-worker0', 29, 39);
    worker.position.set(showNobles ? -53 : -27, 10);
    group.addChild(
      worker,
      this.label(String(workers), showNobles ? -25 : 7, -22, 24, 0xffe5a4),
    );
    if (showNobles) {
      const noble = this.sprite('idle-noble0', 29, 39);
      noble.position.set(25, 10);
      group.addChild(noble, this.label(String(nobles), 54, -22, 24, 0xffc3d1));
    }
    group.addChild(this.label(title, 0, 15, 12, 0xf2e8c6));
    this.interactive(group, ref, new Rectangle(-width / 2, -28, width, 65));
    parent.addChild(group);
  }
  private waitingPeople(
    parent: Container,
    workers: number,
    nobles: number,
    central: boolean,
    ref: EntityRef,
  ) {
    const people = idleFormation(workers, nobles, central);
    if (!people.length) return;
    const plaza = new Graphics();
    if (central) plaza.ellipse(-416, 4, 100, 91);
    else
      plaza.poly(
        [
          [2.6, 3.7],
          [7.15, 3.7],
          [7.15, 4.65],
          [2.6, 4.65],
        ].flatMap(([u, v]) => {
          const p = parcel(u!, v!);
          return [p.x, p.y];
        }),
      );
    plaza
      .fill({ color: 0xd5c398, alpha: 0.8 })
      .stroke({ color: 0xf3dfa4, width: 1, alpha: 0.7 });
    plaza.zIndex = -1000;
    parent.addChild(plaza);
    for (const [i, person] of people.entries()) {
      const sprite = this.sprite(
        'idle-' + person.kind + person.pose,
        person.size * 0.75,
        person.size,
      );
      sprite.anchor.y = person.kind === 'worker' ? 0.985 : 0.935;
      sprite.position.set(person.x, person.y);
      sprite.rotation = person.lean;
      sprite.zIndex = person.y;
      const root = new Container();
      root.position.copyFrom(sprite.position);
      root.zIndex = person.y;
      sprite.position.set(0, 0);
      root.addChild(
        new Graphics()
          .ellipse(0, -1, person.size * 0.2, 3)
          .fill({ color: 0x36513a, alpha: 0.18 }),
        sprite,
      );
      this.interactive(
        root,
        ref,
        new Rectangle(
          -person.size * 0.3,
          -person.size,
          person.size * 0.6,
          person.size + 3,
        ),
      );
      parent.addChild(root);
      this.idlers.push({ sprite, baseY: 0, lean: person.lean, phase: i * 1.9 });
    }
  }
  guide(enabled: boolean) {
    this.guiding = enabled;
    if (this.arrow) this.arrow.visible = enabled;
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
    this.interactive(
      g,
      { key: 'port', area: 'port' },
      new Rectangle(-56, -31, 172, 104),
    );
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
          const start = parcel(4.5, 4.0),
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
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          sprite.on('pointertap', () => {
            if (!this.dragged) this.onPick(o.target);
          });
          sprite.on('pointerover', () => {
            sprite.tint = 0xffd277;
          });
          sprite.on('pointerout', () => {
            sprite.tint = 0xffffff;
          });
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
  private syncResidents(s: SceneSnapshot) {
    const active = new Set<string>();
    const add = (island: string, routes: Point[][], noble: boolean) => {
      routes.forEach((route, i) => {
        const key = island + ':resident:' + i;
        active.add(key);
        let w = this.residents.get(key);
        if (!w) {
          const kind = noble && i === 2 ? 'noble' : 'worker';
          const sprite = this.sprite(kind + '0', 33, 44);
          w = { sprite, route, phase: i * 7.5, kind };
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          sprite.on('pointertap', () => {
            if (!this.dragged) this.onPick({ key: 'scenery', area: 'scenery' });
          });
          sprite.on('pointerover', () => {
            sprite.tint = 0xffd277;
          });
          sprite.on('pointerout', () => {
            sprite.tint = 0xffffff;
          });
          this.residents.set(key, w);
        }
        this.playerObjects.get(island)!.addChild(w.sprite);
      });
    };
    add('central', CENTRAL_WALKS, s.nobles);
    for (const p of s.players) add(p.id, PLAYER_WALKS, false);
    for (const [key, w] of this.residents)
      if (!active.has(key)) {
        w.sprite.destroy();
        this.residents.delete(key);
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
        this.app.screen.width / (id === 'central' ? 1580 : 1120),
        this.app.screen.height / (id === 'central' ? 1080 : 740),
        1.5,
      );
    if (id === 'all' && this.snapshot) {
      zoom = Math.min(
        this.app.screen.width / 4350,
        this.app.screen.height / 3200,
      );
    } else if (id !== 'central' && this.snapshot) {
      const i = this.snapshot.players.findIndex((p) => p.id === id);
      if (i >= 0) center = islandCenters(this.snapshot.players.length)[i]!;
    }
    this.destination = {
      x: center.x,
      y: center.y + (id === 'central' ? 40 : 0),
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
    for (let row = 0; row < Math.ceil(height / 75) + 1; row++)
      for (let col = 0; col < Math.ceil(width / 170) + 2; col++) {
        const x = col * 170 + (row % 2) * 60 + ((t * 11) % 170) - 120,
          y = row * 75 + Math.sin(t * 1.1 + col + row) * 6;
        this.waves
          .moveTo(x, y)
          .quadraticCurveTo(x + 20, y + 4, x + 44, y)
          .stroke({
            color: 0xa1e2d7,
            width: 1.6,
            alpha: 0.16 + Math.sin(row + col) * 0.045,
          });
      }
    for (const item of this.wind) {
      if (item.kind === 'tree')
        item.sprite.rotation = this.motion ? swayAt(t, item.phase) : 0;
      else {
        item.sprite.y = item.baseY + (this.motion ? bobAt(t, item.phase).y : 0);
        item.sprite.rotation = this.motion ? bobAt(t, item.phase).rotation : 0;
      }
    }
    for (const w of this.idlers) {
      w.sprite.rotation =
        w.lean + (this.motion ? Math.sin(t * 0.8 + w.phase) * 0.015 : 0);
      w.sprite.y =
        w.baseY + (this.motion ? Math.sin(t * 1.2 + w.phase) * 0.8 : 0);
    }
    if (this.arrow)
      this.arrow.y = this.arrowY + (this.motion ? Math.sin(t * 3.6) * 6 : 0);
    for (const w of this.residents.values()) {
      const p = walkAt(w.route, t + w.phase);
      w.sprite.position.set(p.x, p.y);
      w.sprite.scale.x = Math.abs(w.sprite.scale.x) * p.facing;
      w.sprite.texture = this.textures.get(
        w.kind + (this.motion ? Math.floor(t * 8 + w.phase) % 4 : 0),
      )!;
      w.sprite.rotation = this.motion ? Math.sin(t * 14 + w.phase) * 0.035 : 0;
      w.sprite.zIndex = p.y;
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
        x > -850 * this.camera.zoom &&
        x < width + 850 * this.camera.zoom &&
        y > -650 * this.camera.zoom &&
        y < height + 650 * this.camera.zoom;
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
      this.dragged = this.pointers.size > 1;
      this.pointerOrigin = { x: e.clientX, y: e.clientY };
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
      const origin = this.pointerOrigin ?? prev;
      // Count the whole gesture, including slow movement across many small events.
      if (
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 5 ||
        this.dragged
      ) {
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
