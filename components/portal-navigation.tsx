"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

type NavigationItem = { href: string; label: string; exact?: boolean };

export function PortalNavigation({ admin = false, showAdmin = false }: { admin?: boolean; showAdmin?: boolean }) {
  const pathname = usePathname();
  const items: NavigationItem[] = admin
    ? [
        { href: "/app", label: "Dashboard", exact: true },
        { href: "/admin/users", label: "Nutzer" },
        { href: "/admin/sessions", label: "Sessions" },
        { href: "/app/so-funktionierts", label: "So funktioniert’s" },
        { href: "/", label: "Über Ossi ↗", exact: true },
      ]
    : [
        { href: "/app", label: "Dashboard", exact: true },
        { href: "/app/training", label: "Training" },
        { href: "/app/so-funktionierts", label: "So funktioniert’s" },
        { href: "/", label: "Über Ossi ↗", exact: true },
        ...(showAdmin ? [{ href: "/admin/users", label: "Administration" }] : []),
      ];

  return (
    <nav className="portal-nav" aria-label={admin ? "Admin-Navigation" : "App-Navigation"}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return <Link href={item.href} aria-current={active ? "page" : undefined} key={item.href}>{item.label}</Link>;
      })}
      <LogoutButton />
    </nav>
  );
}
