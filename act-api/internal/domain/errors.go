package domain

import "errors"

// Sentinel errors for each failure category.
// Usecase/handler layers map these to appropriate RPC codes.

var (
	ErrUnauthenticated  = errors.New("unauthenticated")
	ErrPermissionDenied = errors.New("permission denied")
	ErrInvalidArgument  = errors.New("invalid argument")
	ErrSessionInvalid   = errors.New("session invalid or not found")
	ErrCSRFMismatch     = errors.New("csrf validation failed")
	ErrUIDMismatch      = errors.New("uid mismatch between token and request")
)

// StageError wraps a domain error with the pipeline stage that produced it.
type StageError struct {
	Stage     string // e.g. "AUTHN", "SID_VALIDATE", "CSRF_VALIDATE"
	Err       error
	Retryable bool
}

func (e *StageError) Error() string { return e.Stage + ": " + e.Err.Error() }
func (e *StageError) Unwrap() error { return e.Err }
