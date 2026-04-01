import { redirect } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import { loginAction } from "@/lib/auth-actions";
import { getSession } from "@/lib/hard-auth";

export default async function LoginPage({ searchParams }) {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const hasError = resolvedSearchParams?.error === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10">
      <div className="card w-full max-w-md p-6 shadow-sm">
        <BrandLogo />
        <p className="mt-3 text-sm text-zinc-600">
          Login with hardcoded env credentials for super admin, admin, or employee.
        </p>
        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="label">Username</span>
            <input className="input mt-1" name="username" type="text" required autoComplete="username" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input className="input mt-1" name="password" type="password" required autoComplete="current-password" />
          </label>
          {hasError ? <p className="text-sm font-medium text-black">Invalid username or password.</p> : null}
          <button type="submit" className="btn-black w-full">
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
