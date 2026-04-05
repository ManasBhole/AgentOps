package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"github.com/manasbhole/orion/api/internal/middleware"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true }, // dev: allow all origins
}

// POST /api/v1/warroom/:incidentID — open or get war room
func (h *Handlers) OpenWarRoom(c *gin.Context) {
	claims := middleware.GetClaims(c)
	room, err := h.warRoomService.GetOrCreate(c.Param("incidentID"), claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	msgs, _ := h.warRoomService.ListMessages(room.ID)
	tasks, _ := h.warRoomService.ListTasks(room.ID)
	c.JSON(http.StatusOK, gin.H{"room": room, "messages": msgs, "tasks": tasks})
}

// GET /api/v1/warroom/:incidentID/ws — WebSocket upgrade
func (h *Handlers) WarRoomWS(c *gin.Context) {
	claims := middleware.GetClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthenticated"})
		return
	}

	room, err := h.warRoomService.GetByIncident(c.Param("incidentID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "war room not found — open it first"})
		return
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Error("ws upgrade failed", zap.Error(err))
		return
	}

	h.warRoomService.HandleWS(conn, room.ID,
		claims.UserID, claims.Email, claims.Name, claims.Role)
}

// POST /api/v1/warroom/:incidentID/messages
func (h *Handlers) PostWarRoomMessage(c *gin.Context) {
	claims := middleware.GetClaims(c)
	var req struct {
		Body    string `json:"body" binding:"required"`
		Kind    string `json:"kind"`
		TraceID string `json:"trace_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	room, err := h.warRoomService.GetByIncident(c.Param("incidentID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "war room not found"})
		return
	}
	kind := req.Kind
	if kind == "" {
		kind = "chat"
	}
	msg, err := h.warRoomService.PostMessage(room.ID,
		claims.UserID, claims.Email, claims.Role, kind, req.Body, req.TraceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, msg)
}

// POST /api/v1/warroom/:incidentID/tasks
func (h *Handlers) CreateWarRoomTask(c *gin.Context) {
	claims := middleware.GetClaims(c)
	var req struct {
		Title        string `json:"title" binding:"required"`
		AssignedTo   string `json:"assigned_to"`
		AssigneeName string `json:"assignee_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	room, err := h.warRoomService.GetByIncident(c.Param("incidentID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "war room not found"})
		return
	}
	task, err := h.warRoomService.CreateTask(room.ID, req.Title, req.AssignedTo, req.AssigneeName, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, task)
}

// PATCH /api/v1/warroom/:incidentID/tasks/:taskID/toggle
func (h *Handlers) ToggleWarRoomTask(c *gin.Context) {
	room, err := h.warRoomService.GetByIncident(c.Param("incidentID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "war room not found"})
		return
	}
	task, err := h.warRoomService.ToggleTask(c.Param("taskID"), room.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, task)
}
