# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /build

# Copy go mod files
COPY api/go.mod api/go.sum ./
RUN go mod download

# Copy source
COPY api/ .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o agentops-api .

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /build/agentops-api .

EXPOSE 8080

CMD ["./agentops-api"]
