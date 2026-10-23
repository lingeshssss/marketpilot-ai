// Single Vercel Node.js function serving every /api/* route (see vercel.json rewrites).
import { handle } from '../server/app.js';

export default async function handler(req, res) {
  await handle(req, res);
}
