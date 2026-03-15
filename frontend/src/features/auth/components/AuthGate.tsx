"use client";

import { useEffect, useState, type ReactNode } from "react";

import { LoginButton } from "@/features/auth/components/LoginButton";
import { useRequireAuth } from "@/features/auth/hooks/useRequireAuth";
import { ensureLocalWorkspaceAccess } from "@/features/auth/services/ensure-local-workspace-access";
import { emitAuthContext } from "@/features/auth/session";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { config } from "@/lib/config";
import { createWorkspace } from "@/features/workspace/services/create-workspace";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const { user, loading, error, isAuthenticated } = useRequireAuth();
  const { workspaceId, topicId } = useRunContextStore();
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    if (config.useMocks || !user) {
      setBootstrapping(false);
      setBootstrapError(null);
      return;
    }

    // New user: no workspace yet → auto-create one
    if (!workspaceId) {
      let cancelled = false;
      setBootstrapping(true);
      setBootstrapError(null);

      void (async () => {
        try {
          const result = await createWorkspace({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          });
          if (cancelled) return;
          emitAuthContext({ workspaceId: result.workspaceId, topicId: result.topicId });
          if (typeof window !== "undefined") {
            window.localStorage.setItem("run_context.workspaceId", result.workspaceId);
            window.localStorage.setItem("run_context.topicId", result.topicId);
          }
          // bootstrapping stays true; re-render with new workspaceId will complete bootstrap
        } catch (nextError) {
          if (!cancelled) {
            setBootstrapError(nextError instanceof Error ? nextError.message : String(nextError));
            setBootstrapping(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setBootstrapping(true);
    setBootstrapError(null);

    void (async () => {
      try {
        await ensureLocalWorkspaceAccess(user, workspaceId, topicId);

        const idToken = await user.getIdToken();
        if (!idToken) {
          throw new Error("Firebase ID token is missing");
        }

        const response = await fetch(`${config.actApiBaseUrl}/auth/session/bootstrap`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Session bootstrap failed with ${response.status}`);
        }

        if (!cancelled) {
          setBootstrapping(false);
        }
      } catch (nextError) {
        if (!cancelled) {
          setBootstrapError(nextError instanceof Error ? nextError.message : String(nextError));
          setBootstrapping(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [topicId, user, workspaceId]);

  if (config.useMocks) {
    return <>{children}</>;
  }

  if (loading) {
    return <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading auth...</div>;
  }

  if (error) {
    return <div className="flex h-full w-full items-center justify-center text-sm text-destructive">{error.message}</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border bg-background p-6 text-center">
          <h2 className="text-lg font-semibold">Sign in to use Act</h2>
          <p className="text-sm text-muted-foreground">
            RunAct requires a Firebase ID token plus sid/csrf cookies.
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  if (bootstrapping) {
    return <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Starting secure session...</div>;
  }

  if (bootstrapError) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-background p-6 text-center">
          <p className="text-sm text-destructive">{bootstrapError}</p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
