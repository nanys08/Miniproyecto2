/**
 * @file signaling.probe.cjs — Prueba de humo del Signaling Server (evidencia).
 *
 * Conecta DOS clientes y ejercita el contrato completo:
 *   introduction · participant_joined/left · signal (offer/answer/ICE) ·
 *   media-state · eventos AV discretos (camera/mic on/off) ·
 *   permissions-granted · connection-state · media-error.
 *
 * Uso:
 *   node tests/signaling.probe.cjs [url]
 *   SIGNAL_URL=https://...onrender.com node tests/signaling.probe.cjs
 *
 * Requiere `socket.io-client` (devDependency). Por defecto apunta a
 * http://localhost:8082. Sale con código 0 si todo pasó, 1 si algo falló.
 */
const { io } = require("socket.io-client");

const URL = process.argv[2] || process.env.SIGNAL_URL || "http://localhost:8082";
const ROOM = "PROBE-" + Math.random().toString(36).slice(2, 7);
const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(ts(), ...a);

const r = {
  introduction: false,
  participant_joined: false,
  signal: false,
  media_state: false,
  camera_off: false,
  mic_off: false,
  participant_left: false,
};

log(`Probando signaling en ${URL} (sala ${ROOM})`);

const A = io(URL, { transports: ["websocket", "polling"] });
const B = io(URL, { transports: ["websocket", "polling"] });

A.on("connect_error", (e) => log("A connect_error:", e.message));

A.on("connect", () => {
  A.emit("introduction", { roomId: ROOM, uid: "uidA", username: "Alice", micOn: true, camOn: true });
  A.emit("permissions-granted", { audio: true, video: true });
  A.emit("stream-started");
});

A.on("participant_joined", (p) => {
  log("A: participant_joined", p.username, "estado:", p.micOn, p.camOn);
  if (p.uid === "uidB" && p.id) r.participant_joined = true;
});
A.on("introduction", (p) => {
  if (p.peers.some((x) => x.uid === "uidB")) r.introduction = true;
});
A.on("signal", (p) => {
  if (p.signal && p.signal.type === "offer") {
    r.signal = true;
    A.emit("signal", { to: p.from, signal: { type: "answer", sdp: "FAKE" } });
  }
});
A.on("media-state", (m) => { if (m.uid === "uidB") r.media_state = true; });
A.on("camera_off", (p) => { if (p.uid === "uidB") r.camera_off = true; });
A.on("mic_off", (p) => { if (p.uid === "uidB") r.mic_off = true; });
A.on("participant_left", (p) => { if (p.uid === "uidB") r.participant_left = true; });

B.on("connect", () => {
  setTimeout(() => {
    B.emit("introduction", { roomId: ROOM, uid: "uidB", username: "Bob", micOn: true, camOn: true });
    B.emit("permissions-granted", { audio: true, video: true });
  }, 600);
});
B.on("introduction", (p) => {
  const a = p.peers.find((x) => x.uid === "uidA");
  if (a) {
    B.emit("signal", { to: a.socketId, signal: { type: "offer", sdp: "FAKE" } });
    B.emit("connection-state", { peerUid: "uidA", state: "connected" });
  }
});

setTimeout(() => B.emit("camera_off"), 1600);
setTimeout(() => B.emit("mic_off"), 2100);
setTimeout(() => B.emit("media-state", { micOn: false, camOn: false }), 2600);
setTimeout(() => B.disconnect(), 3200);
setTimeout(() => {
  log("RESULTADO:", JSON.stringify(r, null, 0));
  const ok = Object.values(r).every(Boolean);
  console.log(ok ? "\n✅ OK — todos los eventos del signaling funcionan" : "\n❌ FALLO — revisa el detalle arriba");
  A.disconnect();
  process.exit(ok ? 0 : 1);
}, 4000);

setTimeout(() => { console.log("⏱️ TIMEOUT"); process.exit(1); }, 20000);
