package domain

// CSRFValidator validates a CSRF token pair (cookie value vs header value).
type CSRFValidator interface {
	Validate(cookieValue string, headerValue string) error
}
