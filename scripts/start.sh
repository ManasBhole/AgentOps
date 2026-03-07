#!/bin/bash

# AgentOps Quick Start Script

set -e

echo "🚀 Starting AgentOps..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start infrastructure services
echo "📦 Starting infrastructure services (PostgreSQL, Redis, OTLP Collector)..."
docker-compose up -d postgres redis otel-collector

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Build and run API
echo "🔨 Building API..."
cd api
go mod download
go build -o ../bin/agentops-api ./main.go
cd ..

echo "✅ AgentOps is ready!"
echo ""
echo "📊 API: http://localhost:8080"
echo "📈 Dashboard: cd dashboard && npm install && npm run dev"
echo ""
echo "To stop: docker-compose down"
