"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { doc, getDoc } from "firebase/firestore";

import { LoginButton } from "@/features/auth/components/LoginButton";
import { useRequireAuth } from "@/features/auth/hooks/useRequireAuth";
import { ensureLocalWorkspaceAccess } from "@/features/auth/services/ensure-local-workspace-access";
import { createWorkspace } from "@/features/workspace/services/create-workspace";
import { useRunContextStore } from "@/features/context/store/run-context-store";
import { config } from "@/lib/config";
import { firestore } from "@/services/firebase/firestore";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const { user, loading, error, isAuthenticated } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const setReadOnly = useRunContextStore((s) => s.setReadOnly);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const workspaceId = params?.id ?? '';

  useEffect(() => {
    if (!user) {
      setBootstrapping(false);
      setBootstrapError(null);
      return;
    }

    let cancelled = false;
    setBootstrapping(true);
    setBootstrapError(null);

    void (async () => {
      try {
        const isMember =
          workspaceId.length > 0 &&
          (await getDoc(
            doc(firestore, `workspaces/${workspaceId}/members/${user.uid}`),
          ).then((s) => s.exists()).catch(() => false));

        if (!isMember) {
          // Check if workspace is public — if so, allow read-only access
          const isPublic = workspaceId.length > 0 &&
            (await getDoc(doc(firestore, `workspaces/${workspaceId}`))
              .then((s) => s.exists() && s.data()?.visibility === 'public')
              .catch(() => false));

          if (isPublic) {
            if (cancelled) return;
            setReadOnly(true);
            setBootstrapping(false);
            return;
          }

          const result = await createWorkspace({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          });
          if (cancelled) return;
          router.push(`/workspace/${result.workspaceId}?topicId=${result.topicId}`);
          return;
        }

        setReadOnly(false);

        if (cancelled) return;

        const topicId = searchParams.get('topicId') ??
          (typeof window !== 'undefined' ? window.localStorage.getItem('run_context.topicId') : null) ?? '';

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
  }, [user, workspaceId, searchParams, router]);

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
