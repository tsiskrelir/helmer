const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3003;
const BACKEND_URL = 'http://127.0.0.1:3002';

app.use(createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  pathFilter: ['/api', '/uploads'],
  on: {
    proxyRes: (proxyRes) => {
      proxyRes.headers['access-control-allow-origin'] = '*';
      proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
      proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization';
    }
  }
}));

app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/widget', express.static(path.join(__dirname, 'widget')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on port ${PORT}`);
  console.log(`Proxying /api and /uploads to ${BACKEND_URL}`);
});
