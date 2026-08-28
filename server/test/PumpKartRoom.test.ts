import assert from "node:assert/strict";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";

import appConfig from "../src/app.config.js";
import type { PumpKartState } from "../src/rooms/schema/PumpKartState.js";

describe("PumpKartRoom authoritative multiplayer", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => { colyseus = await boot(appConfig); });
  after(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); });

  async function connect(options: Record<string, unknown> = {}) {
    const room = await colyseus.createRoom("pump_kart", { private: false });
    const client = await colyseus.connectTo(room, options);
    return { room, client };
  }

  async function settle(client: ClientRoom<any>, delay = 30) {
    await client.waitForNextPatch(delay);
  }

  it("sanitizes identities and assigns the first client as host", async () => {
    const { room, client } = await connect({ name: "  <b>DoctaDG</b> really long  ", kart: 99 });
    const player = room.state.players.get(client.sessionId)!;

    assert.equal(room.state.hostId, client.sessionId);
    assert.equal(player.name, "bDoctaDGb re");
    assert.equal(player.kart, 7);
    assert.equal(player.connected, true);
    assert.equal(player.bot, false);
    assert.equal(room.state.phase, "lobby");
  });

  it("rejects non-host start and starts an eight-kart authoritative race for the host", async () => {
    const { room, client: host } = await connect({ name: "HOST", kart: 0 });
    const guest = await colyseus.connectTo(room, { name: "GUEST", kart: 1 });

    const guestStart = room.waitForMessage("start");
    guest.send("start", {});
    await guestStart;
    assert.equal(room.state.phase, "lobby");

    const trackMessage = room.waitForMessage("track");
    host.send("track", { track: 2 });
    await trackMessage;
    const hostStart = room.waitForMessage("start");
    host.send("start", {});
    await hostStart;
    await settle(host, 60);

    assert.equal(room.state.track, 2);
    assert.equal(room.state.phase, "countdown");
    assert.equal(room.state.players.size, 8);
    assert.equal([...room.state.players.values()].filter((p: any) => p.bot).length, 6);
  });

  it("moves players only from bounded validated input and ignores unknown fields", async () => {
    const { room, client } = await connect({ name: "DRIVER", kart: 0 });
    client.send("start", {});
    await settle(client, 50);

    room.state.phase = "race";
    const player = room.state.players.get(client.sessionId)!;
    const startS = player.s;
    const startLane = player.lane;

    client.send("input", { gas: true, right: true, left: false, brake: false, drift: false, seq: 1 });
    await room.waitForNextTimestep();
    await room.waitForNextTimestep();
    assert.ok(player.speed > 0, "gas should accelerate on the server");
    assert.ok(player.s !== startS, "server simulation should advance progress");
    assert.ok(player.lane > startLane, "server simulation should steer right");

    const speedBeforeBadInput = player.speed;
    client.send("input", { gas: true, right: true, admin: true, seq: 2 });
    await room.waitForNextTimestep();
    assert.ok(player.speed <= speedBeforeBadInput + 2, "unknown fields must not inject unbounded state");
    assert.ok(Math.abs(player.lane) <= 10.88, "lane is server bounded");
  });

  it("does not rotate a throttle-only player with the track spline", async () => {
    const { room, client } = await connect({ name: "MANUAL", kart: 0 });
    client.send("start", {});
    await settle(client, 50);
    room.state.phase = "race";
    const player = room.state.players.get(client.sessionId)!;
    const internals = room as any;
    const runtime = internals.runtime.get(client.sessionId);
    runtime.input = { gas: true, brake: false, left: false, right: false, drift: false, seq: 1, at: Date.now() + 10_000 };
    const startLane = player.lane;
    for (let i = 0; i < 240; i++) internals.stepPlayer(player, 1 / 60);
    assert.ok(Math.abs(player.lane - startLane) > 1 || Math.abs(player.heading) > 0.25, "the road should turn away when the user refuses to steer");
    assert.equal(player.finished, false, "holding throttle alone must not finish the race");
    assert.ok(Math.abs(player.lane) <= 10.88, "a missed corner should remain safely bounded");
  });

  it("collects an item box across the full visible kart-box overlap", async () => {
    const { room, client } = await connect({ name: "BOXTEST", kart: 0 });
    client.send("start", {});
    await settle(client, 50);
    room.state.phase = "race";

    const player = room.state.players.get(client.sessionId)!;
    player.s = 0.0948; // ~4m past the 0.09 box center: the kart and box still visibly overlap.
    player.lane = 0;
    player.speed = 0;
    player.item = "";
    await room.waitForNextTimestep();

    assert.notEqual(player.item, "", "visible contact with an item box should award an item");
  });

  it("gives human racers decisive steering authority", async () => {
    const { room, client } = await connect({ name: "TURNER", kart: 0 });
    client.send("start", {});
    await settle(client, 50);
    room.state.phase = "race";
    const player = room.state.players.get(client.sessionId)!;
    const internals = room as any;
    const runTurn = (left: boolean, right: boolean) => {
      player.s = 0.985; player.lane = 0; player.speed = 45; player.lap = 0; player.finished = false; player.spin = 0; player.boost = 0; player.drifting = false;
      const runtime = internals.createRuntime(player, 0);
      runtime.input = { gas: true, right, left, brake: false, drift: false, seq: 1, at: Date.now() + 10_000 };
      internals.runtime.set(player.sessionId, runtime);
      for (let i = 0; i < 48; i++) internals.stepPlayer(player, 1 / 60);
      return { lane: player.lane, heading: player.heading };
    };
    const rightTurn = runTurn(false, true), leftTurn = runTurn(true, false);
    assert.ok(rightTurn.lane > leftTurn.lane + 1.5, `right steering must move right of left steering: ${rightTurn.lane} vs ${leftTurn.lane}`);
    assert.ok(rightTurn.heading > leftTurn.heading + 0.2, `right steering must rotate clockwise relative to left: ${rightTurn.heading} vs ${leftTurn.heading}`);
  });

  it("resolves rear-end and side contacts with directional impulses", async () => {
    const { room, client } = await connect({ name: "BUMPER", kart: 0 });
    client.send("start", {});
    await settle(client, 50);
    room.state.phase = "race";
    const players = [...room.state.players.values()];
    const rear = players[0], front = players[1];
    for (let i = 2; i < players.length; i++) { players[i].s = 0.55 + i * 0.03; players[i].lane = 7; }
    const internals = room as any;
    const rearRuntime = internals.runtime.get(rear.sessionId);
    const frontRuntime = internals.runtime.get(front.sessionId);

    rear.s = 0.3; rear.lane = 0; rear.speed = 35;
    front.s = 0.303; front.lane = 0; front.speed = 10;
    Object.assign(rearRuntime, { laneVel: 0, bumpLane: 0, headingOffset: 0 });
    Object.assign(frontRuntime, { laneVel: 0, bumpLane: 0, headingOffset: 0 });
    internals.resolveContacts();
    assert.ok(rear.speed < 35, "rear kart should give up forward momentum");
    assert.ok(front.speed > 10, "front kart should receive forward momentum");
    assert.ok(Math.abs(rear.lane) < 0.05 && Math.abs(front.lane) < 0.05, "rear-end contact must not eject karts sideways");
    let progressGap = Math.abs(rear.s - front.s); if (progressGap > 0.5) progressGap = 1 - progressGap;
    assert.ok(progressGap * 822 >= 3.5, "rear-end overlap should resolve in one authoritative step");

    rear.s = front.s = 0.4; rear.lane = 0; front.lane = 2.3; rear.speed = front.speed = 24;
    Object.assign(rearRuntime, { laneVel: 7, bumpLane: 0, headingOffset: 0 });
    Object.assign(frontRuntime, { laneVel: 0, bumpLane: 0, headingOffset: 0 });
    internals.resolveContacts();
    assert.ok(rearRuntime.bumpLane < 0 && frontRuntime.bumpLane > 0, "side-swipe should push each kart away from contact");
    assert.ok(front.lane - rear.lane >= 2.7, "side overlap should be fully separated");
    assert.ok(Math.abs(rear.speed - front.speed) < 3, "side-swipe should not invent a rear-end speed transfer");
  });

  it("keeps item assignment and use authoritative", async () => {
    const { room, client } = await connect({ name: "ITEMS", kart: 0 });
    client.send("start", {});
    await settle(client, 50);
    room.state.phase = "race";

    const player = room.state.players.get(client.sessionId)!;
    player.item = "rocket";
    const speedBefore = player.speed;
    client.send("useItem", {});
    await settle(client);

    assert.equal(player.item, "");
    assert.ok(player.boost > 1);
    assert.ok(player.speed > speedBefore);
  });

  it("migrates host ownership when the lobby host leaves", async () => {
    const { room, client: host } = await connect({ name: "HOST", kart: 0 });
    const guest = await colyseus.connectTo(room, { name: "GUEST", kart: 1 });

    await host.leave(true);
    await settle(guest, 60);

    assert.equal(room.state.hostId, guest.sessionId);
    assert.equal(room.state.players.has(host.sessionId), false);
  });
});
