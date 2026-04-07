"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [alertThreshold, setAlertThreshold] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    apiFetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setName(d.project.name);
        setDescription(d.project.description ?? "");
        setAlertThreshold(d.project.alert_threshold ?? 50);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description, alert_threshold: alertThreshold }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
      router.push("/dashboard/projects");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-9 w-44 bg-white/40 rounded-card" />
        <div className="h-48 bg-white/40 rounded-card" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-7 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/projects/${id}`}
            className="text-white/50 hover:text-white/80 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-[22px] font-semibold text-white/95 tracking-tight">Project Settings</h1>
        </div>
      </div>

      <div className="space-y-4 max-w-2xl">
        {/* General */}
        <div className="bg-white/95 border border-white/60 rounded-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-gray-900">General</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Project name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="w-full text-[13px] px-3 py-2 rounded-button border border-gray-200 focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/10 transition-all"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full text-[13px] px-3 py-2 rounded-button border border-gray-200 focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/10 transition-all resize-none"
              />
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white/95 border border-white/60 rounded-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-gray-900">Alerts</h2>
          </div>
          <div className="px-6 py-5">
            <label className="block text-[12px] font-medium text-gray-600 mb-1.5">
              Failure rate threshold
            </label>
            <p className="text-[11px] text-gray-400 mb-3">
              Show an alert banner when deploy success rate drops below this value.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(Number(e.target.value))}
                className="flex-1 accent-brand-purple"
              />
              <span className="text-[13px] font-semibold text-gray-800 w-10 text-right">{alertThreshold}%</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Current setting: alert when success rate is below <span className="font-medium text-gray-600">{alertThreshold}%</span>
            </p>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="text-[13px] font-medium px-4 py-2 rounded-button bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-all border border-white/30 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && <span className="text-[12px] text-emerald-600 font-medium">Saved</span>}
        </div>

        {/* Danger zone */}
        <div className="bg-white/95 border border-red-200 rounded-card shadow-card overflow-hidden mt-8">
          <div className="px-6 py-4 border-b border-red-100">
            <h2 className="text-[13px] font-semibold text-red-600">Danger Zone</h2>
          </div>
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-gray-800">Delete this project</p>
              <p className="text-[12px] text-gray-400 mt-0.5">Permanently removes the project and all linked services. Cannot be undone.</p>
            </div>
            {confirmDelete ? (
              <div className="flex items-center gap-2 shrink-0 ml-6">
                <span className="text-[12px] text-gray-500">Are you sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-button bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="shrink-0 ml-6 text-[12px] font-medium px-3 py-1.5 rounded-button border border-red-300 text-red-500 hover:bg-red-500 hover:text-white transition-all"
              >
                Delete project
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
