/**
 * Per-centre data for the parent welcome packs.
 *
 * Lifted from the 2026-10-06 packs (the first print run). Addresses are only
 * printed where that run printed them — the seed has addresses for the
 * others, but nobody has confirmed them for a parent-facing document yet.
 * Fill `address` in once a centre's is checked.
 *
 * `hasBsc: false` drops every before-school mention (Rise and Shine Club,
 * breakfast, the before-school fee row and drop-off card).
 */
export interface WelcomePackCentre {
  slug: string;
  name: string;
  address?: string;
  dropOff: string;
  earlyWednesday?: string;
  coordinator: string;
  phone: string;
  email: string;
  hasBsc: boolean;
  /** Drives Prep vs Kindergarten wording and which regulator is named. */
  state: "NSW" | "VIC";
  /** file names in ./assets */
  map: string;
  photo?: string;
}

export const CENTRES: WelcomePackCentre[] = [
  {
    slug: "AIA-KKCC",
    state: "VIC",
    name: "AIA KKCC",
    dropOff: "School Gym",
    coordinator: "Thushy",
    phone: "0466 707 811",
    email: "aiakkcc@amanaoshc.com.au",
    hasBsc: false,
    map: "aia-kkcc-map.jpg",
    photo: "aia-kkcc-photo.jpg",
  },
  {
    slug: "Al-Taqwa-College",
    state: "VIC",
    name: "Al-Taqwa College",
    dropOff: "Mini Hall",
    coordinator: "Fatema Rasool",
    phone: "0404 339 656",
    email: "altaqwa@amanaoshc.com.au",
    hasBsc: true,
    map: "al-taqwa-college-map.jpg",
  },
  {
    slug: "Arkana-College",
    state: "NSW",
    name: "Arkana College",
    address: "346 Stoney Creek Rd, Kingsgrove NSW 2208",
    dropOff: "School Hall",
    coordinator: "Salma Diab",
    phone: "0494 388 244",
    email: "arkanacollege@amanaoshc.com.au",
    hasBsc: true,
    map: "arkana-college-map.jpg",
    photo: "arkana-college-photo.jpg",
  },
  {
    slug: "MFIS-Beaumont-Hills",
    state: "NSW",
    name: "MFIS Beaumont Hills",
    address: "20 Mungerie Rd, Beaumont Hills NSW 2155",
    dropOff: "School Hall",
    earlyWednesday: "2:10pm",
    coordinator: "Saba",
    phone: "0422 258 893",
    email: "mfisbh@amanaoshc.com.au",
    hasBsc: false,
    map: "mfis-beaumont-hills-map.jpg",
  },
  {
    slug: "MFIS-Greenacre",
    state: "NSW",
    name: "MFIS Greenacre",
    address: "405 Waterloo Rd, Greenacre NSW 2190",
    dropOff: "School Hall",
    earlyWednesday: "2:10pm",
    coordinator: "Sarah Awad",
    phone: "0494 379 929",
    email: "mfisgreenacre@amanaoshc.com.au",
    hasBsc: true,
    map: "mfis-greenacre-map.jpg",
    photo: "mfis-greenacre-photo.jpg",
  },
  {
    slug: "MFIS-Hoxton-Park",
    state: "NSW",
    name: "MFIS Hoxton Park",
    dropOff: "School Hall",
    earlyWednesday: "2:10pm",
    coordinator: "Tamjid Rahman",
    phone: "0466 707 772",
    email: "mfishp@amanaoshc.com.au",
    hasBsc: true,
    map: "mfis-hoxton-park-map.jpg",
    photo: "mfis-hoxton-park-photo.jpg",
  },
  {
    slug: "Minarah-College",
    state: "NSW",
    name: "Minarah College",
    dropOff: "School Hall",
    coordinator: "Nadia",
    phone: "0481 568 290",
    email: "minarah@amanaoshc.com.au",
    hasBsc: true,
    map: "minarah-college-map.jpg",
    photo: "minarah-college-photo.jpg",
  },
  {
    slug: "Minaret-Doveton",
    state: "VIC",
    name: "Minaret Doveton",
    dropOff: "School Gym",
    coordinator: "Khawla Sadat",
    phone: "0406 220 261",
    email: "minaretdoveton@amanaoshc.com.au",
    hasBsc: true,
    map: "minaret-doveton-map.jpg",
    photo: "minaret-doveton-photo.jpg",
  },
  {
    slug: "Minaret-Officer",
    state: "VIC",
    name: "Minaret Officer",
    dropOff: "Classrooms D103 and D101",
    coordinator: "Lami Hopman",
    phone: "0406 367 086",
    email: "minaretofficer@amanaoshc.com.au",
    hasBsc: true,
    map: "minaret-officer-map.jpg",
    photo: "minaret-officer-photo.jpg",
  },
  {
    slug: "Minaret-Springvale",
    state: "VIC",
    name: "Minaret Springvale",
    dropOff: "School Gym",
    coordinator: "Vivi",
    phone: "0466 707 655",
    email: "minaretspringvale@amanaoshc.com.au",
    hasBsc: false,
    map: "minaret-springvale-map.jpg",
    photo: "minaret-springvale-photo.jpg",
  },
  {
    slug: "Unity-Grammar",
    state: "NSW",
    name: "Unity Grammar",
    address: "70 Fourth Ave, Austral NSW 2179",
    dropOff: "G Block",
    coordinator: "Lena",
    phone: "0466 707 771",
    email: "unitygrammar@amanaoshc.com.au",
    hasBsc: true,
    map: "unity-grammar-map.jpg",
    photo: "unity-grammar-photo.jpg",
  },
];
