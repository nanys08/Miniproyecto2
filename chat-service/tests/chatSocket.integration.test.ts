/**
 * Prueba funcional end-to-end del WebSocket (evidencia de las Tareas 1-9).
 *
 * Levanta un servidor Socket.IO real en el path /ws/chat, conecta clientes con
 * socket.io-client y verifica el modelo de mensaje, el broadcast por sala, la
 * validación de mensajes, la unicidad de username y la reconexión.
 *
 * Los tests corren SIN `INTERNAL_SECRET`, por lo que la autenticación por
 * ticket (Tarea 10) está desactivada y el handshake usa `{ roomId, username }`.
 * La verificación del ticket se prueba aparte en `ticketService.test.ts`.
 */

import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { Server } from "socket.io";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { initChatSocket } from "../src/sockets/chatSocket";
import * as presence from "../src/services/presenceService";

const WS_PATH = "/ws/chat";

let httpServer: HttpServer;
let ioServer: Server;
let port: number;
const clients: ClientSocket[] = [];

const connect = (
  roomId: string,
  username: string,
  uid?: string
): Promise<ClientSocket> =>
  new Promise((resolve, reject) => {
    const socket = Client(`http://localhost:${port}`, {
      path: WS_PATH,
      auth: { roomId, username, uid },
      transports: ["websocket"],
      reconnection: false,
    });
    clients.push(socket);
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });

beforeAll((done) => {
  presence.__resetForTests();
  httpServer = createServer();
  // Tarea 2: mismo path que produce server.ts.
  ioServer = new Server(httpServer, { path: WS_PATH, cors: { origin: "*" } });
  initChatSocket(ioServer);
  httpServer.listen(() => {
    port = (httpServer.address() as AddressInfo).port;
    done();
  });
});

afterEach(() => {
  clients.forEach((c) => c.connected && c.disconnect());
  clients.length = 0;
});

afterAll((done) => {
  ioServer.close();
  httpServer.close(() => done());
});

describe("chatSocket (integración)", () => {
  it("Tarea 7/9: un usuario que entra queda registrado como participante", async () => {
    await connect("sala-A", "Juan");
    await new Promise((r) => setTimeout(r, 50));
    expect(presence.getParticipants("sala-A")).toContain("Juan");
  });

  it("Tarea 8: rechaza un username ya conectado en la misma sala", async () => {
    await connect("sala-B", "Ana");
    await expect(connect("sala-B", "Ana")).rejects.toThrow(
      "USERNAME_ALREADY_CONNECTED"
    );
  });

  it("Tarea 8: el mismo username SÍ puede entrar a otra sala", async () => {
    await connect("sala-C", "Carlos");
    const otra = await connect("sala-D", "Carlos");
    expect(otra.connected).toBe(true);
  });

  it("Tarea 7: el mismo uid puede reconectarse (reemplaza la sesión)", async () => {
    await connect("sala-R", "Pedro", "uid-1");
    const recon = await connect("sala-R", "Pedro", "uid-1");
    expect(recon.connected).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(presence.getParticipants("sala-R")).toEqual(["Pedro"]);
  });

  it("Tarea 1/3/4: difunde receive_message con la estructura correcta", async () => {
    const juan = await connect("sala-M", "Juan");
    const ana = await connect("sala-M", "Ana");
    const received = new Promise<any>((resolve) =>
      ana.on("receive_message", resolve)
    );
    juan.emit("send_message", { content: "Hola" });
    const msg = await received;
    expect(msg).toMatchObject({
      roomId: "sala-M",
      username: "Juan",
      content: "Hola",
    });
    expect(typeof msg.timestamp).toBe("string");
  });

  it("Tarea 8: un mensaje de una sala NO llega a otra sala", async () => {
    const enA = await connect("sala-X", "Juan");
    const enB = await connect("sala-Y", "Ana");
    let leaked = false;
    enB.on("receive_message", () => {
      leaked = true;
    });
    enA.emit("send_message", { content: "solo para X" });
    await new Promise((r) => setTimeout(r, 80));
    expect(leaked).toBe(false);
  });

  it("Tarea 5: rechaza mensaje vacío con EMPTY_MESSAGE", async () => {
    const juan = await connect("sala-E1", "Juan");
    const ack = await juan.emitWithAck("send_message", { content: "   " });
    expect(ack).toMatchObject({ ok: false, error: "EMPTY_MESSAGE" });
  });

  it("Tarea 6: rechaza mensaje > 500 chars con MESSAGE_TOO_LONG", async () => {
    const juan = await connect("sala-E2", "Juan");
    const ack = await juan.emitWithAck("send_message", {
      content: "a".repeat(501),
    });
    expect(ack).toMatchObject({ ok: false, error: "MESSAGE_TOO_LONG" });
  });

  it("acepta un mensaje de exactamente 500 chars", async () => {
    const juan = await connect("sala-E3", "Juan");
    const ack = await juan.emitWithAck("send_message", {
      content: "a".repeat(500),
    });
    expect(ack).toMatchObject({ ok: true });
  });

  it("difunde user_joined al resto de la sala", async () => {
    const juan = await connect("sala-J", "Juan");
    const joined = new Promise<{ username: string }>((resolve) =>
      juan.on("user_joined", resolve)
    );
    await connect("sala-J", "Ana");
    const evt = await joined;
    expect(evt.username).toBe("Ana");
  });
});
