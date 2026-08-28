import { Room, Client, CloseCode } from "colyseus";
import { PumpKartState, PumpKartPlayer } from "./schema/PumpKartState.js";

const TRACK_LENGTHS = [822, 846, 806];
const TRACK_MAX_SPEED = [47, 52, 49];
const TRACK_GRIP = [1, 0.98, 0.88];
const ITEM_POINTS = [0.09, 0.24, 0.405, 0.59, 0.755, 0.91];
const BOOST_POINTS = [0.17, 0.51, 0.84];
const ITEMS = ["candle", "rocket", "diamond", "rug", "mev", "airdrop"];
const ALLOWED_INPUT_KEYS = new Set(["gas", "brake", "left", "right", "drift", "seq"]);

interface InputState {
  gas: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  seq: number;
  at: number;
}

interface RuntimeState {
  input: InputState;
  steerInput: number;
  headingOffset: number;
  driftCharge: number;
  lastS: number;
  padLock: number;
  itemLock: number;
  aiLane: number;
  aiPhase: number;
}

function blankInput(): InputState {
  return { gas: false, brake: false, left: false, right: false, drift: false, seq: 0, at: 0 };
}

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") return "RACER";
  const clean = value.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 12);
  return clean || "RACER";
}

function sanitizeKart(value: unknown): number {
  const kart = Number.isFinite(value) ? Math.trunc(Number(value)) : 0;
  return Math.max(0, Math.min(7, kart));
}

function isStrictObject(value: unknown, allowed: Set<string>): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).every((key) => allowed.has(key));
}

function parseInput(value: unknown, previous: InputState): InputState | null {
  if (!isStrictObject(value, ALLOWED_INPUT_KEYS)) return null;
  for (const field of ["gas", "brake", "left", "right", "drift"] as const) {
    if (typeof value[field] !== "boolean") return null;
  }
  const seq = Number(value.seq);
  if (!Number.isSafeInteger(seq) || seq < previous.seq || seq > previous.seq + 10_000) return null;
  return { gas: value.gas as boolean, brake: value.brake as boolean, left: value.left as boolean, right: value.right as boolean, drift: value.drift as boolean, seq, at: Date.now() };
}

function modularDelta(a: number, b: number): number {
  let delta = a - b;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

export class PumpKartRoom extends Room<{ state: PumpKartState }> {
  maxClients = 8;
  state = new PumpKartState();
  private runtime = new Map<string, RuntimeState>();
  private startedAt = 0;

  messages = {
    input: (client: Client, value: unknown) => {
      if (this.state.phase !== "race") return;
      const runtime = this.runtime.get(client.sessionId);
      if (!runtime) return;
      const parsed = parseInput(value, runtime.input);
      if (parsed) runtime.input = parsed;
    },
    ready: (client: Client, value: unknown) => {
      if (this.state.phase !== "lobby" || !isStrictObject(value, new Set(["ready"])) || typeof value.ready !== "boolean") return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.ready = value.ready;
      this.maybeAutoStart();
    },
    track: (client: Client, value: unknown) => {
      if (this.state.phase !== "lobby" || !isStrictObject(value, new Set(["track"]))) return;
      const track = Number(value.track);
      if (!Number.isInteger(track) || track < 0 || track > 2) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.trackVote = track;
      this.recalculateTrackVote();
    },
    start: (client: Client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== "lobby") return;
      this.startRace();
    },
    useItem: (client: Client) => {
      if (this.state.phase !== "race") return;
      const player = this.state.players.get(client.sessionId);
      if (player) this.applyItem(player);
    },
    rematch: (client: Client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== "finished") return;
      this.returnToLobby();
    },
  };

  onCreate(options: Record<string, unknown>) {
    this.state.roomCode = this.roomId;
    this.state.privateRoom = options?.private === true;
    this.state.track = Number.isInteger(options?.track) ? Math.max(0, Math.min(2, Number(options.track))) : 0;
    if (this.state.privateRoom) void this.setPrivate(true);
    this.setPatchRate(50);
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), 1000 / 30);
    void this.setMetadata({ mode: "pump-kart", phase: "lobby", private: this.state.privateRoom });
  }

  onJoin(client: Client, options: Record<string, unknown>) {
    if (this.state.phase !== "lobby") throw new Error("race_already_started");
    const player = new PumpKartPlayer();
    player.sessionId = client.sessionId;
    player.name = sanitizeName(options?.name);
    player.kart = sanitizeKart(options?.kart);
    player.trackVote = this.state.track;
    player.connected = true;
    this.state.players.set(client.sessionId, player);
    this.runtime.set(client.sessionId, this.createRuntime(player, this.state.players.size - 1));
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.broadcast("lobby", { type: "joined", sessionId: client.sessionId, name: player.name });
  }

  async onLeave(client: Client, code: CloseCode) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.state.phase === "race" || this.state.phase === "countdown") {
      player.connected = false;
      try {
        await this.allowReconnection(client, 20);
        player.connected = true;
        this.runtime.get(client.sessionId)!.input = blankInput();
        return;
      } catch {
        this.removePlayer(client.sessionId);
      }
    } else {
      this.removePlayer(client.sessionId);
    }
    void code;
  }

  onDispose() {
    this.runtime.clear();
  }

  private createRuntime(player: PumpKartPlayer, slot: number): RuntimeState {
    return {
      input: blankInput(), steerInput: 0, headingOffset: 0, driftCharge: 0,
      lastS: player.s || 0.98, padLock: 0, itemLock: 0,
      aiLane: (slot % 2 ? 1 : -1) * (1.4 + (slot % 3)), aiPhase: slot * 1.71,
    };
  }

  private removePlayer(sessionId: string) {
    this.state.players.delete(sessionId);
    this.runtime.delete(sessionId);
    if (this.state.hostId === sessionId) {
      const next = [...this.state.players.values()].find((player) => !player.bot);
      this.state.hostId = next?.sessionId || "";
    }
    if (![...this.state.players.values()].some((player) => !player.bot)) this.disconnect();
  }

  private recalculateTrackVote() {
    const votes = [0, 0, 0];
    for (const player of this.state.players.values()) if (!player.bot) votes[player.trackVote]++;
    const best = Math.max(...votes);
    const tied = votes.map((count, index) => count === best ? index : -1).filter((index) => index >= 0);
    const hostVote = this.state.players.get(this.state.hostId)?.trackVote ?? this.state.track;
    this.state.track = tied.includes(hostVote) ? hostVote : tied[0];
  }

  private maybeAutoStart() {
    const humans = [...this.state.players.values()].filter((player) => !player.bot);
    if (humans.length >= 2 && humans.every((player) => player.ready)) this.startRace();
  }

  private startRace() {
    if (this.state.phase !== "lobby") return;
    const humans = [...this.state.players.values()].filter((player) => !player.bot);
    if (!humans.length) return;
    this.recalculateTrackVote();
    for (let slot = this.state.players.size; slot < 8; slot++) {
      const bot = new PumpKartPlayer();
      bot.sessionId = `bot-${slot}`;
      bot.name = ["WHALE", "APE", "DEV", "BOT", "HODL", "CHAD", "JEET"][slot % 7];
      bot.kart = slot;
      bot.bot = true;
      bot.ready = true;
      bot.connected = true;
      this.state.players.set(bot.sessionId, bot);
      this.runtime.set(bot.sessionId, this.createRuntime(bot, slot));
    }
    let slot = 0;
    for (const player of this.state.players.values()) {
      player.s = (0.985 - slot * 0.0055 + 1) % 1;
      player.lane = (slot % 2 ? 1 : -1) * (1.3 + Math.floor(slot / 2) * 0.85);
      player.speed = 0; player.lap = 0; player.finished = false; player.finishTime = 0;
      player.heading = 0;
      player.boost = 0; player.shield = 0; player.spin = 0; player.item = ""; player.drifting = false;
      const runtime = this.createRuntime(player, slot);
      runtime.lastS = 0.98;
      this.runtime.set(player.sessionId, runtime);
      slot++;
    }
    this.state.countdown = 3.65;
    this.state.raceTime = 0;
    this.state.winnerId = "";
    this.state.phase = "countdown";
    this.startedAt = Date.now();
    void this.setPrivate(true);
    void this.setMetadata({ mode: "pump-kart", phase: "countdown", private: this.state.privateRoom });
    this.broadcast("event", { type: "countdown", track: this.state.track });
  }

  private returnToLobby() {
    for (const [sessionId, player] of this.state.players.entries()) {
      if (player.bot) { this.state.players.delete(sessionId); this.runtime.delete(sessionId); continue; }
      player.ready = false; player.finished = false; player.item = ""; player.lap = 0; player.speed = 0;
    }
    this.state.phase = "lobby"; this.state.winnerId = ""; this.state.raceTime = 0;
    if (!this.state.privateRoom) void this.setPrivate(false);
    void this.setMetadata({ mode: "pump-kart", phase: "lobby", private: this.state.privateRoom });
  }

  private update(dt: number) {
    dt = Math.min(0.05, Math.max(0.001, dt));
    if (this.state.phase === "countdown") {
      this.state.countdown = Math.max(0, this.state.countdown - dt);
      if (this.state.countdown <= 0) {
        this.state.phase = "race";
        for (const player of this.state.players.values()) player.speed = player.bot ? 14 : 16;
        this.broadcast("event", { type: "go" });
        void this.setMetadata({ mode: "pump-kart", phase: "race", private: this.state.privateRoom });
      }
      return;
    }
    if (this.state.phase !== "race") return;
    this.state.raceTime += dt;
    for (const player of this.state.players.values()) this.stepPlayer(player, dt);
    this.resolveContacts();
    const humans = [...this.state.players.values()].filter((player) => !player.bot);
    if (humans.length && humans.every((player) => player.finished || !player.connected)) {
      this.state.phase = "finished";
      this.broadcast("event", { type: "finished", winnerId: this.state.winnerId });
      void this.setMetadata({ mode: "pump-kart", phase: "finished", private: this.state.privateRoom });
    }
  }

  private stepPlayer(player: PumpKartPlayer, dt: number) {
    if (player.finished) { player.speed = Math.max(0, player.speed - 10 * dt); return; }
    const runtime = this.runtime.get(player.sessionId)!;
    runtime.padLock = Math.max(0, runtime.padLock - dt);
    runtime.itemLock = Math.max(0, runtime.itemLock - dt);
    player.boost = Math.max(0, player.boost - dt);
    player.shield = Math.max(0, player.shield - dt);
    player.spin = Math.max(0, player.spin - dt);

    let input = runtime.input;
    if (player.bot) {
      const target = runtime.aiLane + Math.sin(runtime.aiPhase + this.state.raceTime * 0.33) * 1.5;
      input = { gas: true, brake: false, left: player.lane > target + 0.2, right: player.lane < target - 0.2, drift: Math.sin(player.s * Math.PI * 12 + runtime.aiPhase) > 0.72 && player.speed > 30, seq: input.seq, at: Date.now() };
    } else if (Date.now() - input.at > 900) {
      input = blankInput();
    }

    const track = this.state.track;
    const maxBase = TRACK_MAX_SPEED[track];
    const offRoad = Math.abs(player.lane) > 17 * 0.54;
    const maxSpeed = maxBase * (player.boost > 0 ? 1.24 : 1) * (offRoad ? 0.7 : 1);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const acceleration = player.bot ? 28 + player.kart * 0.35 : 34;

    if (player.spin > 0) {
      player.speed *= Math.exp(-2.8 * dt);
      runtime.headingOffset += Math.sin(player.spin * 22) * 2.4 * dt;
    } else if (input.brake) {
      if (player.speed > 2) player.speed = Math.max(0, player.speed - 48 * dt);
      else player.speed = Math.max(-12, player.speed - 19 * dt);
    } else if (input.gas) {
      if (player.speed < 0) player.speed = Math.min(0, player.speed + 38 * dt);
      else player.speed = Math.min(maxSpeed, player.speed + acceleration * (1 - Math.max(0, player.speed / maxSpeed) * 0.22) * dt);
    } else {
      const drag = 5.5 + Math.abs(player.speed) * 0.055;
      player.speed += (0 - player.speed) * Math.min(1, drag * dt / Math.max(1, Math.abs(player.speed)));
    }

    const humanHandling = !player.bot;
    const steeringResponse = Math.abs(steer) > Math.abs(runtime.steerInput) ? (humanHandling ? 12.5 : 10.5) : 13;
    runtime.steerInput += (steer - runtime.steerInput) * Math.min(1, steeringResponse * dt);
    const speedRatio = Math.min(1, Math.abs(player.speed) / Math.max(1, maxBase));
    const direction = player.speed >= 0 ? 1 : -1;
    const drifting = input.drift && Math.abs(runtime.steerInput) > 0.12 && Math.abs(player.speed) > 17;
    if (drifting) {
      runtime.driftCharge = Math.min(1.7, runtime.driftCharge + dt * (0.52 + Math.abs(runtime.steerInput) * 0.62));
      const driftTurn = humanHandling ? 1.18 + speedRatio * 0.92 : 0.92 + speedRatio * 0.72;
      const driftAngle = humanHandling ? 0.46 : 0.34;
      runtime.headingOffset += runtime.steerInput * direction * driftTurn * dt;
      runtime.headingOffset += (runtime.steerInput * driftAngle - runtime.headingOffset) * Math.min(1, 0.92 * TRACK_GRIP[track] * dt);
    } else {
      if (player.drifting && runtime.driftCharge > 0.24) {
        player.boost = Math.max(player.boost, 0.34 + Math.min(0.68, runtime.driftCharge * 0.38));
        player.speed = Math.min(maxBase * 1.2, player.speed + 5 + runtime.driftCharge * 4.5);
        this.broadcast("event", { type: "driftBoost", sessionId: player.sessionId });
      }
      runtime.driftCharge = 0;
      const gripTurn = humanHandling ? 0.98 + speedRatio * 0.82 : 0.72 + speedRatio * 0.58;
      runtime.headingOffset += runtime.steerInput * direction * gripTurn * dt;
      const alignRate = (Math.abs(runtime.steerInput) > 0.08 ? (humanHandling ? 2.75 : 3.6) : 6.4) * TRACK_GRIP[track];
      runtime.headingOffset += (0 - runtime.headingOffset) * Math.min(1, alignRate * dt);
    }
    player.drifting = drifting;

    const maxHeading = drifting ? (humanHandling ? 0.62 : 0.5) : (humanHandling ? 0.36 : 0.25);
    runtime.headingOffset = Math.max(-maxHeading, Math.min(maxHeading, runtime.headingOffset));
    const lateralGrip = humanHandling ? (drifting ? 0.94 : 0.86) : 0.68;
    const lateralSpeed = player.speed * Math.sin(runtime.headingOffset) * lateralGrip;
    player.lane += lateralSpeed * dt;
    const softEdge = 17 * 0.55;
    const hardEdge = 17 * 0.64;
    if (Math.abs(player.lane) > softEdge) {
      const over = Math.min(1, (Math.abs(player.lane) - softEdge) / (hardEdge - softEdge));
      runtime.headingOffset += -Math.sign(player.lane) * (1.7 + over * 3.8) * dt;
      player.speed += (0 - player.speed) * Math.min(1, (0.45 + over * 1.2) * dt);
    }
    if (Math.abs(player.lane) > hardEdge) {
      player.lane = Math.sign(player.lane) * hardEdge;
      runtime.headingOffset = -Math.sign(player.lane) * Math.min(0.18, Math.abs(runtime.headingOffset) * 0.45);
      player.speed *= 0.82;
    }

    const forwardSpeed = player.speed * Math.max(0.5, Math.cos(runtime.headingOffset));
    player.heading = runtime.headingOffset;
    player.s = (player.s + forwardSpeed / TRACK_LENGTHS[track] * dt + 1) % 1;

    if (runtime.lastS > 0.82 && player.s < 0.18 && player.speed > 0) {
      player.lap++;
      if (player.lap >= 3) {
        player.finished = true;
        player.finishTime = this.state.raceTime;
        if (!this.state.winnerId) this.state.winnerId = player.sessionId;
        this.broadcast("event", { type: "finish", sessionId: player.sessionId, time: player.finishTime });
      } else if (player.lap > 1) {
        this.broadcast("event", { type: "lap", sessionId: player.sessionId, lap: player.lap });
      }
    }
    runtime.lastS = player.s;

    if (!player.item && runtime.itemLock <= 0 && ITEM_POINTS.some((point) => Math.abs(modularDelta(player.s, point)) < 0.0035)) {
      const rank = this.rankOf(player);
      const pool = rank >= 5 ? ["rocket", "rocket", "candle", "diamond", "airdrop"] : ITEMS;
      player.item = pool[Math.floor(Math.random() * pool.length)];
      runtime.itemLock = 1.2;
      this.broadcast("event", { type: "item", sessionId: player.sessionId, item: player.item });
    }
    if (runtime.padLock <= 0 && BOOST_POINTS.some((point) => Math.abs(modularDelta(player.s, point)) < 0.0038)) {
      player.boost = Math.max(player.boost, 1.05);
      player.speed = Math.min(maxBase * 1.3, player.speed + 10);
      runtime.padLock = 0.8;
      this.broadcast("event", { type: "pad", sessionId: player.sessionId });
    }
    if (player.bot && player.item && Math.random() < dt * 0.13) this.applyItem(player);
  }

  private resolveContacts() {
    const players = [...this.state.players.values()];
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (Math.abs(modularDelta(a.s, b.s)) * TRACK_LENGTHS[this.state.track] < 2.8 && Math.abs(a.lane - b.lane) < 1.8) {
        const direction = a.lane <= b.lane ? -1 : 1;
        a.lane += direction * 0.028;
        b.lane -= direction * 0.028;
      }
    }
  }

  private applyItem(player: PumpKartPlayer) {
    const item = player.item;
    if (!item) return;
    player.item = "";
    if (item === "candle") { player.boost = Math.max(player.boost, 1.65); player.speed += 12; }
    else if (item === "rocket") { player.boost = Math.max(player.boost, 2.1); player.speed += 16; }
    else if (item === "diamond") player.shield = 6;
    else if (item === "airdrop") { player.boost = Math.max(player.boost, 0.9); player.speed += 7; }
    else {
      const ranked = [...this.state.players.values()].filter((other) => other !== player && !other.finished).sort((a, b) => (b.lap + b.s) - (a.lap + a.s));
      const playerRank = ranked.findIndex((other) => (other.lap + other.s) < (player.lap + player.s));
      const target = item === "mev" ? ranked[Math.max(0, playerRank - 1)] : ranked[Math.min(ranked.length - 1, Math.max(0, playerRank + 1))];
      if (target) {
        if (target.shield > 0) target.shield = 0;
        else { target.spin = 1.15; target.speed *= 0.6; }
      }
    }
    this.broadcast("event", { type: "useItem", sessionId: player.sessionId, item });
  }

  private rankOf(player: PumpKartPlayer): number {
    return [...this.state.players.values()].sort((a, b) => (b.lap + b.s) - (a.lap + a.s)).findIndex((candidate) => candidate.sessionId === player.sessionId) + 1;
  }
}
