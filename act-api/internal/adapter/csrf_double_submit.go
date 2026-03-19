package adapter

import "act-api/internal/domain"

// DoubleSubmitCSRFValidator implements domain.CSRFValidator
// using the Double Submit Cookie pattern.
type DoubleSubmitCSRFValidator struct{}

func NewDoubleSubmitCSRFValidator() *DoubleSubmitCSRFValidator {
	return &DoubleSubmitCSRFValidator{}
}

func (v *DoubleSubmitCSRFValidator) Validate(cookieValue, headerValue string) error {
	if cookieValue == "" || cookieValue != headerValue {
		return domain.ErrCSRFMismatch
	}
	return nil
}
