package domain_test

import (
	"errors"
	"testing"

	"act-api/internal/domain"
)

func TestStageError_Error(t *testing.T) {
	err := &domain.StageError{
		Stage:     "AUTHN",
		Err:       domain.ErrUnauthenticated,
		Retryable: false,
	}
	want := "AUTHN: unauthenticated"
	if got := err.Error(); got != want {
		t.Errorf("StageError.Error() = %q, want %q", got, want)
	}
}

func TestStageError_Unwrap(t *testing.T) {
	err := &domain.StageError{
		Stage: "SID_VALIDATE",
		Err:   domain.ErrSessionInvalid,
	}
	if !errors.Is(err, domain.ErrSessionInvalid) {
		t.Error("expected StageError to unwrap to ErrSessionInvalid")
	}
}

func TestSentinelErrors_AreDistinct(t *testing.T) {
	errs := []error{
		domain.ErrUnauthenticated,
		domain.ErrPermissionDenied,
		domain.ErrInvalidArgument,
		domain.ErrSessionInvalid,
		domain.ErrCSRFMismatch,
		domain.ErrUIDMismatch,
	}
	for i := 0; i < len(errs); i++ {
		for j := i + 1; j < len(errs); j++ {
			if errors.Is(errs[i], errs[j]) {
				t.Errorf("sentinel errors %d and %d should be distinct", i, j)
			}
		}
	}
}
