"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconTicket,
  IconTemplate,
  IconUser,
  IconUsers,
  IconUserShield,
  IconCalendarEvent,
  IconPhone,
  IconEyeFilled,
  IconSettings,
  IconLogout,
  IconUserOff,
  IconBuilding,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { NavLink } from "@mantine/core";
import classes from "./Navbar.module.css";
import { useState } from "react";
import { handleLogout } from "@/app/utils/oauth";
import { apiClient } from "@/app/lib/apiClient";
import { useUser } from "@/app/components/provider/UserContext";
import { canManageUsers } from "@/app/users/permissions";

const notAdminData = [
  { link: "/home", label: "Home", icon: IconHome },
  { link: "/tickets", label: "Tickets", icon: IconTicket },
  { link: "/contacts", label: "Contacts", icon: IconUsers },
  { link: "/events", label: "Events", icon: IconCalendarEvent },
];

const internalLinks = [{ link: "/phone-bank", label: "Internal Phone Bank", icon: IconPhone }];

const managementTemplatesLink = { link: "/templates", label: "Templates", icon: IconTemplate };
const managementUsersLink = { link: "/users", label: "Users", icon: IconUserShield };
const managementSettingsLink = { link: "/management", label: "Settings", icon: IconSettings };

export default function NavbarSimple() {
  const pathname = usePathname();
  const { user, isAdmin } = useUser();
  const isImpersonating = user?.is_impersonating ?? false;

  const [collapsed, setCollapsed] = useState(false);

  const handleStopImpersonating = async () => {
    await apiClient.delete(`/management/users/${user?.id}/impersonate/`);
    window.location.replace("/");
  };

  const data = notAdminData;
  const canManage = canManageUsers(user);

  const showNavbar = pathname !== "/login";

  const isInternalActive = internalLinks.some((item) => item.link === pathname);
  const isManagementActive = [
    managementTemplatesLink.link,
    managementUsersLink.link,
    managementSettingsLink.link,
  ].includes(pathname);

  const [internalOpen, setInternalOpen] = useState(isInternalActive);
  const [managementOpen, setManagementOpen] = useState(isManagementActive);

  const handleNavLinkClick =
    (open: boolean, setOpen: (v: boolean) => void) => (e: React.MouseEvent) => {
      if (collapsed) {
        e.preventDefault();
        setCollapsed(false);
        setOpen(true);
      } else {
        setOpen(!open);
      }
    };

  if (!showNavbar) {
    return null;
  }

  return (
    <nav
      className={classes.navbar}
      data-collapsed={collapsed || undefined}
      data-imitating={isImpersonating || undefined}
      data-imitated-name={user?.first_name}
    >
      <button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={classes.collapseButton}
        onClick={() => setCollapsed((value) => !value)}
        type="button"
      >
        {collapsed ? (
          <IconChevronRight size={16} stroke={1.5} />
        ) : (
          <IconChevronLeft size={16} stroke={1.5} />
        )}
      </button>

      <div className={classes.navbarMain}>
        {data.map((item) => (
          <Link
            aria-label={item.label}
            className={classes.link}
            data-active={item.link === pathname || undefined}
            href={item.link}
            key={item.label}
          >
            <item.icon className={classes.linkIcon} stroke={1.5} />
            <span className={classes.linkLabel}>{item.label}</span>
          </Link>
        ))}

        <NavLink
          aria-label="Internal"
          className={classes.navLinkRoot}
          label="Internal"
          leftSection={<IconBuilding stroke={1.5} className={classes.navLinkIcon} />}
          opened={internalOpen}
          onClick={handleNavLinkClick(internalOpen, setInternalOpen)}
          classNames={{
            children: classes.navLinkChildren,
            label: classes.navLinkLabel,
            section: classes.navLinkSection,
          }}
          styles={{
            body: {
              display: collapsed ? "none" : undefined,
            },
            root: {
              padding: "var(--mantine-spacing-xs) var(--mantine-spacing-sm)",
              borderRadius: "var(--mantine-radius-sm)",
              fontSize: "var(--mantine-font-size-sm)",
              fontWeight: 500,
            },
            label: { padding: 0 },
          }}
        >
          {internalLinks.map((item) => (
            <Link
              aria-label={item.label}
              className={classes.link}
              data-active={item.link === pathname || undefined}
              href={item.link}
              key={item.label}
            >
              <item.icon className={classes.linkIcon} stroke={1.5} />
              <span>{item.label}</span>
            </Link>
          ))}
        </NavLink>
      </div>

      <div className={classes.footer}>
        <NavLink
          aria-label="Management"
          className={classes.navLinkRoot}
          label="Management"
          leftSection={<IconEyeFilled stroke={1.5} className={classes.navLinkIcon} />}
          opened={managementOpen}
          onClick={handleNavLinkClick(managementOpen, setManagementOpen)}
          classNames={{
            children: classes.navLinkChildren,
            label: classes.navLinkLabel,
            section: classes.navLinkSection,
          }}
          styles={{
            body: {
              display: collapsed ? "none" : undefined,
            },
            root: {
              padding: "var(--mantine-spacing-xs) var(--mantine-spacing-sm)",
              borderRadius: "var(--mantine-radius-sm)",
              fontSize: "var(--mantine-font-size-sm)",
              fontWeight: 500,
            },
            label: { padding: 0 },
          }}
        >
          <Link
            aria-label={managementTemplatesLink.label}
            className={classes.link}
            data-active={managementTemplatesLink.link === pathname || undefined}
            href={managementTemplatesLink.link}
          >
            <managementTemplatesLink.icon className={classes.linkIcon} stroke={1.5} />
            <span>{managementTemplatesLink.label}</span>
          </Link>
          {canManage && (
            <Link
              aria-label={managementUsersLink.label}
              className={classes.link}
              data-active={managementUsersLink.link === pathname || undefined}
              href={managementUsersLink.link}
            >
              <managementUsersLink.icon className={classes.linkIcon} stroke={1.5} />
              <span>{managementUsersLink.label}</span>
            </Link>
          )}
          {isAdmin && (
            <Link
              aria-label={managementSettingsLink.label}
              className={classes.link}
              data-active={managementSettingsLink.link === pathname || undefined}
              href={managementSettingsLink.link}
            >
              <managementSettingsLink.icon className={classes.linkIcon} stroke={1.5} />
              <span>{managementSettingsLink.label}</span>
            </Link>
          )}
        </NavLink>

        <Link
          aria-label="Profile"
          className={classes.link}
          data-active={"/profile" === pathname || undefined}
          href={"/profile"}
          key={"profile"}
        >
          <IconUser className={classes.linkIcon} stroke={1.5} />
          <span className={classes.linkLabel}>Profile</span>
        </Link>

        {isImpersonating ? (
          <a
            aria-label="Stop impersonating"
            href="#"
            className={classes.link}
            onClick={handleStopImpersonating}
          >
            <IconUserOff className={classes.linkIcon} stroke={1.5} />
            <span className={classes.linkLabel}>Stop impersonating</span>
          </a>
        ) : (
          <a aria-label="Logout" href="#" className={classes.link} onClick={handleLogout}>
            <IconLogout className={classes.linkIcon} stroke={1.5} />
            <span className={classes.linkLabel}>Logout</span>
          </a>
        )}
      </div>
    </nav>
  );
}
