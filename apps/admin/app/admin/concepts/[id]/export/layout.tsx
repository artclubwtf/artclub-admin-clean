import Script from "next/script";

export default function ExportLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script id="autoprint-script">{`
          (() => {
            if (typeof window === "undefined") return;
            const root = document.querySelector(".print-export");
            const shouldPrint = root?.getAttribute("data-autoprint") === "1";
            if (shouldPrint) {
              setTimeout(() => {
                window.print();
              }, 300);
            }
          })();
        `}</Script>
      </body>
    </html>
  );
}
