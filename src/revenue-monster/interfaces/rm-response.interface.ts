export interface RMTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
}

export interface RMOnlinePaymentResponse {
  item: {
    checkoutId: string;
    url: string;
  };
  code: string;
}

export interface RMCheckoutStatusResponse {
  item: {
    id: string;
    type: string;
    transactionId: string;
    order: {
      id: string;
      title: string;
      detail: string;
      amount: number;
      currencyType: string;
    };
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  code: string;
}

export interface RMCallbackPayload {
  data: {
    balanceAmount: number;
    createdAt: string;
    currencyType: string;
    method: string;
    order: {
      id: string;
      title: string;
      detail: string;
      amount: number;
      additionalData: string;
    };
    payee: Record<string, any>;
    platform: string;
    referenceId: string;
    region: string;
    status: string;
    store: Record<string, any>;
    transactionId: string;
    type: string;
    updatedAt: string;
  };
  eventType: string;
}

export interface RMRequestHeaders {
  'Content-Type': string;
  Authorization: string;
  'X-Nonce-Str': string;
  'X-Signature': string;
  'X-Timestamp': string;
}
