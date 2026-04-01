import "@/app/globals.css";

export const metadata = {
  title: "Central Kitchen Khulna Fisheries",
  description: "Fish inventory, pricing, and sales management."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
