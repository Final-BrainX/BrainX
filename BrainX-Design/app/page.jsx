export default function Page() {
  return (
    <main style={{ height: "100vh", width: "100vw", margin: 0, overflow: "hidden" }}>
      <iframe
        src="/legacy/index.html"
        title="BrainX"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          background: "#0b1020"
        }}
      />
    </main>
  );
}
