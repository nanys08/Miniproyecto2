/**
 * Prueba e2e de la integración de persistencia (Tarea 6) SIN Firebase.
 *
 * Levanta:
 *   - Un mock del room-service que responde a
 *     `POST /internal/rooms/:id/messages` devolviendo el mensaje "persistido".
 *   - El servidor WebSocket real del chat-service apuntando a ese mock.
 *
 * Verifica que `send_message`:
 *   1. Llama al room-service para persistir (mensaje → guardar → broadcast).
 *   2. Difunde el mensaje CANÓNICO devuelto (con `messageId`/`id` reales),
 *      de modo que historial y mensaje en vivo coinciden (Tarea 7).
 *   3. El ack reporta `persisted: true`.
 */

import { createServer, Server as HttpServer, IncomingMessage } from "http";
import { AddressInfo } from "net";
import { Server } from "socket.io";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { initChatSocket } from "../src/sockets/chatSocket";
import * as presence from "../src/services/presenceService";
import { env } from "../src/config/env";

const WS_PATH = "/ws/chat";

let chatHttp: HttpServer;
let chatIo: Server;
let chatPort: number;
let mockRoom: HttpServer;
let mockPort: number;
const received: Array<{ roomId: string; body: any }> = [];
const clients: ClientSocket[] = [];
const originalRoomUrl = env.roomServiceUrl;

const readBody = (req: IncomingMessage): Promise<any> =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });

const connect = (roomId: string, username: string): Promise<ClientSocket> =>
  new Promise((resolve, reject) => {
    const socket = Client(`http://localhost:${chatPort}`, {
      path: WS_PATH,
      auth: { roomId, username },
      transports: ["websocket"],
      reconnection: false,
    });
    clients.push(socket);
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });

beforeAll((done) => {
  presence.__resetForTests();

  // Mock del room-service (Repositorio 1).
  mockRoom = createServer(async (req, res) => {
    const m = req.url?.match(/^\/internal\/rooms\/([^/]+)\/messages$/);
    if (req.method === "POST" && m) {
      const body = await readBody(req);
      received.push({ roomId: m[1], body });
      const message = {
        id: "msg-persisted-001",
        roomId: m[1],
        senderUid: body.uid ?? body.username,
        senderUsername: body.username,
        content: body.content,
        type: "text",
        createdAt: "2026-06-01T15:00:00.000Z",
      };
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  mockRoom.listen(() => {
    mockPort = (mockRoom.address() as AddressInfo).port;
    // Apuntar el chat-service al mock (persistencia activada).
    env.roomServiceUrl = `http://localhost:${mockPort}`;

    chatHttp = createServer();
    chatIo = new Server(chatHttp, { path: WS_PATH, cors: { origin: "*" } });
    initChatSocket(chatIo);
    chatHttp.listen(() => {
      chatPort = (chatHttp.address() as AddressInfo).port;
      done();
    });
  });
});

afterEach(() => {
  clients.forEach((c) => c.connected && c.disconnect());
  clients.length = 0;
});

afterAll((done) => {
  env.roomServiceUrl = originalRoomUrl;
  chatIo.close();
  chatHttp.close(() => mockRoom.close(() => done()));
});

describe("Persistencia (Tarea 6) — chat-service → room-service", () => {
  it("persiste el mensaje y difunde el documento canónico", async () => {
    const juan = await connect("123", "Juan");
    const ana = await connect("123", "Ana");

    const received$ = new Promise<any>((resolve) =>
      ana.on("receive_message", resolve)
    );
    const ack = await juan.emitWithAck("send_message", { content: "Hola" });

    // 1. El room-service recibió la petición de persistir.
    expect(received[received.length - 1]).toMatchObject({
      roomId: "123",
      body: { username: "Juan", content: "Hola" },
    });

    // 2. El broadcast usa el id/timestamp canónicos devueltos por el mock.
    const msg = await received$;
    expect(msg).toMatchObject({
      messageId: "msg-persisted-001",
      id: "msg-persisted-001",
      roomId: "123",
      username: "Juan",
      content: "Hola",
      timestamp: "2026-06-01T15:00:00.000Z",
    });

    // 3. El ack confirma persistencia.
    expect(ack).toMatchObject({ ok: true, persisted: true });
  });
});
