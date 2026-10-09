// Test-only preload: refuse outbound requests and listening sockets in the server.
import net from "node:net";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import dgram from "node:dgram";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
const denied = () => {
  throw Error("Network access attempted during local-only verification.");
};
globalThis.fetch = denied;
for (const [mod, keys] of [
  [net, ["connect", "createConnection", "createServer"]],
  [http, ["get", "request", "createServer"]],
  [https, ["get", "request", "createServer"]],
  [tls, ["connect", "createServer"]],
  [dgram, ["createSocket"]],
])
  for (const key of keys) mod[key] = denied;
net.Socket.prototype.connect = denied;
net.Server.prototype.listen = denied;
for (const key of Object.keys(dns))
  if (key.startsWith("resolve") || ["lookup", "lookupService"].includes(key))
    dns[key] = denied;
for (const key of Object.keys(dns.promises))
  if (typeof dns.promises[key] === "function" && key !== "Resolver")
    dns.promises[key] = denied;
syncBuiltinESMExports();
