"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/icons";

interface ProfileData {
  id?: string;
  email: string;
  fullName: string;
  phone: string;
}

export default function PortalProfilePage() {
  const toast = useToast();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [saving, setSaving] = useState(false);

  // Security / Password modal
  const [passModal, setPassModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPass, setChangingPass] = useState(false);

  // Danger zone
  const [deleting, setDeleting] = useState(false);
  const [requestingDelete, setRequestingDelete] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<ProfileData>("/portal/profile").then((p) => {
      if (active) setProfile(p);
    }).catch(() => {
      if (active) {
        setProfile({
          email: user?.email ?? "customer@example.com",
          fullName: user?.fullName ?? "Customer Account",
          phone: "",
        });
      }
    });
    return () => { active = false; };
  }, [user]);

  const saveProfile = async () => {
    if (!profile || saving) return;
    setSaving(true);
    try {
      await api.post("/portal/profile", {
        full_name: profile.fullName,
        phone: profile.phone,
      });
      toast("Profile updated successfully");
    } catch {
      toast("Could not update profile", "danger");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      toast("Passwords do not match", "danger");
      return;
    }
    setChangingPass(true);
    try {
      await api.post("/profile", { password: newPassword });
      toast("Password changed successfully");
      setPassModal(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast("Could not change password", "danger");
    } finally {
      setChangingPass(false);
    }
  };

  const requestDeletion = async () => {
    setRequestingDelete(true);
    try {
      await api.post("/auth/request-deletion", { reason: "User requested from portal" });
      toast("Account deletion request submitted");
      setDeleting(false);
    } catch {
      toast("Could not submit request", "danger");
    } finally {
      setRequestingDelete(false);
    }
  };

  if (!profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 text-text">My Profile</h1>
        <p className="mt-1 text-meta text-text-2">Manage your account information and security preferences.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Left Column: Personal Information & Presence */}
        <section className="rounded-md border border-border bg-surface shadow-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Icon name="user" size={16} className="text-text-2" />
            <h3 className="text-card-title text-text">Personal Information</h3>
          </header>
          <div className="flex flex-col gap-4 p-[18px]">
            <div className="flex items-center gap-3 pb-2 border-b border-border">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white text-base font-bold">
                {profile.fullName.slice(0, 2).toUpperCase() || "CU"}
              </div>
              <div>
                <p className="text-[14px] font-bold text-text">{profile.fullName}</p>
                <p className="text-meta text-text-3">{profile.email}</p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-micro uppercase text-text-3">Full Name</label>
              <input
                type="text"
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                className="input-control w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-micro uppercase text-text-3">Email Address</label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="input-control w-full bg-surface-2 text-text-3 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="mb-1 block text-micro uppercase text-text-3">Phone Number</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="e.g. +234 800 000 0000"
                className="input-control w-full"
              />
            </div>

            <button
              onClick={() => void saveProfile()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 self-start rounded-sm bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50 mt-1"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              Save Changes
            </button>
          </div>
        </section>

        {/* Right Column: Security & Danger Zone */}
        <div className="flex flex-col gap-6">
          <section className="rounded-md border border-border bg-surface shadow-card">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Icon name="lock" size={16} className="text-text-2" />
              <h3 className="text-card-title text-text">Security & Authentication</h3>
            </header>
            <div className="p-[18px] flex flex-col gap-3">
              <p className="text-[12.5px] text-text-2">
                Update your password to keep your support portal account safe and secure.
              </p>
              <button
                onClick={() => setPassModal(true)}
                className="inline-flex items-center gap-1.5 self-start rounded-sm border border-border bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-text hover:bg-surface-2"
              >
                <Icon name="lock" size={14} />
                Change Password
              </button>
            </div>
          </section>

          <section className="rounded-md border border-danger-border bg-surface shadow-card">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3 bg-danger-soft/30">
              <Icon name="alert-triangle" size={16} className="text-danger" />
              <h3 className="text-card-title text-danger">Danger Zone</h3>
            </header>
            <div className="p-[18px] flex flex-col gap-3">
              <p className="text-[12.5px] text-text-2">
                Submitting an account deletion request will queue your data for removal by support admins.
              </p>
              <button
                onClick={() => setDeleting(true)}
                className="inline-flex items-center gap-1.5 self-start rounded-sm border border-danger-border bg-danger-soft px-3.5 py-1.5 text-[12.5px] font-semibold text-danger hover:bg-danger-soft/80"
              >
                <Icon name="close" size={14} />
                Request Account Deletion
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Password Modal */}
      {passModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-surface p-5">
            <h3 className="mb-4 text-[16px] font-bold text-text">Change Password</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-text">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-control"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-text">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-control"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPassModal(false)}
                className="rounded-sm border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={() => void changePassword()}
                disabled={changingPass || !newPassword}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {changingPass ? <Spinner size={14} /> : <Icon name="check" size={14} />}
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Confirm Modal */}
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Request Account Deletion"
        description="Are you sure you want to submit an account deletion request? This will notify administrators to remove your data."
        confirmLabel="Request Deletion"
        busy={requestingDelete}
        onConfirm={() => void requestDeletion()}
      />
    </div>
  );
}
