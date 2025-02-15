import ms from "ms";
import { EventEmitter } from "node:events";
import {
  AuthenticatedUser,
  getLocalStorage,
  handleQueuedJob,
  handleUserOffline,
  handleUserOnline,
  LocalStorage,
} from "queue-run";
import { WebSocket } from "ws";

// All open websockets by unique socket ID
//
// Sockets added/removed by server, since the API is ID based
const sockets = new Map<string, WebSocket>();

/**  Index all open sockets belonging to a given user
 * @key user ID
 * @value connection ID
 */
const userIdToConnectionId = new Map<string, string[]>();
/**  Index of user ID for a given socket
 * @key connection ID
 * @value user ID
 */
const connectionIdToUserId = new Map<string, string>();

// Number of jobs in the queue
let queued = 0;
// Emit idle event when queue is empty
const events = new EventEmitter();

export class DevLocalStorage extends LocalStorage {
  private port;

  constructor(port: number) {
    super({
      urls: {
        http: `http://localhost:${port}`,
        ws: `ws://localhost:${port + 1}`,
      },
    });
    this.port = port;
  }

  async queueJob({
    queueName,
    groupId,
    payload,
    params,
    user,
  }: {
    queueName: string;
    groupId?: string | undefined;
    payload: string | Buffer | object;
    params?: { [key: string]: string | string[] };
    user?: { id: string };
  }) {
    const jobId = crypto.randomUUID!();
    const serializedPayload =
      typeof payload === "string" || Buffer.isBuffer(payload)
        ? payload
        : JSON.parse(JSON.stringify(payload));
    const serializedParams = Object.entries(params ?? {}).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [String(key)]: String(value),
      }),
      {}
    );
    const userId = user?.id ? String(user.id) : undefined;

    ++queued;
    setImmediate(() => {
      this.exit(async () => {
        try {
          await handleQueuedJob({
            queueName,
            metadata: {
              groupId,
              jobId,
              params: serializedParams,
              queueName,
              receivedCount: 1,
              queuedAt: new Date(),
              sequenceNumber: 1,
              user: userId ? { id: userId } : null,
            },
            payload: serializedPayload,
            newLocalStorage: () => new DevLocalStorage(this.port),
            remainingTime: ms("30s"),
          });
        } finally {
          --queued;
          if (queued === 0) events.emit("idle");
        }
      });
    });
    return jobId;
  }

  async authenticated(user: AuthenticatedUser | null) {
    super.authenticated(user);
    const { connectionId } = this;
    if (user && connectionId) {
      const connections = userIdToConnectionId.get(user.id) ?? [];
      connectionIdToUserId.set(connectionId, user.id);
      userIdToConnectionId.set(user.id, [...connections, connectionId]);

      const wentOnline = connections.length === 0;
      if (wentOnline) {
        getLocalStorage().exit(() =>
          handleUserOnline({
            user,
            newLocalStorage: () => new DevLocalStorage(this.port),
          })
        );
      }
    }
  }

  async sendWebSocketMessage(message: Buffer, connection: string) {
    const socket = sockets.get(connection);
    if (socket) {
      await new Promise((resolve, reject) =>
        socket.send(message, { binary: false }, (error) => {
          if (error) reject(error);
          else resolve(undefined);
        })
      );
    }
  }

  async getConnections(userIds: string[]) {
    return userIds
      .map((userId) => userIdToConnectionId.get(userId) ?? [])
      .flat();
  }

  async closeWebSocket(connection: string) {
    const socket = sockets.get(connection);
    if (socket) socket.terminate();
  }
}

export function onIdleOnce(cb: () => void) {
  events.once("idle", cb);
}

export function onWebSocketAccepted({
  connection,
  socket,
}: {
  connection: string;
  socket: WebSocket;
}) {
  sockets.set(connection, socket);
}

export function getUser(connection: string) {
  return connectionIdToUserId.get(connection);
}

export function onWebSocketClosed({
  connectionId: connection,
  newLocalStorage,
}: {
  connectionId: string;
  newLocalStorage: () => LocalStorage;
}) {
  sockets.delete(connection);
  const userId = connectionIdToUserId.get(connection);
  if (userId) {
    connectionIdToUserId.delete(connection);
    const connections = (userIdToConnectionId.get(userId) ?? []).filter(
      (c) => c !== connection
    );
    if (connections.length === 0) {
      userIdToConnectionId.delete(userId);
      handleUserOffline({ user: { id: userId }, newLocalStorage });
    } else userIdToConnectionId.set(userId, connections);
  }
}
