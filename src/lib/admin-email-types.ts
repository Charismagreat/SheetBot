export interface AdminSmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  adminEmail: string;
  notifyOnInquiry: boolean;
  notifyOnTaxInvoice: boolean;
  notifyOnPayment: boolean;
}

export const DEFAULT_SMTP_SETTINGS: AdminSmtpSettings = {
  enabled: true,
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  user: "",
  pass: "",
  fromName: "SheetBot 고객지원팀",
  adminEmail: "",
  notifyOnInquiry: true,
  notifyOnTaxInvoice: true,
  notifyOnPayment: true,
};
