export interface AdminSmsSettings {
  enabled: boolean;
  deviceId: string;
  adminPhone: string;
  notifyOnInquiry: boolean;
  notifyOnTaxInvoice: boolean;
  notifyOnPayment: boolean;
}

export const DEFAULT_SMS_SETTINGS: AdminSmsSettings = {
  enabled: true,
  deviceId: "devmspmxh9g",
  adminPhone: "010-7216-5884",
  notifyOnInquiry: true,
  notifyOnTaxInvoice: true,
  notifyOnPayment: true,
};
