// Isolated Supabase HTTP fixture backed by real Postgres (PGlite).
// It is a test process, never an authentication shortcut in the application.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { initialize, ownerId, strangerId } from '../tests/fixtures/library-db.mjs';
const db = new PGlite(); await initialize(db);
const secret = crypto.randomUUID();
let password = 'library-test-password';
let recoveryUsed = false;
const user = { id: ownerId, aud: 'authenticated', role: 'authenticated', email: 'owner@library.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
const token = (subject = ownerId) => { const content = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: subject, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')].join('.'); return `${content}.${createHmac('sha256', secret).update(content).digest('base64url')}`; };
const authorized = req => { try { const t = (req.headers.authorization || '').replace(/^Bearer /, ''), [h, p, signature] = t.split('.'); const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url'); return signature && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); } catch { return false; } };
const authenticatedSubject = req => {
  if (!authorized(req)) return '';
  try {
    const payload = req.headers.authorization.replace(/^Bearer /, '').split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).sub || '';
  } catch { return ''; }
};
const server = createServer(async (req, res) => {
  const send = (value, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, 'http://127.0.0.1:3212');
    if (url.pathname === '/health') return send({ ok: true });
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 6_000_000) return send({ message: 'Too large' }, 413); }
    const body = raw ? JSON.parse(raw) : {};
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password' && !(body.email === user.email && body.password === password)) return send({ msg: 'Invalid credentials' }, 400);
      return send({ access_token: token(), refresh_token: 'isolated-test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user });
    }
    if (url.pathname === '/auth/v1/verify') {
      if (body.type === 'recovery' && body.token_hash === 'isolated-stranger-recovery-hash') return send({ access_token: token(strangerId), refresh_token: 'isolated-stranger-refresh', token_type: 'bearer', expires_in: 3600, user: { ...user, id: strangerId } });
      if (body.type !== 'recovery' || body.token_hash !== 'isolated-recovery-token-hash' || recoveryUsed) return send({ msg: 'Expired link', code: 'otp_expired' }, 403);
      recoveryUsed = true;
      return send({ access_token: token(), refresh_token: 'isolated-test-refresh', token_type: 'bearer', expires_in: 3600, user });
    }
    if (url.pathname === '/auth/v1/user') {
      if (!authorized(req)) return send({ msg: 'Invalid token' }, 401);
      const subject = JSON.parse(Buffer.from(req.headers.authorization.replace(/^Bearer /, '').split('.')[1], 'base64url').toString()).sub;
      if (subject !== ownerId) return send({ ...user, id: subject });
      if (req.method === 'PUT') password = body.password;
      return send(user);
    }
    if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
    if (['/rest/v1/rpc/library_read_preview', '/rest/v1/rpc/library_browse_index'].includes(url.pathname)) {
      const browsing = url.pathname.endsWith('library_browse_index');
      const result = await db.transaction(async tx => {
        await tx.exec(`set local role ${authenticatedSubject(req) ? 'authenticated' : 'anon'}`);
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [authenticatedSubject(req)]);
        return browsing
          ? tx.query('select public.library_browse_index($1,$2,$3) as payload', [body.p_owner, body.p_scope, body.p_filters || {}])
          : tx.query('select public.library_read_preview($1,$2) as payload', [body.p_owner, body.p_scope]);
      });
      return send(result.rows[0].payload);
    }
    if (url.pathname === '/rest/v1/rpc/library_save') {
      const result = await db.transaction(async tx => {
        await tx.exec(`set local role ${authenticatedSubject(req) ? 'authenticated' : 'anon'}`);
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [authenticatedSubject(req)]);
        return tx.query('select public.library_save($1,$2,$3) as revision', [body.expected_revision, body.next_document, body.public_document]);
      });
      return send(result.rows[0].revision);
    }
    const table = url.pathname.split('/').pop();
    if (table === 'library_read_works' && req.method === 'GET') {
      const result = await db.transaction(async tx => {
        await tx.exec(`set local role ${authenticatedSubject(req) ? 'authenticated' : 'anon'}`);
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [authenticatedSubject(req)]);
        return tx.query(
          'select work,record from public.library_read_works where owner_id=$1 and scope=$2 and work_id=$3',
          [
            url.searchParams.get('owner_id')?.replace(/^eq\./, '') || ownerId,
            url.searchParams.get('scope')?.replace(/^eq\./, '') || 'public',
            url.searchParams.get('work_id')?.replace(/^eq\./, '') || '',
          ],
        );
      });
      return send(result.rows);
    }
    if (['library_state', 'library_public', 'library_trakt'].includes(table) && req.method === 'GET') {
      const result = await db.transaction(async tx => {
        await tx.exec(`set local role ${authenticatedSubject(req) ? 'authenticated' : 'anon'}`);
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [authenticatedSubject(req)]);
        return tx.query(`select ${table === 'library_trakt' ? '*' : 'document,revision'} from public.${table} where owner_id=$1`, [url.searchParams.get('owner_id')?.replace(/^eq\./, '') || ownerId]);
      });
      return send(result.rows);
    }
    send({ message: 'Unknown test endpoint' }, 404);
  } catch (error) { send({ message: error.message, code: error.code || 'XX000' }, error.code === '40001' ? 409 : 403); }
});
await new Promise(resolve => server.listen(3212, '127.0.0.1', resolve));
const child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', '-p', '3211'], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, LIBRARY_TEST_DIST_DIR: '.next-library-tests', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3212', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'isolated-test-anon-key', LIBRARY_OWNER_ID: ownerId, TMDB_READ_TOKEN: '', MAL_CLIENT_ID: '', TWITCH_CLIENT_ID: '', TWITCH_CLIENT_SECRET: '', TRAKT_CLIENT_ID: 'isolated-test-client', TRAKT_ENCRYPTION_KEY: 'a'.repeat(64), TRAKT_REDIRECT_URI: 'https://library.example/api/library/trakt/callback' },
});
const stop = () => { child.kill(); server.close(); db.close().finally(() => process.exit()); };
process.on('SIGINT', stop); process.on('SIGTERM', stop); child.on('exit', () => { server.close(); db.close().finally(() => process.exit()); });
