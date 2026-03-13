package services

import (
	"context"
	"fmt"

	"go.uber.org/zap"
	"gorm.io/gorm"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/agentops/agentops/api/internal/config"
	"github.com/agentops/agentops/api/internal/database"
)

type OrchestrationService struct {
	db        *gorm.DB
	logger    *zap.Logger
	config    *config.Config
	k8sClient *kubernetes.Clientset
}

func NewOrchestrationService(db *gorm.DB, logger *zap.Logger, cfg *config.Config) *OrchestrationService {
	var k8sClient *kubernetes.Clientset

	// Initialize K8s client if config path is provided
	if cfg.K8sConfigPath != "" {
		config, err := rest.InClusterConfig()
		if err != nil {
			// Fallback to out-of-cluster config
			config, err = rest.InClusterConfig()
		}
		if err == nil {
			clientset, err := kubernetes.NewForConfig(config)
			if err == nil {
				k8sClient = clientset
			}
		}
	}

	return &OrchestrationService{
		db:        db,
		logger:    logger,
		config:    cfg,
		k8sClient: k8sClient,
	}
}

// DeployAgent deploys an agent to Kubernetes
func (os *OrchestrationService) DeployAgent(ctx context.Context, agentID string, config map[string]interface{}) (*database.Deployment, error) {
	// Get agent
	var agent database.Agent
	if err := os.db.Where("id = ?", agentID).First(&agent).Error; err != nil {
		return nil, err
	}

	// Create deployment record
	deployment := &database.Deployment{
		ID:        fmt.Sprintf("deploy_%d", agentID),
		AgentID:   agentID,
		Namespace: "default",
		Replicas:  1,
		Status:    "pending",
		Config:    fmt.Sprintf("%v", config),
	}

	if err := os.db.Create(deployment).Error; err != nil {
		return nil, err
	}

	// Deploy to K8s if client is available
	if os.k8sClient != nil {
		if err := os.deployToK8s(ctx, deployment, &agent); err != nil {
			os.logger.Error("Failed to deploy to K8s", zap.Error(err))
			deployment.Status = "error"
			os.db.Save(deployment)
			return nil, err
		}
		deployment.Status = "active"
		os.db.Save(deployment)
	}

	return deployment, nil
}

// ScaleAgent scales an agent deployment
func (os *OrchestrationService) ScaleAgent(ctx context.Context, deploymentID string, replicas int) error {
	var deployment database.Deployment
	if err := os.db.Where("id = ?", deploymentID).First(&deployment).Error; err != nil {
		return err
	}

	deployment.Replicas = replicas
	if err := os.db.Save(&deployment).Error; err != nil {
		return err
	}

	// Scale in K8s if client is available
	if os.k8sClient != nil {
		if err := os.scaleInK8s(ctx, &deployment, replicas); err != nil {
			return err
		}
	}

	return nil
}

// SetCircuitBreaker configures circuit breaker for an agent
func (os *OrchestrationService) SetCircuitBreaker(ctx context.Context, agentID string, config map[string]interface{}) error {
	// TODO: Implement circuit breaker configuration
	os.logger.Info("Circuit breaker configured", zap.String("agent_id", agentID))
	return nil
}

// deployToK8s deploys agent to Kubernetes
func (os *OrchestrationService) deployToK8s(ctx context.Context, deployment *database.Deployment, agent *database.Agent) error {
	// TODO: Create K8s Deployment, Service, ConfigMap, etc.
	// This would use the k8s client to create resources
	os.logger.Info("Deploying to K8s",
		zap.String("agent_id", agent.ID),
		zap.String("namespace", deployment.Namespace),
	)
	return nil
}

// scaleInK8s scales deployment in Kubernetes
func (os *OrchestrationService) scaleInK8s(ctx context.Context, deployment *database.Deployment, replicas int) error {
	if os.k8sClient == nil {
		return fmt.Errorf("K8s client not initialized")
	}

	// Get deployment
	k8sDeployment, err := os.k8sClient.AppsV1().Deployments(deployment.Namespace).
		Get(ctx, deployment.ID, metav1.GetOptions{})
	if err != nil {
		return err
	}

	// Scale
	scale := int32(replicas)
	k8sDeployment.Spec.Replicas = &scale

	_, err = os.k8sClient.AppsV1().Deployments(deployment.Namespace).
		Update(ctx, k8sDeployment, metav1.UpdateOptions{})

	return err
}
