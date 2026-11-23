import { isFeatureOpen } from './features';

// Frequently asked questions, shown in Account -> Help & FAQs. Plain data, so the wording can be changed here without touching the screen.
// Every answer describes only what the app does today; nothing here promises prices, timings, free services or locations.

export type FaqItem = { id: string; question: string; answer: string };
export type FaqSection = { title: string; items: FaqItem[] };

export function faqSections(): FaqSection[] {
  const rentals = isFeatureOpen('rental')
    ? 'Self-drive rentals are available from the Rent tile on Home.'
    : 'Self-drive rentals are coming soon.';

  return [
    {
      title: 'Getting started',
      items: [
        {
          id: 'what-can-i-do',
          question: 'What can I do in V MOTIV?',
          answer: `Book a car service, buy a pre-owned car, sell your car, or scrap an old one. ${rentals} Everything starts from the tiles on Home.`,
        },
        {
          id: 'sign-in',
          question: 'How do I sign in?',
          answer: 'Sign in with your Google account. We never see or store your Google password.',
        },
        {
          id: 'garage',
          question: 'Do I have to add my car first?',
          answer: 'No, but adding your car to My Garage once makes booking a service quicker, because your car details are already saved.',
        },
        {
          id: 'tour',
          question: 'Can I see the quick tour again?',
          answer: 'Yes. Open Account and choose "Take a quick tour".',
        },
      ],
    },
    {
      title: 'Car service',
      items: [
        {
          id: 'book-service',
          question: 'How do I book a service?',
          answer: 'Tap Car Service on Home, pick your car and the work you need, then choose a time. You can ask for pickup and drop, or visit the workshop yourself.',
        },
        {
          id: 'estimate',
          question: 'Will I know the cost before work starts?',
          answer: 'You see an estimate and approve it in the app before the work begins.',
        },
        {
          id: 'track-service',
          question: 'How do I follow my service?',
          answer: 'Open the Activity tab. Each booking shows its current status, and you get a notification when it changes.',
        },
      ],
    },
    {
      title: 'Buying a car',
      items: [
        {
          id: 'test-drive',
          question: 'How do I request a test drive?',
          answer: 'Open a car you like and choose the test drive option, then pick a date and time. Follow the request in the Activity tab.',
        },
        {
          id: 'inspection-report',
          question: 'Can I see a car\'s inspection report?',
          answer: 'Open the car and choose its inspection report. It shows the checks and findings that have been approved for customers to view.',
        },
        {
          id: 'wishlist',
          question: 'How do I save a car for later?',
          answer: 'Tap the heart on a car to save it. Your saved cars are in the Wishlist.',
        },
      ],
    },
    {
      title: 'Selling a car',
      items: [
        {
          id: 'how-sell',
          question: 'How does selling work?',
          answer: 'Tell us about your car in a few minutes. Our team reviews your request and arranges an inspection. You can follow the inspection and the offer in the Activity tab.',
        },
        {
          id: 'sell-draft',
          question: 'I did not finish the form. Is my answer lost?',
          answer: 'No. Your answers are saved as you go, so you can come back to Sell and carry on from where you stopped.',
        },
      ],
    },
    {
      title: 'Scrapping a car',
      items: [
        {
          id: 'how-scrap',
          question: 'How do I scrap an old car?',
          answer: 'Tap Scrap on Home and send a request with your vehicle details. Our team will call you to take it forward. You can see your request in the Activity tab.',
        },
      ],
    },
    {
      title: 'Your account',
      items: [
        {
          id: 'notifications',
          question: 'Why am I getting notifications?',
          answer: 'We notify you about your bookings, inspections, offers and service updates. Open Account to see your recent notifications and manage your marketing preferences.',
        },
        {
          id: 'delete-account',
          question: 'How do I ask for my data or to delete my account?',
          answer: 'Open Account, then Privacy & Terms, and submit a data-access or account-deletion review request. Our team reviews it before replying.',
        },
      ],
    },
    {
      title: 'Still need help?',
      items: [
        {
          id: 'contact',
          question: 'How do I reach a person?',
          answer: 'Use Help & Support Desk in Account to report an issue or ask a question. You can also write to support@vmotiv.in.',
        },
      ],
    },
  ];
}

/** Every question across all sections, flattened. */
export const allFaqItems = (): FaqItem[] => faqSections().flatMap(section => section.items);
