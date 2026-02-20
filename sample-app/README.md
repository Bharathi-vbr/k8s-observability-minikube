# Sample Observability App (Node.js + Prometheus)

A lightweight Node.js service instrumented with Prometheus metrics and request logging. This app is designed to generate traffic and metrics for a Kubernetes observability stack powered by Prometheus and Grafana.

The service exposes a `/metrics` endpoint compatible with Prometheus and includes a simple web UI to generate load and visualize observability data in Grafana dashboards.

---

## Features

- ✅ Express HTTP service
- ✅ Prometheus metrics via `prom-client`
- ✅ Default Node.js runtime metrics
- ✅ Custom HTTP request metrics
- ✅ `/metrics` endpoint for Prometheus scraping
- ✅ Timestamped request logs
- ✅ Demo UI to generate traffic
- ✅ Health check endpoint
- ✅ Kubernetes-ready deployment

---

## Metrics Instrumentation

The application uses the `prom-client` library to expose Prometheus metrics.

### Default Metrics

Exports Node.js process metrics such as:

- CPU usage
- Memory usage
- Event loop lag
- Garbage collection activity
- Process uptime

Enabled via:

```js
promClient.collectDefaultMetrics()
