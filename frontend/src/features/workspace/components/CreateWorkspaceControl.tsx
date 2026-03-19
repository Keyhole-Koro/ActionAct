"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuthState } from "@/features/auth/hooks/useAuthState";
import { createWorkspace } from "@/features/workspace/services/create-workspace";

export function CreateWorkspaceControl() {
  const { user } = useAuthState();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!user) {
      toast.error("Sign in first");
      return;
    }
    setSubmitting(true);
    try {
      const { workspaceId, topicId } = await createWorkspace({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });
      if (typeof window !== 'undefined') window.localStorage.setItem('run_context.topicId', topicId);
      router.push(`/workspace/${workspaceId}`);
      toast.success("Workspace created");
    } catch (error) {
      console.error("Failed to create workspace", error);
      toast.error("Failed to create workspace");
      setSubmitting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSubmit} disabled={submitting}>
      {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
      New Workspace
    </Button>
  );
}
