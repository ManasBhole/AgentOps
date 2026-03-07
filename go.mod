module github.com/ManasBhole/AgentOps

go 1.21



require (
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.5.0
	go.opentelemetry.io/otel v1.21.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.21.0
	go.opentelemetry.io/otel/sdk v1.21.0
	go.opentelemetry.io/otel/trace v1.21.0
	go.uber.org/zap v1.26.0
	gorm.io/driver/postgres v1.5.4
	gorm.io/gorm v1.25.5
	github.com/lib/pq v1.10.9
	github.com/redis/go-redis/v9 v9.3.0
	github.com/prometheus/client_golang v1.18.0
	k8s.io/client-go v0.29.0
	k8s.io/api v0.29.0
	k8s.io/apimachinery v0.29.0
)
