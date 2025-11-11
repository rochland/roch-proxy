const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { URL } = require('url');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

function decodeBase64(u) {
  try { return Buffer.from(u, 'base64').toString('utf8'); }
  catch { return null; }
}

function rewritePlaylist(playlistText, originUrl, proxyBase) {
  const lines = playlistText.split(/\r?\n/);
  const out = lines.map(line => {
    if (!line || line.startsWith('#')) return line;
    try {
      const abs = new URL(line, originUrl).toString();
      const enc = Buffer.from(abs).toString('base64');
      return `${proxyBase}/hls/segment?u=${encodeURIComponent(enc)}`;
    } catch {
      return line;
    }
  });
  return out.join('\n');
}

app.get('/hls/playlist', async (req, res) => {
  const u = req.query.u;
  const origin = decodeBase64(u);
  if (!origin) return res.status(400).send('invalid url');
  try {
    const originRes = await fetch(origin);
    const text = await originRes.text();
    const host = req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const proxyBase = `${proto}://${host}`;
    const rewritten = rewritePlaylist(text, origin, proxyBase);
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(rewritten);
  } catch (e) {
    console.error(e);
    res.status(500).send('proxy error');
  }
});

app.get('/hls/segment', async (req, res) => {
  const origin = decodeBase64(req.query.u);
  if (!origin) return res.status(400).send('invalid url');
  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const originRes = await fetch(origin, { headers });
    res.status(originRes.status);
    for (const [k, v] of originRes.headers.entries()) {
      if (['content-type', 'content-length', 'accept-ranges', 'content-range'].includes(k.toLowerCase()))
        res.set(k, v);
    }
    originRes.body.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).send('segment proxy error');
  }
});

app.get('/', (req, res) => res.send('✅ HLS Proxy is running'));
app.listen(PORT, () => console.log('Server running on port', PORT));
