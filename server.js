const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TINY_API_TOKEN = process.env.TINY_API_TOKEN;

app.use(cors());
app.use(express.json());

app.get('/api/pedidos', async (req, res) => {
  const { cliente } = req.query;

  if (!TINY_API_TOKEN) {
    return res.status(500).json({ error: 'TINY_API_TOKEN nao configurado' });
  }

  try {
    const url = new URL('https://api.tiny.com.br/api2/pedidos.pesquisa.php');
    url.searchParams.set('token', TINY_API_TOKEN);
    url.searchParams.set('formato', 'json');
    if (cliente) url.searchParams.set('cliente', cliente);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

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
    console.error('Erro ao chamar Tiny API:', err.message);
    res.status(502).json({ error: 'Erro ao conectar com a Tiny API' });
  }
});

app.get('/api/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`GET http://localhost:${PORT}/api/pedidos?cliente=NOME`);
});
