/* WorkKaro chat assistant (powered by Gemma 4 through server.js)
   Add to any page, just before </body>:
     <script src="chat-widget.js" data-role="employer"></script>
     <script src="chat-widget.js" data-role="worker"></script>
*/
(function () {
  const script = document.currentScript;
  let role = (script && script.dataset.role) || null;
  if (!role) { try { role = localStorage.getItem('userRole'); } catch (e) {} }
  role = role === 'worker' ? 'worker' : 'employer';

  const accent = role === 'worker' ? '#3b82f6' : '#f97316';
  const glow = role === 'worker' ? 'rgba(59,130,246,0.3)' : 'rgba(249,115,22,0.3)';
  const greeting = role === 'worker'
    ? 'Hi! I can help you understand jobs, pay and staying safe at work. What would you like to know?'
    : 'Hi! I can help you write a job post, decide a fair wage, or use WorkKaro. What do you need?';
  const suggestions = role === 'worker'
    ? ['What jobs are available?', 'What should I ask an employer?', 'How do I get verified?']
    : ['Help me write a job post', 'What is a fair wage for painting?', 'How do I find trusted workers?'];

  // ----- Styles -----
  const css = document.createElement('style');
  css.textContent = `
    #wk-chat-btn{position:fixed;right:20px;bottom:20px;z-index:9998;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;
      background:${accent};color:#fff;font-size:28px;box-shadow:0 12px 30px -8px ${glow};transition:transform .25s ease}
    #wk-chat-btn:hover{transform:scale(1.08)}
    #wk-chat{position:fixed;right:20px;bottom:92px;z-index:9999;width:min(380px,calc(100vw - 24px));height:min(540px,calc(100vh - 120px));
      display:none;flex-direction:column;background:#18181b;border:1px solid #3f3f46;border-radius:18px;overflow:hidden;
      box-shadow:0 25px 50px -12px rgba(0,0,0,.7);font-family:system-ui,-apple-system,sans-serif}
    #wk-chat.open{display:flex}
    #wk-chat header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#09090b;border-bottom:1px solid #27272a;color:#fff}
    #wk-chat header b{font-size:15px}
    #wk-chat header small{display:block;color:#a1a1aa;font-size:12px;margin-top:2px}
    #wk-chat header button{background:none;border:none;color:#a1a1aa;font-size:20px;cursor:pointer}
    #wk-chat header button:hover{color:#fff}
    #wk-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
    .wk-m{max-width:85%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}
    .wk-bot{align-self:flex-start;background:#27272a;color:#e4e4e7;border-bottom-left-radius:4px}
    .wk-me{align-self:flex-end;background:${accent};color:#fff;border-bottom-right-radius:4px}
    .wk-chips{display:flex;flex-wrap:wrap;gap:6px}
    .wk-chip{background:transparent;border:1px solid #3f3f46;color:#d4d4d8;border-radius:999px;padding:6px 11px;font-size:12.5px;cursor:pointer}
    .wk-chip:hover{border-color:${accent};color:#fff}
    .wk-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#a1a1aa;animation:wkb 1s infinite}
    .wk-dots span:nth-child(2){animation-delay:.15s}.wk-dots span:nth-child(3){animation-delay:.3s}
    @keyframes wkb{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
    #wk-form{display:flex;gap:8px;padding:12px;border-top:1px solid #27272a;background:#09090b}
    #wk-input{flex:1;min-width:0;background:#18181b;border:1px solid #3f3f46;border-radius:12px;color:#fff;padding:10px 12px;font-size:14px;outline:none}
    #wk-input:focus{border-color:${accent};box-shadow:0 0 0 3px ${glow}}
    #wk-send{background:${accent};color:#fff;border:none;border-radius:12px;padding:0 16px;font-weight:600;cursor:pointer}
    #wk-send:disabled{opacity:.5;cursor:not-allowed}
    @media (prefers-reduced-motion: reduce){.wk-dots span{animation:none}#wk-chat-btn{transition:none}}
  `;
  document.head.appendChild(css);

  // ----- Markup -----
  const btn = document.createElement('button');
  btn.id = 'wk-chat-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Open WorkKaro assistant');
  btn.textContent = '💬';

  const box = document.createElement('div');
  box.id = 'wk-chat';
  box.innerHTML =
    '<header><div><b>WorkKaro Assistant</b><small>AI helper. It can make mistakes.</small></div>' +
    '<button type="button" id="wk-close" aria-label="Close chat">✕</button></header>' +
    '<div id="wk-msgs"></div>' +
    '<form id="wk-form"><input id="wk-input" type="text" maxlength="500" autocomplete="off" placeholder="Type your question..." />' +
    '<button id="wk-send" type="submit">Send</button></form>';

  document.body.appendChild(btn);
  document.body.appendChild(box);

  const msgsEl = box.querySelector('#wk-msgs');
  const form = box.querySelector('#wk-form');
  const input = box.querySelector('#wk-input');
  const sendBtn = box.querySelector('#wk-send');

  const history = []; // {role: 'user' | 'assistant', content}
  let busy = false;

  function add(text, who) {
    const el = document.createElement('div');
    el.className = 'wk-m ' + (who === 'me' ? 'wk-me' : 'wk-bot');
    el.textContent = text; // textContent keeps model output from running as HTML
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  // Jobs saved in this browser, so the assistant can talk about real data.
  // Reads both the simple 'jobs' list and the employer page's 'wk_db' store.
  function getContext() {
    const lines = [];
    try {
      JSON.parse(localStorage.getItem('jobs') || '[]').slice(0, 5).forEach(j =>
        lines.push('- ' + j.category + ': ' + String(j.description || '').slice(0, 90) +
          ' | Rs ' + j.wagePerDay + ' per day | ' + j.workers + ' worker(s)' + (j.city ? ' | ' + j.city : '')));
    } catch (e) {}
    try {
      const db = JSON.parse(localStorage.getItem('wk_db') || '{}');
      (db.jobs || []).slice(0, 5).forEach(j =>
        lines.push('- ' + j.type + ' job: ' + j.workers + ' worker(s) for ' + j.hours + ' hours' +
          (j.urgent ? ' (urgent)' : '') + ' | status: ' + j.status + ' | ' + (j.accepted || []).length + ' accepted' +
          (j.address ? ' | ' + String(j.address).slice(0, 60) : '')));
    } catch (e) {}
    return lines.join('\n');
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    chips && chips.remove();

    add(text, 'me');
    history.push({ role: 'user', content: text });
    input.value = '';

    const typing = add('', 'bot');
    typing.innerHTML = '<span class="wk-dots"><span></span><span></span><span></span></span>';

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, messages: history, context: getContext() }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      typing.textContent = data.reply;
      history.push({ role: 'assistant', content: data.reply });
    } catch (e) {
      typing.textContent = 'The assistant is offline right now. Please try again in a moment.';
      history.pop(); // drop the unanswered question so the next try starts clean
    }

    busy = false;
    sendBtn.disabled = false;
    msgsEl.scrollTop = msgsEl.scrollHeight;
    input.focus();
  }

  // First message and quick-question chips
  add(greeting, 'bot');
  const chips = document.createElement('div');
  chips.className = 'wk-chips';
  suggestions.forEach(q => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'wk-chip';
    c.textContent = q;
    c.addEventListener('click', () => send(q));
    chips.appendChild(c);
  });
  msgsEl.appendChild(chips);

  function toggle(open) {
    box.classList.toggle('open', open);
    if (open) input.focus();
  }
  btn.addEventListener('click', () => toggle(!box.classList.contains('open')));
  box.querySelector('#wk-close').addEventListener('click', () => toggle(false));
  form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
})();
