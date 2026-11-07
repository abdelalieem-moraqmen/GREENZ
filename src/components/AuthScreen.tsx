import { useState } from "react";
import { supabase } from "../supabase";

/** رسائل أخطاء Supabase بالعربي. */
function arabicError(m: string): string {
  const s = m.toLowerCase();
  if (s.includes("invalid login")) return "الإيميل أو كلمة المرور غير صحيحة.";
  if (s.includes("email not confirmed")) return "الإيميل لم يتم تأكيده بعد. افتح رسالة التأكيد في بريدك.";
  if (s.includes("already registered")) return "الإيميل ده مسجّل بالفعل، سجّل الدخول.";
  if (s.includes("rate limit") || s.includes("seconds")) return "محاولات كتير في وقت قصير. استنى شوية وجرّب تاني.";
  if (s.includes("password")) return "كلمة المرور ضعيفة (6 حروف على الأقل).";
  if (s.includes("fetch") || s.includes("network")) return "مشكلة في الاتصال بالإنترنت.";
  return m;
}

type Mode = "in" | "up" | "reset";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const say = (text: string, ok = false) => setMsg({ text, ok });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null); setNeedsConfirm(false);
    const mail = email.trim();
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: window.location.origin });
        return error ? say(arabicError(error.message)) : say("بعتنا لك رابط إعادة تعيين كلمة المرور على إيميلك ✅", true);
      }
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({ email: mail, password });
        if (error) return say(arabicError(error.message));
        // Supabase بيرجّع user بدون identities لو الإيميل مسجّل قبل كده
        if (data.user && data.user.identities?.length === 0) return say("الإيميل ده مسجّل بالفعل، سجّل الدخول.");
        if (!data.session) { setNeedsConfirm(true); say("تم إنشاء الحساب ✅ — افتح إيميلك واضغط رابط التأكيد، ثم سجّل الدخول.", true); }
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (error) {
        if (error.message.toLowerCase().includes("not confirmed")) setNeedsConfirm(true);
        say(arabicError(error.message));
      }
    } catch (err) {
      say(arabicError(String(err)));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    error ? say(arabicError(error.message)) : say("بعتنا رسالة التأكيد تاني ✅", true);
  };

  const titles: Record<Mode, string> = { in: "تسجيل الدخول", up: "إنشاء حساب", reset: "إرسال رابط الاستعادة" };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">🌿</div>
        <h1>GREENZ</h1>
        <p>إدارة محل المبيدات والتوزيع</p>

        <input type="email" placeholder="الإيميل" required autoComplete="email" dir="ltr"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "reset" && (
          <div className="pass-row">
            <input type={show ? "text" : "password"} placeholder="كلمة المرور (6 حروف على الأقل)" required minLength={6}
              autoComplete={mode === "in" ? "current-password" : "new-password"} dir="ltr"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="eye" onClick={() => setShow(!show)} title="إظهار/إخفاء">{show ? "🙈" : "👁"}</button>
          </div>
        )}

        <button className="btn primary" disabled={busy}>{busy ? "..." : titles[mode]}</button>

        {msg && <div className={"auth-msg " + (msg.ok ? "ok" : "bad")}>{msg.text}</div>}
        {needsConfirm && <button type="button" className="link" onClick={resend}>إعادة إرسال رسالة التأكيد</button>}

        {mode === "in" && <button type="button" className="link" onClick={() => { setMode("reset"); setMsg(null); }}>نسيت كلمة المرور؟</button>}
        <button type="button" className="link" onClick={() => { setMode(mode === "up" ? "in" : mode === "in" ? "up" : "in"); setMsg(null); }}>
          {mode === "in" ? "ما عندكش حساب؟ أنشئ حساب" : "رجوع لتسجيل الدخول"}
        </button>
      </form>
    </div>
  );
}
