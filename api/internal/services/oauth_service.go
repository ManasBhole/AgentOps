package services

import (
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
	"gorm.io/gorm"

	"github.com/manasbhole/orion/api/internal/config"
	"github.com/manasbhole/orion/api/internal/database"
)

// OAuthUserInfo is the normalised user profile returned by any provider.
type OAuthUserInfo struct {
	ProviderUserID string
	Email          string
	Name           string
	AvatarURL      string
}

// OAuthService handles provider OAuth flows and account linking.
type OAuthService struct {
	db     *gorm.DB
	logger *zap.Logger
	cfg    *config.Config
}

func NewOAuthService(db *gorm.DB, logger *zap.Logger, cfg *config.Config) *OAuthService {
	return &OAuthService{db: db, logger: logger, cfg: cfg}
}

// ── Provider configs ──────────────────────────────────────────────────────────

func (s *OAuthService) googleConfig(callbackURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.cfg.GoogleClientID,
		ClientSecret: s.cfg.GoogleClientSecret,
		RedirectURL:  callbackURL,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func (s *OAuthService) githubConfig(callbackURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.cfg.GitHubClientID,
		ClientSecret: s.cfg.GitHubClientSecret,
		RedirectURL:  callbackURL,
		Scopes:       []string{"user:email", "read:user"},
		Endpoint:     github.Endpoint,
	}
}

func (s *OAuthService) linkedinConfig(callbackURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.cfg.LinkedInClientID,
		ClientSecret: s.cfg.LinkedInClientSecret,
		RedirectURL:  callbackURL,
		Scopes:       []string{"openid", "profile", "email"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://www.linkedin.com/oauth/v2/authorization",
			TokenURL: "https://www.linkedin.com/oauth/v2/accessToken",
		},
	}
}

func (s *OAuthService) twitterConfig(callbackURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.cfg.TwitterClientID,
		ClientSecret: s.cfg.TwitterClientSecret,
		RedirectURL:  callbackURL,
		Scopes:       []string{"tweet.read", "users.read"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://twitter.com/i/oauth2/authorize",
			TokenURL: "https://api.twitter.com/2/oauth2/token",
		},
	}
}

// ── AuthURL generation ────────────────────────────────────────────────────────

// AuthURL returns the redirect URL for a given provider + state token.
func (s *OAuthService) AuthURL(provider, callbackURL, state string) (string, error) {
	cfg, err := s.providerConfig(provider, callbackURL)
	if err != nil {
		return "", err
	}
	if provider == "apple" {
		return s.appleAuthURL(callbackURL, state), nil
	}
	return cfg.AuthCodeURL(state, oauth2.AccessTypeOnline), nil
}

func (s *OAuthService) providerConfig(provider, callbackURL string) (*oauth2.Config, error) {
	switch provider {
	case "google":
		return s.googleConfig(callbackURL), nil
	case "github":
		return s.githubConfig(callbackURL), nil
	case "linkedin":
		return s.linkedinConfig(callbackURL), nil
	case "twitter":
		return s.twitterConfig(callbackURL), nil
	case "apple":
		return nil, nil // apple uses custom flow
	}
	return nil, fmt.Errorf("unknown provider: %s", provider)
}

// ── Token exchange + user info ────────────────────────────────────────────────

// ExchangeAndGetUser exchanges the code for a token and fetches the user profile.
func (s *OAuthService) ExchangeAndGetUser(ctx context.Context, provider, code, callbackURL, codeVerifier string) (*OAuthUserInfo, error) {
	switch provider {
	case "google":
		return s.googleUser(ctx, code, callbackURL)
	case "github":
		return s.githubUser(ctx, code, callbackURL)
	case "linkedin":
		return s.linkedinUser(ctx, code, callbackURL)
	case "twitter":
		return s.twitterUser(ctx, code, callbackURL, codeVerifier)
	case "apple":
		return s.appleUser(ctx, code, callbackURL)
	}
	return nil, fmt.Errorf("unknown provider: %s", provider)
}

func (s *OAuthService) googleUser(ctx context.Context, code, callbackURL string) (*OAuthUserInfo, error) {
	cfg := s.googleConfig(callbackURL)
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return nil, err
	}
	client := cfg.Client(ctx, tok)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v3/userinfo")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var u struct {
		Sub     string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, err
	}
	return &OAuthUserInfo{ProviderUserID: u.Sub, Email: u.Email, Name: u.Name, AvatarURL: u.Picture}, nil
}

func (s *OAuthService) githubUser(ctx context.Context, code, callbackURL string) (*OAuthUserInfo, error) {
	cfg := s.githubConfig(callbackURL)
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return nil, err
	}
	client := cfg.Client(ctx, tok)

	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var u struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, err
	}
	name := u.Name
	if name == "" {
		name = u.Login
	}
	email := u.Email
	if email == "" {
		// Fetch primary email separately
		email = s.githubPrimaryEmail(ctx, client)
	}
	return &OAuthUserInfo{ProviderUserID: fmt.Sprintf("%d", u.ID), Email: email, Name: name, AvatarURL: u.AvatarURL}, nil
}

func (s *OAuthService) githubPrimaryEmail(ctx context.Context, client *http.Client) string {
	resp, err := client.Get("https://api.github.com/user/emails")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var emails []struct {
		Email   string `json:"email"`
		Primary bool   `json:"primary"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return ""
	}
	for _, e := range emails {
		if e.Primary {
			return e.Email
		}
	}
	if len(emails) > 0 {
		return emails[0].Email
	}
	return ""
}

func (s *OAuthService) linkedinUser(ctx context.Context, code, callbackURL string) (*OAuthUserInfo, error) {
	cfg := s.linkedinConfig(callbackURL)
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return nil, err
	}
	client := cfg.Client(ctx, tok)
	resp, err := client.Get("https://api.linkedin.com/v2/userinfo")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var u struct {
		Sub     string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, err
	}
	return &OAuthUserInfo{ProviderUserID: u.Sub, Email: u.Email, Name: u.Name, AvatarURL: u.Picture}, nil
}

func (s *OAuthService) twitterUser(ctx context.Context, code, callbackURL, _ string) (*OAuthUserInfo, error) {
	cfg := s.twitterConfig(callbackURL)
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return nil, err
	}
	client := cfg.Client(ctx, tok)
	resp, err := client.Get("https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result struct {
		Data struct {
			ID              string `json:"id"`
			Name            string `json:"name"`
			Username        string `json:"username"`
			ProfileImageURL string `json:"profile_image_url"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	u := result.Data
	// Twitter OAuth 2.0 doesn't return email without special scope; use placeholder
	email := u.Username + "@twitter.placeholder"
	return &OAuthUserInfo{ProviderUserID: u.ID, Email: email, Name: u.Name, AvatarURL: u.ProfileImageURL}, nil
}

// ── Apple Sign In ─────────────────────────────────────────────────────────────

func (s *OAuthService) appleAuthURL(callbackURL, state string) string {
	params := url.Values{}
	params.Set("client_id", s.cfg.AppleClientID)
	params.Set("redirect_uri", callbackURL)
	params.Set("response_type", "code")
	params.Set("response_mode", "form_post")
	params.Set("scope", "name email")
	params.Set("state", state)
	return "https://appleid.apple.com/auth/authorize?" + params.Encode()
}

func (s *OAuthService) appleUser(ctx context.Context, code, callbackURL string) (*OAuthUserInfo, error) {
	if s.cfg.ApplePrivateKey == "" {
		return nil, fmt.Errorf("Apple Sign In not configured: APPLE_PRIVATE_KEY missing")
	}
	clientSecret, err := s.appleClientSecret()
	if err != nil {
		return nil, fmt.Errorf("apple client secret: %w", err)
	}

	// Exchange code for token
	data := url.Values{}
	data.Set("client_id", s.cfg.AppleClientID)
	data.Set("client_secret", clientSecret)
	data.Set("code", code)
	data.Set("grant_type", "authorization_code")
	data.Set("redirect_uri", callbackURL)

	resp, err := http.PostForm("https://appleid.apple.com/auth/token", data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var tokenResp struct {
		IDToken string `json:"id_token"`
		Error   string `json:"error"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, err
	}
	if tokenResp.Error != "" {
		return nil, fmt.Errorf("apple token error: %s", tokenResp.Error)
	}

	// Parse id_token claims (no verification needed — Apple signs it)
	parts := strings.Split(tokenResp.IDToken, ".")
	if len(parts) < 2 {
		return nil, fmt.Errorf("invalid apple id_token")
	}
	claimsJSON, err := jwt.NewParser().DecodeSegment(parts[1])
	if err != nil {
		return nil, err
	}
	var claims struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
	}
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, err
	}
	return &OAuthUserInfo{ProviderUserID: claims.Sub, Email: claims.Email, Name: ""}, nil
}

func (s *OAuthService) appleClientSecret() (string, error) {
	block, _ := pem.Decode([]byte(s.cfg.ApplePrivateKey))
	if block == nil {
		return "", fmt.Errorf("invalid PEM block")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return "", err
	}
	ecKey, ok := key.(*ecdsa.PrivateKey)
	if !ok {
		return "", fmt.Errorf("not an EC key")
	}

	now := time.Now()
	claims := jwt.RegisteredClaims{
		Issuer:    s.cfg.AppleTeamID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute)),
		Audience:  jwt.ClaimStrings{"https://appleid.apple.com"},
		Subject:   s.cfg.AppleClientID,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = s.cfg.AppleKeyID
	return token.SignedString(ecKey)
}

// ── Account linking / user creation ─────────────────────────────────────────

// FindOrCreateUser finds an existing user by OAuth account or email, or creates a new one.
func (s *OAuthService) FindOrCreateUser(provider string, info *OAuthUserInfo) (*database.User, error) {
	// 1. Look for existing OAuth account link
	var existing database.OAuthAccount
	err := s.db.Where("provider = ? AND provider_user_id = ?", provider, info.ProviderUserID).First(&existing).Error
	if err == nil {
		// Found — load the user
		var user database.User
		if err := s.db.First(&user, "id = ?", existing.UserID).Error; err != nil {
			return nil, err
		}
		// Update avatar if changed
		s.db.Model(&existing).Updates(map[string]any{"email": info.Email, "name": info.Name, "avatar_url": info.AvatarURL, "updated_at": time.Now()})
		return &user, nil
	}

	// 2. Look for existing user by email
	var user database.User
	if info.Email != "" {
		s.db.Where("email = ?", info.Email).First(&user)
	}

	if user.ID == "" {
		// 3. Create new user
		user = database.User{
			ID:        "usr_" + randomHex(8),
			Email:     info.Email,
			Name:      info.Name,
			Role:      "viewer",
			AvatarURL: info.AvatarURL,
			IsActive:  true,
			// No password — OAuth-only accounts get a random unusable hash
			PasswordHash: "$2a$10$" + randomHex(32),
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		if err := s.db.Create(&user).Error; err != nil {
			return nil, err
		}
	}

	// 4. Link the OAuth account
	s.db.Create(&database.OAuthAccount{
		ID:             "oa_" + randomHex(8),
		UserID:         user.ID,
		Provider:       provider,
		ProviderUserID: info.ProviderUserID,
		Email:          info.Email,
		Name:           info.Name,
		AvatarURL:      info.AvatarURL,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	})

	return &user, nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)[:n]
}
