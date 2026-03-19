"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/services/firebase/auth";

export function LoginButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button onClick={handleLogin} disabled={pending}>
        {pending ? "Signing In..." : "Sign In With Google"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

