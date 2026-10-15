package database

import "time"

// Organization is a company/team workspace. Every user belongs to at least
// one (their personal org, auto-created at signup) and can belong to more.
type Organization struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`
	Slug      string    `gorm:"uniqueIndex;not null" json:"slug"`
	PlanTier  string    `gorm:"not null;default:'free'" json:"plan_tier"` // free | pro | enterprise
	SeatLimit int       `gorm:"not null;default:3" json:"seat_limit"`
	AgentLimit int      `gorm:"not null;default:5" json:"agent_limit"`
	CreatedBy string    `json:"created_by"` // user_id of the creator
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// OrganizationMember links a User to an Organization with a role scoped to
// that org (owner | admin | agent-runner | viewer — same vocabulary as the
// platform RBAC role, but independent of it).
type OrganizationMember struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	OrgID     string    `gorm:"index:idx_org_member,unique;not null" json:"org_id"`
	UserID    string    `gorm:"index:idx_org_member,unique;not null" json:"user_id"`
	Role      string    `gorm:"not null;default:'viewer'" json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// PlanLimits returns the seat/agent ceilings for a plan tier. Unknown tiers
// fall back to "free".
func PlanLimits(tier string) (seats int, agents int) {
	switch tier {
	case "pro":
		return 15, 50
	case "enterprise":
		return 1 << 30, 1 << 30 // effectively unlimited
	default:
		return 3, 5
	}
}
