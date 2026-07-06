"use client";

import { notifyPopupResultAndClose } from "@/lib/desktop-bridge";
import { PAYMENT_RESULT_MESSAGE_TYPE } from "@/lib/commerce-api";

export async function notifyOpenerAndClosePayment(success: boolean, message?: string) {
  return notifyPopupResultAndClose(PAYMENT_RESULT_MESSAGE_TYPE, { success, message });
}
