import { supabase } from "./supabase";
import { uid } from "./calc";
import type { CompanySettings, ContentPage } from "./types";

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  brandName: "المميز للخدمات الزراعية",
  tagline: "كل ما يحتاجه نموّك الزراعي، في مكان واحد",
  intro: "خبرة ومنتجات موثوقة لدعم المزارعين وتحقيق أفضل النتائج في كل موسم.",
  whatsapp: "201141645190",
  logoUrl: "/logo.png",
  bannerUrl: "/banner.jpg",
  primaryColor: "#2e9e4f",
  services: [
    { icon: "🌱", title: "بذور مختارة", description: "بداية قوية لمحصولك" },
    { icon: "🧪", title: "مبيدات وأسمدة", description: "حلول متكاملة للمحاصيل" },
    { icon: "🌾", title: "استشارات زراعية", description: "دعم وخبرة في كل خطوة" },
  ],
  landingSections: {
    servicesTitle: "كل احتياجات أرضك في مكان واحد",
    servicesIntro: "اختيارات موثوقة وخبرة تساعدك على رعاية محصولك من بداية الموسم حتى الحصاد.",
    aboutTitle: "نزرع الثقة قبل كل شيء",
    contactTitle: "جاهز لموسم زراعي أفضل؟",
    contactIntro: "تواصل مع فريق المميز للخدمات الزراعية، وسنساعدك في اختيار الحل المناسب.",
  },
};

const fromSettingsRow = (row: Record<string, unknown>): CompanySettings => ({
  brandName: String(row.brand_name ?? DEFAULT_COMPANY_SETTINGS.brandName),
  tagline: String(row.tagline ?? DEFAULT_COMPANY_SETTINGS.tagline),
  intro: String(row.intro ?? DEFAULT_COMPANY_SETTINGS.intro),
  whatsapp: String(row.whatsapp ?? DEFAULT_COMPANY_SETTINGS.whatsapp),
  logoUrl: String(row.logo_url ?? DEFAULT_COMPANY_SETTINGS.logoUrl),
  bannerUrl: String(row.banner_url ?? DEFAULT_COMPANY_SETTINGS.bannerUrl),
  primaryColor: String(row.primary_color ?? DEFAULT_COMPANY_SETTINGS.primaryColor),
  services: Array.isArray(row.services) ? row.services as CompanySettings["services"] : DEFAULT_COMPANY_SETTINGS.services,
  landingSections: row.landing_sections && typeof row.landing_sections === "object"
    ? { ...DEFAULT_COMPANY_SETTINGS.landingSections, ...row.landing_sections as CompanySettings["landingSections"] }
    : DEFAULT_COMPANY_SETTINGS.landingSections,
});

export async function loadSiteContent() {
  const [settingsResult, pagesResult] = await Promise.all([
    supabase.from("company_settings")
      .select("brand_name, tagline, intro, whatsapp, logo_url, banner_url, primary_color, services, landing_sections")
      .eq("id", "main").maybeSingle(),
    supabase.from("content_pages").select("id, title, body, published").order("created_at"),
  ]);
  if (settingsResult.error) throw new Error(`تعذر تحميل إعدادات الشركة: ${settingsResult.error.message}`);
  if (pagesResult.error) throw new Error(`تعذر تحميل الصفحات: ${pagesResult.error.message}`);
  return {
    settings: settingsResult.data ? fromSettingsRow(settingsResult.data) : DEFAULT_COMPANY_SETTINGS,
    pages: (pagesResult.data ?? []) as ContentPage[],
  };
}

export async function saveCompanySettings(settings: CompanySettings) {
  const { data, error } = await supabase.from("company_settings").upsert({
    id: "main",
    brand_name: settings.brandName,
    tagline: settings.tagline,
    intro: settings.intro,
    whatsapp: settings.whatsapp.replace(/\D/g, ""),
    logo_url: settings.logoUrl,
    banner_url: settings.bannerUrl,
    primary_color: settings.primaryColor,
    services: settings.services,
    landing_sections: settings.landingSections,
  }, { onConflict: "id" }).select().single();
  if (error) throw new Error(`تعذر حفظ إعدادات الشركة: ${error.message}`);
  return fromSettingsRow(data);
}

export async function uploadCompanyImage(file: File, kind: "logo" | "banner", userId: string) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("اختر صورة بصيغة PNG أو JPEG أو WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 5 ميجابايت.");
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "img";
  const path = `${userId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
  if (error) throw new Error(`تعذر رفع الصورة: ${error.message}`);
  return supabase.storage.from("company-assets").getPublicUrl(path).data.publicUrl;
}

export async function saveContentPage(page: Omit<ContentPage, "id">, id?: string) {
  const pageId = id ?? uid();
  const query = id
    ? supabase.from("content_pages").update(page).eq("id", id)
    : supabase.from("content_pages").insert({ ...page, id: pageId });
  const { error } = await query;
  if (error) throw new Error(`تعذر حفظ الصفحة: ${error.message}`);
  return { ...page, id: pageId };
}

export async function deleteContentPage(id: string) {
  const { error } = await supabase.from("content_pages").delete().eq("id", id);
  if (error) throw new Error(`تعذر حذف الصفحة: ${error.message}`);
}
