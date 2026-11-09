export class AuthError extends Error {
  status:number; retryAfter?:number; code:string;
  constructor(message:string,status=401,retryAfter?:number,code='AUTH_REQUIRED'){super(message);this.name='AuthError';this.status=status;this.retryAfter=retryAfter;this.code=code;}
}

export class KycError extends Error {
  status:number; code:string;
  constructor(message:string,status=400,code='KYC_ERROR'){super(message);this.name='KycError';this.status=status;this.code=code;}
}
