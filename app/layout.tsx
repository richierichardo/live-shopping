import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { StoreProvider } from "@/components/store-provider";

export const metadata: Metadata = {
  title: "Goodluch — Race your own way",
  description: "Streetwear for the ones who choose their own line. Explore Goodluch and try selected pieces live.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <StoreProvider>
          <SiteHeader />
          <main>{children}</main>
          <footer className="site-footer">
            <div className="footer-top"><LinkMark /><p>Wear your pace.<br />Choose your line.</p><div className="footer-links"><a href="/products">Shop</a><a href="/tracking">Track order</a><a href="/products">Size guide</a></div></div>
            <div className="footer-bottom"><span>© 2026 Goodluch Club. Prototype storefront.</span><span>Bandung · Indonesia</span><span>PREVIEW ONLY — NO REAL CHECKOUT</span></div>
          </footer>
        </StoreProvider>
      </body>
    </html>
  );
}

function LinkMark() { return <a href="/" className="footer-wordmark">GOODLUCH<span>®</span></a>; }
