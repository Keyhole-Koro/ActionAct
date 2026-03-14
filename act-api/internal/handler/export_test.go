package handler

import (
	"net/http"

	"connectrpc.com/connect"
)

// Test exports — allow tests in handler_test package to access unexported helpers.
// This file is only compiled during testing.

func CookieValueForTest(header http.Header, name string) string {
	return cookieValue(header, name)
}

func ConnectCodeForTest(code string) connect.Code {
	return connectCode(code)
}

func DomainErrToCodeForTest(err error) string {
	return domainErrToCode(err)
}

func NewTraceIDForTest() string {
	return newTraceID()
}
