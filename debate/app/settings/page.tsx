import Link from "next/link";

import { SettingsConsole } from "@/components/settings-console";

export default function SettingsPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <div>
          <p className="eyebrow">Team Config</p>
          <h1>Provider / Model Settings</h1>
          <p>
            로컬 환경의 API 키 존재 여부를 확인하고, 6개 팀 에이전트별 provider와
            model id를 저장합니다.
          </p>
        </div>
        <nav className="view-switch" aria-label="Settings navigation">
          <Link href="/" className="nav-pill">
            Overview
          </Link>
          <Link href="/operator/live" className="nav-pill">
            Operator
          </Link>
          <Link href="/settings" className="nav-pill active">
            Settings
          </Link>
        </nav>
      </section>

      <SettingsConsole />
    </main>
  );
}
