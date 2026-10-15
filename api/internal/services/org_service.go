package services

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/manasbhole/orion/api/internal/database"
)

type OrgService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewOrgService(db *gorm.DB, logger *zap.Logger) *OrgService {
	return &OrgService{db: db, logger: logger}
}

// OrgWithRole is one row of "organizations I belong to", with my role attached.
type OrgWithRole struct {
	database.Organization
	Role string `json:"role"`
}

// MemberView is one row of an org's member roster, joined with user info.
type MemberView struct {
	UserID      string     `json:"user_id"`
	Name        string     `json:"name"`
	Email       string     `json:"email"`
	AvatarURL   string     `json:"avatar_url"`
	Role        string     `json:"role"`
	JoinedAt    time.Time  `json:"joined_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

// Usage is the computed billing/usage snapshot for one organization.
type Usage struct {
	PlanTier     string  `json:"plan_tier"`
	SeatsUsed    int64   `json:"seats_used"`
	SeatLimit    int     `json:"seat_limit"`
	AgentsUsed   int64   `json:"agents_used"`
	AgentLimit   int     `json:"agent_limit"`
	CostThisMoUSD float64 `json:"cost_this_month_usd"`
	TracesThisMo int64   `json:"traces_this_month"`
}

var slugInvalidChars = regexp.MustCompile(`[^a-z0-9-]+`)

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.ReplaceAll(s, " ", "-")
	s = slugInvalidChars.ReplaceAllString(s, "")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "org"
	}
	return s
}

// CreateOrganization creates a new org, makes ownerUserID its owner, and
// switches that user's active org to the new one.
func (s *OrgService) CreateOrganization(ownerUserID, name string) (*database.Organization, error) {
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("organization name is required")
	}
	base := slugify(name)
	slug := base
	for i := 2; i < 1000; i++ {
		var count int64
		s.db.Model(&database.Organization{}).Where("slug = ?", slug).Count(&count)
		if count == 0 {
			break
		}
		slug = base + "-" + uuid.New().String()[:4]
		_ = i
	}

	seats, agents := database.PlanLimits("free")
	org := &database.Organization{
		ID:         "org_" + uuid.New().String(),
		Name:       name,
		Slug:       slug,
		PlanTier:   "free",
		SeatLimit:  seats,
		AgentLimit: agents,
		CreatedBy:  ownerUserID,
	}
	if err := s.db.Create(org).Error; err != nil {
		return nil, err
	}

	member := &database.OrganizationMember{
		ID:     "orgmem_" + uuid.New().String(),
		OrgID:  org.ID,
		UserID: ownerUserID,
		Role:   "owner",
	}
	if err := s.db.Create(member).Error; err != nil {
		return nil, err
	}

	if err := s.db.Model(&database.User{}).Where("id = ?", ownerUserID).
		Update("active_org_id", org.ID).Error; err != nil {
		return nil, err
	}

	return org, nil
}

// EnsurePersonalOrg gives userID an active org if they don't have one yet —
// called right after a new account is created. Idempotent.
func (s *OrgService) EnsurePersonalOrg(userID, userName string) (*database.Organization, error) {
	var user database.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, err
	}
	if user.ActiveOrgID != "" {
		var org database.Organization
		if err := s.db.First(&org, "id = ?", user.ActiveOrgID).Error; err == nil {
			return &org, nil
		}
	}
	name := userName
	if name == "" {
		name = "My"
	}
	return s.CreateOrganization(userID, name+"'s Organization")
}

// ListUserOrgs returns every org userID belongs to, with their role in each.
func (s *OrgService) ListUserOrgs(userID string) ([]OrgWithRole, error) {
	var memberships []database.OrganizationMember
	if err := s.db.Where("user_id = ?", userID).Find(&memberships).Error; err != nil {
		return nil, err
	}
	if len(memberships) == 0 {
		return []OrgWithRole{}, nil
	}
	roleByOrg := make(map[string]string, len(memberships))
	orgIDs := make([]string, 0, len(memberships))
	for _, m := range memberships {
		roleByOrg[m.OrgID] = m.Role
		orgIDs = append(orgIDs, m.OrgID)
	}
	var orgs []database.Organization
	if err := s.db.Where("id IN ?", orgIDs).Order("created_at ASC").Find(&orgs).Error; err != nil {
		return nil, err
	}
	out := make([]OrgWithRole, 0, len(orgs))
	for _, o := range orgs {
		out = append(out, OrgWithRole{Organization: o, Role: roleByOrg[o.ID]})
	}
	return out, nil
}

// GetMemberRole returns the caller's role within orgID, or an error if not a member.
func (s *OrgService) GetMemberRole(orgID, userID string) (string, error) {
	var m database.OrganizationMember
	if err := s.db.Where("org_id = ? AND user_id = ?", orgID, userID).First(&m).Error; err != nil {
		return "", errors.New("not a member of this organization")
	}
	return m.Role, nil
}

// SwitchActiveOrg sets userID's active org, provided they're a member of targetOrgID.
func (s *OrgService) SwitchActiveOrg(userID, targetOrgID string) (*database.User, error) {
	if _, err := s.GetMemberRole(targetOrgID, userID); err != nil {
		return nil, err
	}
	if err := s.db.Model(&database.User{}).Where("id = ?", userID).
		Update("active_org_id", targetOrgID).Error; err != nil {
		return nil, err
	}
	var user database.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// ListMembers returns the member roster for orgID, joined with user details.
func (s *OrgService) ListMembers(orgID string) ([]MemberView, error) {
	var members []database.OrganizationMember
	if err := s.db.Where("org_id = ?", orgID).Order("created_at ASC").Find(&members).Error; err != nil {
		return nil, err
	}
	out := make([]MemberView, 0, len(members))
	for _, m := range members {
		var u database.User
		if err := s.db.First(&u, "id = ?", m.UserID).Error; err != nil {
			continue
		}
		out = append(out, MemberView{
			UserID: u.ID, Name: u.Name, Email: u.Email, AvatarURL: u.AvatarURL,
			Role: m.Role, JoinedAt: m.CreatedAt, LastLoginAt: u.LastLoginAt,
		})
	}
	return out, nil
}

// AddMember adds userID to orgID with the given role, enforcing the org's seat limit.
func (s *OrgService) AddMember(orgID, userID, role string) (*database.OrganizationMember, error) {
	var org database.Organization
	if err := s.db.First(&org, "id = ?", orgID).Error; err != nil {
		return nil, errors.New("organization not found")
	}
	var seatsUsed int64
	s.db.Model(&database.OrganizationMember{}).Where("org_id = ?", orgID).Count(&seatsUsed)
	if int(seatsUsed) >= org.SeatLimit {
		return nil, errors.New("seat limit reached for this plan — upgrade to add more members")
	}
	var existing int64
	s.db.Model(&database.OrganizationMember{}).Where("org_id = ? AND user_id = ?", orgID, userID).Count(&existing)
	if existing > 0 {
		return nil, errors.New("user is already a member of this organization")
	}
	member := &database.OrganizationMember{
		ID: "orgmem_" + uuid.New().String(), OrgID: orgID, UserID: userID, Role: role,
	}
	if err := s.db.Create(member).Error; err != nil {
		return nil, err
	}
	// A brand-new user (no active org yet) lands here by default.
	s.db.Model(&database.User{}).Where("id = ? AND active_org_id = ?", userID, "").
		Update("active_org_id", orgID)
	return member, nil
}

// UpdateMemberRole changes a member's role, refusing to demote the last owner.
func (s *OrgService) UpdateMemberRole(orgID, userID, newRole string) error {
	var m database.OrganizationMember
	if err := s.db.Where("org_id = ? AND user_id = ?", orgID, userID).First(&m).Error; err != nil {
		return errors.New("member not found")
	}
	if m.Role == "owner" && newRole != "owner" {
		var ownerCount int64
		s.db.Model(&database.OrganizationMember{}).Where("org_id = ? AND role = ?", orgID, "owner").Count(&ownerCount)
		if ownerCount <= 1 {
			return errors.New("an organization must have at least one owner")
		}
	}
	return s.db.Model(&m).Update("role", newRole).Error
}

// RemoveMember removes userID from orgID, refusing to remove the last owner.
func (s *OrgService) RemoveMember(orgID, userID string) error {
	var m database.OrganizationMember
	if err := s.db.Where("org_id = ? AND user_id = ?", orgID, userID).First(&m).Error; err != nil {
		return errors.New("member not found")
	}
	if m.Role == "owner" {
		var ownerCount int64
		s.db.Model(&database.OrganizationMember{}).Where("org_id = ? AND role = ?", orgID, "owner").Count(&ownerCount)
		if ownerCount <= 1 {
			return errors.New("cannot remove the last owner — transfer ownership first")
		}
	}
	return s.db.Delete(&m).Error
}

// UpdatePlan changes an org's plan tier and refreshes its seat/agent limits.
func (s *OrgService) UpdatePlan(orgID, planTier string) (*database.Organization, error) {
	valid := map[string]bool{"free": true, "pro": true, "enterprise": true}
	if !valid[planTier] {
		return nil, errors.New("invalid plan tier")
	}
	seats, agents := database.PlanLimits(planTier)
	if err := s.db.Model(&database.Organization{}).Where("id = ?", orgID).Updates(map[string]any{
		"plan_tier":   planTier,
		"seat_limit":  seats,
		"agent_limit": agents,
	}).Error; err != nil {
		return nil, err
	}
	var org database.Organization
	if err := s.db.First(&org, "id = ?", orgID).Error; err != nil {
		return nil, err
	}
	return &org, nil
}

// GetUsage computes the real, current usage snapshot for billing display.
func (s *OrgService) GetUsage(orgID string) (*Usage, error) {
	var org database.Organization
	if err := s.db.First(&org, "id = ?", orgID).Error; err != nil {
		return nil, errors.New("organization not found")
	}

	var seatsUsed, agentsUsed int64
	s.db.Model(&database.OrganizationMember{}).Where("org_id = ?", orgID).Count(&seatsUsed)
	s.db.Model(&database.Agent{}).Where("org_id = ?", orgID).Count(&agentsUsed)

	var agentIDs []string
	s.db.Model(&database.Agent{}).Where("org_id = ?", orgID).Pluck("id", &agentIDs)

	usage := &Usage{
		PlanTier: org.PlanTier, SeatsUsed: seatsUsed, SeatLimit: org.SeatLimit,
		AgentsUsed: agentsUsed, AgentLimit: org.AgentLimit,
	}
	if len(agentIDs) == 0 {
		return usage, nil
	}

	monthStart := time.Now().UTC().AddDate(0, 0, -time.Now().UTC().Day()+1).Truncate(24 * time.Hour)
	var cost *float64
	s.db.Model(&database.RouterLog{}).
		Select("sum(cost_est_usd)").
		Where("agent_id IN ? AND created_at >= ?", agentIDs, monthStart).
		Scan(&cost)
	if cost != nil {
		usage.CostThisMoUSD = *cost
	}

	var traceCount int64
	s.db.Model(&database.Trace{}).Where("agent_id IN ? AND start_time >= ?", agentIDs, monthStart).Count(&traceCount)
	usage.TracesThisMo = traceCount

	return usage, nil
}

// AgentLimitReached returns true if orgID is at or over its plan's agent cap.
func (s *OrgService) AgentLimitReached(orgID string) bool {
	if orgID == "" {
		return false
	}
	var org database.Organization
	if err := s.db.First(&org, "id = ?", orgID).Error; err != nil {
		return false
	}
	var count int64
	s.db.Model(&database.Agent{}).Where("org_id = ?", orgID).Count(&count)
	return int(count) >= org.AgentLimit
}
