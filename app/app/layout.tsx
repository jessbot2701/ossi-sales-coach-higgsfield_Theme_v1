import { Brand } from "@/components/brand";
import { PortalNavigation } from "@/components/portal-navigation";
import { requirePageUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="portal-page">
      <header className="portal-header"><div className="shell portal-header-inner"><Brand href="/app" /><PortalNavigation showAdmin={user.role === "admin"} /></div></header>
      <main className="shell portal-main">{children}</main>
    </div>
  );
}
