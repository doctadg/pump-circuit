import {
  defineServer,
  defineRoom,
  createRouter,
  createEndpoint,
} from "colyseus";
import { PumpKartRoom } from "./rooms/PumpKartRoom.js";

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://pump-kart.vercel.app,http://localhost:5178,http://127.0.0.1:5178")
    .split(",").map((origin) => origin.trim()).filter(Boolean)
);

const server = defineServer({
  rooms: {
    pump_kart: defineRoom(PumpKartRoom),
  },
  routes: createRouter({
    health: createEndpoint("/healthz", { method: "GET" }, async () => ({
      ok: true,
      service: "pump-kart-colyseus",
      version: "1.0.0",
    })),
    ready: createEndpoint("/readyz", { method: "GET" }, async () => ({ ok: true })),
  }),
  express: (app) => {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (req.method === "OPTIONS") { res.sendStatus(204); return; }
      next();
    });
  },
});

export default server;
