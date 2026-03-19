package adapter_test

import (
	"errors"
	"testing"

	"act-api/internal/adapter"
	"act-api/internal/domain"
)

func TestDoubleSubmitCSRF_Valid(t *testing.T) {
	v := adapter.NewDoubleSubmitCSRFValidator()
	if err := v.Validate("token123", "token123"); err != nil {
		t.Errorf("expected nil, got %v", err)
	}
}

func TestDoubleSubmitCSRF_EmptyCookie(t *testing.T) {
	v := adapter.NewDoubleSubmitCSRFValidator()
	err := v.Validate("", "token123")
	if !errors.Is(err, domain.ErrCSRFMismatch) {
		t.Errorf("expected ErrCSRFMismatch, got %v", err)
	}
}

func TestDoubleSubmitCSRF_Mismatch(t *testing.T) {
	v := adapter.NewDoubleSubmitCSRFValidator()
	err := v.Validate("tokenA", "tokenB")
	if !errors.Is(err, domain.ErrCSRFMismatch) {
		t.Errorf("expected ErrCSRFMismatch, got %v", err)
	}
}

func TestDoubleSubmitCSRF_BothEmpty(t *testing.T) {
	v := adapter.NewDoubleSubmitCSRFValidator()
	err := v.Validate("", "")
	if !errors.Is(err, domain.ErrCSRFMismatch) {
		t.Errorf("expected ErrCSRFMismatch for both empty, got %v", err)
	}
}
