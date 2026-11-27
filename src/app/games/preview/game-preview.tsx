"use client";
// Preview for every unplayed game: a short analysis, recent form, each team's matchup nightmare,
// who's being slept on, and what to expect. Shown whether or not Projections is on; the
// projection in words (pick, margin, projected score) only appears once the reader turns it on.
import { useMemo } from "react";
import { useJson } from "@sports/ui/client-data";
import ProjectionToggle from "@/components/projection-toggle";
import { useShowProjections } from "@/lib/show-projections";
import { buildPreview, poss, type Side } from "@/lib/preview";
import type { Game, TeamSummary } from "@/lib/types";

const A_COLOR = "var(--def)", B_COLOR = "var(--off)"; // away, home (the sheet's colours)

export default function GamePreview({ g }: { g: Game }) {
  const teams = useJson<TeamSummary[]>("teams.json");
  const showProj = useShowProjections();
  const bySlug = useMemo(() => new Map((teams.data ?? []).map(t => [t.slug, t])), [teams.data]);
  const a = g.away.slug ? bySlug.get(g.away.slug) ?? null : null;
  const b = g.home.slug ? bySlug.get(g.home.slug) ?? null : null;
  const p = useMemo(() => buildPreview(g, a, b, { projections: showProj, total: teams.data?.length ?? 365 }), [g, a, b, showProj, teams.data]);

  if (teams.status === "error") return null;
  if (!teams.data) return <section className="mt-7"><h3 className="h-section mb-2 !text-xl">Preview</h3><p className="text-sm text-mute">Loading the preview…</p></section>;
  if (!p) return null;

  const color = (s: Side | null) => (s === "a" ? A_COLOR : s === "b" ? B_COLOR : "var(--mute)");
  const nameOf = (s: Side) => (s === "a" ? a?.name ?? g.away.name : b?.name ?? g.home.name);

  return (
    <section className="mt-7" aria-labelledby={`pv-${g.id}`} data-testid="game-preview">
      <h3 id={`pv-${g.id}`} className="h-section mb-2 !text-xl">Preview</h3>
      <p className="text-[15px] leading-relaxed text-ink">{p.summary}</p>

      {p.form.length > 0 && (
        <Block title="Recent form">
          {p.form.map(f => (
            <Item key={f.team} color={color(f.team)}>
              {f.text}
              {f.trend && <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${f.trend === "up" ? "bg-[rgb(var(--win-rgb)/0.14)] text-win" : "bg-[rgb(var(--hot-rgb)/0.14)] text-hot"}`}>{f.trend === "up" ? "Trending up" : "Trending down"}</span>}
            </Item>
          ))}
        </Block>
      )}

      {(a && b) && (
        <Block title="Matchup nightmares">
          {(["a", "b"] as const).map(s => {
            const n = p.nightmares.find(x => x.team === s);
            return (
              <Item key={s} color={color(s)}>
                <b className="font-semibold">{poss(nameOf(s))} problem: </b>
                {n ? n.text : <span className="text-mute">no glaring weak spot against this opponent. Nothing in the shooting, turnover, rebounding or free-throw numbers is lopsided.</span>}
              </Item>
            );
          })}
        </Block>
      )}

      {p.sleeper && (
        <Block title="Getting slept on">
          <Item color={color(p.sleeper.team)}>{p.sleeper.text}</Item>
        </Block>
      )}

      {(p.expect.length > 0 || p.pick || g.pred) && (
        <Block title="What to expect">
          {p.expect.map((t, i) => <Item key={i} color="var(--line-2)">{t}</Item>)}
          {p.pick ? (
            <Item color="var(--ink)"><b className="font-semibold">Projection: </b>{p.pick}</Item>
          ) : g.pred ? (
            <li className="flex flex-wrap items-center gap-2 pt-1 text-[13px] text-mute">
              <span>Turn on Projections for the pick and projected score.</span>
              <ProjectionToggle />
            </li>
          ) : null}
        </Block>
      )}

      <p className="mt-3 text-[12px] text-dim">
        Built from season stats, national ranks and each game&apos;s opponent-adjusted rating.
        {a && b && Math.min(a.ratedGames, b.ratedGames) < 8 ? " Early in the season ranks can still swing." : ""}
      </p>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="mb-1.5 text-[13px] font-semibold text-mute">{title}</h4>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function Item({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-snug">
      <i className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span>{children}</span>
    </li>
  );
}
