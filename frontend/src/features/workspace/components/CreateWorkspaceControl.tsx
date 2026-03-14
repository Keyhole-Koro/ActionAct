"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emitAuthContext } from "@/features/auth/session";
import { useAuthState } from "@/features/auth/hooks/useAuthState";
import { createWorkspace } from "@/features/workspace/services/create-workspace";

export function CreateWorkspaceControl() {
  const { user } = useAuthState();
  const [open, setOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [topicName, setTopicName] = useState("topic-1");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setWorkspaceName("");
    setTopicName("topic-1");
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Sign in first");
      return;
    }
    if (!workspaceName.trim()) {
      toast.error("Workspace name is required");
      return;
    }

    setSubmitting(true);
    try {
      const { workspaceId, topicId } = await createWorkspace({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        workspaceName,
        topicName,
      });

      emitAuthContext({ workspaceId, topicId });
      if (typeof window !== "undefined") {
        window.localStorage.setItem("run_context.workspaceId", workspaceId);
        window.localStorage.setItem("run_context.topicId", topicId);
      }
      toast.success("Workspace created");
      reset();
    } catch (error) {
      console.error("Failed to create workspace", error);
      toast.error("Failed to create workspace");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" />
        New Workspace
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/95 px-2 py-2 shadow-lg">
      <Input
        value={workspaceName}
        onChange={(event) => setWorkspaceName(event.target.value)}
        placeholder="workspace name"
        className="w-40"
        disabled={submitting}
      />
      <Input
        value={topicName}
        onChange={(event) => setTopicName(event.target.value)}
        placeholder="initial topic"
        className="w-32"
        disabled={submitting}
      />
      <Button size="sm" onClick={handleSubmit} disabled={submitting}>
        Create
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={reset} disabled={submitting}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
