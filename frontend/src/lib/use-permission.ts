"use client";
import React from "react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export type Permission =
  | "dashboard.view"
  | "tickets.view"
  | "tickets.manage"
  | "customers.view"
  | "customers.manage"
  | "billing.view"
  | "billing.manage"
  | "channels.manage"
  | "team.view"
  | "team.manage"
  | "ai.configure"
  | "ai.use"
  | "ai.manage"
  | "kb.view"
  | "kb.manage"
  | "knowledge.publish"
  | "automations.manage"
  | "sla.manage"
  | "labels.manage"
  | "webhooks.manage"
  | "api_keys.manage"
  | "platform.admin"
  | "macros.use"
  | "macros.manage"
  | "reports.view"
  | "analytics.view"
  | "custom_fields.manage"
  | "conversations.view"
  | "conversations.reply";

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  super_admin: new Set([
    "dashboard.view", "tickets.view", "tickets.manage", "customers.view",
    "customers.manage", "billing.view", "billing.manage", "channels.manage",
    "team.view", "team.manage", "ai.configure", "ai.use", "ai.manage",
    "kb.view", "kb.manage", "knowledge.publish", "automations.manage",
    "sla.manage", "labels.manage", "webhooks.manage", "api_keys.manage",
    "platform.admin", "macros.use", "macros.manage", "reports.view",
    "analytics.view", "custom_fields.manage", "conversations.view", "conversations.reply",
  ]),
  owner: new Set([
    "dashboard.view", "tickets.view", "tickets.manage", "customers.view",
    "customers.manage", "billing.view", "billing.manage", "channels.manage",
    "team.view", "team.manage", "ai.configure", "ai.use", "ai.manage",
    "kb.view", "kb.manage", "knowledge.publish", "automations.manage",
    "sla.manage", "labels.manage", "webhooks.manage", "api_keys.manage",
    "macros.use", "macros.manage", "reports.view", "analytics.view",
    "custom_fields.manage", "conversations.view", "conversations.reply",
  ]),
  agent: new Set([
    "dashboard.view", "tickets.view", "tickets.manage", "customers.view",
    "team.view", "kb.view", "labels.manage", "ai.use", "macros.use",
    "reports.view", "analytics.view", "conversations.view", "conversations.reply",
  ]),
  customer: new Set(["ai.use"]),
};

export function useHasPerm(perm: Permission): boolean {
  const { role } = useAuth();
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(perm) ?? false;
}

interface PermissionGateProps {
  perm: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ perm, children, fallback = null }: PermissionGateProps) {
  const has = useHasPerm(perm);
  return has ? React.createElement(React.Fragment, null, children) : React.createElement(React.Fragment, null, fallback);
}
