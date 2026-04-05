export interface Insight {
  health: "healthy" | "warning" | "critical";
  summary: string;
  issues: { severity: "high" | "medium" | "low"; service: string; description: string }[];
  highlights: string[];
  recommendation: string;
  generated_at: string;
}

export interface ProjectService {
  id: string;
  service_type: string;
  resource_id: string;
  resource_name: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  project_services: ProjectService[];
}

export interface VercelProject { id: string; name: string; }
export interface GitHubRepo { id: number; full_name: string; name: string; }
export interface RenderService { id: string; name: string; type: string; suspended: boolean; url: string | null; }
export interface SupabaseProject { id: string; ref: string; name: string; region: string; status: string; }
export interface SupabaseServiceHealth { name: string; status: string; }
export interface SupabaseApiStat { timestamp: string; count: number; }
export interface SupabaseErrorLog { timestamp: string; message: string; status: number | null; }
export interface SupabaseAction { id: string; status: string; created_at: string; updated_at: string; error_message: string | null; }
export interface SupabaseOverview {
  api_stats: SupabaseApiStat[];
  error_logs: SupabaseErrorLog[];
  actions: SupabaseAction[];
  available: { api_stats: boolean; logs: boolean; actions: boolean };
}

export interface RenderDeploy {
  id: string; status: string; commit_message: string | null;
  commit_id: string | null; created_at: string; finished_at: string | null;
}

export interface Deployment {
  id: string; name: string; url: string; state: string;
  target: string; branch: string; commit_message: string; created_at: number;
  commit_sha: string | null; pr_id: string | null;
  ready_at: number | null; build_duration: number | null;
}

export interface Commit {
  sha: string; message: string; author: string;
  author_avatar: string | null; date: string; url: string;
}

export interface PullRequest {
  number: number; title: string; state: string; author: string;
  author_avatar: string; branch: string; base: string;
  created_at: string; updated_at: string; url: string;
  draft: boolean; labels: string[];
}

export interface DeployAnalysis { error_lines: string[]; reason: string; fix: string; }
export interface UptimeStatus { is_up: boolean; latency_ms: number; status_code: number | null; uptime_pct: number | null; avg_latency_ms: number | null; checks: { is_up: boolean; latency_ms: number; checked_at: string }[]; }
export interface EnvVar { key: string; target: string[]; type: string; git_branch?: string; }
export interface LogLine { type: "stdout" | "stderr" | "command"; text: string; }
