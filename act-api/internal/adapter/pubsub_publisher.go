package adapter

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"cloud.google.com/go/pubsub"
)

type EventEnvelope struct {
	SchemaVersion  string            `json:"schemaVersion"`
	Type           string            `json:"type"`
	TraceID        string            `json:"traceId"`
	WorkspaceID    string            `json:"workspaceId"`
	TopicID        string            `json:"topicId"`
	IdempotencyKey string            `json:"idempotencyKey"`
	EmittedAt      string            `json:"emittedAt"`
	Payload        map[string]string `json:"payload"`
}

// PubSubPublisher publishes structured events to a Pub/Sub topic.
type PubSubPublisher struct {
	topic *pubsub.Topic
}

// NewPubSubPublisher wraps an existing Pub/Sub topic handle.
func NewPubSubPublisher(topic *pubsub.Topic) *PubSubPublisher {
	return &PubSubPublisher{topic: topic}
}

// Publish sends a JSON-encoded envelope that matches Organize event intake.
func (p *PubSubPublisher) Publish(
	ctx context.Context,
	eventType string,
	workspaceID string,
	topicID string,
	idempotencyKey string,
	payload map[string]string,
) error {
	envelope := EventEnvelope{
		SchemaVersion:  "1",
		Type:           eventType,
		TraceID:        "trace_" + uuid.New().String()[:12],
		WorkspaceID:    workspaceID,
		TopicID:        topicID,
		IdempotencyKey: idempotencyKey,
		EmittedAt:      time.Now().UTC().Format(time.RFC3339),
		Payload:        payload,
	}

	data, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("pubsub marshal: %w", err)
	}

	attributes := map[string]string{
		"type":          envelope.Type,
		"schemaVersion": envelope.SchemaVersion,
		"workspaceId":   envelope.WorkspaceID,
		"topicId":       envelope.TopicID,
	}
	if inputID := payload["inputId"]; inputID != "" {
		attributes["inputId"] = inputID
	}

	result := p.topic.Publish(ctx, &pubsub.Message{
		Data: data,
		Attributes: attributes,
	})

	_, err = result.Get(ctx)
	if err != nil {
		return fmt.Errorf("pubsub publish: %w", err)
	}
	return nil
}

// Stop flushes the topic. Call on shutdown.
func (p *PubSubPublisher) Stop() {
	p.topic.Stop()
}
