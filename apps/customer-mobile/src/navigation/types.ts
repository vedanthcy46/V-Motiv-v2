import type { NavigatorScreenParams } from '@react-navigation/native';

export type Tabs = {
  Home: undefined;
  Explore: undefined;
  Garage: undefined;
  Activity: undefined;
  Account: undefined;
  Saved?: undefined;
};
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
    inspectionDetails?: import('../types').InspectionAuditDetails | null;
    customerProfile?: import('../types').CustomerVehicleProfile | null;
  };
  CitySelection: undefined;
  TestDrive: { listingId: string; title: string };
  TestDriveDetails: { driveId: string };
  Sell: undefined;
  SellingRequestDetails: { leadId: string };
  PurchaseEnquiry: { listingId: string; title: string };
  PurchaseEnquiryDetails: { enquiryId: string };
  Quotation: { quotationId: string };
  Support: undefined;
  ProfileEditor: undefined;
  MarketingPreferences: undefined;
  PrivacySettings: undefined;
  Addresses: undefined;
  SupportCaseDetails: { caseId: string };
  MyGarage: undefined;
  ConnectGuest: { token?: string } | undefined;
  ServiceHome: { preselectedVehicleId?: string } | undefined;
  ServiceRequestDetails: { requestId: string };
  Wishlist: undefined;
  RentalHome: undefined;
  ScrapHome: undefined;
  /** The intake wizard. With a requestId it resumes that draft; with a vehicleId it starts from that garage car. */
  ScrapRequest: { requestId?: string; vehicleId?: string } | undefined;
  MyScrapRequests: undefined;
  ScrapRequestDetails: { requestId: string; justSubmitted?: boolean };
  RentalSearchResults: {
    hubId?: string;
    city?: string;
    startTime: string;
    endTime: string;
  };
  RentalVehicleDetails: {
    vehicleId: string;
    startTime?: string;
    endTime?: string;
  };
  RentalCheckout: {
    holdId: string;
    holdCode: string;
    vehicle?: import('../services/rental-api').RentalFleetVehicle;
    quoteSnapshot?: import('../services/rental-api').RentalQuote;
    startTime?: string;
    endTime?: string;
    hubName?: string;
  };
  RentalBookingDetails: {
    bookingId: string;
  };
};
