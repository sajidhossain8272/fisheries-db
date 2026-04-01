import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { getCredentialHints, getSession } from "@/lib/hard-auth";
import { formatMoney } from "@/lib/number";
import { isSuperAdmin } from "@/lib/roles";

async function getUsers() {
  const db = await getDb();
  return db
    .collection("sales")
    .aggregate([
      { $group: { _id: "$createdBy", saleCount: { $sum: 1 }, revenue: { $sum: "$revenue" } } },
      { $sort: { _id: 1 } }
    ])
    .toArray();
}

async function resetDataAction() {
  "use server";

  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    throw new Error("Only super admin can reset data.");
  }

  const db = await getDb();
  await db.collection("inventory_batches").deleteMany({});
  await db.collection("sales").deleteMany({});

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

export default async function AdminPage() {
  const session = await getSession();
  const superAdmin = isSuperAdmin(session?.role);
  const users = await getUsers();
  const hardcoded = getCredentialHints();

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h1 className="text-xl font-semibold">Admin Panel</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Roles: <b>super_admin</b> can manage everything, <b>admin</b> manages inventory and pricing, <b>employee</b>{" "}
          can view inventory and record sales.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Sales By User</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Username</th>
                <th className="py-2">Sales Entries</th>
                <th className="py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td className="py-3 text-sm text-zinc-500" colSpan={3}>
                    No sales activity yet.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={String(user._id)} className="border-b border-zinc-200 text-sm">
                    <td className="py-2 font-medium">{user._id || "Unknown"}</td>
                    <td className="py-2">{user.saleCount}</td>
                    <td className="py-2">{formatMoney(user.revenue || 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Hardcoded Login Credentials</h2>
        {!superAdmin ? (
          <p className="mt-3 text-sm text-zinc-600">Only super admin can view passwords.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2">Role</th>
                  <th className="py-2">Username</th>
                  <th className="py-2">Password</th>
                </tr>
              </thead>
              <tbody>
                {hardcoded.map((row) => (
                  <tr key={row.role} className="border-b border-zinc-200 text-sm">
                    <td className="py-2 uppercase">{row.role}</td>
                    <td className="py-2">{row.username}</td>
                    <td className="py-2 font-mono">{row.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {superAdmin ? (
          <form action={resetDataAction} className="mt-4">
            <button type="submit" className="btn-white text-sm">
              Reset Inventory + Sales Data (Fresh Start)
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
