import { describe, expect, it } from 'vitest';
import { renderEmailBody, renderEmailHtml, BRAND_HEADER_LOGO_URL } from '../src/email-templates.js';

describe('V MOTIV Email Templates', () => {
  it('renders purchase enquiry template with vehicle title, single header logo, and support footer', () => {
    const html = renderEmailHtml({
      templateVersion: 'purchase-enquiry-v1',
      subject: 'Purchase Enquiry Recorded · 2021 Hyundai Creta SX',
      text: 'We recorded your purchase enquiry for 2021 Hyundai Creta SX.\n\nYour Question / Message:\n"I would like to inquire about loan financing options."\n\nNext Steps:\n1. Our automotive operations team will verify availability.',
      recipient: 'buyer@example.com',
      webOrigin: 'https://vmotiv.in',
    });

    // Single clear header logo
    expect(html).toContain(BRAND_HEADER_LOGO_URL);
    // Support contact in the footer
    expect(html).toContain('support@vmotiv.in');
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
      subject: 'Welcome to V MOTIV · Verified Automotive Mobility',
      text: 'Welcome to V MOTIV!\n\nYour verified customer account is ready.',
      recipient: 'newuser@example.com',
    });

    expect(html).toContain('ACCOUNT CONFIRMED');
    expect(html).toContain('Welcome to V MOTIV');
    expect(html).toContain('Browse Verified Cars');
  });

  it('renders rental booking confirmation template with breakdown and rental assurance', () => {
    const html = renderEmailHtml({
      templateVersion: 'rental-booking-confirmed-v1',
      subject: 'Rental Booking Confirmed [RENT-2026-0042] · 2023 Mahindra Thar 4x4',
      text: 'Your rental booking has been confirmed!\n\nBooking Reference: RENT-2026-0042\nVehicle: 2023 Mahindra Thar 4x4 (KA-01-EQ-9876)\nPickup Hub: Koramangala Hub (Bangalore)\n\nRental Schedule:\n• Pickup: 2026-11-05 10:00 AM\n• Return: 2026-11-08 10:00 AM\n\nPayment Summary:\n• Rental Tariff: ₹7,500\n• Refundable Security Deposit: ₹5,000\n• Total Paid: ₹12,500',
      recipient: 'renter@example.com',
      webOrigin: 'https://vmotiv.in',
    });

    expect(html).toContain('RENTAL CONFIRMED');
    expect(html).toContain('RENT-2026-0042');
    expect(html).toContain('Mahindra Thar 4x4');
    expect(html).toContain('V MOTIV Rental Assurance:');
    expect(html).toContain('1800-866-848');
    expect(html).toContain('View Rental Booking');
  });

  it('renders rental trip started template with start odometer and emergency assistance', () => {
    const html = renderEmailHtml({
      templateVersion: 'rental-trip-started-v1',
      subject: 'Rental Trip Started · 2023 Mahindra Thar 4x4',
      text: 'Your rental trip is now active!\n\nBooking: RENT-2026-0042\nStart Odometer: 14,250 km\nFuel Level: 100%\nReturn Due: 2026-11-08 10:00 AM\n\nEmergency Assistance: 1800-866-848',
      recipient: 'renter@example.com',
    });

    expect(html).toContain('TRIP ACTIVE');
    expect(html).toContain('Start Odometer');
    expect(html).toContain('14,250 km');
    expect(html).toContain('24/7 Roadside Assistance:');
    expect(html).toContain('1800-866-848');
  });

  it('renders rental return and deposit settlement template', () => {
    const html = renderEmailHtml({
      templateVersion: 'rental-trip-returned-v1',
      subject: 'Rental Vehicle Returned & Settlement Summary [RENT-2026-0042]',
      text: 'Vehicle return inspection has concluded.\n\nReturn Odometer: 14,680 km (Total Driven: 430 km)\nReturn Fuel: 100%\n\nSettlement Breakdown:\n• Extra Km Charges: ₹0\n• Refuel Charges: ₹0\n• Damage Deductions: ₹0\n• Refund Amount: ₹5,000',
      recipient: 'renter@example.com',
    });

    expect(html).toContain('TRIP CONCLUDED');
    expect(html).toContain('Deposit Refund Guarantee:');
    expect(html).toContain('Refund Amount');
    expect(html).toContain('₹5,000');
  });

  it('renders rental cancellation template', () => {
    const html = renderEmailHtml({
      templateVersion: 'rental-booking-cancelled-v1',
      subject: 'Rental Booking Cancelled [RENT-2026-0042]',
      text: 'Your rental booking has been cancelled.\n\nReason: Customer requested schedule change.\nEligible Refund Amount: ₹12,500',
      recipient: 'renter@example.com',
    });

    expect(html).toContain('RENTAL CANCELLED');
    expect(html).toContain('Cancellation Policy:');
    expect(html).toContain('Eligible Refund Amount');
    expect(html).toContain('₹12,500');
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

describe('the light email theme', () => {
  const html = (text: string, templateVersion = 'rental-booking-confirmed-v1') => renderEmailHtml({ templateVersion, subject: 'Subject line', text, recipient: 'a@example.test' });

  it('is a light, readable page: white card on a pale background, navy header with the logo, no dark page', () => {
    const page = html('Hello.');
    expect(page).toContain('background-color: #F3F5F9'); // pale page
    expect(page).toContain('background-color: #FFFFFF'); // white card
    expect(page).toContain('background-color: #061A38'); // brand header band
    expect(page).not.toContain('#020B18'); // the old near-black page
    expect(page).not.toContain('linear-gradient');
    expect(page).toContain('alt="V MOTIV"');
    expect(page).toContain('color-scheme');
  });

  it('shows "Label: value" lines as a details table, label and value side by side', () => {
    const body = renderEmailBody('Booking Reference: RENT-2026-0042\nVehicle: 2023 Mahindra Thar 4x4 (KA-01-EQ-9876)\nPickup Hub: Koramangala Hub');
    expect(body.match(/<table/g)).toHaveLength(1);
    expect(body.match(/<tr>/g)).toHaveLength(3);
    expect(body).toMatch(/>Booking Reference<\/td>\s*<td[^>]*>RENT-2026-0042<\/td>/);
    expect(body).toContain('2023 Mahindra Thar 4x4 (KA-01-EQ-9876)');
  });

  it('puts a bulleted run of "Label: value" lines in the same kind of table, and a heading above it', () => {
    const body = renderEmailBody('Payment Summary:\n• Rental Tariff: ₹7,500\n• Total Paid: ₹12,500');
    expect(body).toContain('>Payment Summary:</p>');
    expect(body.match(/<tr>/g)).toHaveLength(2);
    expect(body).toMatch(/>Total Paid<\/td>\s*<td[^>]*>₹12,500<\/td>/);
  });

  it('shows plain bullets as a list and numbered steps as a numbered list', () => {
    expect(renderEmailBody('• Bring your licence\n• Keep the RC handy')).toMatch(/<ul[^>]*>.*Bring your licence.*Keep the RC handy.*<\/ul>/s);
    const steps = renderEmailBody('1. Our team verifies availability.\n2. A specialist will call you.');
    expect(steps).toMatch(/<ol[^>]*>.*verifies availability.*will call you.*<\/ol>/s);
  });

  it('shows a quoted message as a quote, and plain sentences as paragraphs with line breaks kept', () => {
    expect(renderEmailBody('"I would like to know about loan options."')).toContain('<blockquote');
    const under = renderEmailBody('Your Question / Message:\n"Is there a loan option?"');
    expect(under).toContain('>Your Question / Message:</p>');
    expect(under).toContain('<blockquote'); // a quote directly under its heading is still a quote
    const text = renderEmailBody('First sentence.\nSecond sentence.');
    expect(text).toContain('First sentence.<br>Second sentence.');
    expect(text).not.toContain('<table');
  });

  it('turns web addresses into links without letting typed text become markup', () => {
    const body = renderEmailBody('Track it at https://vmotiv.in/account?x=1&y=2. Thanks!\n\nName: <b onclick="x()">Asha</b>');
    expect(body).toContain('<a href="https://vmotiv.in/account?x=1&amp;y=2"');
    expect(body).toContain('</a>. Thanks!'); // the full stop stays outside the link
    expect(body).not.toContain('<b onclick');
    expect(body).toContain('&lt;b onclick=');
  });

  it('uses the first sentence as the inbox preview and escapes it', () => {
    const page = html('Your <booking> is confirmed & ready.\n\nDetails:\nA: B');
    expect(page).toMatch(/mso-hide: all[^>]*>Your &lt;booking&gt; is confirmed &amp; ready\./);
  });

  it('gives every known template a label, a button and a link, and never prints "undefined"', () => {
    const versions = ['purchase-enquiry-v1', 'test-drive-requested-v1', 'selling-requested-v1', 'offer-accepted-v1', 'offer-declined-v1', 'rental-booking-confirmed-v1', 'rental-kyc-reviewed-v1', 'rental-trip-started-v1', 'rental-trip-returned-v1', 'rental-booking-cancelled-v1', 'service-request-submitted-v1', 'service-cancelled-v1', 'support-case-v1', 'support-reply-v1', 'welcome-v1', 'retail-quotation-v1', 'employee-invitation-v1', 'inspection-assigned-v1', 'inspection-rework-v1', 'inspection-approved-v1', 'inspection-requested-v1', 'offer-communicated-v1', 'payment-verified-v1', 'a-template-we-have-not-seen-v1'];
    for (const version of versions) {
      const page = html('Hello.\n\nRef: X-1', version);
      expect(page, version).not.toContain('undefined');
      expect(page, version).not.toContain('null');
      expect(page, version).toMatch(/<a href="https?:\/\/[^"]+" style="display: inline-block; padding: 14px 30px/);
      expect(page, version).toContain('text-transform: uppercase');
    }
  });

  it('colours the status label by meaning, not just by brand', () => {
    expect(html('x', 'rental-booking-confirmed-v1')).toContain('background-color: #D1FAE5'); // confirmed: green
    expect(html('x', 'rental-booking-cancelled-v1')).toContain('background-color: #FEE2E2'); // cancelled: red
    expect(html('x', 'support-case-v1')).toContain('background-color: #FEF3C7'); // general: brand yellow tint
  });
});
