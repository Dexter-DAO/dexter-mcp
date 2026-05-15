// Subset of x402gle's HostManifest response shape we actually need to render bundles.
// Full manifest shape lives in dexter-api; we only declare what we read.
// Reference: https://x402gle.com/api/public/skills/:host/manifest

export type HostManifestProvenance = 'merchant_reviewed' | 'merchant_edited' | 'ai_authored';
export type HostManifestStatus = 'ready' | 'generating' | 'failed';

export interface HostManifestWorkflow {
  name: string;
  description: string;
  steps: string[];
}

export interface HostManifestCluster {
  name: string;
  description: string;
  endpoints?: HostManifestEndpoint[];
  price?: { amount: string; asset: string; chain: string } | null;
}

export interface HostManifestEndpoint {
  url: string;
  method?: string;
  description?: string;
  inputSchema?: unknown;
  price?: { amount: string; asset: string; chain: string } | null;
  authMode?: string;
}

export interface HostManifestPayload {
  positioning: string;
  host_overview?: string;
  routing_guidance?: string;
  capability_clusters: HostManifestCluster[];
  workflows: HostManifestWorkflow[];
  // free-form fields we tolerate but do not require
  [key: string]: unknown;
}

export interface HostManifestEnvelope {
  host: string;
  status: HostManifestStatus;
  version_no: number;
  provenance: HostManifestProvenance;
  manifest: HostManifestPayload | null;
  // free-form fields we tolerate but do not require
  [key: string]: unknown;
}

export interface ComposeInput {
  hosts: string[];          // v0: exactly one
  skill_name?: string;      // optional override; otherwise derived from host
  publish?: boolean;        // v0: ignored (always false)
  baseUrl?: string;         // optional override for tests; defaults to https://x402gle.com
}

export interface BundleFile {
  path: string;
  content: string;
}

export interface ComposeHostInclusion {
  host: string;
  version_no: number;
  provenance: HostManifestProvenance;
}

export interface ComposeResult {
  slug: string;
  name: string;
  files: BundleFile[];
  hosts_included: ComposeHostInclusion[];
  cost_estimate: { amount: string; asset: string; chain: string } | null;
  call_count_estimate: number;
  installation_instructions: string;
}
