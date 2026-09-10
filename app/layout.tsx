import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BorrowBack — Clear loans, confirmed returns",
  description:
    "Record an equipment loan, resolve uncertain details, and prepare a return. A working simulated Alexa+ experience.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
