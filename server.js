// WorkKaro server (Ollama version, fully local and open source).
// Serves your HTML files and answers /api/wage and /api/chat using a model running in Ollama.
//
// One-time setup:
//   1. Install Ollama from https://ollama.com and open it
//   2. In Terminal:  ollama pull llama3.2
// Every time:
//   node server.js          (needs Node 18 or newer)
// Then open http://localhost:3000/index.html
//
// To use another model:   OLLAMA_MODEL=qwen2.5:3b node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ---------- helpers ----------
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 40000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));

// ---------- talking to Ollama ----------
// turns = [{ role: 'user' | 'assistant', content }]
async function callModel(system, turns, asJson = false) {
  let r;
  try {
    r = await fetch(OLLAMA_URL + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        ...(asJson ? { format: 'json' } : {}),
        messages: [{ role: 'system', content: system }, ...turns],
        options: { temperature: 0.3 }
      })
    });
  } catch (e) {
    throw new Error('Cannot reach Ollama at ' + OLLAMA_URL + '. Is the Ollama app running?');
  }
  if (!r.ok) {
    const text = await r.text();
    if (r.status === 404) throw new Error('Model "' + MODEL + '" is not installed. Run: ollama pull ' + MODEL);
    throw new Error('Ollama error ' + r.status + ': ' + text);
  }
  const data = await r.json();
  return (data.message && data.message.content) || '';
}

// ---------- wage estimate ----------
const WAGE_PROMPT = `You are a wage advisor for daily-wage and informal work in India.
An employer describes a job. Judge how hard it is and what a fair MINIMUM pay per worker per day would be.
Rules:
- Think about the skill needed, physical effort, risk, tools, travel and how long the work takes.
- The minimum must never be below the usual statutory minimum wage for unskilled work in India.
- All amounts are in Indian rupees per worker for one 8-hour day.
- Reply with ONLY a JSON object and nothing else, in exactly this shape:
{"difficulty":"Easy|Moderate|Hard","skill_level":"Unskilled|Semi-skilled|Skilled","min_per_day":number,"recommended_low":number,"recommended_high":number,"reasoning":"one or two short sentences in plain English"}
- recommended_low must be at least min_per_day and recommended_high must be above recommended_low.`;

async function handleWage(req, res) {
  let input;
  try { input = JSON.parse(await readBody(req)); }
  catch { return sendJson(res, 400, { error: 'Invalid request.' }); }

  const description = String(input.description || '').slice(0, 800).trim();
  if (description.length < 10) return sendJson(res, 400, { error: 'Describe the work in a bit more detail.' });

  const userText = [
    'Category: ' + String(input.category || 'Other').slice(0, 60),
    'Work description: ' + description,
    'Duration: ' + Number(input.duration || 1) + ' ' + (input.unit === 'hours' ? 'hours' : 'days'),
    'Workers needed: ' + clamp(input.workers, 1, 500),
    'City or area: ' + String(input.city || 'not given').slice(0, 80)
  ].join('\n');

  try {
    const text = await callModel(WAGE_PROMPT, [{ role: 'user', content: userText }], true);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return sendJson(res, 502, { error: 'Could not read the AI answer.' });

    const a = JSON.parse(match[0]);
    const min = clamp(a.min_per_day, 300, 5000);
    const low = Math.max(min, clamp(a.recommended_low, 300, 6000));
    const high = Math.max(low + 20, clamp(a.recommended_high, 300, 8000));

    sendJson(res, 200, {
      difficulty: ['Easy', 'Moderate', 'Hard'].includes(a.difficulty) ? a.difficulty : 'Moderate',
      skill_level: ['Unskilled', 'Semi-skilled', 'Skilled'].includes(a.skill_level) ? a.skill_level : 'Unskilled',
      min_per_day: min,
      recommended_low: low,
      recommended_high: high,
      reasoning: String(a.reasoning || '').slice(0, 400)
    });
  } catch (err) {
    console.error(err.message);
    sendJson(res, 502, { error: 'Could not reach the AI model.' });
  }
}

// ---------- chat assistant ----------
const CHAT_RULES = `Rules:
- Reply in the same language the person writes in (English, Hindi, Marathi or Hinglish).
- Keep replies short: 2 to 4 sentences in plain, simple words.
- Never ask for Aadhaar numbers, OTPs, passwords or bank details.
- Never invent jobs, workers or wages. For job facts use only the APP DATA if it is given.
- No legal advice. For legal questions say to check the state labour rules.
- If you do not know something, say so.`;

const CHAT_PROMPTS = {
  employer: `You are the WorkKaro Assistant for employers who hire daily-wage workers in India.
You help with: writing a clear job post, judging a fair wage (give a rough idea), what to check before hiring, and how the app works (verified workers show a photo and a verified badge).
${CHAT_RULES}`,
  worker: `You are the WorkKaro Assistant for workers looking for daily work in India.
You help with: understanding the jobs shown in the app, what to ask an employer before accepting work, how to stay safe at a job site, how verification works (photo, government ID, Aadhaar OTP), and fair pay.
${CHAT_RULES}`
};

async function handleChat(req, res) {
  let input;
  try { input = JSON.parse(await readBody(req)); }
  catch { return sendJson(res, 400, { error: 'Invalid request.' }); }

  const role = input.role === 'worker' ? 'worker' : 'employer';
  const turns = (Array.isArray(input.messages) ? input.messages : [])
    .slice(-10)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 500).trim() }))
    .filter(m => m.content);
  while (turns.length && turns[0].role === 'assistant') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    return sendJson(res, 400, { error: 'Send a message first.' });
  }

  const context = String(input.context || '').slice(0, 1500);
  const system = CHAT_PROMPTS[role] + (context ? '\n\nAPP DATA (jobs currently posted):\n' + context : '');

  try {
    let reply = await callModel(system, turns);
    reply = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 1500);
    sendJson(res, 200, { reply: reply || 'Sorry, I could not answer that. Please try again.' });
  } catch (err) {
    console.error(err.message);
    sendJson(res, 502, { error: 'Could not reach the AI model.' });
  }
}

// ---------- static files ----------
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, path.normalize(urlPath));

  if (!filePath.startsWith(__dirname) || path.basename(filePath) === 'server.js') {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/wage') return handleWage(req, res);
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end('Method not allowed');
}).listen(PORT, async () => {
  console.log('WorkKaro running at http://localhost:' + PORT + '/index.html');
  console.log('AI: Ollama, model "' + MODEL + '"');
  // Friendly startup check
  try {
    const r = await fetch(OLLAMA_URL + '/api/tags');
    const names = ((await r.json()).models || []).map(m => m.name);
    if (!names.some(n => n === MODEL || n.startsWith(MODEL + ':'))) {
      console.log('Warning: model "' + MODEL + '" is not installed yet. Run: ollama pull ' + MODEL);
    } else {
      console.log('Ollama is running and the model is ready.');
    }
  } catch {
    console.log('Warning: Ollama is not running at ' + OLLAMA_URL + '. Open the Ollama app first.');
  }
});
