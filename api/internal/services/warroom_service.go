package services

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/manasbhole/orion/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// ── WS Message types ──────────────────────────────────────────────────────────

type WSMessage struct {
	Type    string         `json:"type"`
	Payload map[string]any `json:"payload"`
}

// ── Client ────────────────────────────────────────────────────────────────────

type WRClient struct {
	RoomID    string
	UserID    string
	UserEmail string
	UserName  string
	UserRole  string
	conn      *websocket.Conn
	send      chan []byte
}

func (c *WRClient) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

// ── Room ──────────────────────────────────────────────────────────────────────

type WRRoom struct {
	id      string
	clients map[*WRClient]bool
	mu      sync.RWMutex
}

func (r *WRRoom) broadcast(msg []byte, exclude *WRClient) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for c := range r.clients {
		if c == exclude {
			continue
		}
		select {
		case c.send <- msg:
		default:
			close(c.send)
			delete(r.clients, c)
		}
	}
}

func (r *WRRoom) presence() []map[string]any {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]map[string]any, 0, len(r.clients))
	for c := range r.clients {
		out = append(out, map[string]any{
			"user_id":    c.UserID,
			"user_email": c.UserEmail,
			"user_name":  c.UserName,
			"user_role":  c.UserRole,
		})
	}
	return out
}

// ── Hub ───────────────────────────────────────────────────────────────────────

type WarRoomHub struct {
	rooms map[string]*WRRoom
	mu    sync.RWMutex
}

var globalWRHub = &WarRoomHub{rooms: make(map[string]*WRRoom)}

func GetWarRoomHub() *WarRoomHub { return globalWRHub }

func (h *WarRoomHub) getOrCreate(roomID string) *WRRoom {
	h.mu.Lock()
	defer h.mu.Unlock()
	if r, ok := h.rooms[roomID]; ok {
		return r
	}
	r := &WRRoom{id: roomID, clients: make(map[*WRClient]bool)}
	h.rooms[roomID] = r
	return r
}

func (h *WarRoomHub) Join(c *WRClient) {
	room := h.getOrCreate(c.RoomID)
	room.mu.Lock()
	room.clients[c] = true
	room.mu.Unlock()

	// Broadcast join event to room
	msg := wsMsg("user.joined", map[string]any{
		"user_id":    c.UserID,
		"user_email": c.UserEmail,
		"user_name":  c.UserName,
		"user_role":  c.UserRole,
		"presence":   room.presence(),
	})
	room.broadcast(msg, c)

	// Send presence snapshot to the joining user
	snap := wsMsg("presence.snapshot", map[string]any{"presence": room.presence()})
	c.send <- snap
}

func (h *WarRoomHub) Leave(c *WRClient) {
	h.mu.RLock()
	room, ok := h.rooms[c.RoomID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	room.mu.Lock()
	delete(room.clients, c)
	close(c.send)
	room.mu.Unlock()

	msg := wsMsg("user.left", map[string]any{
		"user_id":  c.UserID,
		"presence": room.presence(),
	})
	room.broadcast(msg, nil)
}

func (h *WarRoomHub) BroadcastToRoom(roomID string, msg []byte, exclude *WRClient) {
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	room.broadcast(msg, exclude)
}

// ── Service ───────────────────────────────────────────────────────────────────

type WarRoomService struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *WarRoomHub
}

func NewWarRoomService(db *gorm.DB, logger *zap.Logger) *WarRoomService {
	return &WarRoomService{db: db, logger: logger, hub: GetWarRoomHub()}
}

// GetOrCreate returns the war room for an incident, creating one if needed.
func (s *WarRoomService) GetOrCreate(incidentID, createdBy string) (*database.WarRoom, error) {
	var room database.WarRoom
	err := s.db.Where("incident_id = ?", incidentID).First(&room).Error
	if err == nil {
		return &room, nil
	}

	// Fetch incident title
	var incident database.Incident
	s.db.First(&incident, "id = ?", incidentID)

	room = database.WarRoom{
		ID:         fmt.Sprintf("wr_%d", time.Now().UnixNano()),
		IncidentID: incidentID,
		Title:      incident.Title,
		Status:     "active",
		Commander:  createdBy,
		CreatedBy:  createdBy,
		CreatedAt:  time.Now().UTC(),
	}
	return &room, s.db.Create(&room).Error
}

func (s *WarRoomService) Get(roomID string) (*database.WarRoom, error) {
	var room database.WarRoom
	return &room, s.db.First(&room, "id = ?", roomID).Error
}

func (s *WarRoomService) GetByIncident(incidentID string) (*database.WarRoom, error) {
	var room database.WarRoom
	return &room, s.db.Where("incident_id = ?", incidentID).First(&room).Error
}

// ── Messages ──────────────────────────────────────────────────────────────────

func (s *WarRoomService) PostMessage(roomID, userID, email, role, kind, body, traceID string) (*database.WarRoomMessage, error) {
	msg := database.WarRoomMessage{
		ID:        fmt.Sprintf("wrm_%d", time.Now().UnixNano()),
		RoomID:    roomID,
		UserID:    userID,
		UserEmail: email,
		UserRole:  role,
		Kind:      kind,
		Body:      body,
		TraceID:   traceID,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.db.Create(&msg).Error; err != nil {
		return nil, err
	}

	// Broadcast to all room members
	broadcast := wsMsg("message.new", map[string]any{
		"id":         msg.ID,
		"user_id":    msg.UserID,
		"user_email": msg.UserEmail,
		"user_role":  msg.UserRole,
		"kind":       msg.Kind,
		"body":       msg.Body,
		"trace_id":   msg.TraceID,
		"created_at": msg.CreatedAt,
	})
	s.hub.BroadcastToRoom(roomID, broadcast, nil)
	return &msg, nil
}

func (s *WarRoomService) ListMessages(roomID string) ([]database.WarRoomMessage, error) {
	var msgs []database.WarRoomMessage
	return msgs, s.db.Where("room_id = ?", roomID).Order("created_at ASC").Limit(500).Find(&msgs).Error
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

func (s *WarRoomService) CreateTask(roomID, title, assignedTo, assigneeName, createdBy string) (*database.WarRoomTask, error) {
	task := database.WarRoomTask{
		ID:           fmt.Sprintf("wrt_%d", time.Now().UnixNano()),
		RoomID:       roomID,
		Title:        title,
		AssignedTo:   assignedTo,
		AssigneeName: assigneeName,
		Done:         false,
		CreatedBy:    createdBy,
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.db.Create(&task).Error; err != nil {
		return nil, err
	}
	broadcast := wsMsg("task.created", map[string]any{
		"id":            task.ID,
		"title":         task.Title,
		"assigned_to":   task.AssignedTo,
		"assignee_name": task.AssigneeName,
		"done":          false,
		"created_at":    task.CreatedAt,
	})
	s.hub.BroadcastToRoom(roomID, broadcast, nil)
	return &task, nil
}

func (s *WarRoomService) ToggleTask(taskID, roomID string) (*database.WarRoomTask, error) {
	var task database.WarRoomTask
	if err := s.db.First(&task, "id = ?", taskID).Error; err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	task.Done = !task.Done
	if task.Done {
		task.DoneAt = &now
	} else {
		task.DoneAt = nil
	}
	if err := s.db.Save(&task).Error; err != nil {
		return nil, err
	}
	broadcast := wsMsg("task.updated", map[string]any{
		"id":   task.ID,
		"done": task.Done,
	})
	s.hub.BroadcastToRoom(roomID, broadcast, nil)
	return &task, nil
}

func (s *WarRoomService) ListTasks(roomID string) ([]database.WarRoomTask, error) {
	var tasks []database.WarRoomTask
	return tasks, s.db.Where("room_id = ?", roomID).Order("created_at ASC").Find(&tasks).Error
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

func (s *WarRoomService) HandleWS(conn *websocket.Conn, roomID, userID, email, name, role string) {
	client := &WRClient{
		RoomID:    roomID,
		UserID:    userID,
		UserEmail: email,
		UserName:  name,
		UserRole:  role,
		conn:      conn,
		send:      make(chan []byte, 64),
	}

	s.hub.Join(client)
	defer s.hub.Leave(client)
	go client.writePump()

	// Post system message to DB + broadcast
	s.PostMessage(roomID, "system", "system", "system", "system",
		fmt.Sprintf("%s joined the war room", email), "")

	// Read pump
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg WSMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "message.send":
			body, _ := msg.Payload["body"].(string)
			kind, _ := msg.Payload["kind"].(string)
			traceID, _ := msg.Payload["trace_id"].(string)
			if kind == "" {
				kind = "chat"
			}
			if body != "" {
				s.PostMessage(roomID, userID, email, role, kind, body, traceID)
			}

		case "cursor.move":
			// Relay cursor position to room (don't persist)
			out := wsMsg("cursor.moved", map[string]any{
				"user_id": userID,
				"email":   email,
				"x":       msg.Payload["x"],
				"y":       msg.Payload["y"],
			})
			s.hub.BroadcastToRoom(roomID, out, client)

		case "ping":
			client.send <- wsMsg("pong", map[string]any{"ts": time.Now().UnixMilli()})
		}
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func wsMsg(msgType string, payload map[string]any) []byte {
	b, _ := json.Marshal(WSMessage{Type: msgType, Payload: payload})
	return b
}
