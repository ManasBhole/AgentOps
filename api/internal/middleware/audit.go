package middleware

import (
	"github.com/manasbhole/orion/api/internal/services"
	"github.com/gin-gonic/gin"
)

// AuditLogger emits one audit entry per request AFTER the handler runs,
// so it has access to the real status code. Only fires when a user is
// authenticated (claims present).
func AuditLogger(svc *services.AuditService) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next() // run handler first

		claims := GetClaims(c)
		if claims == nil {
			return // unauthenticated — skip
		}

		action, resource := services.ActionFromRequest(c.Request.Method, c.FullPath())

		svc.Log(services.LogParams{
			UserID:     claims.UserID,
			UserEmail:  claims.Email,
			UserRole:   claims.Role,
			Action:     action,
			Resource:   resource,
			Method:     c.Request.Method,
			Path:       c.Request.URL.Path,
			StatusCode: c.Writer.Status(),
			IPAddress:  c.ClientIP(),
			UserAgent:  c.Request.UserAgent(),
		})
	}
}
