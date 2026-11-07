export class KycError extends Error {
  constructor(public message:string, public status=400, public code='KYC_ERROR'){super(message);}
}
