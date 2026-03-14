package adapter

import (
	"context"
	"fmt"
	"strings"

	firebaseauth "firebase.google.com/go/v4/auth"

	"act-api/internal/domain"
)

// FirebaseAuthVerifier implements domain.AuthVerifier using Firebase Admin SDK.
type FirebaseAuthVerifier struct {
	client *firebaseauth.Client
}

func NewFirebaseAuthVerifier(client *firebaseauth.Client) *FirebaseAuthVerifier {
	return &FirebaseAuthVerifier{client: client}
}

func (v *FirebaseAuthVerifier) VerifyToken(ctx context.Context, authHeader string) (string, error) {
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return "", fmt.Errorf("%w: missing Bearer token", domain.ErrUnauthenticated)
	}
	idToken := strings.TrimPrefix(authHeader, "Bearer ")
	token, err := v.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return "", fmt.Errorf("%w: invalid token: %v", domain.ErrUnauthenticated, err)
	}
	if token.Firebase.SignInProvider != "google.com" {
		return "", fmt.Errorf("%w: unsupported sign_in_provider: %q", domain.ErrUnauthenticated, token.Firebase.SignInProvider)
	}
	return token.UID, nil
}
