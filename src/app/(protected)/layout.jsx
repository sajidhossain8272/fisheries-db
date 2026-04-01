import { redirect } from "next/navigation";
import { getSession } from "@/lib/hard-auth";
import Shell from "@/components/shell";

export default async function ProtectedLayout({ children }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <Shell user={session}>{children}</Shell>;
}
