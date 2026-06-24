"use server";

import { signIn, signOut } from "@/auth";

export async function doSignIn() {
  // land on the dashboard after auth, regardless of which page started sign-in
  // (the landing form or the /u explorer's "sign in for private repos")
  await signIn("github", { redirectTo: "/" });
}

export async function doSignOut() {
  await signOut({ redirectTo: "/" });
}
