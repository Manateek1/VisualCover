import { ExternalLink, GitFork, ShieldCheck } from "lucide-react";
import { BrandMark } from "../../components/BrandMark";
import type { CoverLifecycle } from "../../types";

type AboutScreenProps = {
  version: string;
  lifecycle: CoverLifecycle;
};

export function AboutScreen({ version, lifecycle }: AboutScreenProps) {
  const covered = lifecycle !== "uncovered";
  return (
    <div className="screen about-screen">
      <div className="about-hero">
        <BrandMark />
        <h1>Visual privacy, without stopping your work.</h1>
        <p>VisualCover places a calm desktop curtain above ordinary windows while your apps continue running underneath.</p>
        <span className="version-badge">Version {version}</span>
      </div>

      {covered ? (
        <div className="covered-about-notice" role="status">
          <ShieldCheck aria-hidden="true" />
          <div><strong>The cover is active.</strong><span>Return to the primary cover display and enter your PIN to access settings.</span></div>
        </div>
      ) : null}

      <div className="about-grid">
        <section>
          <h2>What it does</h2>
          <p>Covers connected displays, keeps a local PIN, and leaves Windows signed in so background tasks can continue.</p>
        </section>
        <section>
          <h2>What it is not</h2>
          <p>It is not a secure Windows lock screen. System shortcuts, elevated software, switching users, or a restart can bypass it.</p>
        </section>
      </div>
      <div className="about-links">
        <a href="https://github.com/Manateek1/visual-cover" target="_blank" rel="noreferrer"><GitFork aria-hidden="true" />Source code<ExternalLink aria-hidden="true" /></a>
        <span>MIT licensed · No analytics · No runtime network services</span>
      </div>
    </div>
  );
}
