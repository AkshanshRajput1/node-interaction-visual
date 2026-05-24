const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// State
let myId = null;
let nodes = {};
let packets = [];
let ws = null;

// WebSocket
function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);

  ws.onopen = () => {
    log('Connected to server', 'join');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleMessage(data);
  };

  ws.onclose = () => {
    log('Disconnected. Reconnecting in 2s...', 'leave');
    // auto reconnect after 2 seconds
    setTimeout(connect, 2000);
  };

  ws.onerror = (err) => {
    log('WebSocket error', 'error');
  };
}

// Handle incoming messages from server
function handleMessage(data) {
  if (data.type === 'welcome') {
    myId = data.id;
    document.getElementById('my-id').textContent = myId;

    //aDDING NODES TO THE MAP
    data.peers.forEach(p => addNode(p.id, p.name));
    log(`You joined as ${myId}`, 'join');
  }

  else if (data.type === 'node_join') {
    // New Node
    addNode(data.id, data.name);
    log(`${data.id} joined the network`, 'join');
  }

  else if (data.type === 'node_leave') {
    //Node Disconnedted
    if (nodes[data.id]) {
      nodes[data.id].online = false;
      // Remove from dropdown
      removeFromDropdown(data.id);
      log(`${data.id} left the network`, 'leave');
    }
  }

  else if (data.type === 'message') {
    // Someone sent a message
    const src = nodes[data.from];
    const dst = nodes[myId];
    if (src && dst) spawnPacket(src, dst, 'msg');
    const who = data.broadcast ? `${data.from} (broadcast)` : data.from;
    log(`${who}: ${data.text}`, 'msg');
  }

  else if (data.type === 'ping') {
    const src = nodes[data.from];
    const dst = nodes[myId];
    if (src && dst) spawnPacket(src, dst, 'ping');
    log(`PING from ${data.from}`, 'ping');
  }

  else if (data.type === 'pong') {
    log(`PONG from ${data.from}`, 'ping');
  }

  else if (data.type === 'file') {
    const src = nodes[data.from];
    const dst = nodes[myId];
    if (src && dst) spawnPacket(src, dst, 'file');
    log(`FILE from ${data.from}: ${data.filename} (${data.size}KB)`, 'file');
  }

  else if (data.type === 'error') {
    log(`Error: ${data.text}`, 'error');
  }
}

//Node management
function addNode(id, name) {
  const x = 80 + Math.random() * (canvas.width - 160);
  const y = 80 + Math.random() * (canvas.height - 160);

  nodes[id] = { id, name, x, y, online: true };

  const sel = document.getElementById('target-select');
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = id;
  //Cannot add self as target
  if (id !== myId) sel.appendChild(opt);
}

function removeFromDropdown(id) {
  const sel = document.getElementById('target-select');
  const opt = sel.querySelector(`option[value="${id}"]`);
  if (opt) opt.remove();
}

//Send function
function getTarget() {
  return document.getElementById('target-select').value;
}

function sendMessage() {
  const to = getTarget();
  const text = document.getElementById('msg-input').value.trim();
  if (!to) { log('Select a target node first', 'error'); return; }
  if (!text) { log('Type a message first', 'error'); return; }

  ws.send(JSON.stringify({ type: 'message', to, text }));
  const src = nodes[myId];
  const dst = nodes[to];
  if (src && dst) spawnPacket(src, dst, 'msg');

  log(`You → ${to}: ${text}`, 'msg');
  document.getElementById('msg-input').value = '';
}

function sendPing() {
  const to = getTarget();
  if (!to) { log('Select a target node first', 'error'); return; }

  ws.send(JSON.stringify({ type: 'ping', to }));

  const src = nodes[myId];
  const dst = nodes[to];
  if (src && dst) spawnPacket(src, dst, 'ping');

  log(`PING → ${to}`, 'ping');
}

function sendFile() {
  const to = getTarget();
  if (!to) { log('Select a target node first', 'error'); return; }

  const filename = 'data.txt';
  const size = Math.floor(Math.random() * 900 + 100);

  ws.send(JSON.stringify({ type: 'file', to, filename, size }));

  const src = nodes[myId];
  const dst = nodes[to];
  if (src && dst) {
    // Send 4 packet to simulate chunked file transfer
    for (let i = 0; i < 4; i++) {
      setTimeout(() => spawnPacket(src, dst, 'file'), i * 150);
    }
  }

  log(`FILE → ${to}: ${filename} (${size}KB)`, 'file');
}

function sendBroadcast() {
  const text = document.getElementById('msg-input').value.trim() || 'broadcast';

  ws.send(JSON.stringify({ type: 'broadcast', text }));

  const src = nodes[myId];
  Object.values(nodes).forEach(n => {
    if (n.id !== myId && n.online) spawnPacket(src, n, 'msg');
  });

  log(`Broadcast: ${text}`, 'msg');
}

// Packet animation
function spawnPacket(from, to, type) {
  const colors = { msg: '#378ADD', ping: '#1D9E75', file: '#BA7517' };
  packets.push({
    x: from.x, y: from.y,
    tx: to.x,  ty: to.y,
    progress: 0,
    speed: type === 'ping' ? 0.03 : type === 'file' ? 0.01 : 0.02,
    color: colors[type] || '#378ADD',
    size: type === 'file' ? 7 : 5
  });
}

// Canvas resize
function resize() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

// Draw loop
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const onlineNodes = Object.values(nodes).filter(n => n.online);

  for (let i = 0; i < onlineNodes.length; i++) {
    for (let j = i + 1; j < onlineNodes.length; j++) {
      const a = onlineNodes[i];
      const b = onlineNodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 300) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }

  // Draw nodes
  Object.values(nodes).forEach(n => {
    ctx.beginPath();
    ctx.arc(n.x, n.y, 18, 0, Math.PI * 2);

    //self node is purple, others are teal, offline is red
    if (n.id === myId) {
      ctx.fillStyle = '#3C3489';
    } else if (n.online) {
      ctx.fillStyle = '#085041';
    } else {
      ctx.fillStyle = '#791F1F';
    }
    ctx.fill();

    ctx.strokeStyle = n.id === myId ? '#7F77DD' : (n.online ? '#1D9E75' : '#E24B4A');
    ctx.lineWidth = 2;
    ctx.stroke();

    // Node id
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.id, n.x, n.y);
  });

  // Draw and update packet
  packets = packets.filter(p => p.progress <= 1);
  packets.forEach(p => {
    p.progress += p.speed;
    const x = p.x + (p.tx - p.x) * p.progress;
    const y = p.y + (p.ty - p.y) * p.progress;

    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 1 - p.progress * 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  requestAnimationFrame(draw);
}

// Log helper
function log(msg, type) {
  const panel = document.getElementById('log');
  const div = document.createElement('div');
  div.className = 'log-entry ' + (type || '');
  const t = new Date().toLocaleTimeString('en', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  div.textContent = `[${t}] ${msg}`;
  panel.prepend(div);
  // Keeping log short
  if (panel.children.length > 100) panel.removeChild(panel.lastChild);
}

// ########Start#########
window.addEventListener('resize', () => { resize(); });
resize();
connect();
draw();