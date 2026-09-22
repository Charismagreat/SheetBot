export interface UserWallet {
  balanceTokens: number;
  totalPurchasedTokens: number;
  totalUsedTokens: number;
  tier: string;
}

export interface PaymentPackage {
  id: string;
  name: string;
  priceKrw: number;
  tokens: number;
  bonusTokens: number;
  totalTokens: number;
  tag?: string;
  isPopular?: boolean;
}

export interface PaymentOrder {
  id: string;
  order_id: string;
  package_name: string;
  amount_krw: number;
  tokens_credited: number;
  payment_method: string;
  created_at: string;
}

export const DEFAULT_PACKAGES: PaymentPackage[] = [
  {
    id: "pkg_starter",
    name: "Starter (체험형)",
    priceKrw: 5000,
    tokens: 50000,
    bonusTokens: 0,
    totalTokens: 50000,
    tag: "약 25회 생성 가능",
  },
  {
    id: "pkg_standard",
    name: "Standard (인기 추천)",
    priceKrw: 12000,
    tokens: 120000,
    bonusTokens: 30000,
    totalTokens: 150000,
    tag: "+25% 보너스 토큰",
    isPopular: true,
  },
  {
    id: "pkg_pro",
    name: "Pro Automation",
    priceKrw: 30000,
    tokens: 300000,
    bonusTokens: 150000,
    totalTokens: 450000,
    tag: "+50% 대용량 보너스",
  },
];
