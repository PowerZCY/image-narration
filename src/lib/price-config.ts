import { PricePlanAppConfig } from "@windrun-huaiin/third-ui/main";

export const pricePlanConfig: PricePlanAppConfig = {
  billingOptions: [
    { key: 'monthly', discount: 0 },
    { key: 'yearly', discount: 0.20 }
  ],
  prices: {
    free: 'Free',
    premium: 10,
    ultimate: 20,
  },
  minPlanFeaturesCount: 4
}