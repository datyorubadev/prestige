"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { Pill } from "@/components/ui/pill";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { AgentUser, Team } from "@/lib/types";

/** P4 teams manager: name a group of agents, add/remove members. These teams
 *  feed inbox scoping ("team" scope) and routing so each agent only sees the
 *  conversations their team owns. Owner-only surface (§4.4). */
export function TeamsManager() {
  const toast = useToast();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [agents, setAgents] = useState<AgentUser[]>([]);

  const [modal, setModal] = useState<Team | "new" | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Team | null>(null);
  const [removing, setRemoving] = useState(false);

  const [memberTeamId, setMemberTeamId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<Team[]>("/teams")
      .then((data) => active && setTeams(data))
      .catch(() => active && setTeams([]));
    api
      .get<AgentUser[]>("/agents")
      .then((data) => active && setAgents(data))
      .catch(() => active && setAgents([]));
    return () => {
      active = false;
    };
  }, []);

  const openNew = () => {
    setName("");
    setModal("new");
  };

  const openEdit = (t: Team) => {
    setName(t.name);
    setModal(t);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Team name is required", "danger");
      return;
    }
    setSaving(true);
    try {
      if (modal === "new") {
        const created = await api.post<Team>("/teams", { name: trimmed });
        setTeams((prev) => (prev ? [...prev, created] : [created]));
        toast(`${created.name} created`);
      } else if (modal) {
        const updated = await api.patch<Team>(`/teams/${modal.id}`, { name: trimmed });
        setTeams((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
        toast(`${updated.name} saved`);
      }
      setModal(null);
    } catch {
      toast("Could not save team", "danger");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Team) => {
    setRemoving(true);
    try {
      await api.del(`/teams/${t.id}`);
      setTeams((prev) => prev?.filter((x) => x.id !== t.id) ?? null);
      setDeleting(null);
      toast(`${t.name} deleted`);
    } catch {
      toast("Could not delete team", "danger");
    } finally {
      setRemoving(false);
    }
  };

  const addMember = async (t: Team, userId: string) => {
    if (!userId) return;
    setAddingTo(t.id);
    try {
      const updated = await api.post<Team>(`/teams/${t.id}/members`, { userId });
      setTeams((prev) => prev?.map((x) => (x.id === t.id ? updated : x)) ?? null);
      toast(`Added to ${t.name}`);
    } catch {
      toast("Could not add member", "danger");
    } finally {
      setAddingTo(null);
      setMemberTeamId(null);
    }
  };

  const removeMember = async (t: Team, userId: string) => {
    setAddingTo(t.id);
    try {
      const updated = await api.del<Team>(`/teams/${t.id}/members/${userId}`);
      setTeams((prev) => prev?.map((x) => (x.id === t.id ? updated : x)) ?? null);
      toast("Member removed");
    } catch {
      toast("Could not remove member", "danger");
    } finally {
      setAddingTo(null);
    }
  };

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  /** Members who can still be added to a team (not already in it). */
  const eligibleOptions = useCallback(
    (t: Team): SelectOption[] =>
      agents
        .filter((a) => !t.memberIds.includes(a.id))
        .map((a) => ({ value: a.id, label: a.name })),
    [agents],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Teams</h1>
          <p className="mt-1 text-[12.5px] text-text-3">
            Group agents by responsibility. Agents set to a <b className="text-text-2">team</b> inbox
            only see conversations routed to their team plus unassigned tickets.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
        >
          <Icon name="plus" size={15} />
          New team
        </button>
      </header>

      {!teams ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-4 shadow-card">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton mt-3 h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface/40 p-12 text-center">
          <Icon name="team" size={28} className="mx-auto text-text-3" />
          <p className="mt-3 text-[13.5px] font-semibold text-text">No teams yet</p>
          <p className="mt-1 text-[12.5px] text-text-3">
            Create a team like Payments or Escalations, then assign agents to it.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((t) => {
            const options = eligibleOptions(t);
            return (
              <div
                key={t.id}
                className="flex flex-col rounded-md border border-border bg-surface p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-[14px] font-bold text-text">{t.name}</h2>
                    <p className="mt-0.5 text-[11.5px] text-text-3">
                      {t.members.length} member{t.members.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                    >
                      <Icon name="edit" size={12} />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(t)}
                      className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2 py-1 text-[11.5px] font-semibold text-danger transition-colors duration-150 hover:bg-danger-soft/70"
                    >
                      <Icon name="close" size={12} />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-1.5">
                  {t.members.length === 0 ? (
                    <p className="text-[12px] text-text-3">No members yet — add one below.</p>
                  ) : (
                    t.members.map((m) => {
                      const agent = agentById.get(m.id);
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 rounded-sm bg-surface-2 px-2.5 py-1.5"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar name={m.name} color={agent?.color ?? "slate"} size="sm" />
                            <span className="truncate text-[12.5px] font-medium text-text">
                              {m.name}
                            </span>
                            <Pill status={m.role} className="hidden sm:inline-flex" />
                          </span>
                          <button
                            type="button"
                            onClick={() => void removeMember(t, m.id)}
                            disabled={addingTo === t.id}
                            title={`Remove ${m.name}`}
                            className="rounded-sm p-1 text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-danger disabled:opacity-50"
                          >
                            {addingTo === t.id ? <Spinner size={12} /> : <Icon name="close" size={13} />}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {options.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <label className="mb-1.5 flex items-center gap-1.5 text-micro uppercase text-text-3">
                      <Icon name="plus" size={11} />
                      Add member
                    </label>
                    <Select
                      value={memberTeamId === t.id ? "" : ""}
                      onChange={(userId) => {
                        if (userId) void addMember(t, userId);
                      }}
                      options={options}
                      placeholder="Select agent…"
                      size="sm"
                      className="w-full"
                      ariaLabel={`Add member to ${t.name}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "new" ? "New team" : `Rename ${modal?.name}`}
        icon="team"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              {modal === "new" ? "Create team" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Team name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              placeholder="e.g. Payments"
              className={cn("input-control")}
              autoFocus
            />
          </label>
          <p className="text-[11.5px] text-text-3">
            Tickets routed to a team stay visible to its members in a team inbox scope.
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete team"
        icon="team"
        confirmLabel="Delete team"
        busy={removing}
        onConfirm={() => deleting && void remove(deleting)}
        description={
          deleting && (
            <>
              <b className="text-text">{deleting.name}</b> will be removed. Agents keep their
              accounts, and tickets stay in the workspace — they just lose this routing label.
            </>
          )
        }
      />
    </div>
  );
}
