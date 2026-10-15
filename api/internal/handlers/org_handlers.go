package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/manasbhole/orion/api/internal/middleware"
)

// GET /auth/orgs — organizations the caller belongs to, with the active one flagged.
func (h *Handlers) ListMyOrgs(c *gin.Context) {
	claims := middleware.GetClaims(c)
	orgs, err := h.orgService.ListUserOrgs(claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	type orgOut struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Slug     string `json:"slug"`
		PlanTier string `json:"plan_tier"`
		Role     string `json:"role"`
		Active   bool   `json:"active"`
	}
	out := make([]orgOut, 0, len(orgs))
	for _, o := range orgs {
		out = append(out, orgOut{ID: o.ID, Name: o.Name, Slug: o.Slug, PlanTier: o.PlanTier, Role: o.Role, Active: o.ID == claims.OrgID})
	}
	c.JSON(http.StatusOK, gin.H{"organizations": out})
}

// POST /auth/orgs — create a new organization and switch into it.
func (h *Handlers) CreateMyOrg(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claims := middleware.GetClaims(c)
	org, err := h.orgService.CreateOrganization(claims.UserID, req.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, h.reissueForActiveOrg(c, claims.UserID, org.ID))
}

// POST /auth/switch-org — switch active org and re-issue tokens carrying the new org role.
func (h *Handlers) SwitchOrg(c *gin.Context) {
	var req struct {
		OrgID string `json:"org_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claims := middleware.GetClaims(c)
	if _, err := h.orgService.SwitchActiveOrg(claims.UserID, req.OrgID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	resp, status := h.reissueTokens(c, claims.UserID)
	c.JSON(status, resp)
}

// reissueForActiveOrg switches the user into orgID then re-issues tokens.
func (h *Handlers) reissueForActiveOrg(c *gin.Context, userID, orgID string) gin.H {
	if _, err := h.orgService.SwitchActiveOrg(userID, orgID); err != nil {
		return gin.H{"error": err.Error()}
	}
	resp, _ := h.reissueTokens(c, userID)
	return resp
}

func (h *Handlers) reissueTokens(c *gin.Context, userID string) (gin.H, int) {
	user, err := h.authService.GetUser(userID)
	if err != nil {
		return gin.H{"error": "user not found"}, http.StatusNotFound
	}
	access, refresh, err := h.authService.IssueTokensForUser(user, c.Request.UserAgent(), c.ClientIP())
	if err != nil {
		return gin.H{"error": "failed to issue session"}, http.StatusInternalServerError
	}
	return gin.H{
		"access_token": access, "refresh_token": refresh, "token_type": "Bearer",
		"user": gin.H{"id": user.ID, "email": user.Email, "name": user.Name, "role": user.Role, "avatar_url": user.AvatarURL},
	}, http.StatusOK
}

// GET /api/v1/org — the caller's active organization.
func (h *Handlers) GetMyOrg(c *gin.Context) {
	claims := middleware.GetClaims(c)
	if claims.OrgID == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active organization"})
		return
	}
	orgs, err := h.orgService.ListUserOrgs(claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, o := range orgs {
		if o.ID == claims.OrgID {
			c.JSON(http.StatusOK, o)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
}

// GET /api/v1/org/members
func (h *Handlers) ListOrgMembers(c *gin.Context) {
	claims := middleware.GetClaims(c)
	members, err := h.orgService.ListMembers(claims.OrgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"members": members})
}

// PATCH /api/v1/org/members/:userID  { role }
func (h *Handlers) UpdateOrgMemberRole(c *gin.Context) {
	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	validRoles := map[string]bool{"owner": true, "admin": true, "viewer": true, "agent-runner": true}
	if !validRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	claims := middleware.GetClaims(c)
	if err := h.orgService.UpdateMemberRole(claims.OrgID, c.Param("userID"), req.Role); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// DELETE /api/v1/org/members/:userID
func (h *Handlers) RemoveOrgMember(c *gin.Context) {
	claims := middleware.GetClaims(c)
	if err := h.orgService.RemoveMember(claims.OrgID, c.Param("userID")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "removed"})
}

// GET /api/v1/org/usage
func (h *Handlers) GetOrgUsage(c *gin.Context) {
	claims := middleware.GetClaims(c)
	usage, err := h.orgService.GetUsage(claims.OrgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, usage)
}

// PATCH /api/v1/org/plan  { plan_tier }
func (h *Handlers) UpdateOrgPlan(c *gin.Context) {
	var req struct {
		PlanTier string `json:"plan_tier" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claims := middleware.GetClaims(c)
	org, err := h.orgService.UpdatePlan(claims.OrgID, req.PlanTier)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, org)
}
