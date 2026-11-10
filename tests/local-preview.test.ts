import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { localPreviewUser } from "../lib/local-preview.ts";
import { findFreePort } from "../scripts/local-runtime.mjs";

test("локальный вход требует dev-режим, явный флаг и loopback-адрес", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3001", "[::1]:3000"]) {
    assert.equal(localPreviewUser(true, true, host)?.userId, "local_zakupai");
    assert.equal(localPreviewUser(false, true, host), null);
    assert.equal(localPreviewUser(true, false, host), null);
  }
});
test("локальный вход не действует для внешнего домена или поддельного адреса", () => {
  for (const host of [
    null,
    "example.com",
    "localhost.example.com",
    "192.168.1.2:3000",
    "example.com@localhost:3000",
    "not a host",
  ]) {
    assert.equal(localPreviewUser(true, true, host), null);
  }
});
test("занятый порт пропускается без остановки существующего сервера", async () => {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const occupied = (server.address() as net.AddressInfo).port;
    if (occupied === 65535) return;
    const free = await findFreePort(occupied);
    assert.ok(free > occupied);
    assert.equal(server.listening, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test("неверные номера портов отклоняются", async () => {
  for (const port of [0, 80, -1, 65536, 3000.5, NaN])
    await assert.rejects(() => findFreePort(port));
});
