package adapter

import (
	"context"
	"encoding/json"
	"fmt"

	"cloud.google.com/go/pubsub"
)

// PubSubPublisher publishes structured events to a Pub/Sub topic.
type PubSubPublisher struct {
	topic *pubsub.Topic
}

// NewPubSubPublisher wraps an existing Pub/Sub topic handle.
func NewPubSubPublisher(topic *pubsub.Topic) *PubSubPublisher {
	return &PubSubPublisher{topic: topic}
}

// Publish sends a JSON-encoded event to the topic.
// eventType is set as both a message attribute and in the JSON body.
func (p *PubSubPublisher) Publish(ctx context.Context, eventType string, payload map[string]string) error {
	body := map[string]interface{}{
		"type":    eventType,
		"payload": payload,
	}
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("pubsub marshal: %w", err)
	}

	result := p.topic.Publish(ctx, &pubsub.Message{
		Data: data,
		Attributes: map[string]string{
			"eventType": eventType,
		},
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
