package usecase

import (
	"context"
	"fmt"
	"strings"

	"act-api/internal/domain"
)

type ResolveNodeCandidatesUsecase struct {
	authVerifier domain.AuthVerifier
	authzVerifier domain.AuthzVerifier
	resolver domain.NodeCandidateResolver
}

func NewResolveNodeCandidatesUsecase(auth domain.AuthVerifier, authz domain.AuthzVerifier, resolver domain.NodeCandidateResolver) *ResolveNodeCandidatesUsecase {
	return &ResolveNodeCandidatesUsecase{
		authVerifier: auth,
		authzVerifier: authz,
		resolver: resolver,
	}
}

func (u *ResolveNodeCandidatesUsecase) Execute(ctx context.Context, authHeader string, input domain.ResolveNodeCandidatesInput) ([]domain.NodeCandidate, error) {
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.TopicID = strings.TrimSpace(input.TopicID)
	input.UserMessage = strings.TrimSpace(input.UserMessage)
	if input.WorkspaceID == "" {
		return nil, fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if input.TopicID == "" {
		return nil, fmt.Errorf("%w: topic_id is required", domain.ErrInvalidArgument)
	}
	if input.UserMessage == "" {
		return nil, fmt.Errorf("%w: user_message is required", domain.ErrInvalidArgument)
	}
	if len(input.Nodes) == 0 {
		return nil, fmt.Errorf("%w: nodes is required", domain.ErrInvalidArgument)
	}
	if input.MaxCandidates <= 0 {
		input.MaxCandidates = 4
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}
	input.UID = uid

	if u.authzVerifier != nil {
		if err := u.authzVerifier.AuthorizeRunAct(ctx, uid, input.WorkspaceID, input.TopicID); err != nil {
			return nil, err
		}
	}

	return u.resolver.Resolve(ctx, input)
}
