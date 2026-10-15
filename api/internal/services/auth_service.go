package services

import (
	"errors"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/manasbhole/orion/api/internal/database"
)

// RBAC permission matrix.
// Each role lists the (resource, action) pairs it is allowed.
var rbacMatrix = map[string]map[string][]string{
	"owner": {
		"*": {"*"}, // full access
	},
	"admin": {
		"agents":      {"read", "write", "delete"},
		"traces":      {"read", "write"},
		"incidents":   {"read", "write", "resolve"},
		"nexus":       {"read", "write"},
		"deployments": {"read", "write", "delete"},
		"analytics":   {"read"},
		"audit":       {"read"},
		"users":       {"read"},
	},
	"agent-runner": {
		"agents":      {"read"},
		"traces":      {"read", "write"},
		"incidents":   {"read"},
		"deployments": {"read", "write"},
		"nexus":       {"read"},
	},
	"viewer": {
		"agents":      {"read"},
		"traces":      {"read"},
		"incidents":   {"read"},
		"nexus":       {"read"},
		"deployments": {"read"},
		"analytics":   {"read"},
		"audit":       {"read"},
	},
}

// AuthClaims are embedded in every JWT access token.
type AuthClaims struct {
	UserID  string `json:"user_id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Role    string `json:"role"` // platform RBAC role
	OrgID   string `json:"org_id,omitempty"`
	OrgRole string `json:"org_role,omitempty"` // role within OrgID (owner|admin|agent-runner|viewer)
	jwt.RegisteredClaims
}

const (
	accessTokenTTL  = 15 * time.Minute
	refreshTokenTTL = 7 * 24 * time.Hour
)

type AuthService struct {
	db        *gorm.DB
	logger    *zap.Logger
	jwtSecret []byte
	orgs      *OrgService
}

func NewAuthService(db *gorm.DB, logger *zap.Logger, jwtSecret string, orgs *OrgService) *AuthService {
	return &AuthService{db: db, logger: logger, jwtSecret: []byte(jwtSecret), orgs: orgs}
}

// Register creates a new user. Only owners can create non-viewer accounts (enforced at handler level).
func (s *AuthService) Register(email, name, password, role string) (*database.User, error) {
	if len(password) > 72 {
		return nil, errors.New("password must be 72 characters or fewer")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	user := &database.User{
		ID:           "usr_" + uuid.New().String(),
		Email:        email,
		Name:         name,
		Role:         role,
		PasswordHash: string(hash),
		IsActive:     true,
	}
	if err := s.db.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

// Login validates credentials and returns (accessToken, refreshToken, user).
// If the email is not registered yet, the account is created automatically (open registration).
func (s *AuthService) Login(email, password, userAgent, ip string) (string, string, *database.User, error) {
	var user database.User
	err := s.db.Where("email = ? AND is_active = true", email).First(&user).Error
	if err != nil {
		// Auto-register: new email gets an account on first login.
		// Platform role defaults to "viewer" (least privilege) — the account
		// only gets real authority inside the personal org it now owns.
		name := email
		if idx := strings.Index(email, "@"); idx > 0 {
			name = email[:idx]
		}
		newUser, regErr := s.Register(email, name, password, "viewer")
		if regErr != nil {
			return "", "", nil, errors.New("invalid credentials")
		}
		if s.orgs != nil {
			if _, orgErr := s.orgs.EnsurePersonalOrg(newUser.ID, name); orgErr != nil {
				s.logger.Warn("failed to provision personal org", zap.Error(orgErr))
			}
			s.db.First(newUser, "id = ?", newUser.ID) // reload with ActiveOrgID set
		}
		user = *newUser
	} else {
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
			return "", "", nil, errors.New("invalid credentials")
		}
	}

	access, err := s.signAccessToken(&user)
	if err != nil {
		return "", "", nil, err
	}

	refresh := uuid.New().String()
	session := &database.Session{
		ID:           "ses_" + uuid.New().String(),
		UserID:       user.ID,
		RefreshToken: refresh,
		UserAgent:    userAgent,
		IPAddress:    ip,
		ExpiresAt:    time.Now().UTC().Add(refreshTokenTTL),
	}
	if err := s.db.Create(session).Error; err != nil {
		return "", "", nil, err
	}

	now := time.Now().UTC()
	s.db.Model(&user).Update("last_login_at", now)

	return access, refresh, &user, nil
}

// RefreshAccessToken issues a new access token given a valid refresh token.
func (s *AuthService) RefreshAccessToken(refreshToken string) (string, error) {
	var session database.Session
	err := s.db.Where("refresh_token = ? AND expires_at > ?", refreshToken, time.Now().UTC()).
		First(&session).Error
	if err != nil {
		return "", errors.New("session not found or expired")
	}

	var user database.User
	if err := s.db.First(&user, "id = ? AND is_active = true", session.UserID).Error; err != nil {
		return "", errors.New("user not found")
	}

	return s.signAccessToken(&user)
}

// Logout deletes the session for the given refresh token.
func (s *AuthService) Logout(refreshToken string) error {
	return s.db.Where("refresh_token = ?", refreshToken).Delete(&database.Session{}).Error
}

// ValidateAccessToken parses and validates a JWT, returning its claims.
func (s *AuthService) ValidateAccessToken(tokenStr string) (*AuthClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &AuthClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*AuthClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// CheckAccess returns true if the given role can perform action on resource.
func CheckAccess(role, resource, action string) bool {
	perms, ok := rbacMatrix[role]
	if !ok {
		return false
	}
	// owner wildcard
	if wild, ok := perms["*"]; ok {
		for _, a := range wild {
			if a == "*" {
				return true
			}
		}
	}
	actions, ok := perms[resource]
	if !ok {
		return false
	}
	for _, a := range actions {
		if a == action || a == "*" {
			return true
		}
	}
	return false
}

func (s *AuthService) signAccessToken(user *database.User) (string, error) {
	var orgRole string
	if s.orgs != nil && user.ActiveOrgID != "" {
		orgRole, _ = s.orgs.GetMemberRole(user.ActiveOrgID, user.ID)
	}
	claims := &AuthClaims{
		UserID:  user.ID,
		Email:   user.Email,
		Name:    user.Name,
		Role:    user.Role,
		OrgID:   user.ActiveOrgID,
		OrgRole: orgRole,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(accessTokenTTL)),
			Issuer:    "orion",
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
}

// IssueTokensForUser generates an access + refresh token pair for an OAuth-authenticated user.
func (s *AuthService) IssueTokensForUser(user *database.User, userAgent, ip string) (accessToken, refreshToken string, err error) {
	accessToken, err = s.signAccessToken(user)
	if err != nil {
		return
	}
	refreshToken = uuid.New().String()
	session := &database.Session{
		ID:           "ses_" + uuid.New().String(),
		UserID:       user.ID,
		RefreshToken: refreshToken,
		UserAgent:    userAgent,
		IPAddress:    ip,
		ExpiresAt:    time.Now().UTC().Add(refreshTokenTTL),
	}
	err = s.db.Create(session).Error
	return
}

// GetUser returns a user by ID.
func (s *AuthService) GetUser(id string) (*database.User, error) {
	var user database.User
	err := s.db.First(&user, "id = ?", id).Error
	return &user, err
}

// ListUsers returns all users (admin/owner only, enforced at handler level).
func (s *AuthService) ListUsers() ([]database.User, error) {
	var users []database.User
	err := s.db.Order("created_at ASC").Find(&users).Error
	return users, err
}

// UpdateProfile updates a user's display name and/or password.
// OldPassword is required only when NewPassword is non-empty.
func (s *AuthService) UpdateProfile(userID, name, oldPassword, newPassword string) (*database.User, error) {
	var user database.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, errors.New("user not found")
	}

	updates := map[string]interface{}{}

	if name != "" && name != user.Name {
		updates["name"] = name
	}

	if newPassword != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPassword)); err != nil {
			return nil, errors.New("current password is incorrect")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		updates["password_hash"] = string(hash)
	}

	if len(updates) == 0 {
		return &user, nil
	}

	if err := s.db.Model(&user).Updates(updates).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// EnsureDefaultOwner creates an initial owner account if no users exist.
func (s *AuthService) EnsureDefaultOwner() {
	var count int64
	s.db.Model(&database.User{}).Count(&count)
	if count > 0 {
		return
	}
	user, err := s.Register("admin@orion.ai", "Admin", "agentops-admin", "owner")
	if err != nil {
		s.logger.Warn("failed to create default owner", zap.Error(err))
		return
	}
	if s.orgs != nil {
		if org, orgErr := s.orgs.CreateOrganization(user.ID, "Orion Demo"); orgErr != nil {
			s.logger.Warn("failed to create demo organization", zap.Error(orgErr))
		} else if _, planErr := s.orgs.UpdatePlan(org.ID, "enterprise"); planErr != nil {
			s.logger.Warn("failed to set demo organization plan", zap.Error(planErr))
		}
	}
	s.logger.Info("created default owner: admin@orion.ai / agentops-admin — change this immediately")
}
