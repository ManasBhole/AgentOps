package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/manasbhole/orion/api/internal/services"
)

const claimsKey = "auth_claims"

// RequireAuth validates the Bearer JWT and sets auth claims in the gin context.
func RequireAuth(authSvc *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims, err := authSvc.ValidateAccessToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set(claimsKey, claims)
		c.Next()
	}
}

// RequireRole returns a middleware that gates access to a specific RBAC resource+action.
// It must run after RequireAuth.
func RequireRole(resource, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := GetClaims(c)
		if claims == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthenticated"})
			return
		}
		if !services.CheckAccess(claims.Role, resource, action) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":    "insufficient permissions",
				"required": resource + ":" + action,
				"role":     claims.Role,
			})
			return
		}
		c.Next()
	}
}

// GetClaims retrieves the auth claims injected by RequireAuth.
func GetClaims(c *gin.Context) *services.AuthClaims {
	v, exists := c.Get(claimsKey)
	if !exists {
		return nil
	}
	claims, _ := v.(*services.AuthClaims)
	return claims
}
