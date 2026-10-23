// Starts an embedded Postgres (PGlite) over the wire protocol for local dev/tests.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import net from 'node:net';

async function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

export async function startLocalDb({ dataDir } = {}) {
  const db = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 1 });
  await server.start();
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
    async stop() { await server.stop(); await db.close(); },
  };
}
