import "./globals.css";

export const metadata = {
  title: "Sistema de Estoque",
  description: "Controle de estoque com Supabase, relatórios e Excel"
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
