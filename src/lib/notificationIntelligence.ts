/**
 * MURSAL JARVIS — Notification Intelligence Engine
 * 
 * Capabilities:
 * - Smart Categorization (CUSTOMER_ORDER, CHAT_VIP, SYSTEM_BATTERY, SECURITY, PROMO_SPAM)
 * - Priority Scoring (1 to 10)
 * - Spam / Marketing Noise Suppression
 * - Conversational Pakistani Read-Aloud Audio Summarizer
 * - Quick Action Suggestions (e.g. "Draft WhatsApp Reply", "Inspect Node")
 */

export interface SystemNotification {
  id: string;
  sourceApp: string; // com.whatsapp, com.daraz, pk.markaz, android
  title: string;
  body: string;
  timestamp: number;
  priority: number; // 1 (lowest) to 10 (urgent)
  category: 'CUSTOMER_ORDER' | 'CHAT_VIP' | 'SYSTEM_ALERT' | 'SECURITY' | 'PROMO_SPAM';
  isSpam: boolean;
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

  public addNotification(raw: { sourceApp: string; title: string; body: string; timestamp: number }): SystemNotification {
    const textLower = `${raw.title} ${raw.body}`.toLowerCase();

    // 1. Spam detection
    const isSpam = /sale sale|50% off|limited offer|download now|jackpot|free spins/i.test(textLower);

    // 2. Category & Priority classification
    let category: SystemNotification['category'] = 'CHAT_VIP';
    let priority = 5;
    let suggestedAction = 'Mark as Read';

    if (raw.sourceApp.includes('markaz') || raw.sourceApp.includes('daraz') || textLower.includes('order') || textLower.includes('parcel')) {
      category = 'CUSTOMER_ORDER';
      priority = 9;
      suggestedAction = 'Draft Customer Reply';
    } else if (textLower.includes('battery') || textLower.includes('storage') || textLower.includes('wifi')) {
      category = 'SYSTEM_ALERT';
      priority = 6;
      suggestedAction = 'Check Device HUD';
    } else if (textLower.includes('alarm') || textLower.includes('security') || textLower.includes('lost')) {
      category = 'SECURITY';
      priority = 10;
      suggestedAction = 'Sound Anti-Loss Siren';
    } else if (isSpam) {
      category = 'PROMO_SPAM';
      priority = 1;
      suggestedAction = 'Dismiss';
    }

    const notif: SystemNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sourceApp: raw.sourceApp,
      title: raw.title,
      body: raw.body,
      timestamp: raw.timestamp || Date.now(),
      priority,
      category,
      isSpam,
      suggestedAction,
    };

    this.notifications.unshift(notif);
    if (this.notifications.length > 50) this.notifications.pop();
    return notif;
  }

  public getUnreadImportant(): SystemNotification[] {
    return this.notifications.filter((n) => !n.isSpam && n.priority >= 5);
  }

  /**
   * Generates a conversational Pakistani spoken digest for JARVIS
   */
  public generateSpokenDigest(lang = 'ur-Roman'): string {
    const important = this.getUnreadImportant();
    if (important.length === 0) {
      return lang === 'en'
        ? 'No new urgent notifications, Mursaleen. Everything is quiet.'
        : 'Jani, koi naya zaroori notification nahi aaya, sab theek chal raha hai.';
    }

    const orderCount = important.filter((n) => n.category === 'CUSTOMER_ORDER').length;
    const topMsg = important[0];

    if (lang === 'en') {
      return `Mursaleen, you have ${important.length} important updates. ${orderCount > 0 ? `${orderCount} customer order inquiries pending.` : ''} Latest: ${topMsg.title}: "${topMsg.body.slice(0, 70)}..."`;
    }

    return `Jani, ${important.length} zaroori notifications hain. ${orderCount > 0 ? `${orderCount} customer order inquiries aayi hui hain.` : ''} Sab se taaza update: ${topMsg.title} se hai: "${topMsg.body.slice(0, 65)}...". Kya reply tayyar karoon?`;
  }
}

export const globalNotificationIntelligence = new NotificationIntelligence();
