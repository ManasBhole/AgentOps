package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
)

var validProviders = map[string]bool{
	"google": true, "github": true, "linkedin": true, "twitter": true, "apple": true,
}

// GET /auth/oauth/:provider
// Redirects the browser to the provider's OAuth consent screen.
func (h *Handlers) OAuthRedirect(c *gin.Context) {
	provider := c.Param("provider")
	if !validProviders[provider] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown provider"})
		return
	}

	state := randomState()
	// Store state + code verifier in a short-lived cookie for CSRF protection
	c.SetCookie("oauth_state", state, 600, "/", "", false, true)

	callbackURL := h.cfg.BackendURL() + "/auth/oauth/" + provider + "/callback"
	authURL, err := h.oauthService.AuthURL(provider, callbackURL, state)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "provider not configured: " + err.Error()})
		return
	}
	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

// GET /auth/oauth/:provider/callback  (also POST for Apple form_post)
func (h *Handlers) OAuthCallback(c *gin.Context) {
	provider := c.Param("provider")
	if !validProviders[provider] {
		h.oauthError(c, "unknown provider")
		return
	}

	// Validate state
	storedState, _ := c.Cookie("oauth_state")
	incomingState := c.Query("state")
	if c.Request.Method == "POST" {
		incomingState = c.PostForm("state")
	}
	if storedState == "" || storedState != incomingState {
		h.oauthError(c, "invalid state — possible CSRF")
		return
	}
	c.SetCookie("oauth_state", "", -1, "/", "", false, true) // clear

	code := c.Query("code")
	if c.Request.Method == "POST" {
		code = c.PostForm("code")
	}
	if code == "" {
		h.oauthError(c, "missing code from provider")
		return
	}

	callbackURL := h.cfg.BackendURL() + "/auth/oauth/" + provider + "/callback"
	info, err := h.oauthService.ExchangeAndGetUser(c.Request.Context(), provider, code, callbackURL, storedState)
	if err != nil {
		h.oauthError(c, fmt.Sprintf("failed to fetch user from %s: %v", provider, err))
		return
	}

	user, err := h.oauthService.FindOrCreateUser(provider, info)
	if err != nil {
		h.oauthError(c, "failed to create user: "+err.Error())
		return
	}

	// Issue tokens using the existing auth service
	accessToken, refreshToken, err := h.authService.IssueTokensForUser(user, c.Request.UserAgent(), c.ClientIP())
	if err != nil {
		h.oauthError(c, "token generation failed")
		return
	}

	now := time.Now()
	h.db.Model(user).Update("last_login_at", &now)

	// Redirect to frontend with tokens in the URL fragment
	// The frontend reads them from the hash and stores in localStorage
	frontendURL := h.cfg.FrontendURL
	redirectTo := frontendURL + "/oauth/callback#" + url.Values{
		"access_token":  {accessToken},
		"refresh_token": {refreshToken},
		"user_id":       {user.ID},
		"email":         {user.Email},
		"name":          {user.Name},
		"avatar_url":    {user.AvatarURL},
		"role":          {user.Role},
	}.Encode()

	c.Redirect(http.StatusTemporaryRedirect, redirectTo)
}

func (h *Handlers) oauthError(c *gin.Context, msg string) {
	frontendURL := h.cfg.FrontendURL
	c.Redirect(http.StatusTemporaryRedirect, frontendURL+"/login?error="+url.QueryEscape(msg))
}

func randomState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

// GET /auth/oauth/providers — returns which providers are configured
func (h *Handlers) ListOAuthProviders(c *gin.Context) {
	configured := map[string]bool{}
	configured["google"] = h.cfg.GoogleClientID != ""
	configured["github"] = h.cfg.GitHubClientID != ""
	configured["linkedin"] = h.cfg.LinkedInClientID != ""
	configured["twitter"] = h.cfg.TwitterClientID != ""
	configured["apple"] = h.cfg.AppleClientID != ""
	c.JSON(http.StatusOK, gin.H{"providers": configured})
}
