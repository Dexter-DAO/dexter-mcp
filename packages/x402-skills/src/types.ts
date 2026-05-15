// Subset of dexter-api's public manifest + skill index shapes we need to render bundles.
// Reference (manifest): https://api.dexter.cash/api/public/skills/:host/manifest
// Reference (skill index): https://api.dexter.cash/api/public/skills/:host
//
// The manifest envelope describes the AI-synthesized positioning + capability clusters
// for a host. The skill index lists every individual paid skill on that host with
// per-skill resource_url, price, network, method. Both are needed to render a complete
// Claude Code skill bundle.

export type HostManifestProvenance =
  | 'merchant_reviewed'
  | 'merchant_edited'
  | 'ai_authored_reviewed'
  | 'ai_authored_unreviewed';

export type HostManifestStatus = 'ready' | 'generating' | 'failed';

export interface HostManifestWorkflowStep {
  skill_name: string;
  description: string;
}

export interface HostManifestWorkflow {
  workflow_name: string;
  when_to_use: string;
  steps: HostManifestWorkflowStep[];
}

export interface HostManifestCluster {
  cluster_name: string;
  cluster_summary: string;
  skill_names: string[];
}

export interface HostManifestPayload {
  positioning: string;
  host_overview?: string;
  routing_guidance?: string;
  capability_clusters: HostManifestCluster[];
  cross_skill_workflows?: HostManifestWorkflow[];
  // free-form fields we tolerate but do not require
  [key: string]: unknown;
}

export interface HostManifestEnvelope {
  ok?: boolean;
  host: string;
  status: HostManifestStatus;
  version_no: number;
  provenance: HostManifestProvenance;
  manifest: HostManifestPayload | null;
  model?: string;
  generated_at?: string;
  ai_authored?: boolean;
  merchant_reviewed?: boolean;
  merchant_edited?: boolean;
  merchant_reviewed_at?: string | null;
  merchant_edited_at?: string | null;
  skill_md_url?: string;
  skills_url?: string;
  // free-form fields we tolerate but do not require
  [key: string]: unknown;
}

// L2 skill index — GET /api/public/skills/:host
// One entry per individual paid skill. resource_url is the endpoint to call;
// price (when present) is the per-call cost.

export interface HostSkill {
  skill_name: string;
  display_name: string;
  one_liner: string;
  when_to_use: string;
  not_for?: string | null;
  confidence?: 'high' | 'medium' | 'low' | string;
  price: { amount: string; asset: string; chain: string } | null;
  network: string;
  method: string;
  resource_url: string;
  version: number;
  merchant_approved: boolean;
  verification_status: string;
  quality_score?: number;
  last_verified_at?: string;
  skill_url?: string;
  // free-form fields we tolerate but do not require
  [key: string]: unknown;
}

export interface HostSkillIndex {
  ok?: boolean;
  host: string;
  skill_count: number;
  skills: HostSkill[];
  manifest_url?: string;
  skill_md_url?: string;
  agent_card_url?: string;
  [key: string]: unknown;
}

export interface ComposeInput {
  hosts: string[];          // v0: exactly one
  skill_name?: string;      // optional override; otherwise derived from host
  publish?: boolean;        // v1: when true, persister + owner_handle are required
  baseUrl?: string;         // optional override for tests; defaults to https://api.dexter.cash
  owner_handle?: string;
  composer_kind?: 'ai_authored' | 'user_authored' | 'merchant_authored';
  composer_id?: string;
  visibility?: 'unlisted' | 'public';
  persister?: Persister;
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
  skill_id?: string;
  version_no?: number;
  preview_url?: string;
}

export interface PersistComposedSkillInput {
  owner_handle: string;
  slug: string;
  name: string;
  description: string | null;
  composer_kind: 'ai_authored' | 'user_authored' | 'merchant_authored';
  composer_id: string | null;
  hosts_included: ComposeHostInclusion[];
  workflow_json: Record<string, unknown>;
  bundle_md: string;
  bundle_files: BundleFile[];
  cost_estimate: ComposeResult['cost_estimate'];
  call_count_estimate: number;
  visibility: 'unlisted' | 'public';
}

export interface PersistResult {
  skill_id: string;
  version_no: number;
  preview_url: string;
}

export type Persister = (input: PersistComposedSkillInput) => Promise<PersistResult>;
