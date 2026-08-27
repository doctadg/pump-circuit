import { Client, type Room } from "@colyseus/sdk";
import { cli, type Options } from "@colyseus/loadtest";

export async function main(options: Options) {
  const client = new Client(options.endpoint);
  const name = `LOAD_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const room: Room = await client.joinOrCreate(options.roomName, { name, kart: Math.floor(Math.random() * 8), private: false });
  let seq = 0;
  room.onMessage("event", () => {});
  room.onMessage("lobby", () => {});
  room.send("ready", { ready: true });

  const inputTimer = setInterval(() => {
    if ((room.state as any).phase !== "race") return;
    const right = Math.floor(Date.now() / 1100) % 2 === 0;
    room.send("input", { gas: true, brake: false, left: !right, right, drift: right, seq: ++seq });
  }, 50);

  room.onLeave(() => clearInterval(inputTimer));
}

cli(main);
