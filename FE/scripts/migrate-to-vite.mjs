import fs from "fs";
import path from "path";

function transform(src) {
  let s = src;
  s = s.replace(/^"use client";\r?\n+/gm, "");
  s = s.replace(
    /import Link from "next\/link";/g,
    'import { Link } from "react-router-dom";',
  );
  s = s.replace(
    /import \{([^}]+)\} from "next\/navigation";/g,
    (_m, inner) => {
      const names = inner.split(",").map((x) => x.trim()).filter(Boolean);
      const out = [];
      for (const n of names) {
        if (n === "useRouter") out.push("useNavigate");
        else if (n === "useParams") out.push("useParams");
        else if (n === "useSearchParams") out.push("useSearchParams");
        else if (n === "usePathname") out.push("useLocation");
      }
      return `import { ${[...new Set(out)].join(", ")} } from "react-router-dom";`;
    },
  );
  s = s.replace(/const router = useRouter\(\);/g, "const navigate = useNavigate();");
  s = s.replace(/router\.push\(/g, "navigate(");
  s = s.replace(
    /router\.replace\(([^)]+)\)/g,
    "navigate($1, { replace: true })",
  );
  s = s.replace(/router\.back\(\)/g, "navigate(-1)");
  s = s.replace(/navigateBack\(router,/g, "navigateBack(navigate,");
  s = s.replace(
    /const pathname = usePathname\(\);/g,
    "const { pathname } = useLocation();",
  );
  s = s.replace(/<Link(\s[^>]*?)href=/g, "<Link$1to=");
  return s;
}

function unwrapSuspenseDefault(src) {
  // Pattern: function XContent ... export default function X() { return <Suspense>...<XContent /></Suspense> }
  // Convert to: export default function XContent (renamed) — keep first function as default if Suspense wrapper exists
  const hasSuspense =
    src.includes("Suspense") &&
    /export default function \w+\(\) \{\s*return \(\s*<Suspense/.test(src);
  if (!hasSuspense) return src;

  // Remove Suspense import usage and default wrapper; export the Content function as default
  let s = src;
  s = s.replace(/,\s*Suspense/g, "");
  s = s.replace(/Suspense,\s*/g, "");
  s = s.replace(/import \{ Suspense([^}]*)\} from "react";\r?\n/g, (m, rest) => {
    const cleaned = rest.replace(/^,\s*/, "").trim();
    if (!cleaned) return 'import { useState } from "react";\n'.includes("useState")
      ? ""
      : "";
    return `import { ${cleaned} } from "react";\n`;
  });

  // Find Content function name
  const contentMatch = s.match(/function (\w+Content)\(/);
  if (!contentMatch) return src;
  const contentName = contentMatch[1];

  // Remove trailing export default Suspense wrapper
  s = s.replace(
    /\r?\nexport default function \w+\([^)]*\) \{[\s\S]*<Suspense[\s\S]*<\/Suspense>[\s\S]*\}\s*$/,
    `\n\nexport default ${contentName};\n`,
  );

  // Ensure Content is not just a local function — already fine
  return s;
}

function mergeRouterImports(src) {
  const re =
    /import \{([^}]+)\} from "react-router-dom";\r?\n/g;
  const all = [];
  let m;
  const without = src.replace(re, (_full, inner) => {
    inner.split(",").forEach((x) => {
      const n = x.trim();
      if (n && !all.includes(n)) all.push(n);
    });
    return "";
  });
  if (all.length === 0) return src;
  return `import { ${all.join(", ")} } from "react-router-dom";\n` + without;
}

const map = [
  ["src/app/page.tsx", "src/pages/SplashPage.tsx"],
  ["src/app/onboarding/page.tsx", "src/pages/OnboardingPage.tsx"],
  ["src/app/setup/allergen/page.tsx", "src/pages/SetupAllergenPage.tsx"],
  ["src/app/setup/restriction/page.tsx", "src/pages/SetupRestrictionPage.tsx"],
  ["src/app/setup/confirm/page.tsx", "src/pages/SetupConfirmPage.tsx"],
  ["src/app/explore/page.tsx", "src/pages/ExplorePage.tsx"],
  ["src/app/my/page.tsx", "src/pages/MyPage.tsx"],
  ["src/app/ai/page.tsx", "src/pages/AiPage.tsx"],
  ["src/app/menu/[id]/page.tsx", "src/pages/MenuDetailPage.tsx"],
  ["src/app/menu/[id]/reasoning/page.tsx", "src/pages/MenuReasoningPage.tsx"],
  ["src/app/menu/[id]/inquiry/page.tsx", "src/pages/MenuInquiryPage.tsx"],
  ["src/app/menu/[id]/report/page.tsx", "src/pages/MenuReportPage.tsx"],
  ["src/app/show-staff/page.tsx", "src/pages/ShowStaffPage.tsx"],
  ["src/app/design-system/page.tsx", "src/pages/DesignSystemPage.tsx"],
];

fs.mkdirSync("src/pages", { recursive: true });
for (const [from, to] of map) {
  let out = transform(fs.readFileSync(from, "utf8"));
  out = unwrapSuspenseDefault(out);
  out = mergeRouterImports(out);
  // useParams typing: const params = useParams<{ id: string }>() -> useParams()
  out = out.replace(
    /useParams<\{[^}]+\}>\(\)/g,
    "useParams()",
  );
  // const id = params.id; ensure string
  out = out.replace(
    /const id = params\.id;/g,
    'const id = String(params.id ?? "");',
  );
  // Next searchParams already URLSearchParams-like in RR
  fs.writeFileSync(to, out);
  console.log("wrote", to);
}

for (const f of [
  "src/components/MenuCard.tsx",
  "src/components/SessionGate.tsx",
]) {
  if (!fs.existsSync(f)) continue;
  let out = transform(fs.readFileSync(f, "utf8"));
  out = mergeRouterImports(out);
  fs.writeFileSync(f, out);
  console.log("updated", f);
}

console.log("migrate-to-vite done");
