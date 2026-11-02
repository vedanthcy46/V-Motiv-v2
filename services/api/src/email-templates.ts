import type { EmailOutbox } from '@prisma/client';

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

// Official single V MOTIV header logo
export const BRAND_HEADER_LOGO_URL = 'https://iili.io/neuRn49.png';
export const BRAND_FOOTER_LOCKUP_URL = 'https://iili.io/neuRrZl.png'; // Retained for backwards compatibility

export function renderEmailHtml(event: EmailTemplateData): string {
  const {
    templateVersion,
    subject,
    text,
    recipient,
    webOrigin = 'https://vmotiv.in',
    headerLogoUrl = BRAND_HEADER_LOGO_URL,
  } = event;

  let badgeText = 'NOTIFICATION';
  let badgeColor = '#F7B503';
  let ctaTitle = 'Open V MOTIV App';
  let ctaUrl = webOrigin;
  let bannerSubtitle = 'V MOTIV Automotive Mobility Ecosystem';

  let assuranceTitle = 'V MOTIV Promise:';
  let assuranceBody = 'Complete transparency, verified standards, and total accountability across all automotive services.';

  if (templateVersion === 'purchase-enquiry-v1') {
    badgeText = 'ENQUIRY RECORDED';
    ctaTitle = 'View in Activity';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Vehicle Purchase Enquiry Confirmation';
    assuranceTitle = '180-Point Certification:';
    assuranceBody = 'Every V MOTIV pre-owned vehicle undergoes our strict 180-point mechanical, structural, and electrical certification. No surprises. No rollbacks.';
  } else if (templateVersion === 'test-drive-requested-v1') {
    badgeText = 'TEST DRIVE REQUEST';
    ctaTitle = 'Manage Appointment';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Test Drive Schedule Request';
    assuranceTitle = 'Doorstep & Hub Drives:';
    assuranceBody = 'All test drive vehicles are sanitised, inspected, and accompanied by certified automotive specialists.';
  } else if (templateVersion === 'selling-requested-v1') {
    badgeText = 'SELLING REQUEST';
    ctaTitle = 'Track Valuation';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Doorstep Valuation & Inspection Request';
    assuranceTitle = 'Guaranteed Purchase:';
    assuranceBody = 'Transparent fair-market pricing, free 180-point inspection, instant bank transfer, and free RC transfer.';
  } else if (templateVersion === 'offer-accepted-v1') {
    badgeText = 'OFFER ACCEPTED';
    badgeColor = '#10B981';
    ctaTitle = 'View Offer Details';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Direct Purchase Agreement Confirmation';
  } else if (templateVersion === 'offer-declined-v1') {
    badgeText = 'OFFER DECLINED';
    badgeColor = '#94A3B8';
    ctaTitle = 'View in Activity';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Acquisition Offer Update';
  } else if (templateVersion === 'rental-booking-confirmed-v1') {
    badgeText = 'RENTAL CONFIRMED';
    badgeColor = '#10B981';
    ctaTitle = 'View Rental Booking';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Self-Drive Fleet Booking Confirmed';
    assuranceTitle = 'V MOTIV Rental Assurance:';
    assuranceBody = 'Sanitized, GPS-enabled fleet with comprehensive vehicle insurance, transparent fuel policy, and 24/7 Roadside Assistance hotline (1800-866-848).';
  } else if (templateVersion === 'rental-kyc-reviewed-v1') {
    badgeText = 'RENTAL KYC';
    badgeColor = '#3B82F6';
    ctaTitle = 'View Verification';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Driver KYC Document Review Update';
    assuranceTitle = 'Safe Driving Compliance:';
    assuranceBody = 'Strict identity verification ensures road safety and fleet security for all drivers across our network.';
  } else if (templateVersion === 'rental-trip-started-v1') {
    badgeText = 'TRIP ACTIVE';
    badgeColor = '#F7B503';
    ctaTitle = 'View Active Trip';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Vehicle Handover Completed · Have a Safe Drive';
    assuranceTitle = '24/7 Roadside Assistance:';
    assuranceBody = 'In case of breakdown, puncture, or towing emergency, call our immediate response helpline at 1800-866-848.';
  } else if (templateVersion === 'rental-trip-returned-v1') {
    badgeText = 'TRIP CONCLUDED';
    badgeColor = '#10B981';
    ctaTitle = 'View Settlement & Refund';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Vehicle Return & Deposit Settlement Summary';
    assuranceTitle = 'Deposit Refund Guarantee:';
    assuranceBody = 'Security deposit refunds are automatically processed to your original payment method within 3 to 5 business days.';
  } else if (templateVersion === 'rental-booking-cancelled-v1') {
    badgeText = 'RENTAL CANCELLED';
    badgeColor = '#EF4444';
    ctaTitle = 'View Booking Status';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Rental Booking Cancellation & Refund';
    assuranceTitle = 'Cancellation Policy:';
    assuranceBody = 'Eligible refunds are processed directly per our transparent cancellation terms without hidden deductions.';
  } else if (templateVersion === 'service-request-submitted-v1') {
    badgeText = 'SERVICE CONFIRMED';
    badgeColor = '#10B981';
    ctaTitle = 'Track Service Job';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Workshop Service Booking Scheduled';
    assuranceTitle = 'V MOTIV Workshop Guarantee:';
    assuranceBody = 'Certified technicians, genuine OEM/OES spares, itemized estimate approvals, and multi-point quality control.';
  } else if (templateVersion === 'service-cancelled-v1') {
    badgeText = 'SERVICE CANCELLED';
    badgeColor = '#EF4444';
    ctaTitle = 'View Service Details';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Workshop Service Request Cancelled';
  } else if (templateVersion === 'support-case-v1') {
    badgeText = 'SUPPORT TICKET';
    ctaTitle = 'View Support Case';
    ctaUrl = `${webOrigin}/support`;
    bannerSubtitle = 'Customer Support Request Received';
    assuranceTitle = 'Dedicated Customer Support:';
    assuranceBody = 'Our customer care team tracks every ticket with end-to-end accountability. Direct response within 24 hours.';
  } else if (templateVersion === 'support-reply-v1') {
    badgeText = 'CASE UPDATE';
    badgeColor = '#F7B503';
    ctaTitle = 'View Conversation';
    ctaUrl = `${webOrigin}/support`;
    bannerSubtitle = 'New Support Message on Case';
  } else if (templateVersion === 'welcome-v1') {
    badgeText = 'ACCOUNT CONFIRMED';
    badgeColor = '#10B981';
    ctaTitle = 'Browse Verified Cars';
    ctaUrl = `${webOrigin}`;
    bannerSubtitle = 'Welcome to Total Certainty in Automotive Mobility';
  } else if (templateVersion === 'retail-quotation-v1') {
    badgeText = 'OFFICIAL QUOTATION';
    badgeColor = '#2563EB';
    ctaTitle = 'View & Accept Quotation';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Authorized Retail Quotation';
  } else if (templateVersion === 'employee-invitation-v1') {
    badgeText = 'EMPLOYEE INVITATION';
    ctaTitle = 'Review invitation';
    const invitationUrl = text.match(/https?:\/\/[^\s]+\/accept-invitation\?token=[A-Za-z0-9_%.-]+/)?.[0];
    ctaUrl = invitationUrl || webOrigin;
    bannerSubtitle = 'Secure Employee Onboarding';
    assuranceTitle = 'Secure Workspace Access:';
    assuranceBody = 'This invitation is protected with time-limited single-use authentication tokens and multi-factor authorization.';
  } else if (templateVersion === 'inspection-assigned-v1') {
    badgeText = 'INSPECTION ASSIGNED';
    badgeColor = '#F7B503';
    ctaTitle = 'Open Inspector App';
    ctaUrl = `${webOrigin}/inspector`;
    bannerSubtitle = 'New Vehicle Inspection Assignment';
  } else if (templateVersion === 'inspection-rework-v1') {
    badgeText = 'CORRECTIONS REQUIRED';
    badgeColor = '#EF4444';
    ctaTitle = 'Review Feedback';
    ctaUrl = `${webOrigin}/inspector`;
    bannerSubtitle = 'Reviewer Feedback on Inspection Report';
  } else if (templateVersion === 'inspection-approved-v1') {
    badgeText = 'INSPECTION APPROVED';
    badgeColor = '#10B981';
    ctaTitle = 'View Certification';
    ctaUrl = `${webOrigin}/inspection-review`;
    bannerSubtitle = 'Vehicle Certification Report Approved';
  } else if (templateVersion === 'inspection-requested-v1') {
    badgeText = 'INSPECTION REQUEST';
    badgeColor = '#3B82F6';
    ctaTitle = 'Open Operations';
    ctaUrl = `${webOrigin}/operations`;
    bannerSubtitle = 'New Inspection Request in Dispatch Queue';
  } else if (templateVersion === 'offer-communicated-v1') {
    badgeText = 'PURCHASE OFFER';
    badgeColor = '#10B981';
    ctaTitle = 'Review Offer';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Official Acquisition Offer for Your Vehicle';
  } else if (templateVersion === 'payment-verified-v1') {
    badgeText = 'PAYMENT VERIFIED';
    badgeColor = '#10B981';
    ctaTitle = 'View Account';
    ctaUrl = `${webOrigin}/account`;
    bannerSubtitle = 'Direct Purchase Payment Processed';
  }

  // Format text paragraphs and list items
  const paragraphs = text.split('\n\n').filter(Boolean);
  const formattedBody = paragraphs
    .map((block) => {
      const lines = block.split('\n');
      if (lines.length > 1 && lines.every((line) => line.trim().startsWith('•') || line.trim().startsWith('-') || /^\d+\./.test(line.trim()))) {
        const items = lines
          .map((line) => {
            const clean = line.replace(/^[•\-\d+\.]\s*/, '').trim();
            return `<li style="margin-bottom: 8px; color: #CBD5E1; line-height: 1.5;">${escapeHtml(clean)}</li>`;
          })
          .join('');
        return `<ul style="margin: 12px 0 16px 20px; padding: 0;">${items}</ul>`;
      }

      if (block.startsWith('"') && block.endsWith('"')) {
        return `<div style="background-color: #0A2246; border-left: 3px solid #F7B503; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-style: italic; color: #F1F5F9; line-height: 1.6;">${escapeHtml(block)}</div>`;
      }

      const renderedLines = lines.map((l) => {
        if (/^[A-Za-z0-9\s#\-\[\]\(\)]+:$/.test(l.trim())) {
          return `<strong style="display: block; color: #F7B503; margin-top: 14px; margin-bottom: 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(l)}</strong>`;
        }
        if (l.trim().startsWith('•') || l.trim().startsWith('-')) {
          return `<div style="margin-left: 8px; margin-bottom: 4px; color: #CBD5E1;">${escapeHtml(l)}</div>`;
        }
        return `<span style="display: block; margin-bottom: 4px;">${escapeHtml(l)}</span>`;
      }).join('');

      return `<div style="margin-bottom: 14px; color: #E2E8F0; line-height: 1.6; font-size: 14px;">${renderedLines}</div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #020B18;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #E2E8F0;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
    }
    a {
      color: #F7B503;
      text-decoration: none;
    }
    @media only screen and (max-width: 620px) {
      .container {
        width: 100% !important;
        border-radius: 0 !important;
      }
      .content-padding {
        padding: 24px 16px !important;
      }
      .header-padding {
        padding: 20px 16px !important;
      }
    }
  </style>
</head>
<body style="background-color: #020B18; margin: 0; padding: 24px 12px;">
  <center>
    <table class="container" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #061A38; border: 1px solid #1E293B; border-radius: 14px; overflow: hidden; text-align: left;">
      <!-- ─── HEADER WITH SINGLE OFFICIAL BRAND LOGO ─── -->
      <tr>
        <td class="header-padding" style="background-color: #020B18; padding: 22px 28px; border-bottom: 1px solid #1E293B;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle">
                <a href="${escapeHtml(webOrigin)}" style="display: block; text-decoration: none;">
                  <img
                    src="${escapeHtml(headerLogoUrl)}"
                    alt="V MOTIV"
                    width="180"
                    style="display: block; border: 0; outline: none; text-decoration: none; width: 180px; max-width: 180px; height: auto;"
                  />
                </a>
              </td>
              <td align="right" valign="middle">
                <span style="display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; color: ${badgeColor}; border: 1px solid ${badgeColor}; letter-spacing: 0.5px; text-transform: uppercase;">
                  ${escapeHtml(badgeText)}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Subject & Banner Subtitle -->
      <tr>
        <td style="padding: 26px 28px 12px 28px; background: linear-gradient(180deg, #092044 0%, #061A38 100%);">
          <div style="font-size: 11px; font-weight: 700; color: #F7B503; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">
            ${escapeHtml(bannerSubtitle)}
          </div>
          <h1 style="margin: 0; font-size: 19px; font-weight: 800; color: #FFFFFF; line-height: 1.4;">
            ${escapeHtml(subject)}
          </h1>
        </td>
      </tr>

      <!-- Content Body -->
      <tr>
        <td class="content-padding" style="padding: 20px 28px 28px 28px;">
          <div style="background-color: #081D3C; border: 1px solid #1E3A66; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
            ${formattedBody}
          </div>

          <!-- Primary CTA Button -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 8px; margin-bottom: 24px;">
            <tr>
              <td align="center">
                <a href="${escapeHtml(ctaUrl)}" style="background-color: #F7B503; color: #020B18; font-weight: 800; font-size: 14px; text-decoration: none; padding: 14px 32px; border-radius: 8px; display: inline-block; letter-spacing: 0.4px;">
                  ${escapeHtml(ctaTitle)} &rarr;
                </a>
              </td>
            </tr>
          </table>

          <!-- Context-Aware Assurance Banner -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(247, 181, 3, 0.05); border: 1px solid rgba(247, 181, 3, 0.2); border-radius: 8px; padding: 12px 16px;">
            <tr>
              <td style="font-size: 12px; color: #94A3B8; line-height: 1.5;">
                <strong style="color: #F7B503;">${escapeHtml(assuranceTitle)}</strong> ${escapeHtml(assuranceBody)}
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ─── CLEAN BRAND FOOTER (SINGLE UNIFIED BRAND SIGNATURE - NO CONFUSING SECONDARY LOGOS) ─── -->
      <tr>
        <td align="center" style="background-color: #031024; padding: 24px 28px; border-top: 1px solid #1E293B; border-bottom: 1px solid #1E293B;">
          <div style="font-size: 12px; font-weight: 800; color: #F7B503; letter-spacing: 1.8px; text-transform: uppercase; margin-bottom: 6px;">
            YOUR VEHICLE. OUR ACCOUNTABILITY.
          </div>
          <div style="font-size: 12px; color: #94A3B8; max-width: 440px; margin: 0 auto; line-height: 1.6;">
            All-in-One Mobility Ecosystem &middot; Verified Cars &middot; Self-Drive Fleet &middot; Workshop Care
          </div>
        </td>
      </tr>

      <!-- Footer Contact & Copyright -->
      <tr>
        <td style="background-color: #020B18; padding: 22px 28px; font-size: 11px; color: #64748B; line-height: 1.6;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="color: #94A3B8; font-weight: 600; margin-bottom: 4px;">
                  V MOTIV Private Limited
                </div>
                <div>This automated notification was delivered to <strong>${escapeHtml(recipient)}</strong>.</div>
                <div style="margin-top: 8px;">
                  Need assistance? Contact our team at <a href="mailto:support@vmotiv.in" style="color: #F7B503;">support@vmotiv.in</a> or 24/7 helpline <strong>1800-866-848</strong>.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding-top: 16px; border-top: 1px solid #0F1D30; margin-top: 12px; font-size: 10px; color: #475569;">
                &copy; ${new Date().getFullYear()} V MOTIV. All rights reserved. Bangalore, Chennai, Mumbai, Hyderabad, Delhi NCR.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
}
