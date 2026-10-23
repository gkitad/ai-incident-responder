import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Incident Responder",
  description:
    "Break something in a simulated company network and watch an AI on-call engineer reproduce the problem, follow the evidence to the root cause, fix it with your approval and write the postmortem. Built by Anthony Jaimez with the Claude API.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
