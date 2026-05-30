import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

// Configuración OpenAPI 3.0.3 — la fuente de verdad de la documentación API.
//
// Cómo se compone:
//   - Esquemas globales (User, RegisterRequest, Error, etc.) viven aquí.
//   - Las rutas se documentan inline con bloques `@openapi` en `src/routes/*.ts`
//     y `src/controllers/*.ts`, y swagger-jsdoc los une al spec final.
//
// Cualquier cambio funcional en endpoints, payloads o códigos de error DEBE
// reflejarse aquí o en el comentario @openapi del handler correspondiente.
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Salón de Estudio Colaborativo — Backend API",
      version: "1.2.0",
      description: `
API REST + Socket.IO del backend de **EstudioColab** (Mini-proyecto 2).

## Dominios cubiertos

* **Auth** — Registro y perfil del usuario autenticado (Firebase ID Token).
* **Users** — Lectura del perfil **público** de cualquier usuario (whitelist).
* **Rooms** — Crear, listar, unirse y eliminar salas; historial de mensajes.
* **Tiempo real** — Chat y presencia vía Socket.IO (ver sección "Socket.IO").

## Autenticación

Salvo las rutas marcadas como **público**, todas exigen el header:

\`Authorization: Bearer <Firebase ID Token>\`

El cliente obtiene el token con \`signInWithEmailAndPassword\` o
\`signInWithPopup\` del SDK de Firebase. El backend lo valida con
\`admin.auth().verifyIdToken(...)\`.

## Errores

Todos los errores responden con el esquema [\`Error\`](#/components/schemas/Error)
(\`{ error: <CODE>, message: <texto> }\`). Los códigos son estables; el
\`message\` está en español listo para mostrar al usuario. **No se filtran
detalles internos** (mensajes originales de Firebase, paths, stack).

Errores de Firestore (\`permission-denied\`, \`not-found\`, \`unavailable\`)
se normalizan vía \`mapFirestoreError()\` antes de responder.

## Socket.IO — eventos

Conexión: \`io(SOCKET_URL, { auth: { token } })\` (mismo token Firebase).

| Evento | Dirección | Payload | Comportamiento |
|---|---|---|---|
| \`join_room\` | client → server (ack) | \`{ roomId, limit? }\` | Ack \`{ ok, data: { room, messages, members } }\`. Añade al usuario a \`participants\`. |
| \`leave_room\` | client → server (ack) | \`{ roomId }\` | Ack \`{ ok }\`. No quita la membresía persistida — solo libera la presencia. |
| \`send_message\` | client → server (ack) | \`{ roomId, content }\` | Sanitiza, persiste y broadcast. Ack \`{ ok, data: Message }\`. |
| \`receive_message\` | server → room | \`Message\` | Mensaje nuevo en la sala. |
| \`user_joined\` | server → room | \`{ uid, username, avatar?, micOn, camOn, roomId }\` | Otro usuario entró. |
| \`user_left\` | server → room | \`{ uid, username, roomId }\` | Otro usuario salió. |
| \`media_state\` | bidir | \`{ roomId, micOn, camOn }\` | Estado del mic/cam de un participante. |

Ack contract: \`{ ok: true, data? } | { ok: false, error: <CODE>, message? }\`.

## Reglas Firestore

El backend bypasea las reglas (Admin SDK), pero estas viven en
\`firestore.rules\` como red de seguridad para clientes que intenten
hablar directamente con Firestore.
`,
    },
    servers: [
      {
        url: `http://localhost:${env.port}`,
        description: "Desarrollo local",
      },
      {
        url: "https://miniproyecto2-backend.onrender.com",
        description: "Producción (Render)",
      },
    ],
    tags: [
      {
        name: "Auth",
        description:
          "Registro, perfil y validación de username/email. " +
          "Requiere Firebase ID Token salvo cuando se indica `(público)`. " +
          "Nota: el login NO es un endpoint REST — vive en el cliente con " +
          "`signInWithEmailAndPassword` / `signInWithPopup` del SDK de Firebase. " +
          "El backend solo verifica los ID Tokens emitidos por el cliente.",
      },
      {
        name: "Users",
        description:
          "Lectura del **perfil público** de cualquier usuario por uid. " +
          "Útil para resolver el avatar/username de los demás participantes " +
          "de una sala. Solo expone campos seguros (uid, username, avatar, " +
          "displayName) — nunca email ni teléfono.",
      },
      {
        name: "Rooms",
        description:
          "Gestión de salas de estudio. Todas las rutas requieren Firebase ID Token. " +
          "Los IDs de sala son generados automáticamente por Firestore (20 chars). " +
          "Solo el dueño (`ownerId`) puede eliminar su propia sala. " +
          "El listado `GET /api/rooms` incluye salas propias **y** salas a las " +
          "que el usuario se unió (`participants` contiene su uid).",
      },
      {
        name: "Health",
        description: "Endpoints de estado del servicio.",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Firebase ID Token emitido por el cliente tras " +
            "`signInWithEmailAndPassword` o `signInWithPopup`. " +
            "Se valida con `auth.verifyIdToken(token, true)` " +
            "(`checkRevoked: true` para reflejar logouts forzados).",
        },
      },
      schemas: {
        AuthProvider: {
          type: "string",
          enum: ["password", "google"],
          description: "Mecanismo con que el usuario inició sesión.",
        },
        User: {
          type: "object",
          required: [
            "uid",
            "username",
            "fullName",
            "email",
            "avatar",
            "provider",
            "online",
          ],
          description:
            "Documento `users/{uid}` en Firestore. Ver `docs/firestore-model.md`. " +
            "Las respuestas REST pueden incluir el campo derivado `isUnivalle` " +
            "(no persistido).",
          properties: {
            uid: {
              type: "string",
              example: "abc123",
              description: "Firebase Auth UID. Coincide con el ID del documento.",
            },
            username: {
              type: "string",
              example: "juanp",
              description: "Único en la colección. 4-10 chars, regex `^[a-zA-Z0-9_.]{4,10}$`.",
            },
            fullName: { type: "string", example: "Juan Pérez" },
            email: {
              type: "string",
              format: "email",
              example: "juan@correounivalle.edu.co",
              description: "Tomado del Firebase ID Token, no del body.",
            },
            avatar: { type: "string", example: "/avatars/avatar1.png" },
            provider: { $ref: "#/components/schemas/AuthProvider" },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Firestore Timestamp serializado a ISO 8601.",
            },
            online: { type: "boolean", example: false },
            isUnivalle: {
              type: "boolean",
              example: true,
              description:
                "**Derivado, no persistido.** `true` si el correo " +
                "pertenece a `@correounivalle.edu.co`. Se calcula al vuelo " +
                "desde el email del ID Token en las respuestas de `/me` y " +
                "`/register`.",
            },
            university: {
              type: "string",
              enum: ["Univalle", "No identificado"],
              example: "Univalle",
              description:
                "**Derivado, no persistido.** Etiqueta humana lista para " +
                "mostrar en el campo `Universidad` del perfil del usuario. " +
                "Vale `\"Univalle\"` si `isUnivalle` es `true`, " +
                "`\"No identificado\"` en otro caso.",
            },
          },
        },
        PublicUser: {
          type: "object",
          required: ["uid", "username", "avatar"],
          description:
            "Subconjunto **seguro** del perfil del usuario, devuelto por " +
            "`GET /api/users/:uid`. Whitelist explícita: nunca incluye " +
            "email ni teléfono, aunque el doc Firestore los tenga.",
          properties: {
            uid: { type: "string", example: "abc123" },
            username: { type: "string", example: "juanp" },
            displayName: { type: "string", example: "Juan Pérez" },
            avatar: { type: "string", example: "/avatars/avatar1.png" },
          },
        },
        UnivalleResponse: {
          type: "object",
          required: ["isUnivalle", "domain", "university"],
          description:
            "Respuesta del endpoint `is-univalle`. `domain` y `university` " +
            "se devuelven como referencia para que el frontend no tenga " +
            "que hardcodearlos.",
          properties: {
            isUnivalle: { type: "boolean", example: true },
            domain: { type: "string", example: "correounivalle.edu.co" },
            university: {
              type: "string",
              enum: ["Univalle", "No identificado"],
              example: "Univalle",
            },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["username", "fullName", "provider"],
          properties: {
            username: {
              type: "string",
              example: "juanp",
              description:
                "4-10 caracteres, solo letras, números, punto y guion bajo " +
                "(regex `^[a-zA-Z0-9_.]{4,10}$`). Se rechaza si contiene " +
                "palabras de la lista negra (ver `USERNAME_FORBIDDEN`).",
            },
            fullName: {
              type: "string",
              example: "Juan Pérez",
              description:
                "Nombre completo. Mínimo 3 caracteres (tras `trim`). " +
                "Se rechaza con `FULLNAME_INVALID` si es más corto.",
            },
            provider: { $ref: "#/components/schemas/AuthProvider" },
            avatar: {
              type: "string",
              example: "/avatars/avatar1.png",
              description: "URL/ruta opcional. Default: `default_avatar.png`.",
            },
          },
        },
        UpdateProfileRequest: {
          type: "object",
          description:
            "Body de `PATCH /api/auth/me`. Al menos uno de los tres campos " +
            "debe estar presente. Los campos inmutables (uid, email, provider, " +
            "createdAt) son ignorados aunque vengan en el body.",
          properties: {
            username: {
              type: "string",
              example: "nuevo_user",
              description:
                "Nuevo username. 4-10 caracteres, regex `^[a-zA-Z0-9_.]{4,10}$`. " +
                "Se valida unicidad contra todos los usuarios excepto el propio. " +
                "Si coincide con el username actual, la operación es idempotente.",
            },
            fullName: {
              type: "string",
              example: "Juan Pérez Actualizado",
              description:
                "Nuevo nombre completo. Mínimo 3 caracteres (tras `trim`). " +
                "Se rechaza con `FULLNAME_INVALID` si es más corto.",
            },
            avatar: {
              type: "string",
              example: "/avatars/avatar3.png",
              description: "Nueva ruta o URL del avatar.",
            },
            phone: {
              type: "string",
              example: "+57 300 123 4567",
              description:
                "Teléfono opcional. Cadena vacía borra el valor. " +
                "Si trae valor, debe tener entre 7 y 15 dígitos (los " +
                "caracteres no numéricos como `+`, espacios o guiones no cuentan). " +
                "Se rechaza con `PHONE_INVALID` si está fuera de rango.",
            },
          },
        },
        Room: {
          type: "object",
          required: ["roomId", "name", "ownerId", "accessCode", "createdAt", "participants", "isActive"],
          description:
            "Documento `rooms/{roomId}` en Firestore. " +
            "El `roomId` coincide con el ID del documento.",
          properties: {
            roomId: {
              type: "string",
              example: "aB3kXq9mZvL2wRtY",
              description: "ID único auto-generado por Firestore (20 chars).",
            },
            name: {
              type: "string",
              example: "Sala Matemáticas",
              description: "Nombre descriptivo (1-100 caracteres).",
            },
            ownerId: {
              type: "string",
              example: "abc123",
              description: "UID Firebase del creador de la sala.",
            },
            accessCode: {
              type: "string",
              example: "B6K3F2",
              description: "Código de acceso de 6 caracteres para compartir/unirse.",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Fecha de creación (Firestore Timestamp serializado a ISO 8601).",
            },
            participants: {
              type: "array",
              items: { type: "string" },
              example: ["abc123"],
              description: "UIDs de participantes. El creador se incluye automáticamente.",
            },
            isActive: {
              type: "boolean",
              example: true,
              description: "`true` mientras la sala esté activa.",
            },
          },
        },
        CreateRoomRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              example: "Sala Matemáticas",
              description: "Nombre de la sala (1-100 caracteres). Obligatorio.",
            },
            accessCode: {
              type: "string",
              example: "B6K3F2",
              description:
                "Código de acceso pre-generado por el cliente (opcional). " +
                "Si se omite, el backend genera uno automáticamente.",
            },
          },
        },
        Message: {
          type: "object",
          required: [
            "id",
            "roomId",
            "senderUid",
            "senderUsername",
            "content",
            "type",
            "createdAt",
          ],
          description:
            "Documento `rooms/{roomId}/messages/{messageId}` en Firestore. " +
            "El `senderUsername` es un snapshot del momento del envío, no " +
            "se actualiza si el autor cambia su username después.",
          properties: {
            id: { type: "string", example: "msg_abc123" },
            roomId: { type: "string", example: "aB3kXq9mZvL2wRtY" },
            senderUid: { type: "string", example: "uid-xyz" },
            senderUsername: { type: "string", example: "juanp" },
            content: { type: "string", example: "Hola a todos 👋" },
            type: {
              type: "string",
              enum: ["text", "system"],
              example: "text",
              description:
                "`text` = mensaje de usuario; `system` = evento de sala " +
                "(joins, leaves) generado por el servidor.",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Fecha del servidor (Firestore Timestamp).",
            },
          },
        },
        CheckResponse: {
          type: "object",
          required: ["available"],
          description:
            "Respuesta de los endpoints `check-username` y `check-email`. " +
            "Para check-username, las palabras prohibidas se reportan como " +
            "`available: false` (no como error), por compatibilidad con el " +
            "frontend.",
          properties: {
            available: { type: "boolean", example: true },
          },
        },
        Error: {
          type: "object",
          required: ["error", "message"],
          description:
            "Forma estable de los errores del backend. El frontend toma " +
            "decisiones con `error` (código); muestra `message` o lo " +
            "traduce con su propio i18n.",
          properties: {
            error: {
              type: "string",
              enum: [
                "MISSING_TOKEN",
                "INVALID_TOKEN",
                "MISSING_FIELDS",
                "USERNAME_INVALID",
                "USERNAME_FORBIDDEN",
                "PROVIDER_INVALID",
                "EMAIL_INVALID",
                "EMAIL_DOMAIN_FORBIDDEN",
                "FULLNAME_INVALID",
                "PHONE_INVALID",
                "USERNAME_ALREADY_EXISTS",
                "EMAIL_ALREADY_EXISTS",
                "PROFILE_ALREADY_EXISTS",
                "PROFILE_NOT_FOUND",
                "ROOM_NAME_INVALID",
                "ROOM_CODE_INVALID",
                "ROOM_NOT_FOUND",
                "INTERNAL_ERROR",
              ],
              example: "USERNAME_ALREADY_EXISTS",
              description:
                "Código estable y legible por máquina. El frontend lo " +
                "usa para i18n y para decidir el flujo (p. ej. mostrar " +
                "el formulario de username tras un 404).",
            },
            message: {
              type: "string",
              example: "El nombre de usuario ya está en uso",
              description:
                "Mensaje humano en español, apto para mostrar al usuario.",
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: "Token ausente o inválido.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              examples: {
                missingToken: {
                  value: {
                    error: "MISSING_TOKEN",
                    message: "Token de autorización requerido",
                  },
                },
                invalidToken: {
                  value: {
                    error: "INVALID_TOKEN",
                    message: "Token inválido o expirado",
                  },
                },
              },
            },
          },
        },
        InternalError: {
          description:
            "Error interno del servidor. El detalle queda en logs; el " +
            "cliente solo recibe el código. Si la causa es Firestore " +
            "(`permission-denied`/`unavailable`), `mapFirestoreError()` " +
            "puede devolver `503` con mensaje 'Servicio temporalmente no " +
            "disponible' en vez de 500.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                error: "INTERNAL_ERROR",
                message: "Error interno del servidor",
              },
            },
          },
        },
        Forbidden: {
          description:
            "Acción no permitida para el solicitante (no es dueño / no es " +
            "miembro / etc.). El cliente debería tratarlo como un " +
            "`FORBIDDEN` en su mapper de errores y mostrar 'No tienes acceso'.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                error: "INTERNAL_ERROR",
                message: "No eres miembro de esta sala",
              },
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts", "./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
