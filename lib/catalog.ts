export type ProductVariant = {
  id: string;
  color: string;
  colorHex: string;
  size: string;
  stock: number;
};

export type TryOnCoverage = "longsleeve" | "tee" | "jersey";
export type TryOnTemplateId = "longsleeve-v1" | "tee-v1" | "jersey-v1";

export type TryOnAnchors = {
  shoulderWidth: number;
  torsoHeight: number;
  hemY: number;
};

/** Per-SKU try-on metadata. Prefer resolveTryOnAsset() for runtime defaults. */
export type TryOnAsset = {
  src: string;
  label: string;
  coverage: TryOnCoverage;
  templateId: TryOnTemplateId;
  anchors: TryOnAnchors;
  /** Optional rigged GLB for live 3D try-on (pilot products only). */
  glb?: string;
  collarMask?: string;
  backSrc?: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: "Longsleeve" | "Jersey" | "T-shirt";
  price: number;
  compareAt?: number;
  badge?: string;
  description: string;
  material: string;
  images: string[];
  colors: { name: string; hex: string }[];
  sizes: string[];
  variants: ProductVariant[];
  sizeGuide: { size: string; length: number; width: number; sleeve?: number }[];
  tryOnAsset?: TryOnAsset;
  featured?: boolean;
};

const makeVariants = (colors: Product["colors"], sizes: string[]) =>
  colors.flatMap((color, colorIndex) =>
    sizes.map((size, sizeIndex) => ({
      id: `${color.name.toLowerCase().replaceAll(" ", "-")}-${size.toLowerCase()}`,
      color: color.name,
      colorHex: color.hex,
      size,
      stock: (colorIndex + sizeIndex) % 5 === 0 ? 0 : 2 + ((colorIndex + sizeIndex) % 6),
    })),
  );

const standardSizes = ["M", "L", "XL", "XXL", "3XL"];
const racingBlack = [{ name: "Black", hex: "#171717" }];

export const products: Product[] = [
  {
    id: "gl-001",
    slug: "retro-racing-group-black-longsleeve",
    name: "Retro Racing Group Black Longsleeve",
    category: "Longsleeve",
    price: 350_000,
    badge: "Best seller",
    description: "Longsleeve hitam dengan grafis racing yang berani dan potongan relaxed untuk dipakai harian.",
    material: "Cotton combed 24s · DTF print",
    images: ["/images/product-racing.svg", "/images/product-detail.svg"],
    colors: racingBlack,
    sizes: standardSizes,
    variants: makeVariants(racingBlack, standardSizes),
    sizeGuide: [
      { size: "M", length: 69, width: 58, sleeve: 58 },
      { size: "L", length: 71, width: 60, sleeve: 60 },
      { size: "XL", length: 73, width: 62, sleeve: 62 },
      { size: "XXL", length: 75, width: 64, sleeve: 63 },
      { size: "3XL", length: 77, width: 68, sleeve: 66 },
    ],
    tryOnAsset: {
      src: "/images/tryon-shirt.svg",
      label: "Rigged longsleeve preview",
      coverage: "longsleeve",
      templateId: "longsleeve-v1",
      anchors: { shoulderWidth: 0.78, torsoHeight: 1.08, hemY: -0.52 },
      glb: "/models/longsleeve-racing.glb",
    },
    featured: true,
  },
  {
    id: "gl-002",
    slug: "pit-lane-jersey-cream",
    name: "Pit Lane Jersey Cream",
    category: "Jersey",
    price: 329_000,
    badge: "New drop",
    description: "Jersey ringan dengan detail kontras yang terinspirasi dari paddock dan pit lane.",
    material: "Sport mesh · Sublimation print",
    images: ["/images/product-jersey.svg", "/images/product-detail.svg"],
    colors: [{ name: "Cream", hex: "#d9c7a1" }, { name: "Black", hex: "#171717" }],
    sizes: standardSizes,
    variants: makeVariants([{ name: "Cream", hex: "#d9c7a1" }, { name: "Black", hex: "#171717" }], standardSizes),
    sizeGuide: [{ size: "M", length: 68, width: 56 }, { size: "L", length: 70, width: 59 }, { size: "XL", length: 73, width: 62 }, { size: "XXL", length: 76, width: 65 }],
    tryOnAsset: {
      src: "/images/product-jersey.svg",
      label: "Jersey try-on template",
      coverage: "jersey",
      templateId: "jersey-v1",
      anchors: { shoulderWidth: 0.8, torsoHeight: 1.02, hemY: -0.44 },
    },
    featured: true,
  },
  {
    id: "gl-003",
    slug: "trackside-club-tee-white",
    name: "Trackside Club Tee White",
    category: "T-shirt",
    price: 249_000,
    description: "T-shirt putih clean dengan statement kecil dari tribun sampai jalanan.",
    material: "Cotton combed 24s · Screen print",
    images: ["/images/product-white-tee.svg", "/images/product-detail.svg"],
    colors: [{ name: "White", hex: "#f4f0e7" }, { name: "Black", hex: "#171717" }],
    sizes: standardSizes,
    variants: makeVariants([{ name: "White", hex: "#f4f0e7" }, { name: "Black", hex: "#171717" }], standardSizes),
    sizeGuide: [{ size: "M", length: 68, width: 54 }, { size: "L", length: 71, width: 57 }, { size: "XL", length: 74, width: 60 }, { size: "XXL", length: 77, width: 63 }],
    tryOnAsset: {
      src: "/images/product-white-tee.svg",
      label: "Tee try-on template",
      coverage: "tee",
      templateId: "tee-v1",
      anchors: { shoulderWidth: 0.76, torsoHeight: 0.99, hemY: -0.42 },
    },
    featured: true,
  },
  {
    id: "gl-004",
    slug: "garage-session-longsleeve-washed-black",
    name: "Garage Session Longsleeve",
    category: "Longsleeve",
    price: 365_000,
    badge: "Limited",
    description: "Longsleeve washed black dengan grafis garage-session yang terasa lived-in.",
    material: "Heavy cotton · Water-based print",
    images: ["/images/product-garage.svg", "/images/product-detail.svg"],
    colors: [{ name: "Washed Black", hex: "#4a4945" }],
    sizes: standardSizes,
    variants: makeVariants([{ name: "Washed Black", hex: "#4a4945" }], standardSizes),
    sizeGuide: [{ size: "M", length: 70, width: 58, sleeve: 59 }, { size: "L", length: 72, width: 61, sleeve: 61 }, { size: "XL", length: 75, width: 64, sleeve: 63 }, { size: "XXL", length: 78, width: 67, sleeve: 65 }],
    tryOnAsset: {
      src: "/images/product-garage.svg",
      label: "Longsleeve try-on template",
      coverage: "longsleeve",
      templateId: "longsleeve-v1",
      anchors: { shoulderWidth: 0.78, torsoHeight: 1.08, hemY: -0.52 },
    },
  },
  {
    id: "gl-005",
    slug: "apex-line-jersey-ink",
    name: "Apex Line Jersey Ink",
    category: "Jersey",
    price: 339_000,
    description: "Jersey breathable dengan garis apex kontras dan fit santai.",
    material: "Sport mesh · Sublimation print",
    images: ["/images/product-jersey-black.svg", "/images/product-detail.svg"],
    colors: [{ name: "Ink", hex: "#222936" }],
    sizes: standardSizes,
    variants: makeVariants([{ name: "Ink", hex: "#222936" }], standardSizes),
    sizeGuide: [{ size: "M", length: 68, width: 56 }, { size: "L", length: 71, width: 59 }, { size: "XL", length: 74, width: 62 }, { size: "XXL", length: 77, width: 65 }],
    tryOnAsset: {
      src: "/images/product-jersey-black.svg",
      label: "Jersey try-on template",
      coverage: "jersey",
      templateId: "jersey-v1",
      anchors: { shoulderWidth: 0.8, torsoHeight: 1.02, hemY: -0.44 },
    },
  },
  {
    id: "gl-006",
    slug: "finish-line-tee-black",
    name: "Finish Line Tee Black",
    category: "T-shirt",
    price: 259_000,
    description: "T-shirt hitam dengan graphic mark sederhana, easy match setiap hari.",
    material: "Cotton combed 24s · DTF print",
    images: ["/images/product-black-tee.svg", "/images/product-detail.svg"],
    colors: [{ name: "Black", hex: "#171717" }],
    sizes: standardSizes,
    variants: makeVariants([{ name: "Black", hex: "#171717" }], standardSizes),
    sizeGuide: [{ size: "M", length: 68, width: 54 }, { size: "L", length: 71, width: 57 }, { size: "XL", length: 74, width: 60 }, { size: "XXL", length: 77, width: 63 }],
    tryOnAsset: {
      src: "/images/product-black-tee.svg",
      label: "Tee try-on template",
      coverage: "tee",
      templateId: "tee-v1",
      anchors: { shoulderWidth: 0.76, torsoHeight: 0.99, hemY: -0.42 },
    },
  },
];

export const categories = ["All", "Longsleeve", "Jersey", "T-shirt"] as const;

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}

export function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
