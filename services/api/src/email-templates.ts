import type { EmailOutbox } from '@prisma/client';
import { currentCalendarYear } from './calendar.js';

// The look of every V MOTIV email. One layout, light and easy to read:
//   - a brand-navy header band with the white logo (the logo file is white, so it needs a dark background),
//   - a clean white card with the title, a short status label, the message, and one clear button,
//   - lines written as "Label: value" shown as a tidy details table, bullets as lists, and plain web addresses as links,
//   - a quiet footer with the support contact.
// It is built with tables and inline styles because email apps (Outlook, Gmail, Apple Mail) ignore most modern CSS. The plain-text version
// of each email is sent separately and is unchanged.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export type EmailTemplateData = {
  templateVersion: string;
  subject: string;
  text: string;
  recipient: string;
  webOrigin?: string;
  headerLogoUrl?: string;
  footerLockupUrl?: string; // Retained for backwards compatibility
};

// Hosted on our own domain (a third-party image host once removed the file and left a broken image in every email).
export const BRAND_HEADER_LOGO_URL = 'https://vmotiv.in/brand/vmotiv-header-logo.png';
export const BRAND_FOOTER_LOCKUP_URL = 'https://vmotiv.in/brand/vmotiv-logo.png'; // Retained for backwards compatibility

// ------------------------------------------------------------------------------------------------------------------------------------
// Colours. Text on white is always dark enough to read comfortably (all pairs here pass WCAG AA).
// ------------------------------------------------------------------------------------------------------------------------------------
const NAVY = '#061A38';
const YELLOW = '#F7B503';
const INK = '#1F2937'; // body text
const MUTED = '#64748B'; // labels and small print (4.8:1 on white)
const LINE = '#E5EAF2';
const PAGE = '#F3F5F9';
const SOFT = '#F8FAFC';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

type Tone = 'brand' | 'success' | 'danger' | 'info' | 'neutral';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: '#FEF3C7', fg: '#92400E' },
  success: { bg: '#D1FAE5', fg: '#047857' },
  danger: { bg: '#FEE2E2', fg: '#B91C1C' },
  info: { bg: '#DBEAFE', fg: '#1D4ED8' },
  neutral: { bg: '#E5E7EB', fg: '#374151' },
};

interface TemplateSpec {
  /** Short status label shown above the title. */
  badge: string;
  tone: Tone;
  /** Button text. */
  cta: string;
  /** Where the button goes, relative to the website address. */
  ctaPath: string;
  /** One line saying what kind of email this is. */
  subtitle: string;
  /** A short note at the bottom; falls back to the general promise. */
  assurance?: [title: string, body: string];
}

const DEFAULT_ASSURANCE: [string, string] = ['V MOTIV Promise:', 'Complete transparency, verified standards, and total accountability across all automotive services.'];

const DEFAULT_SPEC: TemplateSpec = { badge: 'NOTIFICATION', tone: 'brand', cta: 'Open V MOTIV App', ctaPath: '', subtitle: 'V MOTIV Automotive Mobility Ecosystem' };

const ACCOUNT = '/account';

const TEMPLATES: Record<string, Partial<TemplateSpec>> = {
  'purchase-enquiry-v1': {
    badge: 'ENQUIRY RECORDED', cta: 'View in Activity', ctaPath: ACCOUNT, subtitle: 'Vehicle Purchase Enquiry Confirmation',
    assurance: ['180-Point Certification:', 'Every V MOTIV pre-owned vehicle undergoes our strict 180-point mechanical, structural, and electrical certification. No surprises. No rollbacks.'],
  },
  'test-drive-requested-v1': {
    badge: 'TEST DRIVE REQUEST', cta: 'Manage Appointment', ctaPath: ACCOUNT, subtitle: 'Test Drive Schedule Request',
    assurance: ['Doorstep & Hub Drives:', 'All test drive vehicles are sanitised, inspected, and accompanied by certified automotive specialists.'],
  },
  'selling-requested-v1': {
    badge: 'SELLING REQUEST', cta: 'Track Valuation', ctaPath: ACCOUNT, subtitle: 'Doorstep Valuation & Inspection Request',
    assurance: ['Guaranteed Purchase:', 'Transparent fair-market pricing, free 180-point inspection, instant bank transfer, and free RC transfer.'],
  },
  'offer-accepted-v1': { badge: 'OFFER ACCEPTED', tone: 'success', cta: 'View Offer Details', ctaPath: ACCOUNT, subtitle: 'Direct Purchase Agreement Confirmation' },
  'offer-declined-v1': { badge: 'OFFER DECLINED', tone: 'neutral', cta: 'View in Activity', ctaPath: ACCOUNT, subtitle: 'Acquisition Offer Update' },
  'rental-booking-confirmed-v1': {
    badge: 'RENTAL CONFIRMED', tone: 'success', cta: 'View Rental Booking', ctaPath: ACCOUNT, subtitle: 'Self-Drive Fleet Booking Confirmed',
    assurance: ['V MOTIV Rental Assurance:', 'Sanitized, GPS-enabled fleet with comprehensive vehicle insurance, transparent fuel policy, and 24/7 Roadside Assistance hotline (1800-866-848).'],
  },
  'rental-kyc-reviewed-v1': {
    badge: 'RENTAL KYC', tone: 'info', cta: 'View Verification', ctaPath: ACCOUNT, subtitle: 'Driver KYC Document Review Update',
    assurance: ['Safe Driving Compliance:', 'Strict identity verification ensures road safety and fleet security for all drivers across our network.'],
  },
  'rental-trip-started-v1': {
    badge: 'TRIP ACTIVE', cta: 'View Active Trip', ctaPath: ACCOUNT, subtitle: 'Vehicle Handover Completed · Have a Safe Drive',
    assurance: ['24/7 Roadside Assistance:', 'In case of breakdown, puncture, or towing emergency, call our immediate response helpline at 1800-866-848.'],
  },
  'rental-trip-returned-v1': {
    badge: 'TRIP CONCLUDED', tone: 'success', cta: 'View Settlement & Refund', ctaPath: ACCOUNT, subtitle: 'Vehicle Return & Deposit Settlement Summary',
    assurance: ['Deposit Refund Guarantee:', 'Security deposit refunds are automatically processed to your original payment method within 3 to 5 business days.'],
  },
  'rental-booking-cancelled-v1': {
    badge: 'RENTAL CANCELLED', tone: 'danger', cta: 'View Booking Status', ctaPath: ACCOUNT, subtitle: 'Rental Booking Cancellation & Refund',
    assurance: ['Cancellation Policy:', 'Eligible refunds are processed directly per our transparent cancellation terms without hidden deductions.'],
  },
  'service-request-submitted-v1': {
    badge: 'SERVICE CONFIRMED', tone: 'success', cta: 'Track Service Job', ctaPath: ACCOUNT, subtitle: 'Workshop Service Booking Scheduled',
    assurance: ['V MOTIV Workshop Guarantee:', 'Certified technicians, genuine OEM/OES spares, itemized estimate approvals, and multi-point quality control.'],
  },
  'service-cancelled-v1': { badge: 'SERVICE CANCELLED', tone: 'danger', cta: 'View Service Details', ctaPath: ACCOUNT, subtitle: 'Workshop Service Request Cancelled' },
  'support-case-v1': {
    badge: 'SUPPORT TICKET', cta: 'View Support Case', ctaPath: '/support', subtitle: 'Customer Support Request Received',
    assurance: ['Dedicated Customer Support:', 'Our customer care team tracks every ticket with end-to-end accountability. Direct response within 24 hours.'],
  },
  'support-reply-v1': { badge: 'CASE UPDATE', cta: 'View Conversation', ctaPath: '/support', subtitle: 'New Support Message on Case' },
  'welcome-v1': { badge: 'ACCOUNT CONFIRMED', tone: 'success', cta: 'Browse Verified Cars', ctaPath: '', subtitle: 'Welcome to Total Certainty in Automotive Mobility' },
  'retail-quotation-v1': { badge: 'OFFICIAL QUOTATION', tone: 'info', cta: 'View & Accept Quotation', ctaPath: ACCOUNT, subtitle: 'Authorized Retail Quotation' },
  'employee-invitation-v1': {
    badge: 'EMPLOYEE INVITATION', cta: 'Review invitation', ctaPath: '', subtitle: 'Secure Employee Onboarding',
    assurance: ['Secure Workspace Access:', 'This invitation is protected with time-limited single-use authentication tokens and multi-factor authorization.'],
  },
  'inspection-assigned-v1': { badge: 'INSPECTION ASSIGNED', cta: 'Open Inspector App', ctaPath: '/inspector', subtitle: 'New Vehicle Inspection Assignment' },
  'inspection-rework-v1': { badge: 'CORRECTIONS REQUIRED', tone: 'danger', cta: 'Review Feedback', ctaPath: '/inspector', subtitle: 'Reviewer Feedback on Inspection Report' },
  'inspection-approved-v1': { badge: 'INSPECTION APPROVED', tone: 'success', cta: 'View Certification', ctaPath: '/inspection-review', subtitle: 'Vehicle Certification Report Approved' },
  'inspection-requested-v1': { badge: 'INSPECTION REQUEST', tone: 'info', cta: 'Open Operations', ctaPath: '/operations', subtitle: 'New Inspection Request in Dispatch Queue' },
  'offer-communicated-v1': { badge: 'PURCHASE OFFER', tone: 'success', cta: 'Review Offer', ctaPath: ACCOUNT, subtitle: 'Official Acquisition Offer for Your Vehicle' },
  'payment-verified-v1': { badge: 'PAYMENT VERIFIED', tone: 'success', cta: 'View Account', ctaPath: ACCOUNT, subtitle: 'Direct Purchase Payment Processed' },
};

// ------------------------------------------------------------------------------------------------------------------------------------
// The message body. The emails are written as plain text; this turns that text into clean HTML without changing what it says.
// ------------------------------------------------------------------------------------------------------------------------------------

const BULLET = /^\s*[•\-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
/** "Label: value" (the label is short and has no colon of its own). */
const KEY_VALUE = /^([^:\n]{1,42}?):\s+(\S.*)$/;
/** A line that only names a section: "Appointment Details:". */
const HEADING = /^[^:\n]{1,60}:$/;

/** Escapes text, then turns web addresses into links. Done in this order so nothing the sender typed can become markup. */
function inline(raw: string): string {
  return escapeHtml(raw).replace(/https?:\/\/[^\s<]+/g, match => {
    const trailing = /[.,;:!?)]+$/.exec(match)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `<a href="${url}" style="color: #1D4ED8; text-decoration: underline; word-break: break-all;">${url}</a>${trailing}`;
  });
}

const P = `margin: 0 0 16px 0; font-size: 15px; line-height: 1.65; color: ${INK};`;

function detailsTable(rows: Array<[string, string]>): string {
  const cells = rows.map(([label, value], index) => {
    const border = index === rows.length - 1 ? '' : `border-bottom: 1px solid ${LINE};`;
    return `<tr>
          <td valign="top" style="padding: 11px 14px; ${border} font-size: 13px; line-height: 1.5; color: ${MUTED}; width: 42%;">${inline(label)}</td>
          <td valign="top" style="padding: 11px 14px; ${border} font-size: 14px; line-height: 1.5; color: #0F172A; font-weight: 600;">${inline(value)}</td>
        </tr>`;
  }).join('\n        ');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px 0; background-color: ${SOFT}; border: 1px solid ${LINE}; border-radius: 8px; border-collapse: separate;">
        ${cells}
      </table>`;
}

function list(items: string[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul';
  const lis = items.map(item => `<li style="margin: 0 0 6px 0; padding-left: 2px;">${inline(item)}</li>`).join('');
  return `<${tag} style="margin: 0 0 16px 0; padding: 0 0 0 22px; font-size: 15px; line-height: 1.6; color: ${INK};">${lis}</${tag}>`;
}

const QUOTE_STYLE = `margin: 0 0 18px 0; padding: 12px 16px; background-color: ${SOFT}; border-left: 3px solid ${YELLOW}; border-radius: 4px; font-size: 15px; line-height: 1.6; color: #334155; font-style: italic;`;
const isQuoted = (line: string) => line.length > 1 && line.startsWith('"') && line.endsWith('"');

/** The email text as HTML. Exported for tests. */
export function renderEmailBody(text: string): string {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
  const out: string[] = [];

  for (const block of blocks) {
    // A quoted message (for example what the customer wrote).
    if (isQuoted(block)) {
      out.push(`<blockquote style="${QUOTE_STYLE}">${inline(block).replace(/\n/g, '<br>')}</blockquote>`);
      continue;
    }

    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;

      // A quoted line inside a block, for example the customer's message right under its heading.
      if (isQuoted(line)) {
        out.push(`<blockquote style="${QUOTE_STYLE}">${inline(line)}</blockquote>`);
        i += 1;
        continue;
      }

      if (HEADING.test(line)) {
        out.push(`<p style="margin: 22px 0 8px 0; font-size: 15px; font-weight: 700; color: ${NAVY};">${inline(line)}</p>`);
        i += 1;
        continue;
      }

      // A run of bullets or numbered lines. If every one is "Label: value" it is a details table, otherwise a list.
      if (BULLET.test(line) || NUMBERED.test(line)) {
        const ordered = NUMBERED.test(line) && !BULLET.test(line);
        const matcher = ordered ? NUMBERED : BULLET;
        const items: string[] = [];
        while (i < lines.length && matcher.test(lines[i]!)) { items.push(matcher.exec(lines[i]!)![1]!.trim()); i += 1; }
        const pairs = items.map(item => KEY_VALUE.exec(item));
        if (!ordered && pairs.every(Boolean)) out.push(detailsTable(pairs.map(pair => [pair![1]!, pair![2]!] as [string, string])));
        else out.push(list(items, ordered));
        continue;
      }

      // A run of "Label: value" lines is a details table.
      if (KEY_VALUE.test(line)) {
        const rows: Array<[string, string]> = [];
        while (i < lines.length && KEY_VALUE.test(lines[i]!) && !BULLET.test(lines[i]!) && !NUMBERED.test(lines[i]!)) {
          const match = KEY_VALUE.exec(lines[i]!)!;
          rows.push([match[1]!, match[2]!]);
          i += 1;
        }
        out.push(detailsTable(rows));
        continue;
      }

      // Plain sentences until the next structured line.
      const sentences: string[] = [];
      while (i < lines.length && !isQuoted(lines[i]!) && !HEADING.test(lines[i]!) && !BULLET.test(lines[i]!) && !NUMBERED.test(lines[i]!) && !KEY_VALUE.test(lines[i]!)) { sentences.push(lines[i]!); i += 1; }
      out.push(`<p style="${P}">${sentences.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('\n      ');
}

/** The first sentence of the message, shown by inbox lists as the preview next to the subject. */
function previewText(text: string): string {
  const first = text.replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).find(line => line && !HEADING.test(line)) ?? '';
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

// ------------------------------------------------------------------------------------------------------------------------------------
// The page
// ------------------------------------------------------------------------------------------------------------------------------------

export function renderEmailHtml(event: EmailTemplateData): string {
  const { templateVersion, subject, text, recipient, webOrigin = 'https://vmotiv.in', headerLogoUrl = BRAND_HEADER_LOGO_URL } = event;
  const spec = { ...DEFAULT_SPEC, ...(TEMPLATES[templateVersion] ?? {}) };
  const tone = TONES[spec.tone];
  const [assuranceTitle, assuranceBody] = spec.assurance ?? DEFAULT_ASSURANCE;

  let ctaUrl = `${webOrigin}${spec.ctaPath}`;
  if (templateVersion === 'employee-invitation-v1') {
    ctaUrl = text.match(/https?:\/\/[^\s]+\/accept-invitation\?token=[A-Za-z0-9_%.-]+/)?.[0] || webOrigin;
  }

  const preview = previewText(text);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${PAGE}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: #1D4ED8; }
    @media only screen and (max-width: 620px) {
      .outer { padding: 0 !important; }
      .card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
      .pad { padding-left: 20px !important; padding-right: 20px !important; }
      .title { font-size: 21px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${PAGE}; font-family: ${FONT}; color: ${INK};">
  <!-- Inbox preview text (hidden in the email itself) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${PAGE}; opacity: 0;">${escapeHtml(preview)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${PAGE};">
    <tr>
      <td class="outer" align="center" style="padding: 28px 12px;">
        <table class="card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid ${LINE}; border-radius: 12px; border-collapse: separate; overflow: hidden;">

          <!-- Header: brand navy with the white logo, and a yellow line under it -->
          <tr>
            <td class="pad" style="background-color: ${NAVY}; padding: 14px 32px; border-bottom: 3px solid ${YELLOW};">
              <a href="${escapeHtml(webOrigin)}" style="text-decoration: none;">
                <img src="${escapeHtml(headerLogoUrl)}" alt="V MOTIV" width="96" style="display: block; width: 96px; max-width: 96px; height: auto;">
              </a>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td class="pad" style="padding: 32px 32px 8px 32px;">
              <span style="display: inline-block; padding: 4px 10px; border-radius: 999px; background-color: ${tone.bg}; color: ${tone.fg}; font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;">${escapeHtml(spec.badge)}</span>
              <h1 class="title" style="margin: 14px 0 6px 0; font-size: 24px; line-height: 1.3; font-weight: 700; color: ${NAVY};">${escapeHtml(subject)}</h1>
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: ${MUTED};">${escapeHtml(spec.subtitle)}</p>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td class="pad" style="padding: 24px 32px 8px 32px;">
              ${renderEmailBody(text)}
            </td>
          </tr>

          <!-- Button -->
          <tr>
            <td class="pad" style="padding: 8px 32px 28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" bgcolor="${YELLOW}" style="background-color: ${YELLOW}; border-radius: 8px;">
                    <a href="${escapeHtml(ctaUrl)}" style="display: inline-block; padding: 14px 30px; font-size: 15px; font-weight: 700; line-height: 1; color: ${NAVY}; text-decoration: none; border-radius: 8px;">${escapeHtml(spec.cta)} &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Note -->
          <tr>
            <td class="pad" style="padding: 0 32px 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${SOFT}; border-left: 3px solid ${YELLOW}; border-radius: 4px;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; line-height: 1.6; color: #475569;">
                    <strong style="color: ${NAVY};">${escapeHtml(assuranceTitle)}</strong> ${escapeHtml(assuranceBody)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="pad" style="background-color: ${SOFT}; padding: 22px 32px; border-top: 1px solid ${LINE}; font-size: 12px; line-height: 1.7; color: ${MUTED};">
              <div style="font-weight: 700; color: #334155;">V MOTIV Private Limited</div>
              <div>This email was sent to <strong style="color: #334155;">${escapeHtml(recipient)}</strong>.</div>
              <div style="margin-top: 6px;">Need help? Write to <a href="mailto:support@vmotiv.in" style="color: #1D4ED8;">support@vmotiv.in</a> or call our 24/7 helpline <strong style="color: #334155;">1800-866-848</strong>.</div>
              <div style="margin-top: 10px; font-size: 11px; color: #64748B;">&copy; ${currentCalendarYear()} V MOTIV. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
