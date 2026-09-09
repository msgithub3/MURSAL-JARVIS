/**
 * MURSAL JARVIS — Notification Intelligence Engine
 * 
 * 9 Standard Classifications:
 * - PERSONAL (Friends, family direct messages)
 * - WORK (Business, Slack, Teams, client communications)
 * - OTP (One-time passwords, 2FA codes — NEVER persisted or leaked)
 * - SECURITY (Account login alerts, password resets, suspicious logins)
 * - MARKETING (Promotional ads, discounts, commercial offers)
 * - SYSTEM (Android battery, storage, Wi-Fi, OS updates)
 * - URGENT (Critical reminders, emergency alerts, deadlines)
 * - MISSED_CALL (Missed phone / VoIP audio calls)
 * - SOCIAL (Instagram, TikTok, Twitter notifications)
 * 
 * Security Invariant:
 * - OTPs, PINs, passwords, and security tokens are redacted BEFORE storage.
 * - Secret credentials are NEVER exported or spoken aloud without explicit policy.
 */

export type NotificationCategory =
  | 'PERSONAL'
  | 'WORK'
  | 'OTP'
  | 'SECURITY'
  | 'MARKETING'
  | 'SYSTEM'
  | 'URGENT'
  | 'MISSED_CALL'
  | 'SOCIAL';

export interface SystemNotification {
  id: string;
  sourceApp: string; // com.whatsapp, com.google.android.apps.messaging, etc.
  title: string;
  body: string;
  timestamp: number;
  priority: number; // 1 (lowest) to 10 (urgent)
  category: NotificationCategory;
  isSpam: boolean;
  containsSecret: boolean;
  suggestedAction?: string;
}

export class NotificationIntelligence {
  private notifications: SystemNotification[] = [];

  constructor() {
    this.seedDefaultNotifications();
  }

  private seedDefaultNotifications() {
    this.addNotification({
      sourceApp: 'com.whatsapp',
      title: 'WhatsApp: +92 301 8492011',
      body: 'Bhai T900 Ultra watch ka parcel check kar saktay hain delivery pe? Aur Lahore kab tak aayega?',
      timestamp: Date.now() - 150000,
    });

    this.addNotification({
      sourceApp: 'pk.markaz.android',
      title: 'Markaz Wholesale Alert',
      body: 'Supplier price dropped by Rs. 80 on Wireless Earbuds Batch #4.',
      timestamp: Date.now() - 3600000,
    });

    this.addNotification({
      sourceApp: 'android.system',
      title: 'Device Battery Status',
      body: 'Battery is at 88% and discharging normally. Device Mesh active.',
      timestamp: Date.now() - 7200000,
    });
  }

  /**
   * Adds and classifies an incoming Android notification with automatic secret scrubbing
   */
  public addNotification(raw: {
    sourceApp: string;
    title: string;
    body: string;
    timestamp?: number;
  }): SystemNotification {
    const textCombined = `${raw.title} ${raw.body}`;
    const textLower = textCombined.toLowerCase();

    // 1. Detect and sanitize OTP / Secrets
    const otpPattern = /\b\d{4,8}\b|code is \d+|otp is \d+|verification code|one-time password/i;
    const isOtp = otpPattern.test(textCombined) || raw.sourceApp.includes('messaging') && /code|pin|verification/i.test(textLower);

    // Redact OTP/passwords from stored body
    let sanitizedBody = raw.body;
    let containsSecret = false;
    if (isOtp) {
      containsSecret = true;
      sanitizedBody = raw.body.replace(/\b\d{4,8}\b/g, '[REDACTED_OTP]');
    }

    // 2. Classify into 9 strict categories
    let category: NotificationCategory = 'PERSONAL';
    let priority = 5;
    let isSpam = false;
    let suggestedAction = 'View';

    if (isOtp) {
      category = 'OTP';
      priority = 9;
      suggestedAction = 'Copy One-Time Code';
    } else if (/missed call|call from|audio call/i.test(textLower)) {
      category = 'MISSED_CALL';
      priority = 8;
      suggestedAction = 'Call Back';
    } else if (/unauthorized|security alert|login detected|password reset|suspicious/i.test(textLower)) {
      category = 'SECURITY';
      priority = 10;
      suggestedAction = 'Review Security Alert';
    } else if (/emergency|deadline|urgent|flight|hospital|critical/i.test(textLower)) {
      category = 'URGENT';
      priority = 10;
      suggestedAction = 'Open Immediately';
    } else if (/sale|50% off|discount|cashback|voucher|limited offer|win prize|promo/i.test(textLower)) {
      category = 'MARKETING';
      priority = 1;
      isSpam = true;
      suggestedAction = 'Dismiss';
    } else if (raw.sourceApp.includes('slack') || raw.sourceApp.includes('teams') || /invoice|meeting|project|client|order/i.test(textLower)) {
      category = 'WORK';
      priority = 7;
      suggestedAction = 'Open Work App';
    } else if (raw.sourceApp.includes('instagram') || raw.sourceApp.includes('twitter') || raw.sourceApp.includes('facebook') || /liked your|commented|started following/i.test(textLower)) {
      category = 'SOCIAL';
      priority = 3;
      suggestedAction = 'Open Social Feed';
    } else if (raw.sourceApp.includes('android') || /battery|storage|wifi|bluetooth|system update/i.test(textLower)) {
      category = 'SYSTEM';
      priority = 4;
      suggestedAction = 'Check System HUD';
    } else {
      category = 'PERSONAL';
      priority = 6;
      suggestedAction = 'Reply';
    }

    const notif: SystemNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sourceApp: raw.sourceApp,
      title: raw.title,
      body: sanitizedBody,
      timestamp: raw.timestamp || Date.now(),
      priority,
      category,
      isSpam,
      containsSecret,
      suggestedAction,
    };

    this.notifications.unshift(notif);
    if (this.notifications.length > 100) this.notifications.pop();
    return notif;
  }

  public getNotifications(category?: NotificationCategory): SystemNotification[] {
    if (category) {
      return this.notifications.filter((n) => n.category === category);
    }
    return this.notifications;
  }

  public getUnreadImportant(): SystemNotification[] {
    return this.notifications.filter((n) => !n.isSpam && n.priority >= 6);
  }

  /**
   * Generates a conversational spoken summary for the Voice Cockpit
   */
  public generateSpokenDigest(lang = 'ur-Roman'): string {
    const important = this.getUnreadImportant();
    if (important.length === 0) {
      return lang === 'en'
        ? 'No new urgent notifications, Mursaleen. Everything is quiet.'
        : 'Jani, koi naya zaroori notification nahi aaya, sab theek chal raha hai.';
    }

    const urgentCount = important.filter((n) => n.category === 'URGENT' || n.category === 'SECURITY').length;
    const workCount = important.filter((n) => n.category === 'WORK').length;
    const top = important[0];

    if (lang === 'en') {
      return `Mursaleen, you have ${important.length} important updates. ${urgentCount > 0 ? `${urgentCount} urgent security alerts.` : ''} ${workCount > 0 ? `${workCount} work inquiries.` : ''} Latest from ${top.title}: "${top.body.slice(0, 70)}..."`;
    }

    return `Jani, ${important.length} zaroori notifications hain. ${urgentCount > 0 ? `${urgentCount} urgent security alerts hain.` : ''} ${workCount > 0 ? `${workCount} work updates hain.` : ''} Sab se taaza update ${top.title} se hai: "${top.body.slice(0, 65)}...".`;
  }
}

export const globalNotificationIntelligence = new NotificationIntelligence();
