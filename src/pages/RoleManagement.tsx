import { useCallback, useEffect, useMemo, useState } from "react";
import { uid } from "../calc";
import { supabase } from "../supabase";
import { Field, PageHeader, Panel } from "../components/ui";
import type { Profile } from "../types";

interface RoleRecord {
  role_key: string;
  label: string;
  is_system: boolean;
}

interface PermissionRecord {
  permission_key: string;
  label: string;
  group_name: string;
}

export function RoleManagementPage({ myId }: { myId: string }) {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [label, setLabel] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [rolesResult, permissionResult, mappingsResult, profilesResult] = await Promise.all([
      supabase.from("role_catalog").select("role_key,label,is_system").order("label"),
      supabase.from("permission_catalog").select("permission_key,label,group_name").order("group_name").order("permission_key"),
      supabase.from("role_permissions").select("role_key,permission_key"),
      supabase.from("profiles").select("id,email,name,role").order("email"),
    ]);
    const failure = rolesResult.error ?? permissionResult.error ?? mappingsResult.error ?? profilesResult.error;
    if (failure) {
      setError(failure.message);
      setLoading(false);
      return;
    }

    const loadedRoles = (rolesResult.data ?? []) as RoleRecord[];
    const loadedPermissions = (permissionResult.data ?? []) as PermissionRecord[];
    const mappings: Record<string, string[]> = {};
    for (const mapping of mappingsResult.data ?? []) {
      (mappings[mapping.role_key] ??= []).push(mapping.permission_key);
    }
    setRoles(loadedRoles);
    setPermissions(loadedPermissions);
    setRolePermissions(mappings);
    setProfiles((profilesResult.data ?? []) as Profile[]);
    if (!selectedRole || !loadedRoles.some((role) => role.role_key === selectedRole)) {
      setSelectedRole("");
      setLabel("");
      setSelectedPermissions([]);
    }
    setLoading(false);
  }, [selectedRole]);

  useEffect(() => { void load(); }, [load]);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, PermissionRecord[]>();
    for (const permission of permissions) {
      if (permission.permission_key === "roles.manage" || permission.permission_key === "users.manage") continue;
      const current = groups.get(permission.group_name) ?? [];
      current.push(permission);
      groups.set(permission.group_name, current);
    }
    return [...groups.entries()];
  }, [permissions]);

  const editRole = (role: RoleRecord) => {
    setSelectedRole(role.role_key);
    setLabel(role.label);
    setSelectedPermissions(rolePermissions[role.role_key] ?? []);
    setMessage("");
  };

  const newRole = () => {
    setSelectedRole("");
    setLabel("");
    setSelectedPermissions([]);
    setMessage("");
  };

  const saveRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!label.trim()) return setError("اكتب اسم الدور.");
    setBusy(true);
    setError("");
    setMessage("");
    const roleKey = selectedRole || `role_${uid()}`;
    const { error: saveError } = await supabase.rpc("save_role_permissions", {
      p_role_key: roleKey,
      p_label: label.trim(),
      p_permission_keys: selectedPermissions,
    });
    if (saveError) {
      setError(saveError.message);
    } else {
      setSelectedRole(roleKey);
      setMessage("تم حفظ الدور وصلاحياته.");
      await load();
    }
    setBusy(false);
  };

  const assignRole = async (userId: string, role: string) => {
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (updateError) setError(updateError.message);
    else {
      setMessage("تم تحديث دور المستخدم.");
      await load();
    }
    setBusy(false);
  };

  const removeRole = async (role: RoleRecord) => {
    if (role.is_system) return;
    if (!confirm(`هل تريد حذف الدور "${role.label}"؟`)) return;
    setBusy(true);
    setError("");
    const { error: deleteError } = await supabase.rpc("delete_custom_role", { p_role_key: role.role_key });
    if (deleteError) setError(deleteError.message);
    else {
      setMessage("تم حذف الدور.");
      newRole();
      await load();
    }
    setBusy(false);
  };

  const togglePermission = (key: string) => setSelectedPermissions((current) =>
    current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);

  return (
    <>
      <PageHeader title="إدارة الأدوار والصلاحيات" subtitle="أنشئ أدواراً مخصصة، اختر صلاحيات كل قسم، ثم عيّنها للمستخدمين" />
      {error && <div className="alert red">{error} — تأكد من تشغيل supabase/schema_v4.sql.</div>}
      {message && <div className="alert" role="status">{message}</div>}
      {loading ? <div className="splash">جاري تحميل الأدوار…</div> : (
        <>
          <Panel title="الأدوار">
            <div className="role-list">
              {roles.filter((role) => role.role_key !== "pending").map((role) => (
                <div className={"role-chip" + (selectedRole === role.role_key ? " selected" : "")} key={role.role_key}>
                  <button type="button" className="role-chip-name" onClick={() => editRole(role)}>
                    {role.label}{role.is_system && <small>أساسي</small>}
                  </button>
                  {!role.is_system && <button type="button" className="role-chip-delete" disabled={busy} onClick={() => void removeRole(role)} aria-label={`حذف ${role.label}`}>×</button>}
                </div>
              ))}
              <button type="button" className="btn sm blue" onClick={newRole}>＋ دور جديد</button>
            </div>
          </Panel>

          <Panel title={selectedRole ? `صلاحيات: ${label}` : "إنشاء دور وتحديد صلاحياته"}>
            <form className="role-editor" onSubmit={saveRole}>
              <Field label="اسم الدور"><input value={label} onChange={(e) => setLabel(e.target.value)} required /></Field>
              <div className="permission-groups">
                {permissionGroups.map(([group, groupPermissions]) => (
                  <fieldset className="permission-group" key={group}>
                    <legend>{group}</legend>
                    <div className="permission-options">
                      {groupPermissions.map((permission) => (
                        <label key={permission.permission_key}>
                          <input type="checkbox" checked={selectedPermissions.includes(permission.permission_key)}
                            onChange={() => togglePermission(permission.permission_key)} />
                          {permission.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <button className="btn primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ الدور والصلاحيات"}</button>
            </form>
          </Panel>

          <Panel title="تعيين الأدوار للمستخدمين">
            <div className="table-wrap"><table>
              <thead><tr><th>الإيميل</th><th>الاسم</th><th>الدور</th></tr></thead>
              <tbody>{profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>{profile.email}{profile.id === myId && " (أنت)"}</td>
                  <td>{profile.name || "—"}</td>
                  <td>
                    {profile.role === "superadmin" ? <span className="badge green">سوبر أدمن</span> : (
                      <select value={profile.role} disabled={busy} onChange={(event) => void assignRole(profile.id, event.target.value)}>
                        <option value="pending">بانتظار الموافقة</option>
                        {roles.filter((role) => role.role_key !== "pending").map((role) => (
                          <option key={role.role_key} value={role.role_key}>{role.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          </Panel>
        </>
      )}
    </>
  );
}
