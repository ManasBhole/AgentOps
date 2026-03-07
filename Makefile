.PHONY: build run test clean docker-build docker-up docker-down

# Build the API
build:
	cd api && go build -o ../bin/agentops-api ./main.go

# Run the API locally
run: build
	./bin/agentops-api

# Run tests
test:
	cd api && go test ./...
	cd sdk && go test ./...

# Clean build artifacts
clean:
	rm -rf bin/
	cd api && go clean
	cd sdk && go clean

# Build Docker image
docker-build:
	docker build -t agentops-api:latest .

# Start Docker Compose services
docker-up:
	docker-compose up -d

# Stop Docker Compose services
docker-down:
	docker-compose down

# Install dependencies
deps:
	cd api && go mod download && go mod tidy
	cd sdk && go mod download && go mod tidy

# Run database migrations
migrate:
	cd api && go run main.go migrate

# Format code
fmt:
	cd api && go fmt ./...
	cd sdk && go fmt ./...

# Lint code
lint:
	cd api && golangci-lint run
	cd sdk && golangci-lint run
