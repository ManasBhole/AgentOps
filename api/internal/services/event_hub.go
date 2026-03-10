package services

import (
	"encoding/json"
	"sync"
	"time"
)

// Event is the payload sent over SSE.
type Event struct {
	Type      string         `json:"type"`       // "incident.created" | "incident.resolved" | "trace.error"
	ID        string         `json:"id"`
	Title     string         `json:"title"`
	Severity  string         `json:"severity,omitempty"`
	AgentID   string         `json:"agent_id,omitempty"`
	TraceID   string         `json:"trace_id,omitempty"`
	Timestamp time.Time      `json:"timestamp"`
	Data      map[string]any `json:"data,omitempty"`
}

func (e Event) ToSSE() string {
	b, _ := json.Marshal(e)
	return "data: " + string(b) + "\n\n"
}

// EventHub manages SSE subscribers.
type EventHub struct {
	mu      sync.RWMutex
	clients map[chan Event]struct{}
}

func NewEventHub() *EventHub {
	return &EventHub{
		clients: make(map[chan Event]struct{}),
	}
}

// Subscribe registers a new SSE client and returns its channel.
func (h *EventHub) Subscribe() chan Event {
	ch := make(chan Event, 8)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes a client.
func (h *EventHub) Unsubscribe(ch chan Event) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
	close(ch)
}

// Publish broadcasts an event to all connected clients.
func (h *EventHub) Publish(e Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.clients {
		select {
		case ch <- e:
		default:
			// client too slow — drop rather than block
		}
	}
}

// Subscribers returns current subscriber count.
func (h *EventHub) Subscribers() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
