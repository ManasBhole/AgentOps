package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/agentops/agentops/api/internal/middleware"
	"github.com/agentops/agentops/api/internal/services"
)

// POST /auth/login
func (h *Handlers) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	access, refresh, user, err := h.authService.Login(
		req.Email, req.Password,
		c.Request.UserAgent(),
		c.ClientIP(),
	)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  access,
		"refresh_token": refresh,
		"token_type":    "Bearer",
		"user": gin.H{
			"id":         user.ID,
			"email":      user.Email,
			"name":       user.Name,
			"role":       user.Role,
			"avatar_url": user.AvatarURL,
		},
	})
}

// POST /auth/logout
func (h *Handlers) Logout(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.RefreshToken != "" {
		_ = h.authService.Logout(req.RefreshToken)
	}
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// POST /auth/refresh
func (h *Handlers) RefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	access, err := h.authService.RefreshAccessToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "session expired, please log in again"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"access_token": access, "token_type": "Bearer"})
}

// GET /auth/me — returns the current user profile.
func (h *Handlers) Me(c *gin.Context) {
	claims := middleware.GetClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthenticated"})
		return
	}
	user, err := h.authService.GetUser(claims.UserID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// GET /auth/users — list all users (admin+owner only).
func (h *Handlers) ListUsers(c *gin.Context) {
	users, err := h.authService.ListUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, users)
}

// POST /auth/users — register a new user (admin+owner only).
func (h *Handlers) RegisterUser(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Name     string `json:"name" binding:"required"`
		Password string `json:"password" binding:"required,min=8"`
		Role     string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Only owners can grant owner role
	claims := middleware.GetClaims(c)
	if req.Role == "owner" && claims.Role != "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owners can create owner accounts"})
		return
	}

	validRoles := map[string]bool{"owner": true, "admin": true, "viewer": true, "agent-runner": true}
	if req.Role == "" || !validRoles[req.Role] {
		req.Role = "viewer"
	}

	user, err := h.authService.Register(req.Email, req.Name, req.Password, req.Role)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
		return
	}
	c.JSON(http.StatusCreated, user)
}

// CheckAccess answers RBAC queries for frontend enforcement.
// GET /auth/check-access?resource=agents&action=write
func (h *Handlers) CheckAccess(c *gin.Context) {
	claims := middleware.GetClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"allowed": false})
		return
	}
	resource := c.Query("resource")
	action := c.Query("action")
	allowed := services.CheckAccess(claims.Role, resource, action)
	c.JSON(http.StatusOK, gin.H{
		"allowed":  allowed,
		"role":     claims.Role,
		"resource": resource,
		"action":   action,
	})
}
