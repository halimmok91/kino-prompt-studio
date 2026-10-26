import './globals.css';

export const metadata = {
  title: 'Kino — Seedance 2.5 Prompt Studio',
  description: 'Craft precise, cinematic prompts for Seedance 2.5.',
};

export const viewport = { themeColor: '#11120f' };

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
