import type { NavigatorScreenParams } from '@react-navigation/native';

export type Tabs = { Home: undefined; Explore: undefined; Saved: undefined; Activity: undefined; Account: undefined };
export type RootStack = {
  Tabs: NavigatorScreenParams<Tabs> | undefined;
  Vehicle: { listingId: string };
  VehicleGallery: { images: string[]; initialIndex?: number; title?: string };
  InspectionHighlights: {
    inspectionSummary: string | null;
    conditionSummary: string | null;
    verifiedTags: string[];
    features: string[];
    reportUrl: string | null;
  };
  CitySelection: undefined;
  TestDrive: { listingId: string; title: string };
  Sell: undefined;
  SellingRequestDetails: { leadId: string };
  PurchaseEnquiry: { listingId: string; title: string };
  Support: undefined;
  ProfileEditor: undefined;
  MarketingPreferences: undefined;
  PrivacySettings: undefined;
  Addresses: undefined;
  SupportCaseDetails: { caseId: string };
};
