import { createHash } from "node:crypto";
import { Resend } from "resend";
import { AppointmentModel } from "../models/appointment";
import { ContactMessageModel } from "../models/contactMessage";
import { EmailNotificationModel } from "../models/notification";
import { ReferralModel } from "../models/referral";
import { logger } from "../lib/logger";

export type NotificationStatus = "accepted" | "delivered" | "failed" | "not_configured";

interface NotificationRequest {
  entityType: "appointment" | "referral" | "contact";
  entityId: string;
  entityReference: string;
  event: string;
  recipient: string;
}

function notificationKey(input: NotificationRequest): string {
  return createHash("sha256")
    .update(`${input.entityType}:${input.entityId}:${input.event}:${input.recipient.toLowerCase()}`)
    .digest("hex");
}

async function notificationMessage(
  notification: NotificationRequest,
): Promise<{ subject: string; html: string; text: string }> {
  if (notification.entityType === "contact") {
    const contact = await ContactMessageModel.findById(notification.entityId);
    if (!contact) {
      throw new Error("Contact message for notification was not found.");
    }
    return {
      subject: `Website contact message · ${contact.reference}`,
      text: `A website contact message was received from ${contact.name}. Reference ${contact.reference}. Review the protected admin dashboard for details.`,
      html: `<p>A website contact message was received.</p><p>Reference: <strong>${escapeHtml(contact.reference)}</strong></p><p>Review details in the protected admin dashboard.</p>`,
    };
  }
  if (notification.entityType === "appointment") {
    const appointment = await AppointmentModel.findById(notification.entityId);
    if (!appointment) {
      throw new Error("Appointment record for notification was not found.");
    }

    const locationName = appointment.locationName;
    const date = appointment.localDate;
    const time = appointment.slotId;
    if (notification.event === "appointment.patient_confirm") {
      return {
        subject: `Appointment request confirmed · ${appointment.reference}`,
        text: `Your appointment at ${locationName} is confirmed for ${date} at ${time}. Reference: ${appointment.reference}.`,
        html: `<p>Your appointment at ${escapeHtml(locationName)} is confirmed for ${escapeHtml(date)} at ${escapeHtml(time)}.</p><p>Reference: <strong>${escapeHtml(appointment.reference)}</strong></p>`,
      };
    }
    if (notification.event === "appointment.cancelled") {
      return {
        subject: `Appointment update · ${appointment.reference}`,
        text: `Appointment ${appointment.reference} has been cancelled.`,
        html: `<p>Appointment <strong>${escapeHtml(appointment.reference)}</strong> has been cancelled.</p>`,
      };
    }
    if (notification.event === "appointment.rescheduled") {
      return {
        subject: `Appointment update · ${appointment.reference}`,
        text: `Appointment ${appointment.reference} is now scheduled for ${date} at ${time}.`,
        html: `<p>Appointment <strong>${escapeHtml(appointment.reference)}</strong> is now scheduled for ${escapeHtml(date)} at ${escapeHtml(time)}.</p>`,
      };
    }
    return {
      subject: `New appointment · ${appointment.reference}`,
      text: `A new appointment booking was recorded. Reference ${appointment.reference}. Review the protected admin dashboard for details.`,
      html: `<p>A new appointment booking was recorded.</p><p>Reference: <strong>${escapeHtml(appointment.reference)}</strong></p><p>Review details in the protected admin dashboard.</p>`,
    };
  }

  const referral = await ReferralModel.findById(notification.entityId);
  if (!referral) {
    throw new Error("Referral record for notification was not found.");
  }
  if (notification.event === "referral.dentist_receipt") {
    return {
      subject: `Referral received · ${referral.reference}`,
      text: `Your referral has been received. This receipt confirms submission only; it does not confirm acceptance or an appointment. Reference: ${referral.reference}.`,
      html: `<p>Your referral has been received.</p><p>This receipt confirms submission only; it does not confirm acceptance or an appointment.</p><p>Reference: <strong>${escapeHtml(referral.reference)}</strong></p>`,
    };
  }
  return {
    subject: `New dentist referral · ${referral.reference}`,
    text: `A dentist referral was submitted. Reference ${referral.reference}. Review the protected admin dashboard for details.`,
    html: `<p>A dentist referral was submitted.</p><p>Reference: <strong>${escapeHtml(referral.reference)}</strong></p><p>Review details in the protected admin dashboard.</p>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function deliver(
  id: string,
  notification: NotificationRequest,
  allowRetry: boolean,
): Promise<NotificationStatus> {
  const current = await EmailNotificationModel.findById(id);
  if (!current) {
    throw new Error("Email notification record was not found.");
  }
  if ((current.status as string) === "sent") {
    await EmailNotificationModel.updateOne(
      { _id: id },
      { $set: { status: "accepted" } },
    );
    return "accepted";
  }
  if (current.status === "accepted" || current.status === "delivered") {
    return current.status;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    await EmailNotificationModel.updateOne(
      { _id: id },
      {
        $set: {
          status: "not_configured",
          lastError: "RESEND_API_KEY and EMAIL_FROM must be configured.",
          retryLockUntil: null,
        },
      },
    );
    return "not_configured";
  }

  const now = new Date();
  const lockUntil = new Date(now.getTime() + 60_000);
  const claimed = await EmailNotificationModel.findOneAndUpdate(
    {
      _id: id,
      status: { $nin: ["accepted", "delivered"] },
      $or: [
        { retryLockUntil: null },
        { retryLockUntil: { $exists: false } },
        { retryLockUntil: { $lte: now } },
      ],
      ...(allowRetry ? {} : { attempts: 0 }),
    },
    {
      $set: { retryLockUntil: lockUntil },
      $inc: { attempts: 1 },
    },
    { new: true },
  );
  if (!claimed) {
    const fresh = await EmailNotificationModel.findById(id);
    return (fresh?.status ?? "failed") as NotificationStatus;
  }

  try {
    const message = await notificationMessage(notification);
    const resend = new Resend(apiKey);
    const response = await resend.emails.send(
      { from, to: [notification.recipient], ...message },
      { idempotencyKey: claimed.idempotencyKey },
    );
    if (response.error || !response.data?.id) {
      throw new Error(response.error?.message ?? "Email provider did not accept the message.");
    }
    await EmailNotificationModel.updateOne(
      { _id: id },
      {
        $set: {
          status: "accepted",
          providerMessageId: response.data.id,
          lastError: null,
          retryLockUntil: null,
        },
      },
    );
    return "accepted";
  } catch (error) {
    const safeMessage =
      error instanceof Error && error.message.includes("HTTP ")
        ? error.message
        : "Email delivery failed; retry from the admin dashboard.";
    await EmailNotificationModel.updateOne(
      { _id: id },
      { $set: { status: "failed", lastError: safeMessage, retryLockUntil: null } },
    );
    logger.warn(
      { notificationId: id, event: notification.event },
      "Email notification delivery failed",
    );
    return "failed";
  }
}

export async function sendNotification(
  input: NotificationRequest,
): Promise<{ status: NotificationStatus; id: string }> {
  const idempotencyKey = notificationKey(input);
  const record = await EmailNotificationModel.findOneAndUpdate(
    { idempotencyKey },
    {
      $setOnInsert: {
        ...input,
        idempotencyKey,
        status: "not_configured",
        attempts: 0,
        lastError: null,
        retryLockUntil: null,
      },
    },
    { upsert: true, new: true },
  );
  const status = await deliver(String(record._id), input, false);
  return { status, id: String(record._id) };
}

export async function retryNotification(
  id: string,
): Promise<NotificationStatus | null> {
  const record = await EmailNotificationModel.findById(id);
  if (!record) {
    return null;
  }
  if ((record.status as string) === "sent") {
    await EmailNotificationModel.updateOne(
      { _id: record._id },
      { $set: { status: "accepted" } },
    );
    return "accepted";
  }
  if (record.status === "accepted" || record.status === "delivered") {
    return record.status;
  }
  if (record.status === "not_configured" && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) {
    return "not_configured";
  }
  return deliver(
    String(record._id),
    {
      entityType: record.entityType,
      entityId: record.entityId,
      entityReference: record.entityReference,
      event: record.event,
      recipient: record.recipient,
    },
    true,
  );
}

export async function notifyAppointment(
  appointment: {
    _id: unknown;
    reference: string;
    email: string | null;
  },
  change?: "cancelled" | "rescheduled",
): Promise<NotificationStatus> {
  const id = String(appointment._id);
  const doctorEmail = process.env.DOCTOR_EMAIL || "drcharu.25@gmail.com";
  const doctorStatus = await sendNotification({
    entityType: "appointment",
    entityId: id,
    entityReference: appointment.reference,
    event: change ? `appointment.${change}` : "appointment.doctor_new",
    recipient: doctorEmail,
  });
  if (!appointment.email) {
    return doctorStatus.status;
  }
  const patientStatus = await sendNotification({
    entityType: "appointment",
    entityId: id,
    entityReference: appointment.reference,
    event: change
      ? `appointment.${change}`
      : "appointment.patient_confirm",
    recipient: appointment.email,
  });
  return patientStatus.status;
}

export async function notifyReferral(referral: {
  _id: unknown;
  reference: string;
  dentistEmail: string;
}): Promise<NotificationStatus> {
  const id = String(referral._id);
  const doctorEmail = process.env.DOCTOR_EMAIL || "drcharu.25@gmail.com";
  await sendNotification({
    entityType: "referral",
    entityId: id,
    entityReference: referral.reference,
    event: "referral.doctor_new",
    recipient: doctorEmail,
  });
  const receipt = await sendNotification({
    entityType: "referral",
    entityId: id,
    entityReference: referral.reference,
    event: "referral.dentist_receipt",
    recipient: referral.dentistEmail,
  });
  return receipt.status;
}

export async function notifyContactMessage(contact: {
  _id: unknown;
  reference: string;
}): Promise<NotificationStatus> {
  return (
    await sendNotification({
      entityType: "contact",
      entityId: String(contact._id),
      entityReference: contact.reference,
      event: "contact.doctor_new",
      recipient: process.env.DOCTOR_EMAIL || "drcharu.25@gmail.com",
    })
  ).status;
}

export async function recordResendWebhook(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
): Promise<void> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Resend webhook verification is not configured.");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const event = resend.webhooks.verify({
    payload,
    headers,
    webhookSecret,
  });
  if (!("email_id" in event.data) || typeof event.data.email_id !== "string") {
    throw new Error("Resend webhook event does not include an email ID.");
  }
  const emailId = event.data.email_id;
  if (event.type === "email.delivered") {
    await EmailNotificationModel.updateOne(
      { providerMessageId: emailId },
      { $set: { status: "delivered", lastError: null } },
    );
  } else if (event.type === "email.bounced" || event.type === "email.failed") {
    await EmailNotificationModel.updateOne(
      { providerMessageId: emailId },
      { $set: { status: "failed", lastError: `Resend reported ${event.type}.` } },
    );
  }
}
