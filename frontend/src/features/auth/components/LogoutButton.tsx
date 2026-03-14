"use client";

import { Button } from "@/components/ui/button";
import { signOutCurrentUser } from "@/services/firebase/auth";

export function LogoutButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => void signOutCurrentUser()}>
      Logout
    </Button>
  );
}

