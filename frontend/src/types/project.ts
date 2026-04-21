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
  service_name: string;
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

export interface SupabaseMetrics {
  connections: { active: number | null; max: number | null; pct: number | null };
  database: { size_bytes: number | null; limit_bytes: number | null; used_pct: number | null; limit_is_plan_default?: boolean };
  disk: { avail_bytes: number | null; total_bytes: number | null; used_pct: number | null };
  memory: { avail_bytes: number | null; total_bytes: number | null; used_pct: number | null };
  cache: { hit_pct: number | null; blks_hit: number | null; blks_read: number | null } | null;
  transactions: { commit: number | null; rollback: number | null; rollback_pct: number | null } | null;
  rows: { inserted: number | null; updated: number | null; deleted: number | null; returned: number | null; fetched: number | null; conflicts: number | null } | null;
  deadlocks: number | null;
  temp_bytes: number | null;
}

export interface SupabaseTrafficRow { service: string; total: number; errors: number; }
export interface SupabaseTraffic { breakdown: SupabaseTrafficRow[]; available: boolean; }
export interface SupabaseTrafficDayRow { day: string; total: number; errors: number; }
export interface SupabaseTrafficDaily { available: boolean; services: Record<string, SupabaseTrafficDayRow[]>; }

export interface SupabaseConfig {
  project: { name: string | null; region: string | null; db_host: string | null; status: string | null; created_at: string | null } | null;
  auth: { site_url: string | null; providers: string[]; anonymous_sign_ins: boolean; mfa_enabled: boolean; min_password_length: number | null } | null;
}

export interface SupabaseBucket {
  id: string; name: string; public: boolean;
  file_size_limit: number | null; created_at: string; updated_at: string;
}
export interface SupabaseStorage { buckets: SupabaseBucket[]; available: boolean; }

export interface SupabaseLogRow {
  f0_?: string; timestamp?: string;
  event_message?: string; error_severity?: string;
  sql_state_code?: string; user_name?: string;
  method?: string; path?: string; status_code?: number;
  level?: string; msg?: string;
}

export interface SupabaseFunction {
  id: string; slug: string; name: string;
  status: string; created_at: string; updated_at: string; verify_jwt: boolean;
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
  team_slug: string | null;
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
export interface Investigation { service: string; error: string; root_cause: string; fix: string; key_logs: string[]; }
export interface RuntimeError { id: string; title: string; subtitle: string; timestamp: string; service: string; metadata: { errors?: string[]; service_name?: string; alert_type?: "cpu" | "memory"; cpu_pct?: number; cpu_mcpu?: number; mem_pct?: number; mem_mb?: number; limit_mb?: number } | null; }
export interface UptimeStatus { is_up: boolean; latency_ms: number; status_code: number | null; uptime_pct: number | null; avg_latency_ms: number | null; checks: { is_up: boolean; latency_ms: number; checked_at: string }[]; }
export interface EnvVar { key: string; target: string[]; type: string; git_branch?: string; }
export interface LighthouseScores { performance: number | null; accessibility: number | null; seo: number | null; best_practices: number | null; status: string; }
export interface LogLine { type: "stdout" | "stderr" | "command"; text: string; }
