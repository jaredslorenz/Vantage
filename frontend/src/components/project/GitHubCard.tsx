"use client";

import { timeAgo } from "@/lib/utils";
import type { Commit, PullRequest, ProjectService } from "@/types/project";
import { CopyButton } from "@/components/project/StatusDot";

export function GitHubCard({ service, commits, pulls, selected, onClick, onUnlink }: {
  service: ProjectService; commits: Commit[]; pulls: PullRequest[]; selected: boolean; onClick: () => void; onUnlink: () => void;
}) {
  const latestCommit = commits[0];
  const openPRs = pulls.filter((p) => p.state === "open").length;

  return (
    <div
      onClick={onClick}
      className={`group relative w-full cursor-pointer rounded-card p-5 shadow-card transition-all duration-300 overflow-hidden flex flex-col
        ${selected
          ? "bg-white border-2 border-brand-purple shadow-[0_0_0_4px_rgba(111,123,247,0.12)]"
          : "bg-white/95 border border-white/60 hover:border-brand-purple/50 hover:shadow-xl hover:-translate-y-0.5"
        }`}
    >
      {selected && <div className="absolute inset-0 bg-linear-to-br from-brand-purple/5 to-brand-cyan/5 pointer-events-none" />}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all duration-300 ${selected ? "bg-linear-to-br from-brand-purple to-brand-cyan shadow-button" : "bg-gray-900"}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </div>
          <div>
            <div className="text-[14px] font-semibold text-gray-900">GitHub</div>
            <div className="text-[11px] text-gray-400">{service.resource_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {openPRs > 0 && (
            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
              {openPRs} open PR{openPRs !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onUnlink(); }}
            title="Unlink"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Commits", value: String(commits.length) },
          { label: "Open PRs", value: String(openPRs) },
          { label: "Last push", value: latestCommit ? timeAgo(latestCommit.date) : "—" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
            <div className="text-[15px] font-bold text-gray-900">{stat.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
      {latestCommit && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" />
          </svg>
          <span className="text-[11px] text-gray-500 truncate">{latestCommit.message}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
        <a
          href={`https://github.com/${service.resource_id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-gray-300 hover:text-brand-purple transition-colors"
        >
          Open in GitHub ↗
        </a>
        <div className={`flex items-center gap-1 text-[11px] font-medium transition-all duration-200 ${selected ? "text-brand-purple" : "text-gray-300 group-hover:text-brand-purple/60"}`}>
          <span>{selected ? "Hide details" : "View details"}</span>
          <svg className={`w-3 h-3 transition-transform duration-300 ${selected ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function CommitRow({ commit, index }: { commit: Commit; index: number }) {
  return (
    <div className="animate-slide-up flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-0 group" style={{ animationDelay: `${index * 30}ms` }}>
      {commit.author_avatar ? (
        <img src={commit.author_avatar} alt={commit.author} className="w-5 h-5 rounded-full shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-gray-200 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gray-900 truncate">{commit.message}</div>
        <div className="text-[11px] text-gray-400">{commit.author}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-mono text-gray-300">{commit.sha}</span>
        <CopyButton text={commit.sha} />
        <span className="text-[11px] text-gray-400">{timeAgo(commit.date)}</span>
        <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity hover:underline">View ↗</a>
      </div>
    </div>
  );
}

export function PRRow({ pr, index }: { pr: PullRequest; index: number }) {
  return (
    <div className="animate-slide-up flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-0 group" style={{ animationDelay: `${index * 30}ms` }}>
      <img src={pr.author_avatar} alt={pr.author} className="w-5 h-5 rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-medium text-gray-900 truncate">{pr.title}</span>
          {pr.draft && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">Draft</span>}
        </div>
        <div className="text-[11px] text-gray-400">{pr.branch} → {pr.base}</div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[11px] text-gray-400">#{pr.number}</span>
        <span className="text-[11px] text-gray-400">{timeAgo(pr.updated_at)}</span>
        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity hover:underline">View ↗</a>
      </div>
    </div>
  );
}
