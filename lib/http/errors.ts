export class AuthError extends Error {
  constructor(public message:string,public status=401,public retryAfter?:number,public code='AUTH_REQUIRED'){super(message);}
}

export class KycError extends Error {
  constructor(public message:string,public status=400,public code='KYC_ERROR'){super(message);}
}
