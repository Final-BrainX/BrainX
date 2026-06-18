'use client';
import { useState, useEffect } from 'react';

export default function Page() {
  const [iframeSrc, setIframeSrc] = useState('');

  useEffect(() => {
    const hash = window.location.hash || '#/home';
    setIframeSrc('/legacy/index.html' + hash);
  }, []);

  return (
    <main style={{ height: "100vh", width: "100vw", margin: 0, overflow: "hidden" }}>
      {iframeSrc && (
        <iframe
          src={iframeSrc}
          title="BrainX"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            border: 0,
            background: "#0b1020"
          }}
        />
      )}
    </main>
  );
}
