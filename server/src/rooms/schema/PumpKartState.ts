import { schema, t, type SchemaType } from "@colyseus/schema";

export const PumpKartPlayer = schema({
  sessionId: t.string(),
  name: t.string(),
  kart: t.uint8().default(0),
  bot: t.boolean().default(false),
  connected: t.boolean().default(true),
  ready: t.boolean().default(false),
  trackVote: t.uint8().default(0),
  s: t.float64().default(0),
  lane: t.float32().default(0),
  heading: t.float32().default(0),
  speed: t.float32().default(0),
  lap: t.int8().default(0),
  drifting: t.boolean().default(false),
  boost: t.float32().default(0),
  shield: t.float32().default(0),
  spin: t.float32().default(0),
  item: t.string().default(""),
  finished: t.boolean().default(false),
  finishTime: t.float32().default(0),
}, "PumpKartPlayer");
export type PumpKartPlayer = SchemaType<typeof PumpKartPlayer>;

export const PumpKartState = schema({
  phase: t.string().default("lobby"),
  track: t.uint8().default(0),
  hostId: t.string().default(""),
  roomCode: t.string().default(""),
  privateRoom: t.boolean().default(false),
  countdown: t.float32().default(0),
  raceTime: t.float32().default(0),
  winnerId: t.string().default(""),
  players: t.map(PumpKartPlayer),
}, "PumpKartState");
export type PumpKartState = SchemaType<typeof PumpKartState>;
