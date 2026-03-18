"use client";

import { useEffect, useState } from "react";

import {
  AGENT_OPTIONS,
  PROVIDER_OPTIONS,
  type ModelRoutingSettings,
  type ProviderKeyStatus
} from "@/lib/model-routing";

interface SettingsPayload {
  filePath: string;
  providers: ProviderKeyStatus[];
  settings: ModelRoutingSettings;
}

export function SettingsConsole() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`settings_read_failed (${response.status})`);
      }

      const nextPayload = await response.json();
      setPayload(nextPayload);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "settings_read_failed");
    } finally {
      setLoading(false);
    }
  }

  function updateAgent(
    agentId: keyof ModelRoutingSettings["agents"],
    key: "provider" | "model" | "temperature" | "enabled",
    value: string | number | boolean
  ) {
    setPayload((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        settings: {
          ...current.settings,
          agents: {
            ...current.settings.agents,
            [agentId]: {
              ...current.settings.agents[agentId],
              [key]: value
            }
          }
        }
      };
    });
  }

  async function handleSave() {
    if (!payload) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          settings: payload.settings
        })
      });

      const nextPayload = await response.json();
      if (!response.ok || !nextPayload.ok) {
        throw new Error(nextPayload.error ?? `settings_write_failed (${response.status})`);
      }

      setPayload(nextPayload);
      setNotice("팀별 모델 설정을 저장했습니다.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "settings_write_failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="panel settings-panel">설정을 불러오는 중입니다.</section>;
  }

  if (!payload) {
    return (
      <section className="panel settings-panel">
        <p>설정 데이터를 읽지 못했습니다.</p>
        {error ? <p className="settings-error">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Local Config</p>
          <h2>Agent Model Routing</h2>
        </div>
        <button className="control-button" onClick={() => void fetchSettings()} disabled={loading || saving}>
          Refresh
        </button>
      </div>

      <p className="settings-copy">
        API 키는 <code>.env.local</code>에 두고, 여기서는 팀별 provider와 model id만 저장합니다.
        저장 위치는 <code>{payload.filePath}</code>입니다.
      </p>

      <div className="provider-grid">
        {payload.providers.map((provider) => (
          <div key={provider.id} className="provider-card">
            <div className="provider-head">
              <strong>{provider.label}</strong>
              <span className={`provider-pill ${provider.configured ? "ok" : "missing"}`}>
                {provider.configured ? "key detected" : "key missing"}
              </span>
            </div>
            <p>{provider.envVar}</p>
          </div>
        ))}
      </div>

      <div className="settings-grid">
        {AGENT_OPTIONS.map((agent) => {
          const config = payload.settings.agents[agent.id];

          return (
            <article key={agent.id} className="agent-settings-card">
              <div className="agent-settings-head">
                <div>
                  <strong>{agent.label}</strong>
                  <p>{agent.description}</p>
                </div>
                <label className="toggle-row">
                  <span>Enabled</span>
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) => updateAgent(agent.id, "enabled", event.target.checked)}
                  />
                </label>
              </div>

              <label className="settings-field">
                <span>Provider</span>
                <select
                  value={config.provider}
                  onChange={(event) => updateAgent(agent.id, "provider", event.target.value)}
                >
                  {PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Model ID</span>
                <input
                  type="text"
                  value={config.model}
                  placeholder={getModelPlaceholder(config.provider)}
                  onChange={(event) => updateAgent(agent.id, "model", event.target.value)}
                />
              </label>

              <label className="settings-field">
                <span>Temperature</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={config.temperature}
                  onChange={(event) =>
                    updateAgent(agent.id, "temperature", Number(event.target.value))
                  }
                />
              </label>
            </article>
          );
        })}
      </div>

      <div className="settings-footer">
        <div>
          <p className="settings-copy subtle">
            마지막 저장 시각: <code>{payload.settings.updatedAt}</code>
          </p>
          {error ? <p className="settings-error">{error}</p> : null}
          {notice ? <p className="settings-notice">{notice}</p> : null}
        </div>
        <button className="control-button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </section>
  );
}

function getModelPlaceholder(provider: ModelRoutingSettings["agents"][keyof ModelRoutingSettings["agents"]]["provider"]) {
  switch (provider) {
    case "openai":
      return "gpt-5-nano or gpt-5-mini";
    case "anthropic":
      return "claude-haiku-4-5";
    case "google":
      return "gemini-2.5-flash-lite or gemini-2.5-flash";
    default:
      return "enter provider model id";
  }
}
