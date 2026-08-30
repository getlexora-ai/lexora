// The contract types offered in the "Generate" / template flows. The
// "Lease Agreement" string is load-bearing: src/app/api/generate/route.ts routes
// it through the grounded German-rental RAG pipeline.

export const CONTRACT_TYPES = [
  "NDA",
  "MSA",
  "Employment Contract",
  "SaaS Agreement",
  "Vendor Agreement",
  "Consulting Agreement",
  "Lease Agreement",
  "Partnership Agreement",
  "Service Agreement",
  "Other",
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

export const GERMAN_LEASE_TYPE = "Lease Agreement";
export const isGermanLease = (contractType: string) => contractType === GERMAN_LEASE_TYPE;
