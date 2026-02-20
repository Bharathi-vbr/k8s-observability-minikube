# 🚀 Setup Complete Kubernetes Observability Stack

**Quick Summary:** Install Docker → kind → kubectl → Helm → Prometheus → Grafana → Port-forward → Access dashboards

---

## 📋 Prerequisites

- AWS EC2 Instance (t3.medium, Ubuntu 22.04)
- SSH key to connect
- Your existing repo with `k8s/deployment.yaml` and `k8s/service.yaml`
- Your built sample app Docker image

---

## 🔧 Setup Steps

### Step 1: Connect to EC2

```bash
ssh -i "your-key.pem" ubuntu@<YOUR_EC2_IP>
```

---

### Step 2: Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker run hello-world
```

---

### Step 3: Install kind

```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# Verify
kind --version
```

---

### Step 4: Install kubectl

```bash
curl -LO "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# Verify
kubectl version --client
```

---

### Step 5: Create kind Cluster

```bash
# Create config file
cat > kind-config.yaml << 'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
EOF

# Create cluster
kind create cluster --name obs --config kind-config.yaml

# Verify
kubectl get nodes
kubectl cluster-info
```

---

### Step 6: Build & Load Your Sample App Image

```bash
# Navigate to your sample app
cd ~/k8s-observability-minikube/sample-app

# Build Docker image
docker build -t sample-app:latest .

# Load into kind cluster
kind load docker-image sample-app:latest --name obs

# Verify image is in cluster
docker exec obs-control-plane crictl images | grep sample-app
```

---

### Step 7: Deploy Your App Using Existing YAML Files

```bash
# Navigate to your k8s directory
cd ~/k8s-observability-minikube/sample-app/k8s

# Apply your deployment and service
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# Verify deployment
kubectl get deployment -A
kubectl get pods -A
kubectl get svc -A
```

---

### Step 8: Install Helm

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Verify
helm version
```

---

### Step 9: Add Prometheus & Grafana Helm Repos

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Verify repos added
helm repo list
```

---

### Step 10: Create Observability Namespace

```bash
kubectl create namespace observability

# Verify
kubectl get namespaces
```

---

### Step 11: Install Prometheus

```bash
helm install prometheus prometheus-community/prometheus \
  -n observability \
  --set alertmanager.enabled=false \
  --set pushgateway.enabled=false \
  --set server.persistentVolume.enabled=false

# Wait for it to be ready
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/name=prometheus \
  -n observability \
  --timeout=300s

# Verify
kubectl get pods -n observability
kubectl get svc -n observability
```

**Check Prometheus targets:**
```bash
# Describe prometheus server service
kubectl describe svc -n observability prometheus-server
```

---

### Step 12: Install Grafana

```bash
helm install grafana grafana/grafana \
  -n observability \
  --set adminPassword=admin \
  --set service.type=ClusterIP

# Wait for it to be ready
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/name=grafana \
  -n observability \
  --timeout=300s

# Verify
kubectl get pods -n observability
kubectl get svc -n observability
```

**Get Grafana credentials (if needed):**
```bash
kubectl get secret grafana -n observability -o jsonpath="{.data.admin-password}" | base64 --decode; echo
```

---

### Step 13: Port-Forward Services (On EC2)

**Open 3 separate terminals on EC2 and run:**

**Terminal 1 - Prometheus:**
```bash
kubectl -n observability port-forward svc/prometheus-server 9090:80
# Output: Forwarding from 127.0.0.1:9090 -> 9090
```

**Terminal 2 - Grafana:**
```bash
kubectl -n observability port-forward svc/grafana 3000:80
# Output: Forwarding from 127.0.0.1:3000 -> 3000
```

**Terminal 3 - Sample App:**
```bash
kubectl -n <your-app-namespace> port-forward svc/<your-app-service> 8080:80
# Example if deployed in 'apps' namespace with service 'sample-app':
kubectl -n apps port-forward svc/sample-app 8080:80
# Output: Forwarding from 127.0.0.1:8080 -> 3000
```

---

### Step 14: SSH Tunnel from Local Machine

**On your laptop (local machine):**

```bash
ssh -i "your-key.pem" \
  -L 9090:localhost:9090 \
  -L 3000:localhost:3000 \
  -L 8080:localhost:8080 \
  -N ubuntu@<YOUR_EC2_IP>
```

This keeps SSH connection open and forwards all 3 ports.

---

### Step 15: Access Services in Browser

**Open your browser and go to:**

| Service | URL | Login |
|---------|-----|-------|
| **Prometheus** | http://localhost:9090 | None (public) |
| **Grafana** | http://localhost:3000 | admin/admin |
| **Sample App** | http://localhost:8080 | None (public) |

---

## 🎯 What You Should See

### Prometheus (http://localhost:9090)

1. Click **Status** → **Configuration** - See scrape config
2. Click **Status** → **Targets** - See all targets (should show your app as UP)
3. Click **Graph** - Query metrics:
   ```promql
   rate(http_requests_total[1m])
   ```

### Grafana (http://localhost:3000)

1. Login: admin/admin
2. Go to **Configuration** → **Data Sources**
3. Add Prometheus:
   - URL: `http://prometheus-server.observability.svc.cluster.local`
   - Click **Save & Test**
4. Create a dashboard:
   - Click **+ New Dashboard**
   - Click **Add Panel**
   - Select Prometheus as data source
   - Enter PromQL query: `http_requests_total`
   - Click **Apply**

### Sample App (http://localhost:8080)

1. Click **Success Request** - Generates successful requests
2. Click **Error Request** - Generates 5xx errors
3. Click **Load Test** - Generates 100 concurrent requests
4. Go to http://localhost:8080/metrics - See raw metrics

---

## 📊 Generate Traffic & View Metrics

### Generate Traffic from Sample App UI

```bash
# Or use curl to generate traffic programmatically
for i in {1..50}; do
  curl -s http://localhost:8080/api/data > /dev/null &
done
wait
```

### View Metrics in Prometheus

```bash
# Query total requests
curl -s "http://localhost:9090/api/v1/query?query=http_requests_total" | jq .

# Query request rate
curl -s "http://localhost:9090/api/v1/query?query=rate(http_requests_total[1m])" | jq .
```

---

## 🔍 Verify Everything is Working

### Check all pods are running

```bash
# Sample app
kubectl get pods -n apps

# Observability stack
kubectl get pods -n observability
```

### Check services

```bash
# Sample app service
kubectl get svc -n apps

# Prometheus and Grafana services
kubectl get svc -n observability
```

### View pod logs

```bash
# Sample app logs
kubectl logs -n apps -l app=sample-app

# Prometheus logs
kubectl logs -n observability -l app.kubernetes.io/name=prometheus

# Grafana logs
kubectl logs -n observability -l app.kubernetes.io/name=grafana
```

### Check Prometheus is scraping

```bash
# Access Prometheus pod
kubectl exec -it -n observability prometheus-server-xxxxx -- sh

# Inside pod, check metrics are being collected
curl -s http://localhost:9090/api/v1/query?query=up | head -20
exit
```

---

## 🛠️ Useful Commands Reference

### Kubernetes Commands

```bash
# Get all resources
kubectl get all -A

# Get resources in namespace
kubectl get all -n observability

# Describe resource
kubectl describe pod -n observability <pod-name>

# View logs
kubectl logs -n observability <pod-name>

# Follow logs
kubectl logs -f -n observability <pod-name>

# Port-forward
kubectl port-forward -n observability svc/grafana 3000:80

# Exec into pod
kubectl exec -it -n observability <pod-name> -- /bin/sh

# Delete resource
kubectl delete pod -n observability <pod-name>

# Scale deployment
kubectl scale deployment <name> --replicas=3 -n namespace
```

### Helm Commands

```bash
# List installed releases
helm list -n observability

# Get release info
helm get all -n observability prometheus

# Upgrade release
helm upgrade prometheus prometheus-community/prometheus -n observability

# Uninstall release
helm uninstall prometheus -n observability

# Search for chart
helm search repo prometheus-community

# Show chart values
helm show values prometheus-community/prometheus | head -50
```

### Docker/kind Commands

```bash
# Build image
docker build -t image-name:tag .

# Tag image
docker tag image-name:old-tag image-name:new-tag

# List images
docker images

# List containers
docker ps -a

# View logs
docker logs container-name

# kind: Create cluster
kind create cluster --name cluster-name

# kind: Delete cluster
kind delete cluster --name cluster-name

# kind: List clusters
kind get clusters

# kind: Load image
kind load docker-image image-name:tag --name cluster-name
```

---

## ⚠️ Troubleshooting

### Pod Not Running?

```bash
# Check pod status
kubectl describe pod -n namespace pod-name

# Check events
kubectl get events -n namespace

# Check logs
kubectl logs -n namespace pod-name
```

### Prometheus Not Scraping?

```bash
# Check Prometheus logs
kubectl logs -n observability -l app.kubernetes.io/name=prometheus

# Check targets (via http://localhost:9090/targets)
# Or access Prometheus pod directly:
kubectl exec -it -n observability prometheus-server-xxxxx -- cat /etc/prometheus/prometheus.yml
```

### Grafana Can't Connect to Prometheus?

```bash
# Test connectivity from Grafana pod
kubectl exec -it -n observability grafana-xxxxx -- bash
curl http://prometheus-server:80
exit

# Update data source URL to:
http://prometheus-server.observability.svc.cluster.local
```

### Port-Forward Not Working?

```bash
# Check if port-forward process is running
ps aux | grep port-forward

# Kill and restart
pkill -f port-forward
kubectl -n observability port-forward svc/grafana 3000:80
```

### No Metrics in Prometheus?

```bash
# Check if app is exposing metrics
kubectl port-forward -n apps svc/sample-app 3000:80
curl http://localhost:3000/metrics

# Check pod annotations (should have prometheus.io/scrape: "true")
kubectl describe pod -n apps sample-app-xxxxx

# Check service endpoints
kubectl get endpoints -n apps sample-app
```

---

## 📝 Quick Checklists

### After Installation

- [ ] Docker is running: `docker ps`
- [ ] kind cluster exists: `kind get clusters`
- [ ] kubectl connected: `kubectl cluster-info`
- [ ] Sample app pods running: `kubectl get pods -n apps`
- [ ] Prometheus pod running: `kubectl get pods -n observability`
- [ ] Grafana pod running: `kubectl get pods -n observability`
- [ ] Port-forwards active: `ps aux | grep port-forward`
- [ ] Can access http://localhost:3000 (Grafana)
- [ ] Can access http://localhost:9090 (Prometheus)
- [ ] Can access http://localhost:8080 (Sample App)

### Prometheus Checklist

- [ ] Targets page shows targets: http://localhost:9090/targets
- [ ] All targets show "UP" status
- [ ] Metrics are being scraped: http://localhost:9090/targets
- [ ] Can query metrics: http://localhost:9090/graph

### Grafana Checklist

- [ ] Can login with admin/admin
- [ ] Prometheus data source added
- [ ] Can run PromQL queries
- [ ] Dashboard with panels created
- [ ] Metrics showing in graphs

---

## 🎉 Success Indicators

✅ All pods running in both namespaces  
✅ All services have ClusterIP and endpoints  
✅ Prometheus scraping targets (UP status)  
✅ Grafana connected to Prometheus  
✅ Sample app generating metrics  
✅ Grafana dashboards showing metrics  
✅ Port-forwards working from local machine  

---

## 📞 Next Steps

1. **Create custom dashboards** in Grafana
2. **Set up alerting rules** in Prometheus
3. **Add persistent volumes** for data retention
4. **Install kube-prometheus-stack** for full monitoring
5. **Add Loki** for log aggregation
6. **Implement tracing** with Jaeger

---

## 📚 Resources

- **Kubernetes Docs:** https://kubernetes.io/docs/
- **Prometheus Docs:** https://prometheus.io/docs/
- **Grafana Docs:** https://grafana.com/docs/
- **kind Documentation:** https://kind.sigs.k8s.io/
- **Helm Documentation:** https://helm.sh/docs/

---

**Repository:** https://github.com/Bharathi-vbr/k8s-observability-minikube  
**Author:** Bharathi Bhumireddy  
**Last Updated:** 2026-02-20  
**Status:** Production Ready ✅
