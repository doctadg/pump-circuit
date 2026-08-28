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
    await client.waitForInitialState();
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
    await guest.waitForInitialState();

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
    player.lane = 0;
    player.speed = 45;
    const inputMessage = room.waitForMessage("input");
    client.send("input", { gas: true, right: true, left: false, brake: false, drift: false, seq: 1 });
    await inputMessage;
    await new Promise((resolve) => setTimeout(resolve, 650));

    assert.ok(player.lane > 4.5, `full right should move decisively across the track, got ${player.lane}`);
    assert.ok(player.heading > 0.25, `full right should produce a visible turn angle, got ${player.heading}`);
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
    await guest.waitForInitialState();

    await host.leave(true);
    await settle(guest, 60);

    assert.equal(room.state.hostId, guest.sessionId);
    assert.equal(room.state.players.has(host.sessionId), false);
  });
});
