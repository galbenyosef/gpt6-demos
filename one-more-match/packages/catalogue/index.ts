export type Country = {
  id: string;
  name: string;
  flag: string;
  primary: string;
  secondary: string;
  alternate: string;
  shorts: string;
  pattern: "plain" | "stripes" | "checks";
  group: string;
};
const rows = [
  [
    "ARG",
    "Argentina",
    "🇦🇷",
    "#79c7ed",
    "#ffffff",
    "#13233f",
    "#182639",
    "stripes",
    "light",
  ],
  [
    "BRA",
    "Brazil",
    "🇧🇷",
    "#f9df38",
    "#218950",
    "#205bbd",
    "#2459ad",
    "plain",
    "yellow",
  ],
  [
    "FRA",
    "France",
    "🇫🇷",
    "#233d85",
    "#ed3947",
    "#f4f1e9",
    "#233d85",
    "plain",
    "blue",
  ],
  [
    "GER",
    "Germany",
    "🇩🇪",
    "#f3f1e9",
    "#202631",
    "#202631",
    "#202631",
    "plain",
    "light",
  ],
  [
    "ESP",
    "Spain",
    "🇪🇸",
    "#d82d3b",
    "#f9c33b",
    "#a6dce4",
    "#203767",
    "plain",
    "red",
  ],
  [
    "ENG",
    "England",
    "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "#f8f5ee",
    "#273859",
    "#cd3041",
    "#273859",
    "plain",
    "light",
  ],
  [
    "POR",
    "Portugal",
    "🇵🇹",
    "#bc283d",
    "#238d62",
    "#f8f5ee",
    "#238052",
    "plain",
    "red",
  ],
  [
    "ITA",
    "Italy",
    "🇮🇹",
    "#2376d6",
    "#ffffff",
    "#f5f1e6",
    "#f3f1e9",
    "plain",
    "blue",
  ],
  [
    "NED",
    "Netherlands",
    "🇳🇱",
    "#f68b24",
    "#1b2e49",
    "#1b2e49",
    "#f68b24",
    "plain",
    "orange",
  ],
  [
    "BEL",
    "Belgium",
    "🇧🇪",
    "#cf3041",
    "#f6cc38",
    "#acdde4",
    "#202631",
    "plain",
    "red",
  ],
  [
    "CRO",
    "Croatia",
    "🇭🇷",
    "#f3f1e9",
    "#df3944",
    "#253b60",
    "#f3f1e9",
    "checks",
    "light",
  ],
  [
    "URU",
    "Uruguay",
    "🇺🇾",
    "#86cfee",
    "#ffffff",
    "#f8f5ee",
    "#182639",
    "plain",
    "light",
  ],
  [
    "COL",
    "Colombia",
    "🇨🇴",
    "#f3d342",
    "#c42b40",
    "#152c59",
    "#203b77",
    "plain",
    "yellow",
  ],
  [
    "MEX",
    "Mexico",
    "🇲🇽",
    "#208661",
    "#c63143",
    "#f8f5ee",
    "#f4f0e5",
    "plain",
    "green",
  ],
  [
    "USA",
    "United States",
    "🇺🇸",
    "#f7f4ed",
    "#cf3041",
    "#203965",
    "#203965",
    "plain",
    "light",
  ],
  [
    "JPN",
    "Japan",
    "🇯🇵",
    "#205fb8",
    "#ffffff",
    "#f7f4ed",
    "#205fb8",
    "plain",
    "blue",
  ],
  [
    "KOR",
    "South Korea",
    "🇰🇷",
    "#ed3d49",
    "#252d3b",
    "#252d3b",
    "#252d3b",
    "plain",
    "red",
  ],
  [
    "MAR",
    "Morocco",
    "🇲🇦",
    "#c93143",
    "#208661",
    "#f7f4ed",
    "#208661",
    "plain",
    "red",
  ],
  [
    "SEN",
    "Senegal",
    "🇸🇳",
    "#f4f1e9",
    "#24955c",
    "#24955c",
    "#f4f1e9",
    "plain",
    "light",
  ],
  [
    "NGA",
    "Nigeria",
    "🇳🇬",
    "#35b478",
    "#ffffff",
    "#f4f1e9",
    "#35b478",
    "plain",
    "green",
  ],
] as const;
export const countries: Country[] = rows.map(
  ([
    id,
    name,
    flag,
    primary,
    secondary,
    alternate,
    shorts,
    pattern,
    group,
  ]) => ({
    id,
    name,
    flag,
    primary,
    secondary,
    alternate,
    shorts,
    pattern,
    group,
  }),
);
export const country = (id: string) =>
  countries.find((c) => c.id === id) ?? countries[0]!;
export type Kit = {
  primary: string;
  secondary: string;
  shorts: string;
  pattern: Country["pattern"];
  alternate: boolean;
};
export function kitsFor(a: string, b: string): [Kit, Kit] {
  const home = country(a),
    away = country(b);
  const clash =
    home.group === away.group ||
    (["yellow", "orange"].includes(home.group) &&
      ["yellow", "orange"].includes(away.group));
  const kit = (c: Country, alt = false): Kit => ({
    primary: alt ? c.alternate : c.primary,
    secondary: alt ? "#f8f4e8" : c.secondary,
    shorts: alt ? c.alternate : c.shorts,
    pattern: alt ? "plain" : c.pattern,
    alternate: alt,
  });
  const h = kit(home),
    v = kit(away, clash);
  const luminance = (s: string) => {
    const n = parseInt(s.slice(1), 16);
    return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  if (clash && Math.abs(luminance(h.primary) - luminance(v.primary)) < 65) {
    v.primary = luminance(h.primary) > 130 ? "#142038" : "#fff7e6";
    v.shorts = v.primary;
    v.secondary = luminance(h.primary) > 130 ? "#ffffff" : "#142038";
  }
  return [h, v];
}
export const TUNING = {
  version: 1,
  dt: 1 / 60,
  half: 150,
  length: 70,
  width: 45,
  ballRadius: 0.22,
  goalWidth: 5,
  goalHeight: 2,
  run: 6.2,
  sprint: 8.5,
  acceleration: 24,
  tackleReach: 1.65,
  tackleCooldown: 0.7,
  shotMaxCharge: 1.2,
} as const;
