package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm/clause"

	"github.com/manasbhole/orion/api/internal/database"
)

// promptMustJSON marshals v to a JSON string, returning "[]" on error.
func promptMustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "[]"
	}
	return string(b)
}

// GET /api/v1/prompts
func (h *Handlers) ListPrompts(c *gin.Context) {
	agentID := c.Query("agent_id")
	var prompts []database.PromptTemplate
	q := h.db.Order("name ASC, version DESC")
	if agentID != "" {
		q = q.Where("agent_id = ?", agentID)
	}
	q.Find(&prompts)
	if prompts == nil {
		prompts = []database.PromptTemplate{}
	}
	c.JSON(http.StatusOK, gin.H{"prompts": prompts, "total": len(prompts)})
}

// GET /api/v1/prompts/:id
func (h *Handlers) GetPrompt(c *gin.Context) {
	var p database.PromptTemplate
	if err := h.db.First(&p, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, p)
}

// GET /api/v1/prompts/:id/versions
func (h *Handlers) GetPromptVersions(c *gin.Context) {
	var p database.PromptTemplate
	if err := h.db.First(&p, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var versions []database.PromptTemplate
	h.db.Where("name = ?", p.Name).Order("version DESC").Find(&versions)
	c.JSON(http.StatusOK, gin.H{"versions": versions})
}

// POST /api/v1/prompts
func (h *Handlers) CreatePrompt(c *gin.Context) {
	var req struct {
		Name        string   `json:"name"    binding:"required"`
		Description string   `json:"description"`
		Content     string   `json:"content" binding:"required"`
		AgentID     string   `json:"agent_id"`
		Tags        []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if name already exists – if so, bump version
	var maxVersion int
	h.db.Model(&database.PromptTemplate{}).Where("name = ?", req.Name).Select("COALESCE(MAX(version), 0)").Scan(&maxVersion)

	createdBy := c.GetString("user_email")
	tags := promptMustJSON(req.Tags)

	p := database.PromptTemplate{
		ID:          "pmt_" + uuid.New().String()[:8],
		Name:        req.Name,
		Description: req.Description,
		Content:     req.Content,
		Version:     maxVersion + 1,
		AgentID:     req.AgentID,
		Tags:        tags,
		IsActive:    true,
		CreatedBy:   createdBy,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	if err := h.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, p)
}

// PUT /api/v1/prompts/:id  — creates a new version, keeping old one intact
func (h *Handlers) UpdatePrompt(c *gin.Context) {
	var existing database.PromptTemplate
	if err := h.db.First(&existing, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var req struct {
		Description string   `json:"description"`
		Content     string   `json:"content" binding:"required"`
		Tags        []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Find the highest version for this prompt name
	var maxVersion int
	h.db.Model(&database.PromptTemplate{}).Where("name = ?", existing.Name).Select("COALESCE(MAX(version), 0)").Scan(&maxVersion)

	createdBy := c.GetString("user_email")
	tags := promptMustJSON(req.Tags)

	newVersion := database.PromptTemplate{
		ID:          "pmt_" + uuid.New().String()[:8],
		Name:        existing.Name,
		Description: req.Description,
		Content:     req.Content,
		Version:     maxVersion + 1,
		AgentID:     existing.AgentID,
		Tags:        tags,
		IsActive:    true,
		CreatedBy:   createdBy,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	if err := h.db.Create(&newVersion).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, newVersion)
}

// DELETE /api/v1/prompts/:id
func (h *Handlers) DeletePrompt(c *gin.Context) {
	if err := h.db.Delete(&database.PromptTemplate{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": c.Param("id")})
}

// GET /api/v1/prompts/search?q=...
func (h *Handlers) SearchPrompts(c *gin.Context) {
	q := "%" + c.Query("q") + "%"
	var prompts []database.PromptTemplate
	h.db.Where("LOWER(name) LIKE LOWER(?) OR LOWER(content) LIKE LOWER(?)", q, q).
		Order("name ASC, version DESC").Limit(20).Find(&prompts)
	if prompts == nil {
		prompts = []database.PromptTemplate{}
	}
	c.JSON(http.StatusOK, gin.H{"prompts": prompts})
}
