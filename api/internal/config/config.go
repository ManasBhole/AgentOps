package config

import (
	"os"
)

type Config struct {
	Port             string
	Environment      string
	DatabaseURL      string
	RedisURL         string
	CORSOrigins      []string
	OTLPEndpoint     string
	K8sConfigPath    string
	JWTSecret        string
	LLMAPIKey  string
}

func Load() *Config {
	return &Config{
		Port:          getEnv("PORT", "8080"),
		Environment:   getEnv("ENVIRONMENT", "development"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://manasbhole@localhost:5432/orion?sslmode=disable"),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6379"),
		CORSOrigins:   getEnvSlice("CORS_ORIGINS", []string{"*"}),
		OTLPEndpoint:  getEnv("OTLP_ENDPOINT", "localhost:4317"),
		K8sConfigPath: getEnv("K8S_CONFIG_PATH", ""),
		JWTSecret:        getEnv("JWT_SECRET", "change-me-in-production-use-32-chars-min"),
		LLMAPIKey:  getEnv("LLM_API_KEY", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		return []string{value}
	}
	return defaultValue
}
