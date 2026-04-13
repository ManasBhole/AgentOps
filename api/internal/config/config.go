package config

import (
	"os"
)

type Config struct {
	Port          string
	Environment   string
	DatabaseURL   string
	RedisURL      string
	CORSOrigins   []string
	OTLPEndpoint  string
	K8sConfigPath string
	JWTSecret     string
	LLMAPIKey     string
	FrontendURL   string
	// OAuth providers
	GoogleClientID       string
	GoogleClientSecret   string
	GitHubClientID       string
	GitHubClientSecret   string
	LinkedInClientID     string
	LinkedInClientSecret string
	TwitterClientID      string
	TwitterClientSecret  string
	AppleClientID        string
	AppleTeamID          string
	AppleKeyID           string
	ApplePrivateKey      string
}

func Load() *Config {
	return &Config{
		Port:                 getEnv("PORT", "8080"),
		Environment:          getEnv("ENVIRONMENT", "development"),
		DatabaseURL:          getEnv("DATABASE_URL", "postgres://manasbhole@localhost:5432/orion?sslmode=disable"),
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379"),
		CORSOrigins:          getEnvSlice("CORS_ORIGINS", []string{"*"}),
		OTLPEndpoint:         getEnv("OTLP_ENDPOINT", "localhost:4317"),
		K8sConfigPath:        getEnv("K8S_CONFIG_PATH", ""),
		JWTSecret:            getEnv("JWT_SECRET", "change-me-in-production-use-32-chars-min"),
		LLMAPIKey:            getEnv("LLM_API_KEY", ""),
		FrontendURL:          getEnv("FRONTEND_URL", "http://localhost:5173"),
		GoogleClientID:       getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:   getEnv("GOOGLE_CLIENT_SECRET", ""),
		GitHubClientID:       getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret:   getEnv("GITHUB_CLIENT_SECRET", ""),
		LinkedInClientID:     getEnv("LINKEDIN_CLIENT_ID", ""),
		LinkedInClientSecret: getEnv("LINKEDIN_CLIENT_SECRET", ""),
		TwitterClientID:      getEnv("TWITTER_CLIENT_ID", ""),
		TwitterClientSecret:  getEnv("TWITTER_CLIENT_SECRET", ""),
		AppleClientID:        getEnv("APPLE_CLIENT_ID", ""),
		AppleTeamID:          getEnv("APPLE_TEAM_ID", ""),
		AppleKeyID:           getEnv("APPLE_KEY_ID", ""),
		ApplePrivateKey:      getEnv("APPLE_PRIVATE_KEY", ""),
	}
}

func (c *Config) BackendURL() string {
	if c.Environment == "production" {
		return getEnv("BACKEND_URL", "https://orion-api-4ghj.onrender.com")
	}
	return "http://localhost:" + c.Port
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
