import RAPIER from "@dimforge/rapier3d-compat";
import type { DieDefinition, Rotation, Vec3 } from "../dice/types";

/** Starting position, rotation, velocity and spin for one Die. */
export interface Throw {
  position: Vec3;
  rotation: Rotation;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
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
}

class SimulatedDie implements TrayDie {
  private stillFor = 0;

  constructor(
    readonly definition: DieDefinition,
    readonly body: RAPIER.RigidBody,
  ) {}

  get position(): Vec3 {
    return this.body.translation();
  }

  get rotation(): Rotation {
    return this.body.rotation();
  }

  get atRest(): boolean {
    return this.stillFor >= REST_TIME;
  }

  /** Called once per physics step. */
  trackRest(): void {
    const still =
      length(this.body.linvel()) < REST_SPEED && length(this.body.angvel()) < REST_SPEED;
    this.stillFor = still ? this.stillFor + TIMESTEP : 0;
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

  static async create(tray: TrayDimensions = TRAY): Promise<TraySimulation> {
    await RAPIER.init();
    return new TraySimulation(tray);
  }

  get trayDice(): readonly TrayDie[] {
    return this.dice;
  }

  /** True once there is at least one Die and every Die has come to rest. */
  get allAtRest(): boolean {
    return this.dice.length > 0 && this.dice.every((d) => d.atRest);
  }

  throwDie(definition: DieDefinition, t: Throw): TrayDie {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(t.position.x, t.position.y, t.position.z)
        .setRotation(t.rotation)
        .setLinvel(t.linearVelocity.x, t.linearVelocity.y, t.linearVelocity.z)
        .setAngvel(t.angularVelocity)
        .setCcdEnabled(true),
    );
    const half = definition.size / 2;
    const rounding = definition.size * 0.08;
    this.world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(half - rounding, half - rounding, half - rounding, rounding)
        .setDensity(1)
        .setFriction(0.5)
        .setRestitution(0.35),
      body,
    );
    const die = new SimulatedDie(definition, body);
    this.dice.push(die);
    return die;
  }

  /** Removes every Die from the Tray. */
  clear(): void {
    for (const die of this.dice) this.world.removeRigidBody(die.body);
    this.dice = [];
  }

  /** Advances the world by one fixed TIMESTEP. */
  step(): void {
    this.world.step();
    for (const die of this.dice) die.trackRest();
  }

  private buildTray(): void {
    const { width, depth, lidHeight } = this.tray;
    const t = WALL_THICKNESS / 2;
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
