"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, validateCredentials } from "@/lib/hard-auth";

export async function loginAction(formData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const user = validateCredentials(username, password);

  if (!user) {
    redirect("/login?error=1");
  }

  await createSession(user);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
