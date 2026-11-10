import net from "node:net";

export async function findFreePort(preferred = 3000) {
  if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65535) {
    throw new Error("Укажите порт от 1024 до 65535");
  }
  for (let port = preferred; port <= Math.min(preferred + 99, 65535); port++) {
    const available = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE" || error.code === "EACCES")
          resolve(false);
        else reject(error);
      });
      server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
        server.close((error) => (error ? reject(error) : resolve(true)));
      });
    });
    if (available) return port;
  }
  throw new Error("Не найден свободный порт. Укажите другой через --port.");
}
