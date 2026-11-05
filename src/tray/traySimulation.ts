import RAPIER from "@dimforge/rapier3d-compat";
import { readFace } from "../dice/faceReader";
import { dot } from "../dice/polyhedron";
import type { DieDefinition, Rotation, Vec3 } from "../dice/types";

/** Starting position, rotation, velocity and spin for one Die. */
export interface Throw {
  position: Vec3;
  rotation: Rotation;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
  /** Seconds after the throw starts before this Die enters the Tray. 0 if left out. */
  delay?: number;
}

export interface TrayDimensions {
  /** Inside width along X. */
  width: number;
  /** Inside depth along Z. The near edge is at +depth/2. */
  depth: number;
  /** Height of the visible walls. */
  wallHeight: number;
  /**
   * Height of the invisible lid. The physics walls reach up to it, so a Die
   * can never leave the Tray. Must clear a Die standing on a corner, or it
   * can wedge between floor and lid.
   */
  lidHeight: number;
}

export const TRAY: TrayDimensions = { width: 10, depth: 7, wallHeight: 1.5, lidHeight: 3 };

/** Physics runs at a fixed 120 Hz, whatever the display refresh rate. */
export const TIMESTEP = 1 / 120;

const REST_SPEED = 0.05; // linear (units/s) and angular (rad/s)
const REST_TIME = 0.4; // seconds a Die must stay below REST_SPEED
const WALL_THICKNESS = 1;

export interface TrayDie {
  readonly definition: DieDefinition;
  readonly position: Vec3;
  readonly rotation: Rotation;
  readonly atRest: boolean;
  /** The Face Value of the uppermost face, as the Face Reader sees it now. */
  readonly faceValue: number;
}

class SimulatedDie implements TrayDie {
  private stillFor = 0;
  /** Set once the Die has entered the Tray, after its throw's delay. */
  body: RAPIER.RigidBody | undefined;

  constructor(
    readonly definition: DieDefinition,
    readonly dieThrow: Throw,
    /** Physics steps left before the Die enters the Tray. */
    public stepsToEnter: number,
  ) {}

  get position(): Vec3 {
    return this.inTray().translation();
  }

  get rotation(): Rotation {
    return this.inTray().rotation();
  }

  get atRest(): boolean {
    return this.body !== undefined && this.stillFor >= REST_TIME;
  }

  get faceValue(): number {
    return readFace(this.definition, this.rotation);
  }

  /** Called once per physics step. */
  trackRest(): void {
    const body = this.inTray();
    const still = length(body.linvel()) < REST_SPEED && length(body.angvel()) < REST_SPEED;
    this.stillFor = still ? this.stillFor + TIMESTEP : 0;
  }

  private inTray(): RAPIER.RigidBody {
    if (!this.body) throw new Error(`${this.definition.name} has not entered the Tray yet`);
    return this.body;
  }
}

/**
 * The Rapier world of the Tray: floor, walls, lid and the Die bodies.
 * It has no knowledge of rendering and can be stepped headless.
 */
export class TraySimulation {
  private readonly world: RAPIER.World;
  private dice: SimulatedDie[] = [];

  private constructor(readonly tray: TrayDimensions) {
    this.world = new RAPIER.World({ x: 0, y: -9.81 * 2, z: 0 });
    this.world.timestep = TIMESTEP;
    this.buildTray();
  }

  static async create(): Promise<TraySimulation> {
    await RAPIER.init();
    return new TraySimulation(TRAY);
  }

  /** The dice that have entered the Tray; a delayed throw's Die joins once its delay is up. */
  get trayDice(): readonly TrayDie[] {
    return this.dice.filter((d) => d.body);
  }

  /** True once there is at least one Die and every Die has entered the Tray and come to rest. */
  get allAtRest(): boolean {
    return this.dice.length > 0 && this.dice.every((d) => d.atRest);
  }

  /**
   * Throws a Die into the Tray, after the throw's delay if it has one. The
   * returned Die only appears in {@link trayDice} once it has entered.
   */
  throwDie(dieType: DieDefinition, dieThrow: Throw): TrayDie {
    const die = new SimulatedDie(dieType, dieThrow, Math.round((dieThrow.delay ?? 0) / TIMESTEP));
    this.dice.push(die);
    if (die.stepsToEnter === 0) this.enter(die);
    return die;
  }

  /** Removes every Die from the Tray. */
  clear(): void {
    for (const die of this.dice) if (die.body) this.world.removeRigidBody(die.body);
    this.dice = [];
  }

  /** Advances the world by one fixed TIMESTEP. */
  step(): void {
    this.world.step();
    for (const die of this.dice) {
      if (die.body) die.trackRest();
      else if (--die.stepsToEnter <= 0) this.enter(die);
    }
  }

  /** Creates the Die's body at its throw's starting pose and velocity. */
  private enter(die: SimulatedDie): void {
    const { position, rotation, linearVelocity, angularVelocity } = die.dieThrow;
    die.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setLinvel(linearVelocity.x, linearVelocity.y, linearVelocity.z)
        .setAngvel(angularVelocity)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      dieCollider(die.definition).setDensity(1).setFriction(0.5).setRestitution(0.35),
      die.body,
    );
  }

  private buildTray(): void {
    const { width, depth, lidHeight } = this.tray;
    const t = WALL_THICKNESS / 2; // half thickness
    const surface = (desc: RAPIER.ColliderDesc) =>
      this.world.createCollider(desc.setFriction(0.6).setRestitution(0.4));

    // Floor, with its top face at y = 0.
    surface(RAPIER.ColliderDesc.cuboid(width / 2 + 2 * t, t, depth / 2 + 2 * t).setTranslation(0, -t, 0));
    // Lid, invisible: guarantees a Die can never leave the Tray.
    surface(
      RAPIER.ColliderDesc.cuboid(width / 2 + 2 * t, t, depth / 2 + 2 * t).setTranslation(0, lidHeight + t, 0),
    );
    // Walls.
    const h = lidHeight / 2;
    surface(RAPIER.ColliderDesc.cuboid(t, h, depth / 2 + 2 * t).setTranslation(width / 2 + t, h, 0));
    surface(RAPIER.ColliderDesc.cuboid(t, h, depth / 2 + 2 * t).setTranslation(-width / 2 - t, h, 0));
    surface(RAPIER.ColliderDesc.cuboid(width / 2 + 2 * t, h, t).setTranslation(0, h, depth / 2 + t));
    surface(RAPIER.ColliderDesc.cuboid(width / 2 + 2 * t, h, t).setTranslation(0, h, -depth / 2 - t));
  }
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * A convex hull of the Die's corners with slightly rounded edges. The hull is
 * shrunk first so the rounding brings its faces back to their true size.
 */
function dieCollider(dieType: DieDefinition): RAPIER.ColliderDesc {
  const inradius = Math.min(...dieType.faces.map((f) => dot(f.normal, dieType.vertices[f.corners[0]])));
  const rounding = inradius * 0.12;
  const shrink = 1 - rounding / inradius;
  const points = new Float32Array(dieType.vertices.flatMap((v) => [v.x * shrink, v.y * shrink, v.z * shrink]));
  const desc = RAPIER.ColliderDesc.roundConvexHull(points, rounding);
  if (!desc) throw new Error(`could not build a collider for ${dieType.name}`);
  return desc;
}
