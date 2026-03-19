package usecase

import (
	"context"
	"fmt"
	"strings"

	"act-api/internal/domain"
)

type DecideActActionUsecase struct {
	authVerifier  domain.AuthVerifier
	authzVerifier domain.AuthzVerifier
	resolver      domain.ActDecisionResolver
}

func NewDecideActActionUsecase(auth domain.AuthVerifier, authz domain.AuthzVerifier, resolver domain.ActDecisionResolver) *DecideActActionUsecase {
	return &DecideActActionUsecase{
		authVerifier:  auth,
		authzVerifier: authz,
		resolver:      resolver,
	}
}

func (u *DecideActActionUsecase) Execute(ctx context.Context, authHeader string, input domain.ActDecisionInput) (domain.ActDecisionResult, error) {
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.TopicID = strings.TrimSpace(input.TopicID)
	input.UserMessage = strings.TrimSpace(input.UserMessage)
	if input.WorkspaceID == "" {
		return domain.ActDecisionResult{}, fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if input.TopicID == "" {
		return domain.ActDecisionResult{}, fmt.Errorf("%w: topic_id is required", domain.ErrInvalidArgument)
	}
	if input.UserMessage == "" {
		return domain.ActDecisionResult{}, fmt.Errorf("%w: user_message is required", domain.ErrInvalidArgument)
	}
	if len(input.Nodes) == 0 {
		return domain.ActDecisionResult{}, fmt.Errorf("%w: nodes is required", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return domain.ActDecisionResult{}, fmt.Errorf("auth: %w", err)
	}
	input.UID = uid

	if u.authzVerifier != nil {
		if err := u.authzVerifier.AuthorizeRunAct(ctx, uid, input.WorkspaceID, input.TopicID); err != nil {
			return domain.ActDecisionResult{}, err
		}
	}

	return u.resolver.Resolve(ctx, input)
}
