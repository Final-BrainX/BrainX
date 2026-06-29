"use client";

import type { Subscription } from "@/lib/commerce-api";

type PlanLike = {
  planId?: string | null;
  name?: string | null;
} | null | undefined;

type FormatPlanLabelInput = {
  planId?: string | null;
  planName?: string | null;
  status?: string | null;
  fallback?: string;
};

function normalizePlanName(value: string | null | undefined) {
  const name = value?.trim();
  if (!name) return "";
  return name === "무료" ? "Free" : name;
}

export function formatPlanLabel({ planId, planName, status, fallback = "Free" }: FormatPlanLabelInput) {
  const normalizedStatus = status?.toUpperCase?.() ?? "";
  if (!planId || planId === "free" || normalizedStatus === "FREE" || normalizedStatus === "CANCELLED") {
    return "Free";
  }

  const normalizedName = normalizePlanName(planName);
  return normalizedName || fallback;
}

export function formatSubscriptionPlanLabel(subscription: Subscription | null, fallback = "Free") {
  return formatPlanLabel({
    planId: subscription?.plan.planId,
    planName: subscription?.plan.name,
    status: subscription?.status,
    fallback
  });
}

export function formatPlanLikeLabel(plan: PlanLike, fallback = "Free") {
  return formatPlanLabel({
    planId: plan?.planId,
    planName: plan?.name,
    fallback
  });
}
