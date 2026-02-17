const express = require('express');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------- Prometheus Setup ---------------- */

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// Timestamp metric (updates whenever /metrics is requested)
const metricsGeneratedTs = new promClient.Gauge({
  name: 'app_metrics_generated_timestamp_seconds',
  help: 'Unix timestamp when /metrics response was generated',
  registers: [register],
});

/* ---------------- Logging (with timestamps) ---------------- */

// Logs every request with timestamp + latency
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

/* ---------------- Metrics Middleware ---------------- */

app.use((req, res, next) => {
  const endTimer = httpRequestDuration.startTimer({
    method: req.method,
    route: req.path,
  });

  res.on('finish', () => {
    httpRequestCounter.inc({
      method: req.method,
      route: req.path,
      status: res.statusCode,
    });
    endTimer();
  });

  next();
});

/* ---------------- Routes ---------------- */

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Observability Demo App</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 760px; margin: 60px auto; padding: 0 18px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
          h1 { margin: 0 0 8px; }
          p { margin: 8px 0; color: #374151; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
          button { padding: 12px 16px; border-radius: 10px; border: 0; cursor: pointer; font-size: 15px; }
          button:active { transform: scale(0.99); }
          .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
          .muted { color: #6b7280; font-size: 13px; }
          pre { background: #0b1020; color: #e5e7eb; padding: 12px; border-radius: 10px; overflow: auto; }
          a { color: #2563eb; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🚀 Observability Demo App</h1>
          <p>This service exposes Prometheus metrics at <code>/metrics</code>.</p>
          <p class="muted">Use the buttons to generate traffic and see Grafana charts move.</p>

          <div class="row">
            <button onclick="hitOnce()">Call /api once</button>
            <button onclick="hitBurst()">Burst (25 requests)</button>
            <button onclick="openMetrics()">Open /metrics</button>
          </div>

          <p id="status" class="muted" style="margin-top:14px;"></p>
          <pre id="output"></pre>

          <p class="muted">
            Quick links:
            <a href="/health" target="_blank">/health</a> ·
            <a href="/metrics" target="_blank">/metrics</a>
          </p>
        </div>

        <script>
          const statusEl = document.getElementById('status');
          const outEl = document.getElementById('output');

          function setStatus(msg) { statusEl.textContent = msg; }
          function setOutput(obj) { outEl.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2); }

          async function hitOnce() {
            setStatus('Calling /api ...');
            try {
              const res = await fetch('/api');
              const data = await res.json();
              setOutput(data);
              setStatus('Done ✅ (1 request)');
            } catch (e) {
              setOutput(String(e));
              setStatus('Failed ❌');
            }
          }

          async function hitBurst() {
            const n = 25;
            setStatus('Sending burst ...');
            const started = Date.now();
            try {
              await Promise.all(Array.from({length: n}, () => fetch('/api')));
              const ms = Date.now() - started;
              setOutput({ message: 'Burst complete', requests: n, duration_ms: ms });
              setStatus('Done ✅ (' + n + ' requests)');
            } catch (e) {
              setOutput(String(e));
              setStatus('Failed ❌');
            }
          }

          function openMetrics() {
            window.open('/metrics', '_blank');
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/api', (req, res) => {
  res.json({
    message: 'API response',
    time: new Date().toISOString(),
    random: Math.floor(Math.random() * 1000),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/metrics', async (req, res) => {
  // Update timestamp metric at generation time
  metricsGeneratedTs.set(Date.now() / 1000);

  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

/* ---------------- Start Server ---------------- */

console.log(`[${new Date().toISOString()}] Starting app...`);
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Sample app running on port ${PORT}`);
});
