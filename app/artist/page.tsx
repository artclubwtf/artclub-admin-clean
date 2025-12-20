export default function ArtistHomePage() {
  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 720, margin: "40px auto" }}>
        <h1 style={{ marginBottom: 8, fontSize: 24, fontWeight: 700 }}>Artist dashboard</h1>
        <p style={{ color: "var(--muted)" }}>
          Welcome! Your artist tools will appear here. For now, you can update your password from the menu.
        </p>
      </div>
    </div>
  );
}
