import { describe, expect, it } from 'vitest';
import { renderEmailHtml, BRAND_HEADER_LOGO_URL, BRAND_FOOTER_LOCKUP_URL } from '../src/email-templates.js';

describe('V MOTIV Email Templates', () => {
  it('renders purchase enquiry template with vehicle title and message', () => {
    const html = renderEmailHtml({
      templateVersion: 'purchase-enquiry-v1',
      subject: 'Purchase Enquiry Recorded · 2021 Hyundai Creta SX',
      text: 'We recorded your purchase enquiry for 2021 Hyundai Creta SX.\n\nYour Question / Message:\n"I would like to inquire about loan financing options."\n\nNext Steps:\n1. Our automotive operations team will verify availability.',
      recipient: 'buyer@example.com',
      webOrigin: 'https://vmotiv.in',
    });

    expect(html).toContain(BRAND_HEADER_LOGO_URL);
    expect(html).toContain(BRAND_FOOTER_LOCKUP_URL);
    expect(html).toContain('YOUR VEHICLE. OUR ACCOUNTABILITY.');
    expect(html).toContain('ENQUIRY RECORDED');
    expect(html).toContain('2021 Hyundai Creta SX');
    expect(html).toContain('loan financing options');
    expect(html).toContain('buyer@example.com');
    expect(html).toContain('View in Activity');
    expect(html).toContain('https://vmotiv.in/account');
  });

  it('renders test drive requested template with date and location', () => {
    const html = renderEmailHtml({
      templateVersion: 'test-drive-requested-v1',
      subject: 'Test Drive Requested · 2022 Tata Nexon EV',
      text: 'We received your test drive request.\n\nAppointment Details:\n• Date: 2026-10-25\n• Time Window: 10:00 AM - 12:00 PM\n• Location Preference: Doorstep (Indiranagar, Bangalore)',
      recipient: 'driver@example.com',
    });

    expect(html).toContain('TEST DRIVE REQUEST');
    expect(html).toContain('2022 Tata Nexon EV');
    expect(html).toContain('Doorstep (Indiranagar, Bangalore)');
    expect(html).toContain('Manage Appointment');
  });

  it('renders selling request template with car details and reference code', () => {
    const html = renderEmailHtml({
      templateVersion: 'selling-requested-v1',
      subject: 'Selling Request Received [SELL-2026-99] · 2020 Honda City VX',
      text: 'We received your request to sell your 2020 Honda City VX.\n\nReference Code: SELL-2026-99\nLocation: Bangalore (560038)\nOdometer: 42,000 km',
      recipient: 'seller@example.com',
    });

    expect(html).toContain('SELLING REQUEST');
    expect(html).toContain('SELL-2026-99');
    expect(html).toContain('Track Valuation');
  });

  it('renders welcome template for new registrations', () => {
    const html = renderEmailHtml({
      templateVersion: 'welcome-v1',
      subject: 'Welcome to V MOTIV · Verified Pre-Owned Cars',
      text: 'Welcome to V MOTIV!\n\nYour verified customer account is ready.',
      recipient: 'newuser@example.com',
    });

    expect(html).toContain('ACCOUNT CONFIRMED');
    expect(html).toContain('Welcome to V MOTIV');
    expect(html).toContain('Browse Verified Cars');
  });

  it('renders a secure employee invitation CTA to the approved one-time link', () => {
    const invitationUrl = 'https://admin.vmotiv.in/accept-invitation?token=abc_DEF-1234567890';
    const html = renderEmailHtml({
      templateVersion: 'employee-invitation-v1',
      subject: 'Your V MOTIV employee invitation',
      text: `You have been invited to join V MOTIV.\n\nOpen invitation: ${invitationUrl}`,
      recipient: 'employee@example.com',
      webOrigin: 'https://www.vmotiv.in',
    });
    expect(html).toContain('EMPLOYEE INVITATION');
    expect(html).toContain('Review invitation');
    expect(html).toContain(`href="${invitationUrl}"`);
  });

  it('escapes html entities safely to prevent XSS in email clients', () => {
    const html = renderEmailHtml({
      templateVersion: 'purchase-enquiry-v1',
      subject: 'Inquiry <script>alert(1)</script>',
      text: 'User typed <script>bad()</script> & "quotes"',
      recipient: 'safe@example.com',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });
});
