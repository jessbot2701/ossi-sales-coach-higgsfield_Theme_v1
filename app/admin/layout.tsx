import { Brand } from "@/components/brand";
import { AppConversationProvider } from "@/components/app-conversation-provider";
import { PortalNavigation } from "@/components/portal-navigation";
import { requirePageUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser({ admin: true });
  return (
    <AppConversationProvider>
      <div className="portal-page">
        <header className="portal-header"><div className="shell portal-header-inner"><Brand href="/app" /><PortalNavigation admin /></div></header>
        <main className="shell portal-main">{children}</main>
      </div>
    </AppConversationProvider>
  );
}
