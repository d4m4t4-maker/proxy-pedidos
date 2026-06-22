const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const TINY_API_TOKEN = process.env.TINY_API_TOKEN;
const DINAMIZE_EMAIL = process.env.DINAMIZE_EMAIL;
const DINAMIZE_PASSWORD = process.env.DINAMIZE_PASSWORD;
const DINAMIZE_LIST_ID = 1; // "Meus contatos"

app.use(cors());
app.use(express.json());

// ─── Pedidos Tiny ERP ───────────────────────────────────────────────────────
app.get('/api/pedidos', async (req, res) => {
  const { cliente } = req.query;
  if (!TINY_API_TOKEN) return res.status(500).json({ error: 'TINY_API_TOKEN nao configurado' });
  try {
    const url = new URL('https://api.tiny.com.br/api2/pedidos.pesquisa.php');
    url.searchParams.set('token', TINY_API_TOKEN);
    url.searchParams.set('formato', 'json');
    if (cliente) url.searchParams.set('cliente', cliente);
    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    if (cliente && data.retorno && data.retorno.pedidos) {
      const termo = cliente.toLowerCase();
      data.retorno.pedidos = data.retorno.pedidos.filter(p => {
        const nome = (p.pedido && p.pedido.nome) ? p.pedido.nome.toLowerCase() : '';
        return nome.includes(termo);
      });
      data.retorno.numero_registros = data.retorno.pedidos.length;
    }
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Erro ao conectar com a Tiny API' });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/healthz', (_req, res) => res.json({ status: 'ok' }));

// ─── Dinamize: obter token de autenticação ───────────────────────────────────
async function getDinamizeToken() {
  const resp = await fetch('https://api.dinamize.com/v3/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DINAMIZE_EMAIL, password: DINAMIZE_PASSWORD })
  });
  if (!resp.ok) throw new Error('Falha ao autenticar na Dinamize: ' + resp.status);
  const data = await resp.json();
  return data.token || data.access_token;
}

// ─── Dinamize: adicionar contato à lista ─────────────────────────────────────
async function addContactToDinamize(nome, email, telefone) {
  const token = await getDinamizeToken();
  const contact = { email };
  if (nome) contact.name = nome;
  if (telefone) contact.phone = telefone;
  contact.origem = 'Chat Tawk.to';

  const resp = await fetch(`https://api.dinamize.com/v3/contact/list/${DINAMIZE_LIST_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(contact)
  });
  const result = await resp.json();
  console.log('[Dinamize] Contato adicionado:', JSON.stringify(result));
  return result;
}

// ─── Webhook do Tawk.to ───────────────────────────────────────────────────────
app.post('/webhook/tawk', async (req, res) => {
  try {
    const payload = req.body;
    console.log('[webhook/tawk] Recebido:', JSON.stringify(payload).substring(0, 300));

    // Tawk.to envia diferentes eventos; capturar dados do visitante
    const visitor = payload.visitor || payload.chat?.visitor || {};
    const nome = visitor.name || '';
    const email = visitor.email || '';
    const telefone = visitor.phone || '';

    // Só salvar se tiver email
    if (!email) {
      console.log('[webhook/tawk] Sem email, ignorando');
      return res.json({ status: 'ignored', reason: 'no email' });
    }

    if (!DINAMIZE_EMAIL || !DINAMIZE_PASSWORD) {
      return res.status(500).json({ error: 'Credenciais Dinamize nao configuradas' });
    }

    await addContactToDinamize(nome, email, telefone);
    res.json({ status: 'ok', email });
  } catch (err) {
    console.error('[webhook/tawk] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  // Keep-alive: ping a cada 14 minutos para evitar sleep no Render free tier
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try {
      const r = await fetch(`${RENDER_URL}/api/healthz`);
      console.log(`[keep-alive] ping ok: ${r.status}`);
    } catch (e) {
      console.log(`[keep-alive] ping falhou: ${e.message}`);
    }
  }, 14 * 60 * 1000);
});
